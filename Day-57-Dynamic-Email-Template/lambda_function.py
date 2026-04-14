import json
import boto3
import os
import datetime
import time
import calendar
import hashlib
import random
import base64 
from decimal import Decimal

# --- EXTERNAL LIBRARIES ---
import plaid
from plaid.api import plaid_api
from plaid.model.products import Products
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from aws_lambda_powertools import Logger
from boto3.dynamodb.conditions import Key

# --- CONFIGURATION ---
REGION_RESOURCE = 'eu-north-1'
REGION_BEDROCK = 'us-east-1' 
TABLE_NAME = "FinanceAgent-Transactions"
CACHE_TABLE_NAME = "FinanceAgent-Cache"
MEMORY_TABLE_NAME = "FinanceAgent-Memory" 
MODEL_ID = "amazon.nova-micro-v1:0"
SQS_QUEUE_URL = "https://sqs.eu-north-1.amazonaws.com/723013807294/FinanceAgent-SyncQueue"

# VARIABLES
PLAID_CLIENT_ID = os.environ.get('PLAID_CLIENT_ID')
PLAID_SECRET = os.environ.get('PLAID_SECRET')
USER_EMAIL = os.environ.get('USER_EMAIL', 'ericridri11@gmail.com') 
SPENDING_LIMIT = 100.00
STRICT_DAILY_BUDGET = 15.00 
DAYS_LOOKBACK = 120 
CACHE_TTL_HOURS = 1 
SNS_TOPIC_ARN = "arn:aws:sns:eu-north-1:723013807294:FinanceAgent-Alerts"

# VARIABLES DINÁMICAS POR DEFECTO
DEFAULT_USER_ID = os.environ.get('USER_ID', 'user_eric')
DEFAULT_USER_NAME = os.environ.get('USER_NAME', 'Eric')

# --- CLIENTES ---
dynamodb = boto3.resource('dynamodb', region_name=REGION_RESOURCE)
table = dynamodb.Table(TABLE_NAME)
cache_table = dynamodb.Table(CACHE_TABLE_NAME)
memory_table = dynamodb.Table(MEMORY_TABLE_NAME) 
ses = boto3.client('ses', region_name=REGION_RESOURCE)
bedrock = boto3.client(service_name='bedrock-runtime', region_name=REGION_BEDROCK)
sns = boto3.client('sns', region_name=REGION_RESOURCE)
sqs = boto3.client('sqs', region_name=REGION_RESOURCE)
logger = Logger(service="FinanceAgent")

configuration = plaid.Configuration(
    host=plaid.Environment.Sandbox,
    api_key={'clientId': PLAID_CLIENT_ID, 'secret': PLAID_SECRET}
)
api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)

# --- HELPER: STRUCTURED LOGGING ---
def log_metric(metric_name, value, unit="Count", properties={}):
    logger.info(
        f"Metric: {metric_name}",
        extra={
            "metric": metric_name,
            "value": value,
            "unit": unit,
            **properties
        }
    )

def calculate_and_log_cost(response_body, mode):
    try:
        usage = response_body.get('usage', {})
        input_tokens = usage.get('inputTokens', 0)
        output_tokens = usage.get('outputTokens', 0)
        
        cost_input = (input_tokens / 1000) * 0.00035
        cost_output = (output_tokens / 1000) * 0.00140
        total_cost = round(cost_input + cost_output, 7)
        
        log_metric("AICost", total_cost, unit="USD", properties={
            "mode": mode,
            "tokens_in": input_tokens,
            "tokens_out": output_tokens
        })
    except Exception as e:
        logger.warning("Cost calc failed", extra={"details": str(e)})

# ==========================================
# ⚡ PART 0.5: SISTEMA DE CACHÉ
# ==========================================
def generate_cache_key(transactions, monthly_income, monthly_expenses, mode="dashboard", user_id=DEFAULT_USER_ID):
    data_fingerprint = {
        "user_id": user_id,
        "mode": mode,
        "income": str(monthly_income),
        "expenses": str(monthly_expenses),
        "transactions": [
            {"date": t.get('transaction_date', ''), "amount": t.get('amount', 0), "desc": t.get('description', '')}
            for t in transactions if t.get('transaction_id') != 'METADATA'
        ]
    }
    json_str = json.dumps(data_fingerprint, sort_keys=True, default=str)
    return hashlib.sha256(json_str.encode()).hexdigest()

def get_cached_response(cache_key):
    try:
        response = cache_table.get_item(Key={'cache_key': cache_key})
        if 'Item' not in response:
            log_metric("CacheMiss", 1)
            return None, False
        
        item = response['Item']
        cached_time = datetime.datetime.fromisoformat(item['timestamp'])
        time_diff = (datetime.datetime.now() - cached_time).total_seconds() / 3600 
        
        if time_diff > CACHE_TTL_HOURS:
            log_metric("CacheExpired", 1, properties={"age_hours": time_diff})
            return None, False
        
        log_metric("CacheHit", 1, properties={"age_minutes": time_diff * 60})
        return item['response'], True
    except Exception as e:
        logger.warning("Cache read failed", extra={"details": str(e)})
        return None, False

def save_to_cache(cache_key, response_text, user_id=DEFAULT_USER_ID):
    try:
        ttl_timestamp = int(time.time()) + (CACHE_TTL_HOURS * 3600)
        cache_table.put_item(Item={
            'cache_key': cache_key,
            'response': response_text,
            'timestamp': datetime.datetime.now().isoformat(),
            'ttl': ttl_timestamp,
            'user_id': user_id
        })
        log_metric("CacheSaved", 1)
    except Exception as e:
        logger.warning("Cache save failed", extra={"details": str(e)})

# ==========================================
# PART 0.8: USER PROFILE & GAMIFICATION
# ==========================================
def get_user_profile(user_id, default_name):
    profile_id = f"PROFILE#{user_id}"
    try:
        response = table.get_item(Key={'user_id': user_id, 'transaction_date': profile_id})
        if 'Item' in response:
            return response['Item']
    except Exception as e:
        logger.error("Error fetching profile", extra={"details": str(e)})
        
    return {
        'user_id': user_id, 'transaction_date': profile_id, 'transaction_id': 'METADATA',
        'current_streak': 0, 'highest_streak': 0, 'last_update': '1970-01-01',
        'display_name': default_name, 'daily_savings_goal': 5.00, 'ai_tone': 'brutal'
    }

def save_user_profile(profile):
    try:
        table.put_item(Item=profile)
        return True
    except Exception as e:
        logger.error("Error saving profile", extra={"details": str(e)})
        return False

def update_user_streak(profile, daily_spent, projected_monthly_income):
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    if profile.get('last_update') == today_str:
        return profile['current_streak'], profile['highest_streak'], False

    # --- NUEVA LÓGICA: AHORRO DIARIO ---
    today = datetime.date.today()
    _, days_in_month = calendar.monthrange(today.year, today.month)
    
    # Ingreso diario prorrateado vs Gasto de hoy
    daily_income = projected_monthly_income / days_in_month if projected_monthly_income > 0 else 0
    daily_saved = daily_income - daily_spent
    
    target_savings = float(profile.get('daily_savings_goal', 5.00))
    current_streak = int(profile.get('current_streak', 0))
    highest_streak = int(profile.get('highest_streak', 0))

    # Si ahorraste igual o más que tu meta, la racha sube.
    if daily_saved >= target_savings:
        current_streak += 1
    else:
        current_streak = 0

    if current_streak > highest_streak:
        highest_streak = current_streak
        
    profile['current_streak'] = current_streak
    profile['highest_streak'] = highest_streak
    profile['last_update'] = today_str
    
    save_user_profile(profile)
    return current_streak, highest_streak, True

# ==========================================
# 🧠 PART 0.9: AI SEMANTIC MEMORY
# ==========================================
def get_or_create_monthly_memory(user_id, previous_month_str, previous_month_txs):
    try:
        response = memory_table.get_item(Key={'user_id': user_id, 'month': previous_month_str})
        if 'Item' in response:
            log_metric("MemoryHit", 1)
            return response['Item']['summary']

        log_metric("MemoryMiss", 1)
        if not previous_month_txs:
            return "No data available from last month."

        prompt = f"""
        Analyze these financial transactions from the previous month ({previous_month_str}): 
        {json.dumps(previous_month_txs[:50], default=str)}. 
        Write a strict 2-sentence psychological profile of this user's spending weaknesses. 
        Be ruthless. This will be used as context to mock them in the future.
        """
        
        resp = bedrock.invoke_model(
            body=json.dumps({"messages": [{"role": "user", "content": [{"text": prompt}]}], "inferenceConfig": {"max_new_tokens": 150, "temperature": 0.7}}),
            modelId=MODEL_ID
        )
        body_json = json.loads(resp.get("body").read())
        summary = body_json['output']['message']['content'][0]['text']
        calculate_and_log_cost(body_json, "memory_generation")

        memory_table.put_item(Item={
            'user_id': user_id, 
            'month': previous_month_str, 
            'summary': summary, 
            'timestamp': datetime.datetime.now().isoformat()
        })
        return summary
    except Exception as e:
        logger.error("Memory Engine Error", extra={"details": str(e)})
        return ""

# ==========================================
# PART 1: INGESTION
# ==========================================
def ingest_plaid_data():
    log_metric("PlaidConnectionStart", 1)
    pt_request = SandboxPublicTokenCreateRequest(
        institution_id='ins_109508', 
        initial_products=[Products('transactions')]
    )
    pt_response = client.sandbox_public_token_create(pt_request)
    public_token = pt_response['public_token']
    
    exchange_response = client.item_public_token_exchange(ItemPublicTokenExchangeRequest(public_token=public_token))
    access_token = exchange_response['access_token']
    
    time.sleep(8) 
    
    start_date = (datetime.datetime.now() - datetime.timedelta(days=DAYS_LOOKBACK)).date()
    end_date = datetime.datetime.now().date()
    
    request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date,
        options=TransactionsGetRequestOptions(count=500) 
    )
    response = client.transactions_get(request)
    return response['transactions']

def save_to_dynamo(transactions, user_id):
    saved_items = []
    for t in transactions:
        try:
            item = {
                'user_id': user_id,
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
            logger.error("DynamoDB Save Error", extra={"details": str(e)})
    
    log_metric("TransactionsSaved", len(saved_items))
    return saved_items

def get_transactions_from_dynamo(user_id):
    try:
        response = table.query(
            KeyConditionExpression=Key('user_id').eq(user_id)
        )
        items = response.get('Items', [])
        transactions = [item for item in items if item.get('transaction_id') != 'METADATA']
        log_metric("DynamoDBReadSuccess", len(transactions))
        return transactions
    except Exception as e:
        logger.error("DynamoDB Read Error", extra={"details": str(e)})
        return []

# ==========================================
# PART 2: SCORING & FORECAST ENGINE
# ==========================================
def calculate_financial_score(income, expenses):
    score = 50 
    short_reasons = []
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
# PART 3: MONETIZATION & OFFERS ENGINE 
# ==========================================
def generate_financial_offers(score, income, expenses):
    net_surplus = income - expenses
    offers = []

    if score >= 70 and net_surplus > 500:
        offers.append({
            "id": "OFFER_CC_PREM", "type": "CREDIT_CARD", "title": "FinAI Premium Rewards",
            "description": f"Your excellent score of {score} pre-qualifies you for our 2% unlimited cashback card.",
            "cta_text": "Claim Offer", "color": "indigo"
        })
    elif score < 50 and net_surplus < 0:
        offers.append({
            "id": "OFFER_LOAN_CONSOL", "type": "LOAN", "title": "Debt Consolidation Loan",
            "description": "We noticed a negative cashflow. Consolidate your debt today with a 5.9% APR loan.",
            "cta_text": "See Options", "color": "amber"
        })
        
    if net_surplus > 1000:
        offers.append({
            "id": "OFFER_SAVINGS_HY", "type": "INVESTMENT", "title": "High-Yield Savings",
            "description": f"You have {net_surplus:.2f}€ sitting idle. Move it to our 4.5% APY account.",
            "cta_text": "Start Earning", "color": "emerald"
        })
        
    if len(offers) == 0:
         offers.append({
            "id": "OFFER_EDU_BUDGET", "type": "EDUCATION", "title": "Mastering Budgeting",
            "description": "Free guide to optimizing your daily expenses and increasing your financial score.",
            "cta_text": "Read Now", "color": "blue"
        })

    return offers[:2]

# ==========================================
# PART 4: AI BRAIN (ACTUALIZADO CON MEMORIA Y OPTIMIZADO)
# ==========================================
def invoke_nova_ai(daily_txs, total_daily_spent, monthly_income, monthly_expenses, user_query=None, user_name=DEFAULT_USER_NAME, current_streak=0, historical_memory="", ai_tone="brutal", is_report_time=False):
    start_time = time.time()
    
    tone_instruction = "Be sharp, ruthless and sarcastic. No sugar-coating."
    if ai_tone == "polite":
        tone_instruction = "The user requested a 'polite' tone because they can't handle the truth. Mock them subtly for being emotionally fragile, then give the financial advice politely."
    elif ai_tone == "supportive":
        tone_instruction = "Be supportive but firm. Highlight their progress but don't let them get away with bad financial habits."
    elif ai_tone == "professional":
        tone_instruction = "Act as a strict, cold, and highly professional wealth manager. No jokes, no sarcasm, just cold hard financial facts."
    
    # --- CORRECCIÓN BUG PLAID: Instrucciones estrictas sobre los números negativos ---
    financial_context = f"""
    Context: Monthly Income: {monthly_income:.2f}€ | Expenses: {monthly_expenses:.2f}€ | Streak: {current_streak} days.
    CRITICAL RULE FOR PLAID DATA: In the transaction list, negative amounts (e.g., -4.22) represent CREDITS, INCOME, REFUNDS or INTEREST EARNED. They are NOT debts or expenses. Only positive numbers are expenses.
    """

    if user_query:
        log_metric("AIChatRequest", 1)
        prompt = f"""
        You are {user_name}'s personal financial advisor. {tone_instruction}
        {financial_context}
        AI Historical Memory of User: {historical_memory}
        Activity: {json.dumps(daily_txs[:5], default=str)}
        USER QUESTION: "{user_query}"
        RULES:
        1. Call them "{user_name}".
        2. Max 2 sentences. Connect their question to their historical weaknesses if possible.
        3. If streak is 0, mock them for failing.
        Answer:
        """
        try:
            resp = bedrock.invoke_model(
                body=json.dumps({"messages": [{"role": "user", "content": [{"text": prompt}]}], "inferenceConfig": {"max_new_tokens": 100, "temperature": 0.8}}),
                modelId=MODEL_ID
            )
            body_json = json.loads(resp.get("body").read())
            response_text = body_json['output']['message']['content'][0]['text']
            calculate_and_log_cost(body_json, "chat")
            log_metric("AILatency", time.time() - start_time, unit="Seconds", properties={"mode": "chat"})
            return response_text, ""
        except Exception as e:
            logger.error("Bedrock Chat Error", extra={"details": str(e)})
            return "I'm ignoring you right now (System Error).", ""

    log_metric("AIDashboardRequest", 1)
    net_surplus = monthly_income - monthly_expenses
    
    dashboard_prompt = f"""
    You are {user_name}'s financial AI. {tone_instruction} 
    {financial_context}
    Historical weaknesses: {historical_memory}
    Write ONE sentence celebrating or criticizing their current state. Max 120 chars. Be witty and reference their history.
    """
    
    try:
        # 1. Siempre genera el texto corto para la web (Muy rápido)
        resp_dash = bedrock.invoke_model(body=json.dumps({"messages": [{"role": "user", "content": [{"text": dashboard_prompt}]}], "inferenceConfig": {"max_new_tokens": 80, "temperature": 0.8}}), modelId=MODEL_ID)
        body_dash = json.loads(resp_dash.get("body").read())
        dash_text = body_dash['output']['message']['content'][0]['text']
        calculate_and_log_cost(body_dash, "dashboard_short")
        
        email_text = ""
        
        # 2. SOLO genera el correo HTML pesado si SQS se lo pide (Evita lentitud en la web)
        if is_report_time:
            email_tone = f"CRITICAL: {user_name} spent TOO MUCH. Break their ego." if total_daily_spent > 50 else f"{user_name} spent little. Suspicious. Investigate."
            has_starbucks = any('starbucks' in t.get('description', '').lower() for t in daily_txs)
            
            specific_instructions = ""
            if has_starbucks: specific_instructions += "- STARBUCKS DETECTED: Call out their coffee habit.\n"
            if current_streak == 0: specific_instructions += "- STREAK BROKEN: Roast them for ruining their savings streak today.\n"

            email_prompt = f"""
            Act as {user_name}'s financial advisor. {tone_instruction}
            {financial_context}
            Expenses: {json.dumps(daily_txs, default=str)} | Total spent today: {total_daily_spent}€
            Past Performance Context: {historical_memory}
            {email_tone}
            SPECIFIC CRITIQUES: {specific_instructions}
            FORMATTING (Strict HTML):
            1. <h3><b>Summary:</b></h3> [Critique, max 3 sentences. Compare today with their historical flaws.]
            2. <h3><b>Advice:</b></h3> [Actionable advice. Max 3 sentences]
            Use <p> tags. NO markdown.
            """
            resp_email = bedrock.invoke_model(body=json.dumps({"messages": [{"role": "user", "content": [{"text": email_prompt}]}], "inferenceConfig": {"max_new_tokens": 400, "temperature": 0.8}}), modelId=MODEL_ID)
            body_email = json.loads(resp_email.get("body").read())
            email_text = body_email['output']['message']['content'][0]['text']
            calculate_and_log_cost(body_email, "email_tough_love")
        
        log_metric("AILatency", time.time() - start_time, unit="Seconds", properties={"mode": "full_analysis"})
        return dash_text.strip(), email_text.replace('```html', '').replace('```', '').strip()
    except Exception as e:
        logger.error("Bedrock Full Analysis Error", extra={"details": str(e)})
        return "System Offline.", f"AI Error: {str(e)}"

# ==========================================
# PART 5: EMAIL & SMS (TEMPLATE DINÁMICO MEJORADO)
# ==========================================
def generate_html_email(subject, ai_analysis, total_spent, is_alert, transactions):
    color = "#ef4444" if is_alert else "#10b981" 
    status_text = "🚨 High Spending" if is_alert else "✅ Balance Update"
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    
    preview_text = f"{status_text} | Total: {total_spent:.2f}€."
    padding = "&zwnj;&nbsp;" * 50
    preheader_block = f"""<div style="display:none; font-size:1px; color:#333333; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">{preview_text}{padding}</div>"""
    
    income_txs = []
    expense_txs = []
    
    # 1. Separar transacciones por tipo
    if transactions:
        for t in transactions:
            amount = float(t.get('amount', 0))
            desc = t.get('description', '').lower()
            is_income = any(x in desc for x in ['deposit', 'credit', 'payroll', 'gusto', 'refund']) or amount < 0
            if is_income:
                income_txs.append(t)
            else:
                expense_txs.append(t)
                
    # Función auxiliar para renderizar las filas
    def build_tx_rows(tx_list, is_income_list):
        rows = ""
        for t in tx_list:
            amount = float(t.get('amount', 0))
            display_amount = abs(amount)
            sign = "+" if is_income_list else ""
            color_text = "#10b981" if is_income_list else "#f8fafc"
            rows += f"""<div style="display:flex; justify-content:space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #334155;"><span style="color: #e2e8f0; font-size: 13px; margin-right: 15px; flex: 1;">{t.get('description', '')}</span><span style="font-weight:bold; color: {color_text}; font-size: 14px; white-space: nowrap;">{sign}{display_amount:.2f}€</span></div>"""
        return rows

    # 2. Renderizado Dinámico de la Sección de Actividad
    tx_section = ""
    if income_txs or expense_txs:
        tx_section += f"""<div style="margin-bottom: 24px; margin-top: 30px;"><h3 style="color: #94a3b8; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 10px;">Daily Activity</h3>"""
        
        if income_txs:
            tx_section += f"""<h4 style="color: #10b981; font-size: 11px; text-transform: uppercase; margin-top: 15px; margin-bottom: 5px;">Income / Credits</h4>"""
            tx_section += build_tx_rows(income_txs, True)
            
        if expense_txs:
            tx_section += f"""<h4 style="color: #ef4444; font-size: 11px; text-transform: uppercase; margin-top: 15px; margin-bottom: 5px;">Expenses</h4>"""
            tx_section += build_tx_rows(expense_txs, False)
            
        tx_section += "</div>"

    return f"""<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0f172a; color: #cbd5e1; padding: 10px; margin: 0;">
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

def send_sms_if_needed(amount, user_id):
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    lock_key = f"sms_sent_{date_str}_{user_id}"
    try:
        if 'Item' in cache_table.get_item(Key={'cache_key': lock_key}):
            return
    except: pass
    phrases = ["You said you were going to start saving!", "Do you really need that?", "Your wallet is crying right now."]
    try:
        sns.publish(TopicArn=SNS_TOPIC_ARN, Message=f"🚨 FINAI: You spent {amount:.2f} EUR today. {random.choice(phrases)}", Subject="High Spending")
        cache_table.put_item(Item={'cache_key': lock_key, 'status': 'sent', 'ttl': int(time.time()) + 86400, 'user_id': user_id})
    except Exception as e: logger.error("Error SMS", extra={"details": str(e)})

# ==========================================
# LAMBDA HANDLER (API ROUTER & SQS WORKER)
# ==========================================
@logger.inject_lambda_context(log_event=False)
def lambda_handler(event, context):
    try:
        # --- MODO 1: SQS WORKER (El trabajo asíncrono pesado) ---
        if 'Records' in event:
            for record in event['Records']:
                payload = json.loads(record['body'])
                user_id = payload.get('user_id')
                task = payload.get('task')
                
                logger.info(f"SQS Worker executing task: {task}", extra={"user_id": user_id})
                
                if task in ['daily_report', 'hourly_alert_check']:
                    profile = get_user_profile(user_id, DEFAULT_USER_NAME)
                    saved_items = save_to_dynamo(ingest_plaid_data(), user_id)
                    
                    # Si es el reporte diario, miramos el gasto de ayer. Si es la alerta horaria, miramos el gasto de hoy.
                    today_str = datetime.datetime.now().strftime('%Y-%m-%d')
                    target_date = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime('%Y-%m-%d') if task == 'daily_report' else today_str
                    
                    daily_items = [t for t in saved_items if t.get('transaction_date') == target_date]
                    total_daily_spent = sum(float(t.get('amount', 0)) for t in daily_items if float(t.get('amount', 0)) > 0)
                    
                    # 🚨 1. VIGILANCIA DE ALERTAS (Se ejecuta cada hora)
                    is_alert = total_daily_spent > SPENDING_LIMIT
                    if is_alert:
                        send_sms_if_needed(total_daily_spent, user_id)
                        logger.info("SMS Alert checked/sent", extra={"spent": total_daily_spent})
                    
                    # 📧 2. REPORTE DIARIO (Se ejecuta solo a las 09:00 AM)
                    if task == 'daily_report':
                        current_month_str = datetime.datetime.now().strftime('%Y-%m')
                        last_month = datetime.datetime.now().replace(day=1) - datetime.timedelta(days=1)
                        previous_month_str = last_month.strftime('%Y-%m')
                        
                        total_income, total_expenses, last_month_income = 0.0, 0.0, 0.0
                        for t in saved_items:
                            amount = float(t.get('amount', 0))
                            is_income = any(x in t.get('description', '').lower() for x in ['deposit', 'credit', 'payroll', 'gusto', 'refund']) or amount < 0
                            if t.get('transaction_date', '').startswith(current_month_str):
                                if is_income: total_income += abs(amount)
                                else: total_expenses += abs(amount)
                            elif t.get('transaction_date', '').startswith(previous_month_str):
                                if is_income: last_month_income += abs(amount)

                        projected_monthly_income = total_income if total_income > 0 else last_month_income
                        if projected_monthly_income == 0: projected_monthly_income = 1500.00
                        
                        current_streak, _, _ = update_user_streak(profile, total_daily_spent, projected_monthly_income)
                        historical_memory = get_or_create_monthly_memory(user_id, previous_month_str, [t for t in saved_items if t.get('transaction_date', '').startswith(previous_month_str)])
                        
                        _, email_html_body = invoke_nova_ai(daily_items, total_daily_spent, total_income, total_expenses, None, profile.get('display_name', 'User'), current_streak, historical_memory, profile.get('ai_tone', 'brutal'), True)
                        
                        ses.send_email(
                            Source=USER_EMAIL, Destination={'ToAddresses': [USER_EMAIL]},
                            Message={'Subject': {'Data': f"{'🚨' if is_alert else '✅'} Daily Update: {datetime.datetime.now().strftime('%d %b')}"}, 'Body': {'Html': {'Data': generate_html_email("Update", email_html_body, total_daily_spent, is_alert, daily_items)}}}
                        )
            return {'statusCode': 200}

        # --- MODO 2: ORQUESTADOR EVENTBRIDGE O TEST_EMAIL (Envía a la cola) ---
        is_scheduled_event = event.get('source') == 'aws.events'
        query_params = event.get('queryStringParameters') or {}
        test_email = query_params.get('test_email') == 'true'

        if is_scheduled_event or test_email:
            try:
                # AWS Lambda corre en UTC. 07:00 UTC = 09:00 AM Madrid.
                current_hour = datetime.datetime.now().hour
                is_report_time = (current_hour == 7) or test_email
                
                # Asignamos la tarea correspondiente según la hora
                task_name = 'daily_report' if is_report_time else 'hourly_alert_check'
                
                response = table.scan(FilterExpression=Key('transaction_id').eq('METADATA'))
                all_users = response.get('Items', [])
                
                # FILTRO VITAL: Ignorar los usuarios "user_eric" de prueba para evitar correos dobles
                valid_users = [u for u in all_users if not u.get('user_id', '').startswith('user_eric')]
                
                if not valid_users and test_email: 
                    valid_users = [{'user_id': DEFAULT_USER_ID}] 
                
                for u in valid_users:
                    sqs.send_message(QueueUrl=SQS_QUEUE_URL, MessageBody=json.dumps({"task": task_name, "user_id": u.get('user_id')}))
                
                logger.info(f"Fan-out complete. Queued {len(valid_users)} tasks of type '{task_name}'.")
                return {'statusCode': 200, 'headers': {"Content-Type": "application/json"}, 'body': json.dumps(f"Tasks ({task_name}) queued successfully for {len(valid_users)} users.")}
            except Exception as e:
                logger.error("Fan-out failed", extra={"details": str(e)})
                return {'statusCode': 500, 'body': "Failed to queue reports"}

        # --- MODO 3: HTTP API WEB FRONTEND (La web rápida) ---
        headers = event.get('headers', {})
        auth_header = headers.get('authorization', headers.get('Authorization', ''))
        
        user_id = DEFAULT_USER_ID
        user_name = DEFAULT_USER_NAME

        if auth_header.startswith('Bearer '):
            try:
                token = auth_header.split(' ')[1]
                payload_b64 = token.split('.')[1]
                payload_b64 += '=' * (-len(payload_b64) % 4) 
                payload = json.loads(base64.b64decode(payload_b64).decode('utf-8'))
                
                user_id = payload.get('sub', DEFAULT_USER_ID)
                user_email = payload.get('email', '')
                if user_email: user_name = user_email.split('@')[0].capitalize() 
            except Exception as e:
                logger.error("Error decoding JWT", extra={"details": str(e)})

        logger.append_keys(user_id=user_id)
        user_profile = get_user_profile(user_id, user_name)
        display_name = user_profile.get('display_name', user_name)
        ai_tone = user_profile.get('ai_tone', 'brutal')
        
        http_method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
        
        if http_method == 'POST' or query_params.get('action') == 'save_preferences':
            body = json.loads(event.get('body', '{}'))
            user_profile['display_name'] = body.get('display_name', display_name)
            ahorro_seguro = max(0.0, float(body.get('daily_savings_goal', user_profile.get('daily_savings_goal', 5.0))))
            user_profile['daily_savings_goal'] = Decimal(str(ahorro_seguro))
            user_profile['ai_tone'] = body.get('ai_tone', ai_tone)
            save_user_profile(user_profile)
            return {'statusCode': 200, 'headers': {"Content-Type": "application/json"}, 'body': json.dumps({"status": "success", "message": "Preferences saved"})}

        if query_params.get('action') == 'get_preferences':
            return {'statusCode': 200, 'headers': {"Content-Type": "application/json"}, 'body': json.dumps({"status": "success", "data": user_profile}, default=str)}
            
        user_query = query_params.get('query')
        force_sync = query_params.get('sync') == 'true'

        if force_sync:
            saved_items = save_to_dynamo(ingest_plaid_data(), user_id)
        else:
            saved_items = get_transactions_from_dynamo(user_id)
            if not saved_items:
                saved_items = save_to_dynamo(ingest_plaid_data(), user_id)
        
        current_month_str = datetime.datetime.now().strftime('%Y-%m')
        last_month = datetime.datetime.now().replace(day=1) - datetime.timedelta(days=1)
        previous_month_str = last_month.strftime('%Y-%m')
        
        total_income, total_expenses, last_month_income = 0.0, 0.0, 0.0
        for t in saved_items:
            amount = float(t.get('amount', 0))
            is_income = any(x in t.get('description', '').lower() for x in ['deposit', 'credit', 'payroll', 'gusto', 'refund']) or amount < 0
            if t.get('transaction_date', '').startswith(current_month_str):
                if is_income: total_income += abs(amount)
                else: total_expenses += abs(amount)
            elif t.get('transaction_date', '').startswith(previous_month_str):
                if is_income: last_month_income += abs(amount)

        projected_monthly_income = total_income if total_income > 0 else last_month_income
        if projected_monthly_income == 0: projected_monthly_income = 1500.00 

        today_str = datetime.datetime.now().strftime('%Y-%m-%d')
        daily_items = [t for t in saved_items if t.get('transaction_date') == today_str]
        total_daily_spent = sum(float(t.get('amount', 0)) for t in daily_items if float(t.get('amount', 0)) > 0)
        
        current_streak = int(user_profile.get('current_streak', 0))
        fin_score, score_short_reasons, score_audit_log, score_feedback = calculate_financial_score(total_income, total_expenses)
        projected_spend = calculate_projection(total_expenses)
        financial_offers = generate_financial_offers(fin_score, projected_monthly_income, total_expenses)

        from_cache, dash_message = False, ""

        if not user_query and not force_sync:
            cache_key = generate_cache_key(saved_items, total_income, total_expenses, f"dashboard_{display_name}_{ai_tone}", user_id)
            cached_message, cache_hit = get_cached_response(cache_key)
            if cache_hit: dash_message, from_cache = f"⚡ {cached_message}", True

        if not dash_message:
            previous_month_txs = [t for t in saved_items if t.get('transaction_date', '').startswith(previous_month_str)]
            historical_memory = get_or_create_monthly_memory(user_id, previous_month_str, previous_month_txs)
            
            dash_message, _ = invoke_nova_ai(daily_items, total_daily_spent, total_income, total_expenses, user_query, display_name, current_streak, historical_memory, ai_tone, False)
            if not user_query: save_to_cache(generate_cache_key(saved_items, total_income, total_expenses, f"dashboard_{display_name}_{ai_tone}", user_id), dash_message, user_id) 
        
        return {
            'statusCode': 200,
            'headers': {"Content-Type": "application/json"},
            'body': json.dumps({"status": "success", "data": {"transactions": saved_items, "dashboard_message": dash_message, "from_cache": from_cache, "financial_score": fin_score, "score_short_reasons": score_short_reasons, "total_income": projected_monthly_income, "total_expenses": total_expenses, "projected_spend": projected_spend, "current_streak": current_streak, "financial_offers": financial_offers}}, default=str)
        }
    except Exception as e:
        logger.error("Lambda Handler Failed", extra={"details": str(e)})
        return {'statusCode': 500, 'headers': {"Content-Type": "application/json"}, 'body': json.dumps(f"Error: {str(e)}")}