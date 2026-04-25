"""
scoring.py — Motor de scoring financiero, proyección, ofertas, perfil de usuario y gamificación.
No llama a la IA ni a Plaid. Solo lógica de negocio pura.
"""
import datetime
import calendar
import hashlib
import json
import time
from decimal import Decimal

from config import (
    table, cache_table, memory_table, bedrock,
    logger, MODEL_ID, CACHE_TTL_HOURS,
    DEFAULT_USER_ID, DEFAULT_USER_NAME,
    is_income_tx
)


def log_metric(metric_name, value, unit="Count", properties={}):
    logger.info(
        f"Metric: {metric_name}",
        extra={"metric": metric_name, "value": value, "unit": unit, **properties}
    )


# ==========================================
# PERFIL DE USUARIO & GAMIFICACIÓN
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
        'display_name': default_name, 'daily_savings_goal': 5.00, 'ai_tone': 'brutal',
        'wants_daily_email': True
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

    today = datetime.date.today()
    _, days_in_month = calendar.monthrange(today.year, today.month)

    daily_income  = projected_monthly_income / days_in_month if projected_monthly_income > 0 else 0
    daily_saved   = daily_income - daily_spent

    target_savings = float(profile.get('daily_savings_goal', 5.00))
    current_streak = int(profile.get('current_streak', 0))
    highest_streak = int(profile.get('highest_streak', 0))

    if daily_saved >= target_savings:
        current_streak += 1
    else:
        current_streak = 0

    if current_streak > highest_streak:
        highest_streak = current_streak

    profile['current_streak'] = current_streak
    profile['highest_streak'] = highest_streak
    profile['last_update']    = today_str

    save_user_profile(profile)
    return current_streak, highest_streak, True


# ==========================================
# PAYROLL OFFSET ENGINE
# ==========================================
def get_accounting_month(transaction_date_str, is_income):
    """
    Desplaza los ingresos de los últimos 5 días del mes al mes siguiente.
    Ej: Nómina el 2026-04-28 → contablemente es 2026-05.
    """
    try:
        t_date = datetime.datetime.strptime(transaction_date_str, '%Y-%m-%d')
        _, last_day = calendar.monthrange(t_date.year, t_date.month)

        if is_income and t_date.day >= (last_day - 4):
            next_month_date = (t_date.replace(day=last_day) + datetime.timedelta(days=1))
            return next_month_date.strftime('%Y-%m')

        return t_date.strftime('%Y-%m')
    except Exception:
        return transaction_date_str[:7]  # Fallback si la fecha viene mal formateada


# ==========================================
# FINANCIAL SCORING ENGINE
# ==========================================
def calculate_financial_score(income, expenses):
    score = 50
    short_reasons = []
    audit_log = ["Base: 50 Points (Default start)."]
    feedback  = ""

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
    if day_of_month == 0:
        return current_expenses
    daily_avg = current_expenses / day_of_month
    return round(daily_avg * days_in_month, 2)


# ==========================================
# MONETIZATION & OFFERS ENGINE
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
# CACHE ENGINE
# ==========================================
def generate_cache_key(transactions, monthly_income, monthly_expenses, mode="dashboard", user_id=DEFAULT_USER_ID):
    data_fingerprint = {
        "user_id": user_id, "mode": mode,
        "income": str(monthly_income), "expenses": str(monthly_expenses),
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

        item      = response['Item']
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
            'cache_key': cache_key, 'response': response_text,
            'timestamp': datetime.datetime.now().isoformat(),
            'ttl': ttl_timestamp, 'user_id': user_id
        })
        log_metric("CacheSaved", 1)
    except Exception as e:
        logger.warning("Cache save failed", extra={"details": str(e)})
