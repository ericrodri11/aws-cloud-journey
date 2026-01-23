import json
import boto3
import os
import datetime
import time
import calendar
from decimal import Decimal

# --- EXTERNAL LIBRARIES ---
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
DAYS_LOOKBACK = 30 

# --- CLIENTES ---
dynamodb = boto3.resource('dynamodb', region_name=REGION_RESOURCE)
table = dynamodb.Table(TABLE_NAME)
ses = boto3.client('ses', region_name=REGION_RESOURCE)
bedrock = boto3.client(service_name='bedrock-runtime', region_name=REGION_BEDROCK)

configuration = plaid.Configuration(
    host=plaid.Environment.Sandbox,
    api_key={'clientId': PLAID_CLIENT_ID, 'secret': PLAID_SECRET}
)
api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)

# ==========================================
# PART 0: SCORING & FORECAST ENGINE
# ==========================================
def calculate_financial_score(income, expenses):
    score = 50 
    short_reasons = [] # Emojis
    audit_log = ["Base: 50 Points (Default start)."]
    feedback = ""
    
    if income <= 0:
        savings_rate = 0
    else:
        savings = income - expenses
        savings_rate = (savings / income) * 100

    if savings_rate >= 50: 
        score += 40
        short_reasons.append("🔥 High Savings Rate (+40)")
        audit_log.append(f"Savings (+40): Elite savings rate of {savings_rate:.1f}%.")
        feedback = "Outstanding! You're saving >50% of income."
    elif savings_rate >= 20: 
        score += 20
        short_reasons.append("✅ Healthy Savings (+20)")
        audit_log.append(f"Savings (+20): Healthy savings rate of {savings_rate:.1f}%.")
        feedback = "Solid habits. Keep building the nest egg."
    elif savings_rate > 0: 
        score += 10
        short_reasons.append("👍 Positive Cashflow (+10)")
        audit_log.append("Savings (+10): Positive cashflow, but tight margins.")
        feedback = "Profitable, but watch your margins."
    else: 
        score -= 20
        short_reasons.append("⚠️ Negative Cashflow (-20)")
        audit_log.append("Penalty (-20): Expenses exceeded Income.")
        feedback = "Critical: You spent more than you earned."
    
    if expenses < 500:
        score += 10
        short_reasons.append("🛡️ Frugal Month (+10)")
        audit_log.append("Frugality (+10): Low absolute volume (<500€).")
    elif expenses > 4000:
        score -= 5
        short_reasons.append("💸 High Volume (-5)")
        audit_log.append("Penalty (-5): High Volume (>4000€).")
        
    return max(0, min(100, int(score))), short_reasons, audit_log, feedback

def calculate_projection(current_expenses):
    today = datetime.date.today()
    _, days_in_month = calendar.monthrange(today.year, today.month)
    day_of_month = today.day
    if day_of_month == 0: return current_expenses
    daily_avg = current_expenses / day_of_month
    return round(daily_avg * days_in_month, 2)

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
    
    exchange_response = client.item_public_token_exchange(ItemPublicTokenExchangeRequest(public_token=public_token))
    access_token = exchange_response['access_token']
    
    time.sleep(2) 
    
    start_date = (datetime.datetime.now() - datetime.timedelta(days=DAYS_LOOKBACK)).date()
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
# PART 2: AI BRAIN (SOPORTE DE CHAT + IRONÍA PROTEGIDA)
# ==========================================
def invoke_nova_ai(daily_txs, total_daily_spent, monthly_income, monthly_expenses, user_query=None):
    
    # --- MODO 1: CHAT INTERACTIVO (PREGUNTA DEL USUARIO) ---
    if user_query:
        prompt = f"""
        You are a sarcastic, witty financial assistant talking to Eric.
        Context:
        - Monthly Income: {monthly_income:.2f}€
        - Monthly Expenses: {monthly_expenses:.2f}€
        - Recent Transactions: {json.dumps(daily_txs[:5], default=str)}
        
        USER QUESTION: "{user_query}"
        
        Answer sharply and directly. Max 2 sentences. Be ironic if appropriate.
        """
        try:
            resp = bedrock.invoke_model(
                body=json.dumps({"messages": [{"role": "user", "content": [{"text": prompt}]}], "inferenceConfig": {"max_new_tokens": 150}}),
                modelId=MODEL_ID
            )
            return json.loads(resp.get("body").read())['output']['message']['content'][0]['text'], ""
        except:
            return "I'm ignoring you right now (System Error).", ""

    # --- MODO 2: ANÁLISIS AUTOMÁTICO (DASHBOARD & EMAIL) ---
    net_surplus = monthly_income - monthly_expenses
    dashboard_prompt = f"""
    You are a sarcastic financial AI. 
    We have a Net Surplus of {net_surplus:.2f} EUR this month.
    Write a ONE-SENTENCE status update celebrating this surplus amount specifically.
    Max 130 chars. Be sharp.
    """
    
    # Lógica de "Tough Love" (Intacta Día 24)
    if total_daily_spent > 50:
        tone = "CRITICAL: User spent TOO MUCH. Roast him."
    else:
        tone = "User spent little. Congratulate him, but suspiciously."

    email_prompt = f"""
    Act as a TOUGH personal financial advisor talking to Eric.
    Analyze expenses: {json.dumps(daily_txs, default=str)}
    Total Spent: {total_daily_spent} EUR.
    {tone}
    FORMATTING:
    1. <h3><b>Summary:</b></h3> [Sharp paragraph]
    2. <h3><b>Advice:</b></h3> [Actionable lecture]
    3. Use <p> tags. Be concise.
    """
    
    try:
        resp_dash = bedrock.invoke_model(
            body=json.dumps({"messages": [{"role": "user", "content": [{"text": dashboard_prompt}]}], "inferenceConfig": {"max_new_tokens": 100}}),
            modelId=MODEL_ID
        )
        dash_text = json.loads(resp_dash.get("body").read())['output']['message']['content'][0]['text']
        
        resp_email = bedrock.invoke_model(
            body=json.dumps({"messages": [{"role": "user", "content": [{"text": email_prompt}]}], "inferenceConfig": {"max_new_tokens": 500}}),
            modelId=MODEL_ID
        )
        email_text = json.loads(resp_email.get("body").read())['output']['message']['content'][0]['text']
        
        return dash_text.strip(), email_text.replace('```html', '').replace('```', '').strip()
        
    except Exception as e:
        return "System Offline.", f"AI Error: {str(e)}"

# ==========================================
# PART 3: EMAIL (INTACTO DÍA 24)
# ==========================================
def generate_html_email(subject, ai_analysis, total_spent, is_alert, transactions):
    color = "#ef4444" if is_alert else "#10b981" 
    status_text = "🚨 High Spending" if is_alert else "✅ Balance Update"
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    
    summary_clean = ai_analysis.replace("<h3><b>Summary:</b></h3>", "").replace("<p>", "").replace("</p>", "").replace("<h3><b>Advice:</b></h3>", "")[:90]
    preview_text = f"{status_text} | Total: {total_spent:.2f}€. {summary_clean}..."
    padding = "&zwnj;&nbsp;" * 50
    preheader_block = f"""<div style="display:none; max-height:0px; overflow:hidden;">{preview_text}{padding}</div>"""
    
    # PROTECCIÓN: Si no hay transacciones, activity section se queda vacía
    if transactions:
        tx_rows = ""
        for t in transactions:
            try:
                formatted_price = f"{float(t['amount']):.2f}€"
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
                Latest Activity
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
                    <span style="display: block; font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px;">Yesterday's Spend</span>
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
        # DETECCIÓN DE CHAT (DÍA 28)
        query_params = event.get('queryStringParameters')
        user_query = query_params.get('query') if query_params else None

        transactions = ingest_plaid_data()
        saved_items = save_to_dynamo(transactions)
        
        # Filtro Mes Actual (Sincronizado)
        current_month_str = datetime.datetime.now().strftime('%Y-%m')
        total_income = 0.0
        total_expenses = 0.0
        
        for t in saved_items:
            if t['transaction_date'].startswith(current_month_str):
                amount = float(t['amount'])
                desc = t['description'].lower()
                is_income = (any(x in desc for x in ['deposit', 'credit', 'payroll', 'gusto', 'refund'])) or amount < 0
                if is_income: total_income += abs(amount)
                else: total_expenses += abs(amount)
        
        projected_spend = calculate_projection(total_expenses)
        
        # Recuperamos los Emojis (short_reasons) y el Log Detallado
        fin_score, score_short_reasons, score_audit_log, score_feedback = calculate_financial_score(total_income, total_expenses)
        
        # Filtro Diario (Para Email y Contexto de Chat)
        yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
        daily_items = [t for t in saved_items if t['transaction_date'] >= yesterday]
        total_daily_spent = sum(float(t['amount']) for t in daily_items if float(t['amount']) > 0)
        is_alert = total_daily_spent > SPENDING_LIMIT
        
        # LLAMADA A IA (Soporta Chat O Análisis Diario)
        dash_message, email_html_body = invoke_nova_ai(daily_items, total_daily_spent, total_income, total_expenses, user_query)
        
        # SOLO enviamos email si NO es una consulta de chat (para no spammear)
        if not user_query:
            subject = f"{'🚨' if is_alert else '✅'} Alert: {total_daily_spent:.2f}€ - {datetime.datetime.now().strftime('%d %b')}"
            full_email_html = generate_html_email(subject, email_html_body, total_daily_spent, is_alert, daily_items)
            ses.send_email(
                Source=USER_EMAIL,
                Destination={'ToAddresses': [USER_EMAIL]},
                Message={'Subject': {'Data': subject}, 'Body': {'Html': {'Data': full_email_html}, 'Text': {'Data': "HTML req"}}}
            )
        
        response_payload = {
            "status": "success",
            "data": {
                "transactions": saved_items,
                "dashboard_message": dash_message,
                "financial_score": fin_score,
                "score_short_reasons": score_short_reasons, # Emojis devueltos
                "score_audit_log": score_audit_log,
                "score_feedback": score_feedback,
                "total_income": total_income,
                "total_expenses": total_expenses,
                "projected_spend": projected_spend
            }
        }

        return {
            'statusCode': 200,
            'headers': {"Content-Type": "application/json"},
            'body': json.dumps(response_payload, default=str)
        }
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps(f"Error: {str(e)}")}