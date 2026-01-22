import json
import boto3
import os
import datetime
import time
from decimal import Decimal

# --- EXTERNAL LIBRARIES (FROM LAYER) ---
import plaid
from plaid.api import plaid_api
from plaid.model.products import Products
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions

# --- CONFIGURATION ---
REGION_RESOURCE = 'eu-north-1'
REGION_BEDROCK = 'us-east-1' 
TABLE_NAME = "FinanceAgent-Transactions"
MODEL_ID = "amazon.nova-micro-v1:0"

# VARIABLES
PLAID_CLIENT_ID = os.environ.get('PLAID_CLIENT_ID')
PLAID_SECRET = os.environ.get('PLAID_SECRET')
USER_EMAIL = os.environ.get('USER_EMAIL', 'ericridri11@gmail.com') 
SPENDING_LIMIT = 100.00
USER_ID = "user_eric" 
DAYS_LOOKBACK_DASHBOARD = 30 # Miramos 30 días para llenar los gráficos

# --- CLIENTES AWS ---
dynamodb = boto3.resource('dynamodb', region_name=REGION_RESOURCE)
table = dynamodb.Table(TABLE_NAME)
ses = boto3.client('ses', region_name=REGION_RESOURCE)
bedrock = boto3.client(service_name='bedrock-runtime', region_name=REGION_BEDROCK)

# --- CLIENTE PLAID ---
configuration = plaid.Configuration(
    host=plaid.Environment.Sandbox,
    api_key={'clientId': PLAID_CLIENT_ID, 'secret': PLAID_SECRET}
)
api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)

# ==========================================
# PART 1: INGESTION
# ==========================================

def ingest_plaid_data():
    print("🏦 Connecting to Plaid Sandbox...")
    pt_request = SandboxPublicTokenCreateRequest(
        institution_id='ins_109508', 
        initial_products=[Products('transactions')]
    )
    pt_response = client.sandbox_public_token_create(pt_request)
    public_token = pt_response['public_token']

    exchange_request = ItemPublicTokenExchangeRequest(public_token=public_token)
    exchange_response = client.item_public_token_exchange(exchange_request)
    access_token = exchange_response['access_token']
    
    print("⏳ Waiting 2s for Plaid...")
    time.sleep(2) 
    
    # Traemos 30 días para llenar la App
    start_date = (datetime.datetime.now() - datetime.timedelta(days=DAYS_LOOKBACK_DASHBOARD)).date()
    end_date = datetime.datetime.now().date()
    
    request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date,
        options=TransactionsGetRequestOptions(count=50) 
    )
    response = client.transactions_get(request)
    return response['transactions']

def save_to_dynamo(transactions):
    saved_items = []
    for t in transactions:
        try:
            item = {
                'user_id': USER_ID,
                'transaction_date': str(t['date']),
                'transaction_id': t['transaction_id'],
                'amount': str(t['amount']),
                'description': t['name'],
                'currency': t['iso_currency_code'],
                'category': t['category'][0] if t['category'] else "Uncategorized"
            }
            table.put_item(Item=item)
            saved_items.append(item)
        except Exception as e:
            print(f"⚠️ Error saving: {e}")
            
    return saved_items

# ==========================================
# PART 2: BEDROCK AI (PERSONALITY)
# ==========================================

def invoke_nova_ai(transactions, total_spent, is_alert):
    # Lógica de tono sarcástico
    if is_alert:
        tone_instruction = """
        CRITICAL: The user spent TOO MUCH yesterday. You are a tough, sarcastic financial coach.
        Talk directly to 'Eric' (use "You"). Never refer to him as "user_eric".
        
        LOGIC FOR ANALYSIS:
        1. If 'United Airlines' appears: Ask him if he thinks he is a millionaire.
        2. If 'Uber' appears and cost < 10: Ask why he didn't walk. 
        3. If 'Uber' appears and cost > 10: Ask why he didn't take the bus.
        4. If 'Gusto' appears (income): Acknowledge it, but warn him not to blow it all at once.
        """
    else:
        tone_instruction = "Eric is doing well with low spending yesterday. Congratulate him briefly, but tell him not to get cocky."

    prompt = f"""
    Act as a TOUGH personal financial advisor talking to Eric.
    Analyze YESTERDAY'S expenses: {json.dumps(transactions, default=str)}
    Total Spent Yesterday: {total_spent} EUR.
    
    {tone_instruction}
    
    FORMATTING RULES (Strict HTML):
    1. Start immediately with <h3><b>Summary:</b></h3> followed by a sharp paragraph (max 3 sentences).
    2. Then write <h3><b>Advice:</b></h3> followed by a direct, actionable lecture (max 3 sentences).
    3. Use <p> tags for text. Do NOT use markdown.
    """
    
    body = json.dumps({
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"max_new_tokens": 1000, "temperature": 0.7}
    })

    try:
        response = bedrock.invoke_model(
            body=body, modelId=MODEL_ID,
            accept="application/json", contentType="application/json"
        )
        response_body = json.loads(response.get("body").read())
        raw_text = response_body['output']['message']['content'][0]['text']
        
        # Limpieza de Markdown
        clean_text = raw_text.replace('```html', '').replace('```', '').strip()
        return clean_text
        
    except Exception as e:
        return f"AI Error: {str(e)}"

# ==========================================
# PART 3: EMAIL (PREHEADER ROBUSTO)
# ==========================================

def generate_html_email(subject, ai_analysis, total_spent, is_alert, transactions):
    color = "#ef4444" if is_alert else "#10b981" 
    status_text = "🚨 High Daily Spending" if is_alert else "✅ Daily Balance Update"
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    
    summary_clean = ai_analysis.replace("<h3><b>Summary:</b></h3>", "").replace("<p>", "").replace("</p>", "").replace("<h3><b>Advice:</b></h3>", "")
    summary_clean = summary_clean[:90] 
    
    preview_text = f"{status_text} | Total: {total_spent:.2f}€. {summary_clean}..."
    padding = "&zwnj;&nbsp;" * 50
    
    preheader_block = f"""
    <div style="display:none; max-height:0px; overflow:hidden;">
        {preview_text}
        {padding}
    </div>
    """
    
    if transactions:
        tx_rows = ""
        for t in transactions:
            try:
                amount_float = float(t['amount'])
                formatted_price = f"{amount_float:.2f}€"
            except:
                formatted_price = f"{t['amount']}€"

            tx_rows += f"""
            <div style="display:flex; justify-content:space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #334155;">
                <span style="color: #e2e8f0; font-size: 13px; margin-right: 15px; flex: 1;">
                    {t['description']}
                </span>
                <span style="font-weight:bold; color: #f8fafc; font-size: 14px; white-space: nowrap;">
                    {formatted_price}
                </span>
            </div>"""
        
        tx_section = f"""
        <div style="margin-bottom: 24px; margin-top: 30px;">
            <h3 style="color: #94a3b8; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 10px;">
                Yesterday's Activity
            </h3>
            {tx_rows}
        </div>
        """
    else:
        tx_section = ""

    return f"""
    <html>
    <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0f172a; color: #cbd5e1; padding: 10px;">
        {preheader_block}
        <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
            
            <div style="background-color: {color}; padding: 25px 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">{status_text}</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">{date_str}</p>
            </div>
            
            <div style="padding: 24px;">
                <div style="background-color: #334155; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 25px;">
                    <span style="display: block; font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 5px;">Yesterday's Spend</span>
                    <span style="display: block; font-size: 36px; font-weight: 800; color: white;">{total_spent:.2f} €</span>
                </div>
                
                <div style="margin-bottom: 24px; color: #cbd5e1; line-height: 1.6; font-size: 15px;">
                    {ai_analysis}
                </div>
                
                {tx_section} 
            </div>
        </div>
    </body>
    </html>
    """

def lambda_handler(event, context):
    try:
        # 1. INGEST (Traemos 30 días para la App)
        print("🚀 Step 1: Starting Ingestion (30 Days)...")
        transactions_full = ingest_plaid_data()
        
        # 2. STORE
        print(f"📦 Step 2: Saving {len(transactions_full)} transactions...")
        saved_items_full = save_to_dynamo(transactions_full)
        
        # 3. FILTER FOR EMAIL (Solo ayer)
        yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
        # Filtramos la lista completa para quedarnos solo con lo de ayer (o hoy)
        daily_items = [t for t in saved_items_full if t['transaction_date'] >= yesterday]
        
        # 4. ANALYZE (Solo lo diario para no confundir a la IA)
        total_daily_spent = sum(float(t['amount']) for t in daily_items)
        is_alert = total_daily_spent > SPENDING_LIMIT
        
        print(f"🧠 Step 3: Analyzing Daily Spend ({total_daily_spent}€) with AI...")
        ai_analysis = invoke_nova_ai(daily_items, total_daily_spent, is_alert)
        
        # 5. NOTIFY (Email con datos diarios)
        subject = f"{'🚨' if is_alert else '✅'} Alert: {total_daily_spent:.2f}€ - {datetime.datetime.now().strftime('%d %b')}"
        html_body = generate_html_email(subject, ai_analysis, total_daily_spent, is_alert, daily_items)
        
        ses.send_email(
            Source=USER_EMAIL,
            Destination={'ToAddresses': [USER_EMAIL]},
            Message={
                'Subject': {'Data': subject},
                'Body': {'Html': {'Data': html_body}, 'Text': {'Data': ai_analysis}}
            }
        )
        
        # 6. RETURN PAYLOAD FOR FRONTEND
        response_payload = {
            "status": "success",
            "data": {
                "transactions": saved_items_full,
                "ai_analysis": ai_analysis,
                "total_monthly_spent": sum(float(t['amount']) for t in saved_items_full)
            }
        }

        # MODIFICACIÓN: Quitamos los headers CORS manuales porque la Consola de AWS ya los pone.
        # Si los dejamos aquí, se duplican y falla.
        return {
            'statusCode': 200,
            'headers': {
                "Content-Type": "application/json"
            },
            'body': json.dumps(response_payload, default=str)
        }
        
    except Exception as e:
        print(f"❌ Critical Error: {str(e)}")
        return {
            'statusCode': 500, 
            'headers': {
                "Access-Control-Allow-Origin": "*",
            },
            'body': json.dumps(f"Error: {str(e)}")
        }