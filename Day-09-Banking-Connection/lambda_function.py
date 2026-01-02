import json
import boto3
import urllib3
import random
from datetime import datetime

MOCK_MODE = True 

def get_secret():
    secret_name = "prod/finance-agent/banking-keys"
    region_name = "eu-north-1"

    session = boto3.session.Session()
    client = session.client(service_name='secretsmanager', region_name=region_name)
    
    try:
        get_secret_value_response = client.get_secret_value(SecretId=secret_name)
        return json.loads(get_secret_value_response['SecretString'])
    except Exception as e:
        print(f"⚠️ Warning: Could not retrieve secret. ({e})")
        if MOCK_MODE:
            return {"SECRET_ID": "mock_id", "SECRET_KEY": "mock_key"}
        raise e

def generate_mock_data():
    """Genera datos falsos idénticos a los que enviaría el banco"""
    return {
        "access_token": "mock_token_abc123_live",
        "access_expiry": 86400,
        "status": "active"
    }

def lambda_handler(event, context):
    print("🤖 Starting Banking Auth Protocol...")
    
    # 1. Retrieve Secrets
    secrets = get_secret()
    print("✅ Credentials retrieved securely from AWS Secrets Manager.")

    # 2. API Connection Logic
    url = "https://bankaccountdata.gocardless.com/api/v2/token/new/"
    print(f"📡 Sending secure request to: {url}")
    
    # --- (BYPASS) ---
    if MOCK_MODE:
        print("⚠️ NOTICE: Simulation Mode Active (API Signups are temporarily closed).")
        print("🔄 Generating synthetic banking response...")
        
        import time
        time.sleep(1) 
        
        mock_response = generate_mock_data()
        
        print("🎉 SUCCESS: Connection established! (Simulated)")
        print(f"🔑 Session Token generated. Expires in: {mock_response['access_expiry']}s")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                "message": "Authentication Successful (Mock)",
                "token": mock_response['access_token']
            })
        }
    # -------------------------------------

    http = urllib3.PoolManager()
    payload = {
        "secret_id": secrets.get('SECRET_ID'),
        "secret_key": secrets.get('SECRET_KEY')
    }
    
    try:
        response = http.request(
            'POST',
            url,
            body=json.dumps(payload),
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status == 200:
            return {'statusCode': 200, 'body': 'Auth Success'}
        else:
            return {'statusCode': response.status, 'body': 'Auth Failed'}

    except Exception as e:
        print(f"Network Error: {e}")
        raise e