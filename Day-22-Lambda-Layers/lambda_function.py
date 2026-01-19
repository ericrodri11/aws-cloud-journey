import json
import boto3
import os
import datetime
import time
from decimal import Decimal
# External libraries from Lambda Layer
import plaid
from plaid.api import plaid_api
from plaid.model.products import Products
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions

# --- CONFIGURATION ---
REGION = 'eu-north-1' 
TABLE_NAME = "FinanceAgent-Transactions"

# Environment Variables (Secure storage)
PLAID_CLIENT_ID = os.environ.get('PLAID_CLIENT_ID')
PLAID_SECRET = os.environ.get('PLAID_SECRET')

# AWS Clients
dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

# Plaid Client Configuration
configuration = plaid.Configuration(
    host=plaid.Environment.Sandbox,
    api_key={'clientId': PLAID_CLIENT_ID, 'secret': PLAID_SECRET}
)
api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)

def ingest_plaid_data():
    """Connects to Plaid Sandbox and fetches simulated transactions."""
    print("🏦 Connecting to Plaid Sandbox from Cloud...")
    
    # 1. Create Simulated Public Token (Sandbox only)
    # In production, this token comes from the frontend (Link)
    pt_request = SandboxPublicTokenCreateRequest(
        institution_id='ins_109508', # Platypus Bank (Sandbox Standard)
        initial_products=[Products('transactions')]
    )
    pt_response = client.sandbox_public_token_create(pt_request)
    public_token = pt_response['public_token']

    # 2. Exchange for Access Token
    exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
    exchange_response = client.item_public_token_exchange(exchange_request)
    access_token = exchange_response['access_token']
    
    # 3. Buffer time for data generation
    # Sandbox needs a few seconds to generate fake history after linking
    time.sleep(3) 
    
    # 4. Fetch Transactions (Last 2 days)
    start_date = (datetime.datetime.now() - datetime.timedelta(days=2)).date()
    end_date = datetime.datetime.now().date()
    
    request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date,
        options=TransactionsGetRequestOptions(count=3)
    )
    response = client.transactions_get(request)
    return response['transactions']

def save_to_dynamo(transactions):
    """Parses Plaid data and writes to DynamoDB."""
    count = 0
    for t in transactions:
        try:
            item = {
                'transaction_id': t['transaction_id'],
                'date': str(t['date']),
                'amount': str(t['amount']), # DynamoDB requires Strings or Decimals
                'description': t['name'],
                'currency': t['iso_currency_code'],
                'category': t['category'][0] if t['category'] else "Uncategorized"
            }
            table.put_item(Item=item)
            count += 1
        except Exception as e:
            print(f"⚠️ Failed to save transaction {t['transaction_id']}: {e}")
            
    return count

def lambda_handler(event, context):
    print("🚀 Starting Financial Ingestion Engine...")
    try:
        # Step 1: Fetch Data
        txs = ingest_plaid_data()
        
        # Step 2: Store Data
        saved_count = save_to_dynamo(txs)
        
        message = f"✅ Success: Downloaded and stored {saved_count} transactions."
        print(message)
        
        return {
            'statusCode': 200,
            'body': json.dumps(message)
        }
        
    except Exception as e:
        print(f"❌ Critical Error: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps(f"Error: {str(e)}")}