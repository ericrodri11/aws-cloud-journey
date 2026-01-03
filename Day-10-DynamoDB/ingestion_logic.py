import json
import boto3
import uuid
import random
from datetime import datetime
from decimal import Decimal

# --- CONFIGURATION ---
MOCK_MODE = True
TABLE_NAME = "FinanceAgent-Transactions" # El nombre exacto de tu tabla

# Initialize DynamoDB (Outside handler for performance)
dynamodb = boto3.resource('dynamodb', region_name='eu-north-1')
table = dynamodb.Table(TABLE_NAME)

def get_secret():
    if MOCK_MODE: return {"SECRET_ID": "mock", "SECRET_KEY": "mock"}
    
    secret_name = "prod/finance-agent/banking-keys"
    region_name = "eu-north-1"
    session = boto3.session.Session()
    client = session.client(service_name='secretsmanager', region_name=region_name)
    try:
        get_secret_value_response = client.get_secret_value(SecretId=secret_name)
        return json.loads(get_secret_value_response['SecretString'])
    except Exception as e:
        print(f"Error retrieving secret: {e}")
        raise e

def generate_mock_transactions():
    """Generates fake bank transactions for testing"""
    today = datetime.now().isoformat()
    return [
        {
            "transaction_id": str(uuid.uuid4()),
            "date": today,
            "amount": Decimal('5.50'),
            "currency": "EUR",
            "description": "Starbucks Coffee",
            "category": "Food & Drink"
        },
        {
            "transaction_id": str(uuid.uuid4()),
            "date": today,
            "amount": Decimal('15.20'),
            "currency": "EUR",
            "description": "Uber Ride",
            "category": "Transport"
        },
        {
            "transaction_id": str(uuid.uuid4()),
            "date": today,
            "amount": Decimal('89.99'),
            "currency": "EUR",
            "description": "Amazon AWS Bill",
            "category": "Technology"
        }
    ]

def save_to_dynamodb(transactions):
    """Saves a list of transactions to DynamoDB"""
    count = 0
    for tx in transactions:
        # Construct the Item following our Schema (PK: user_id, SK: transaction_date)
        item = {
            'user_id': 'user_eric_01',  # Partition Key
            'transaction_date': str(datetime.now()) + "_" + tx['transaction_id'], # Sort Key (Unique)
            'amount': tx['amount'],
            'description': tx['description'],
            'category': tx['category'],
            'currency': tx['currency']
        }
        
        try:
            table.put_item(Item=item)
            print(f"✅ Saved: {tx['description']} ({tx['amount']}€)")
            count += 1
        except Exception as e:
            print(f"❌ Error saving item: {e}")
            
    return count

def lambda_handler(event, context):
    print("🤖 Starting Ingestion Process...")
    
    # 1. Auth (Simulated)
    secrets = get_secret()
    print("🔐 Auth Successful (Mock Mode)")
    
    # 2. Fetch Data (Simulated)
    print("🔄 Fetching transactions from Bank...")
    transactions = generate_mock_transactions()
    
    # 3. Save to DB
    print(f"💾 Saving {len(transactions)} transactions to DynamoDB...")
    saved_count = save_to_dynamodb(transactions)
    
    return {
        'statusCode': 200,
        'body': json.dumps(f"Success! Saved {saved_count} transactions to DynamoDB.")
    }