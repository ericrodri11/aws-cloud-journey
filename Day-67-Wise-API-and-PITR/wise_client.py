"""
wise_client.py — Motor de ingesta de datos reales desde Wise API.

Reglas de clasificación:
  - CARD_TRANSACTION: gasto real → contar
  - TRANSFER saliente a externo: gasto real → contar
  - CONVERSION / BALANCE_TRANSFER: movimiento interno → filtrar
  - CARD_CHECK (amount 0): verificación sin cargo → filtrar
  - INTEREST / CASHBACK: ingreso → amount negativo (is_income_tx lo detecta)
"""
import os
import json
import re
import urllib.request
import urllib.error
import datetime
import uuid
from config import logger

WISE_API_TOKEN = os.environ.get("WISE_API_TOKEN")
BASE_URL = "https://api.wise.com"

# Tipos de actividad que son movimientos INTERNOS → se filtran completamente
INTERNAL_TYPES = {
    'CONVERSION',           # EUR → USD dentro de tu cuenta
    'BALANCE_TRANSFER',     # Entre tus propios balances de Wise
    'TRANSFER_SELF',        # Transferencia a ti mismo
    'BALANCE_DEPOSIT',      # Depósito desde otra sección tuya
}

# Tipos que son ingresos (amount negativo para que is_income_tx los detecte)
INCOME_TYPES = {
    'INTEREST',
    'BALANCE_CASHBACK',
    'CASHBACK',
    'REFUND',
    'INCOMING_PAYMENT',
}

# Mapeo de merchants/palabras clave a categorías
CATEGORY_MAP = {
    'apple': 'Electronics',
    'google': 'Electronics',
    'amazon': 'Shopping',
    'mercadona': 'Food',
    'carrefour': 'Food',
    'lidl': 'Food',
    'aldi': 'Food',
    'starbucks': 'Coffee',
    'mcdonald': 'Food',
    'burger': 'Food',
    'uber': 'Transport',
    'cabify': 'Transport',
    'renfe': 'Transport',
    'netflix': 'Tech',
    'spotify': 'Tech',
    'sharesub': 'Tech',
    'spliiit': 'Tech',
    'ionos': 'Tech',
    'gym': 'Leisure',
    'fitness': 'Leisure',
    'paypal': 'Shopping',
    'zara': 'Shopping',
    'primark': 'Shopping',
}

def get_category(description: str) -> str:
    desc_lower = description.lower()
    for keyword, category in CATEGORY_MAP.items():
        if keyword in desc_lower:
            return category
    return 'General'


def get_wise_transactions(days_back=120):
    logger.info("Iniciando conexión con Wise API (Datos Reales)")

    if not WISE_API_TOKEN:
        logger.error("WISE_API_TOKEN no encontrado en variables de entorno.")
        return []

    headers = {
        "Authorization": f"Bearer {WISE_API_TOKEN}",
        "Content-Type": "application/json"
    }

    def fetch_data(url):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as e:
            logger.error(f"HTTP Error Wise: {e.code} - {e.reason} — URL: {url}")
            raise e

    try:
        # 1. Perfil personal
        profiles = fetch_data(f"{BASE_URL}/v1/profiles")
        personal = next((p for p in profiles if p.get('type') == 'personal'), profiles[0])
        profile_id = personal['id']
        logger.info(f"Wise profile_id: {profile_id}")

        # 2. Cuenta EUR
        accounts = fetch_data(f"{BASE_URL}/v4/profiles/{profile_id}/balances?types=STANDARD")
        eur_account = next((acc for acc in accounts if acc.get('currency') == 'EUR'), None)
        if not eur_account:
            logger.error("No se encontró cuenta EUR en Wise.")
            return []
        logger.info("Wise EUR account encontrada")

        cutoff_date = (datetime.datetime.now() - datetime.timedelta(days=days_back)).replace(tzinfo=None)
        formatted = []

        # 3. Transferencias salientes
        try:
            transfers_url = (
                f"{BASE_URL}/v1/transfers?"
                f"profile={profile_id}&"
                f"status=outgoing_payment_sent&"
                f"limit=100"
            )
            transfers = fetch_data(transfers_url)
            logger.info(f"Wise transfers recibidas: {len(transfers)}")

            for t in transfers:
                try:
                    created_str = t.get('created', '')
                    if not created_str:
                        continue
                    tx_date_dt = datetime.datetime.fromisoformat(
                        created_str.replace('Z', '+00:00').replace('+00:00', '')
                    )
                    if tx_date_dt < cutoff_date:
                        continue

                    tx_date = tx_date_dt.strftime('%Y-%m-%d')
                    # Guardamos hora para ordenación posterior
                    tx_sort_time = tx_date_dt.strftime('%H:%M:%S')
                    amount = float(t.get('sourceValue', t.get('targetValue', 0)))
                    tx_id = str(t.get('id', uuid.uuid4()))

                    details = t.get('details', {})
                    ref = details.get('reference', '')
                    target_name = t.get('targetAccount', {}).get('accountHolderName', '')
                    description = ref if ref else (target_name if target_name else 'Wise Transfer')

                    formatted.append({
                        'transaction_id':   tx_id,
                        'amount':           str(amount),
                        'transaction_date': tx_date,
                        'sort_time':        tx_sort_time,
                        'description':      description,
                        'currency':         t.get('sourceCurrency', 'EUR'),
                        'category':         get_category(description)
                    })
                except Exception as e:
                    logger.error(f"Error mapeando transfer: {e}")
                    continue

        except Exception as e:
            logger.error(f"Error obteniendo transfers: {e}")

        # 4. Actividades (card transactions, ingresos, etc.)
        try:
            activities_url = f"{BASE_URL}/v1/profiles/{profile_id}/activities?size=100"
            activities_resp = fetch_data(activities_url)
            activity_list = activities_resp if isinstance(activities_resp, list) else activities_resp.get('activities', [])
            logger.info(f"Wise activities recibidas: {len(activity_list)}")

            for a in activity_list:
                try:
                    tx_type = a.get('type', '').upper()

                    # ── Filtrar movimientos internos ──────────────────────────
                    if tx_type in INTERNAL_TYPES:
                        continue

                    # ── Filtrar CARD_CHECK (verificaciones sin cargo real) ────
                    if tx_type == 'CARD_CHECK':
                        continue

                    # ── Detectar si es transferencia interna (To EUR, To USD, etc.) ──
                    # Se hace antes de leer la fecha para poder usarlo en el append
                    _title_raw = re.sub(r'<[^>]+>', '', str(a.get('title', a.get('description', '')))).strip().lower()
                    is_internal_tx = bool(re.match(r'^to (eur|usd|gbp|chf|pln|ron|huf|czk|sek|nok|dkk)\b', _title_raw))

                    created_str = a.get('createdOn', a.get('created', ''))
                    if not created_str:
                        continue

                    tx_date_dt = datetime.datetime.fromisoformat(
                        created_str.replace('Z', '+00:00').replace('+00:00', '')
                    )
                    if tx_date_dt < cutoff_date:
                        continue

                    tx_date = tx_date_dt.strftime('%Y-%m-%d')
                    tx_sort_time = tx_date_dt.strftime('%H:%M:%S')
                    tx_id = str(a.get('id', uuid.uuid4()))

                    # ── Parsear amount desde primaryAmount ("30 EUR", "1.21 EUR") ──
                    amt_raw = a.get('primaryAmount', a.get('amount', '0'))
                    # Quitar HTML tags y el símbolo +
                    amt_clean = re.sub(r'<[^>]+>', '', str(amt_raw))
                    amt_clean = re.sub(r'[^0-9.]', '', amt_clean.split()[0]) if amt_clean.strip() else '0'
                    raw_amount = float(amt_clean) if amt_clean else 0.0

                    # ── Determinar si es ingreso ──────────────────────────────
                    is_income = tx_type in INCOME_TYPES
                    final_amount = -abs(raw_amount) if is_income else abs(raw_amount)

                    # ── Descripción limpia (sin HTML) ─────────────────────────
                    raw_desc = a.get('title', a.get('description', 'Wise Activity'))
                    description = re.sub(r'<[^>]+>', '', str(raw_desc)).strip() or 'Wise Activity'

                    # Evitar duplicados con transfers
                    if not any(f['transaction_id'] == tx_id for f in formatted):
                        formatted.append({
                            'transaction_id':   tx_id,
                            'amount':           str(final_amount),
                            'transaction_date': tx_date,
                            'sort_time':        tx_sort_time,
                            'description':      description,
                            'currency':         'EUR',
                            'category':         'Transfer' if is_internal_tx else get_category(description),
                            'is_internal':      is_internal_tx
                        })
                except Exception as e:
                    logger.error(f"Error mapeando activity: {e}")
                    continue

        except Exception as e:
            logger.info(f"Activities endpoint no disponible: {e}")

        # 5. Ordenar por fecha DESC y luego por hora DESC (mismo día → orden cronológico inverso)
        formatted.sort(
            key=lambda x: f"{x['transaction_date']}T{x.get('sort_time','00:00:00')}",
            reverse=True
        )

        logger.info(f"Wise ingesta completa: {len(formatted)} transacciones formateadas.")
        return formatted

    except Exception as e:
        logger.error("Error conectando con Wise", extra={"details": str(e)})
        return []


def save_wise_to_dynamo(transactions, user_id):
    from config import table, logger as _logger

    saved_items = []
    for t in transactions:
        try:
            tx_id    = t['transaction_id']
            tx_date  = t['transaction_date']
            # Incluimos la hora en el sort key para ordenación correcta en DynamoDB
            sort_time = t.get('sort_time', '00:00:00')
            sort_key  = f"{tx_date}T{sort_time}#{tx_id}"

            item = {
                'user_id':          user_id,
                'transaction_date': sort_key,
                'transaction_id':   tx_id,
                'amount':           str(t['amount']),
                'description':      t['description'],
                'currency':         t.get('currency', 'EUR'),
                'category':         t.get('category', 'General'),
                'is_internal':      t.get('is_internal', False)
            }
            table.put_item(Item=item)
            saved_items.append(item)
        except Exception as e:
            _logger.error("DynamoDB Wise Save Error", extra={"details": str(e)})

    _logger.info(
        "Metric: TransactionsSaved",
        extra={"metric": "TransactionsSaved", "value": len(saved_items), "unit": "Count"}
    )
    return saved_items