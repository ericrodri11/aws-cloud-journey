"""
plaid_client.py — Ingesta desde Plaid y persistencia en DynamoDB.
Responsabilidad única: traer transacciones de Plaid y leer/escribir en DynamoDB.
"""
import datetime
import time
from boto3.dynamodb.conditions import Key

from plaid.model.products import Products
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions

from config import (
    plaid_client, table, logger,
    DAYS_LOOKBACK, DEFAULT_USER_ID
)


def log_metric(metric_name, value, unit="Count", properties={}):
    logger.info(
        f"Metric: {metric_name}",
        extra={"metric": metric_name, "value": value, "unit": unit, **properties}
    )


# ==========================================
# INGESTA DESDE PLAID SANDBOX
# ==========================================
def ingest_plaid_data():
    """Llama a la API de Plaid Sandbox y devuelve la lista de transacciones crudas."""
    log_metric("PlaidConnectionStart", 1)

    pt_request = SandboxPublicTokenCreateRequest(
        institution_id='ins_109508',
        initial_products=[Products('transactions')]
    )
    pt_response = plaid_client.sandbox_public_token_create(pt_request)
    public_token = pt_response['public_token']

    exchange_response = plaid_client.item_public_token_exchange(
        ItemPublicTokenExchangeRequest(public_token=public_token)
    )
    access_token = exchange_response['access_token']

    time.sleep(8)  # Plaid Sandbox necesita este delay para indexar transacciones

    start_date = (datetime.datetime.now() - datetime.timedelta(days=DAYS_LOOKBACK)).date()
    end_date   = datetime.datetime.now().date()

    request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date,
        options=TransactionsGetRequestOptions(count=500)
    )
    response = plaid_client.transactions_get(request)
    return response['transactions']


# ==========================================
# PERSISTENCIA EN DYNAMODB
# ==========================================
def save_to_dynamo(transactions, user_id=DEFAULT_USER_ID):
    """
    Escribe las transacciones en DynamoDB usando 'date#transaction_id' como sort key.
    Devuelve la lista de items guardados.
    """
    saved_items = []
    for t in transactions:
        try:
            tx_id   = t['transaction_id']
            tx_date = str(t['date'])
            sort_key = f"{tx_date}#{tx_id}"

            item = {
                'user_id':          user_id,
                'transaction_date': sort_key,
                'transaction_id':   tx_id,
                'amount':           str(t['amount']),
                'description':      t['name'],
                'currency':         t['iso_currency_code'],
                'category':         t['category'][0] if t['category'] else "Uncategorized"
            }
            table.put_item(Item=item)
            saved_items.append(item)
        except Exception as e:
            logger.error("DynamoDB Save Error", extra={"details": str(e)})

    log_metric("TransactionsSaved", len(saved_items))
    return saved_items


def get_transactions_from_dynamo(user_id=DEFAULT_USER_ID):
    """
    Lee todas las transacciones del usuario desde DynamoDB.
    Filtra METADATA y el formato antiguo (sin '#').
    """
    try:
        response = table.query(
            KeyConditionExpression=Key('user_id').eq(user_id)
        )
        items = response.get('Items', [])
        # Solo conservamos el formato canónico "date#transaction_id"
        transactions = [
            item for item in items
            if item.get('transaction_id') != 'METADATA'
            and '#' in item.get('transaction_date', '')
        ]
        log_metric("DynamoDBReadSuccess", len(transactions))
        return transactions
    except Exception as e:
        logger.error("DynamoDB Read Error", extra={"details": str(e)})
        return []
