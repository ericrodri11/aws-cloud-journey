import json
import boto3
from datetime import datetime
from decimal import Decimal

# --- CONFIGURATION ---
REGION_BEDROCK = 'us-east-1' 
REGION_RESOURCE = 'eu-north-1'
TABLE_NAME = "FinanceAgent-Transactions"
MODEL_ID = "amazon.nova-micro-v1:0"

# ARN
TOPIC_ARN = "arn:aws:sns:eu-north-1:723013807294:FinanceAgent-Alerts"

# Spending Limit (100 Euros)
SPENDING_LIMIT = 100.00  

# --- AWS CLIENTS ---
bedrock = boto3.client(service_name='bedrock-runtime', region_name=REGION_BEDROCK)
dynamodb = boto3.resource('dynamodb', region_name=REGION_RESOURCE)
table = dynamodb.Table(TABLE_NAME)
sns = boto3.client('sns', region_name=REGION_RESOURCE)

def get_today_transactions():
    """Reads transactions from DynamoDB"""
    try:
        response = table.scan()
        return response.get('Items', [])
    except Exception as e:
        print(f"Error reading DB: {e}")
        return []

def invoke_nova_ai(transactions, total_spent, is_alert):
    """Consults Amazon Nova with a dynamic prompt in English"""
    
    # Tone instructions based on alert status
    if is_alert:
        tone = "The user has overspent. Be strict, direct, and give stern advice on how to save money immediately."
    else:
        tone = "Spending is within limits. Congratulate the user and be brief."

    prompt = f"""
    Act as a personal financial assistant.
    Analyze these recent expenses:
    {json.dumps(transactions, default=str)}
    
    Total spent today: {total_spent} EUR.
    Tone Instruction: {tone}
    
    Your response must be a short summary followed by a specific piece of advice.
    """
    
    body = json.dumps({
        "messages": [
            {
                "role": "user",
                "content": [{"text": prompt}]
            }
        ],
        "inferenceConfig": {
            "max_new_tokens": 800,
            "temperature": 0.7
        }
    })

    try:
        response = bedrock.invoke_model(
            body=body, 
            modelId=MODEL_ID,
            accept="application/json", 
            contentType="application/json"
        )
        response_body = json.loads(response.get("body").read())
        return response_body['output']['message']['content'][0]['text']
    except Exception as e:
        return f"AI Error: {str(e)}"

def lambda_handler(event, context):
    print("🧠 Starting Smart Analysis...")
    
    try:
        # 1. Get Data
        transactions = get_today_transactions()
        
        # 2. Calculate Total (Math Logic)
        # Convert Decimal/String to Float for summation
        total_spent = sum(float(t['amount']) for t in transactions)
        
        # 3. Decision Logic (Business Logic)
        is_alert = total_spent > SPENDING_LIMIT
        
        print(f"💰 Total: {total_spent}€ | Alert Mode: {is_alert}")

        # 4. Consult AI (Passing context)
        ai_analysis = invoke_nova_ai(transactions, total_spent, is_alert)
        
        # 5. Define Dynamic Email Subject (English)
        date_str = datetime.now().strftime("%Y-%m-%d")
        
        if is_alert:
            subject = f"🚨 ALERT: High Spending Detected ({total_spent}€) - {date_str}"
        else:
            subject = f"✅ Daily Balance Summary ({total_spent}€) - {date_str}"

        # 6. Send Email via SNS
        sns.publish(
            TopicArn=TOPIC_ARN,
            Message=f"Smart Financial Report:\n\n{ai_analysis}\n\n--\nPowered by AWS Nova",
            Subject=subject
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps('Smart report sent!')
        }
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f"Error: {str(e)}")
        }