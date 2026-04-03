import json
import boto3
import os
import datetime
import time
import calendar
import hashlib
import random 
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
MODEL_ID = "amazon.nova-micro-v1:0"

# VARIABLES
PLAID_CLIENT_ID = os.environ.get('PLAID_CLIENT_ID')
PLAID_SECRET = os.environ.get('PLAID_SECRET')
USER_EMAIL = os.environ.get('USER_EMAIL', 'ericridri11@gmail.com') 
SPENDING_LIMIT = 100.00
STRICT_DAILY_BUDGET = 15.00 # Límite para mantener la racha de ahorro
DAYS_LOOKBACK = 120 
CACHE_TTL_HOURS = 1 
SNS_TOPIC_ARN = "arn:aws:sns:eu-north-1:723013807294:FinanceAgent-Alerts"

# VARIABLES DINÁMICAS POR DEFECTO (Fallback)
DEFAULT_USER_ID = os.environ.get('USER_ID', 'user_eric')
DEFAULT_USER_NAME = os.environ.get('USER_NAME', 'Eric')

# --- CLIENTES ---
dynamodb = boto3.resource('dynamodb', region_name=REGION_RESOURCE)
table = dynamodb.Table(TABLE_NAME)
cache_table = dynamodb.Table(CACHE_TABLE_NAME)
ses = boto3.client('ses', region_name=REGION_RESOURCE)
bedrock = boto3.client(service_name='bedrock-runtime', region_name=REGION_BEDROCK)
sns = boto3.client('sns', region_name=REGION_RESOURCE)
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
# PART 0.8: GAMIFICATION ENGINE
# ==========================================
def update_user_streak(user_id, daily_spent):
    profile_id = f"PROFILE#{user_id}"
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    
    try:
        response = table.get_item(Key={'user_id': user_id, 'transaction_date': profile_id})
        profile = response.get('Item', {
            'user_id': user_id,
            'transaction_date': profile_id,
            'transaction_id': 'METADATA',
            'current_streak': 0,
            'highest_streak': 0,
            'last_update': '1970-01-01'
        })
        
        if profile.get('last_update') == today_str:
            return profile['current_streak'], profile['highest_streak'], False

        current_streak = int(profile.get('current_streak', 0))
        highest_streak = int(profile.get('highest_streak', 0))

        if daily_spent <= STRICT_DAILY_BUDGET:
            current_streak += 1
            logger.info("Streak incremented", extra={"new_streak": current_streak})
        else:
            current_streak = 0
            logger.info("Streak reset to zero due to high spending")

        if current_streak > highest_streak:
            highest_streak = current_streak
            
        profile['current_streak'] = current_streak
        profile['highest_streak'] = highest_streak
        profile['last_update'] = today_str
        
        table.put_item(Item=profile)
        return current_streak, highest_streak, True
        
    except Exception as e:
        logger.error("Gamification engine failed", extra={"details": str(e)})
        return 0, 0, False

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
# PART 3: MONETIZATION & OFFERS ENGINE (NUEVO)
# ==========================================
def generate_financial_offers(score, income, expenses):
    """
    Simula el modelo de negocio de una Fintech recomendando productos
    basados en la salud financiera del usuario.
    """
    net_surplus = income - expenses
    offers = []

    # Perfil 1: Alto Score y Liquidez -> Inversión / Tarjeta Premium
    if score >= 70 and net_surplus > 500:
        offers.append({
            "id": "OFFER_CC_PREM",
            "type": "CREDIT_CARD",
            "title": "FinAI Premium Rewards",
            "description": f"Your excellent score of {score} pre-qualifies you for our 2% unlimited cashback card.",
            "cta_text": "Claim Offer",
            "color": "indigo"
        })
    
    # Perfil 2: Problemas de Cashflow -> Préstamo
    elif score < 50 and net_surplus < 0:
        offers.append({
            "id": "OFFER_LOAN_CONSOL",
            "type": "LOAN",
            "title": "Debt Consolidation Loan",
            "description": "We noticed a negative cashflow. Consolidate your debt today with a 5.9% APR loan.",
            "cta_text": "See Options",
            "color": "amber"
        })
        
    # Perfil 3: Altos ahorros inactivos -> Cuenta Remunerada
    if net_surplus > 1000:
        offers.append({
            "id": "OFFER_SAVINGS_HY",
            "type": "INVESTMENT",
            "title": "High-Yield Savings",
            "description": f"You have {net_surplus:.2f}€ sitting idle. Move it to our 4.5% APY account.",
            "cta_text": "Start Earning",
            "color": "emerald"
        })
        
    # Perfil 4: Fallback genérico para todos
    if len(offers) == 0:
         offers.append({
            "id": "OFFER_EDU_BUDGET",
            "type": "EDUCATION",
            "title": "Mastering Budgeting",
            "description": "Free guide to optimizing your daily expenses and increasing your financial score.",
            "cta_text": "Read Now",
            "color": "blue"
        })

    return offers[:2] # Retornamos un máximo de 2 ofertas para no saturar la UI

# ==========================================
# PART 4: AI BRAIN
# ==========================================
def invoke_nova_ai(daily_txs, total_daily_spent, monthly_income, monthly_expenses, user_query=None, user_name=DEFAULT_USER_NAME, current_streak=0):
    start_time = time.time()
    
    if user_query:
        log_metric("AIChatRequest", 1)
        prompt = f"""
        You are {user_name}'s brutal personal financial advisor. No sugar-coating.
        Context: Monthly Income: {monthly_income:.2f}€ | Expenses: {monthly_expenses:.2f}€ | Streak: {current_streak} days without bad spending.
        Activity: {json.dumps(daily_txs[:5], default=str)}
        USER QUESTION: "{user_query}"
        RULES:
        1. Call them "{user_name}" or "you".
        2. Max 2 sentences. Be sharp and ironic.
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
    You are {user_name}'s sarcastic financial AI. Net Surplus: {net_surplus:.2f}€. Streak: {current_streak} days.
    Write ONE sharp sentence celebrating or criticizing this. Max 120 chars. Be witty.
    """
    
    email_tone = f"CRITICAL: {user_name} spent TOO MUCH. Break their ego." if total_daily_spent > 50 else f"{user_name} spent little. Suspicious. Investigate."
    has_starbucks = any('starbucks' in t.get('description', '').lower() for t in daily_txs)
    
    specific_instructions = ""
    if has_starbucks: specific_instructions += "- STARBUCKS DETECTED: Mock their coffee habit.\n"
    if current_streak == 0: specific_instructions += "- STREAK BROKEN: Roast them for ruining their savings streak today.\n"
    elif current_streak > 3: specific_instructions += f"- GOOD STREAK: Grudgingly admit {current_streak} days of good behavior is acceptable.\n"

    email_prompt = f"""
    Act as {user_name}'s TOUGH financial advisor. No politeness.
    Expenses: {json.dumps(daily_txs, default=str)} | Total: {total_daily_spent}€ | Streak: {current_streak} days.
    {email_tone}
    SPECIFIC CRITIQUES: {specific_instructions}
    FORMATTING (Strict HTML):
    1. <h3><b>Summary:</b></h3> [Sharp critique, max 3 sentences]
    2. <h3><b>Advice:</b></h3> [Actionable advice. Max 3 sentences]
    Use <p> tags. NO markdown. Be concise and brutal.
    """
    
    try:
        resp_dash = bedrock.invoke_model(body=json.dumps({"messages": [{"role": "user", "content": [{"text": dashboard_prompt}]}], "inferenceConfig": {"max_new_tokens": 80, "temperature": 0.8}}), modelId=MODEL_ID)
        body_dash = json.loads(resp_dash.get("body").read())
        dash_text = body_dash['output']['message']['content'][0]['text']
        calculate_and_log_cost(body_dash, "dashboard_short")
        
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
# PART 5: EMAIL & SMS
# ==========================================
def generate_html_email(subject, ai_analysis, total_spent, is_alert, transactions):
    color = "#ef4444" if is_alert else "#10b981" 
    status_text = "🚨 High Spending" if is_alert else "✅ Balance Update"
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    
    preview_text = f"{status_text} | Total: {total_spent:.2f}€."
    padding = "&zwnj;&nbsp;" * 50
    preheader_block = f"""<div style="display:none; font-size:1px; color:#333333; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">{preview_text}{padding}</div>"""
    
    tx_rows = "".join([f"""<div style="display:flex; justify-content:space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #334155;"><span style="color: #e2e8f0; font-size: 13px; margin-right: 15px; flex: 1;">{t.get('description', '')}</span><span style="font-weight:bold; color: #f8fafc; font-size: 14px; white-space: nowrap;">{float(t.get('amount', 0)):.2f}€</span></div>""" for t in transactions]) if transactions else ""
    tx_section = f"""<div style="margin-bottom: 24px; margin-top: 30px;"><h3 style="color: #94a3b8; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #475569; padding-bottom: 8px; margin-bottom: 10px;">Latest Activity</h3>{tx_rows}</div>""" if transactions else ""

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
# LAMBDA HANDLER 
# ==========================================
@logger.inject_lambda_context(log_event=False)
def lambda_handler(event, context):
    try:
        user_id = event.get('user_id', DEFAULT_USER_ID)
        user_name = event.get('user_name', DEFAULT_USER_NAME)
        logger.append_keys(user_id=user_id)
        logger.info("Execution started", extra={"user_name": user_name})

        query_params = event.get('queryStringParameters') or {}
        user_query = query_params.get('query')
        
        force_sync = query_params.get('sync') == 'true'
        test_email = query_params.get('test_email') == 'true'

        is_api_request = 'requestContext' in event
        is_scheduled_event = event.get('source') == 'aws.events'
        current_hour = datetime.datetime.now().hour
        
        is_report_time = is_scheduled_event or (current_hour == 7) or test_email
        
        if is_report_time or force_sync or not is_api_request:
            logger.info("Sync triggered. Ingesting from Plaid API.")
            raw_transactions = ingest_plaid_data()
            saved_items = save_to_dynamo(raw_transactions, user_id)
        else:
            logger.info("Read path triggered. Fetching from DynamoDB.")
            saved_items = get_transactions_from_dynamo(user_id)
            if not saved_items:
                transactions = ingest_plaid_data()
                saved_items = save_to_dynamo(transactions, user_id)
        
        current_month_str = datetime.datetime.now().strftime('%Y-%m')
        total_income, total_expenses = 0.0, 0.0
        
        for t in saved_items:
            t_date = t.get('transaction_date', '')
            if t_date.startswith(current_month_str):
                amount = float(t.get('amount', 0))
                desc = t.get('description', '').lower()
                if any(x in desc for x in ['deposit', 'credit', 'payroll', 'gusto', 'refund']) or amount < 0: 
                    total_income += abs(amount)
                else: 
                    total_expenses += abs(amount)

        today_str = datetime.datetime.now().strftime('%Y-%m-%d')
        yesterday_str = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
        
        target_date = yesterday_str if is_report_time else today_str
        
        daily_items = [t for t in saved_items if t.get('transaction_date') == target_date]
        total_daily_spent = sum(float(t.get('amount', 0)) for t in daily_items if float(t.get('amount', 0)) > 0)
        is_alert = total_daily_spent > SPENDING_LIMIT
        
        current_streak = 0
        if is_report_time:
            current_streak, highest_streak, _ = update_user_streak(user_id, total_daily_spent)
        else:
            profile = table.get_item(Key={'user_id': user_id, 'transaction_date': f"PROFILE#{user_id}"}).get('Item', {})
            current_streak = int(profile.get('current_streak', 0))

        fin_score, score_short_reasons, score_audit_log, score_feedback = calculate_financial_score(total_income, total_expenses)
        projected_spend = calculate_projection(total_expenses)
        
        # 🚀 GENERAR OFERTAS FINANCIERAS (MONETIZACIÓN)
        financial_offers = generate_financial_offers(fin_score, total_income, total_expenses)

        from_cache, dash_message, email_html_body = False, "", ""

        if not user_query and not is_report_time and not force_sync:
            cache_key = generate_cache_key(saved_items, total_income, total_expenses, "dashboard", user_id)
            cached_message, cache_hit = get_cached_response(cache_key)
            if cache_hit:
                dash_message, email_html_body, from_cache = f"⚡ {cached_message}", cached_message, True

        if not dash_message:
            if user_query:
                dash_message, email_html_body = invoke_nova_ai(daily_items, total_daily_spent, total_income, total_expenses, user_query, user_name, current_streak)
            else:
                dash_message, email_html_body = invoke_nova_ai(daily_items, total_daily_spent, total_income, total_expenses, None, user_name, current_streak)
                if not is_report_time:
                    save_to_cache(generate_cache_key(saved_items, total_income, total_expenses, "dashboard", user_id), dash_message, user_id)

        if not user_query:
            if is_report_time: 
                ses.send_email(
                    Source=USER_EMAIL, Destination={'ToAddresses': [USER_EMAIL]},
                    Message={
                        'Subject': {
                            'Data': f"{'🚨' if is_alert else '✅'} Daily Update: {datetime.datetime.now().strftime('%d %b')}",
                            'Charset': 'UTF-8' 
                        }, 
                        'Body': {
                            'Html': {
                                'Data': generate_html_email("Update", email_html_body, total_daily_spent, is_alert, daily_items),
                                'Charset': 'UTF-8' 
                            }
                        }
                    }
                )
            if is_alert: send_sms_if_needed(total_daily_spent, user_id) 
        
        return {
            'statusCode': 200,
            'headers': {"Content-Type": "application/json"},
            'body': json.dumps({
                "status": "success",
                "data": {
                    "transactions": saved_items, 
                    "dashboard_message": dash_message, 
                    "from_cache": from_cache,
                    "financial_score": fin_score, 
                    "score_short_reasons": score_short_reasons, 
                    "total_income": total_income,
                    "total_expenses": total_expenses, 
                    "projected_spend": projected_spend, 
                    "current_streak": current_streak,
                    "financial_offers": financial_offers # <-- NUEVO PAYLOAD PARA EL FRONTEND
                }
            }, default=str)
        }
    except Exception as e:
        logger.error("Lambda Handler Failed", extra={"details": str(e)})
        return {'statusCode': 500, 'body': json.dumps(f"Error: {str(e)}")}