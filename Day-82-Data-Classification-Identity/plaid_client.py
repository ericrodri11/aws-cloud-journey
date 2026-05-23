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
from plaid.model.transactions_sync_request import TransactionsSyncRequest

from config import (
    plaid_client, table, logger,
    DAYS_LOOKBACK, DEFAULT_USER_ID, PLAID_ACCESS_TOKEN
)


def log_metric(metric_name, value, unit="Count", properties={}):
    logger.info(
        f"Metric: {metric_name}",
        extra={"metric": metric_name, "value": value, "unit": unit, **properties}
    )


# ==========================================
# INGESTA DESDE PLAID SANDBOX
# ==========================================
def create_sandbox_access_token():
    pt_request = SandboxPublicTokenCreateRequest(
        institution_id='ins_109508',
        initial_products=[Products('transactions')]
    )
    pt_response = plaid_client.sandbox_public_token_create(pt_request)
    public_token = pt_response['public_token']

    exchange_response = plaid_client.item_public_token_exchange(
        ItemPublicTokenExchangeRequest(public_token=public_token)
    )
    time.sleep(8)  # Plaid Sandbox necesita este delay para indexar transacciones
    return exchange_response['access_token']


def get_plaid_sync_cursor(user_id=DEFAULT_USER_ID):
    try:
        response = table.get_item(
            Key={'user_id': user_id, 'transaction_date': f'PLAID_CURSOR#{user_id}'}
        )
        return response.get('Item', {}).get('cursor')
    except Exception as e:
        logger.warning("Plaid cursor read failed", extra={"details": str(e), "user_id": user_id})
        return None


def save_plaid_sync_cursor(cursor, user_id=DEFAULT_USER_ID):
    if not cursor:
        return
    try:
        table.put_item(Item={
            'user_id': user_id,
            'transaction_date': f'PLAID_CURSOR#{user_id}',
            'transaction_id': 'METADATA',
            'cursor': cursor,
            'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
    except Exception as e:
        logger.warning("Plaid cursor save failed", extra={"details": str(e), "user_id": user_id})


def delete_from_dynamo_by_transaction_ids(transaction_ids, user_id=DEFAULT_USER_ID):
    if not transaction_ids:
        return 0

    existing_items = get_transactions_from_dynamo(user_id)
    deleted = 0
    for item in existing_items:
        if item.get('transaction_id') in transaction_ids:
            try:
                table.delete_item(
                    Key={'user_id': user_id, 'transaction_date': item['transaction_date']}
                )
                deleted += 1
            except Exception as e:
                logger.warning("Plaid delete failed", extra={"details": str(e), "transaction_id": item.get('transaction_id')})
    return deleted


def ingest_plaid_data(user_id=DEFAULT_USER_ID):
    """Llama a Plaid. Si hay access_token persistente, usa sync incremental."""
    log_metric("PlaidConnectionStart", 1)

    access_token = PLAID_ACCESS_TOKEN or create_sandbox_access_token()

    if PLAID_ACCESS_TOKEN:
        try:
            return ingest_plaid_sync_data(access_token, user_id)
        except Exception as e:
            logger.warning("Plaid sync failed; falling back to transactions/get", extra={"details": str(e), "user_id": user_id})

    return ingest_plaid_get_data(access_token)


def ingest_plaid_get_data(access_token):
    """Fallback compatible con el flujo anterior de Plaid."""

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


def ingest_plaid_sync_data(access_token, user_id=DEFAULT_USER_ID):
    cursor = get_plaid_sync_cursor(user_id)
    added, modified, removed = [], [], []
    has_more = True
    next_cursor = cursor

    while has_more:
        request = TransactionsSyncRequest(
            access_token=access_token,
            cursor=next_cursor,
            count=500
        )
        response = plaid_client.transactions_sync(request)
        added.extend(response.get('added', []))
        modified.extend(response.get('modified', []))
        removed.extend(response.get('removed', []))
        has_more = response.get('has_more', False)
        next_cursor = response.get('next_cursor')

    if next_cursor:
        save_plaid_sync_cursor(next_cursor, user_id)

    removed_ids = [
        t.get('transaction_id')
        for t in removed
        if t.get('transaction_id')
    ]
    deleted_count = delete_from_dynamo_by_transaction_ids(removed_ids, user_id)
    log_metric("PlaidSyncRemoved", deleted_count)

    return added + modified


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
                'currency':         t.get('iso_currency_code') or t.get('unofficial_currency_code') or 'USD',
                'category':         t['category'][0] if t.get('category') else "Uncategorized"
            }
            # ConditionExpression: solo escribe si NO existe ya (anti-duplicación)
            try:
                table.put_item(
                    Item=item,
                    ConditionExpression='attribute_not_exists(transaction_date)'
                )
            except Exception as ce:
                if 'ConditionalCheckFailedException' in str(type(ce)):
                    table.update_item(
                        Key={'user_id': user_id, 'transaction_date': sort_key},
                        UpdateExpression='SET amount = :amount, description = :description, currency = :currency, category = :category',
                        ExpressionAttributeValues={
                            ':amount': str(t['amount']),
                            ':description': t['name'],
                            ':currency': t.get('iso_currency_code') or t.get('unofficial_currency_code') or 'USD',
                            ':category': t['category'][0] if t.get('category') else "Uncategorized"
                        }
                    )
                else:
                    raise ce
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
