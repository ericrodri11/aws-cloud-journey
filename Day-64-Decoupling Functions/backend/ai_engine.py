"""
ai_engine.py — Motor de IA (Amazon Nova), memoria semántica mensual y generación del email HTML.

FIX CRÍTICO (chat queries):
  Antes: invoke_nova_ai recibía daily_items (solo las transacciones de HOY) → la IA veía
         un array vacío si las transacciones de Plaid Sandbox no son de hoy → respondía "0 gastos".
  Ahora: cuando hay user_query, se inyectan las transacciones del MES ACTUAL completo pero
         RESUMIDAS (máx 30 items, solo description + amount).  De este modo la IA tiene
         contexto real sin disparar los tokens de Bedrock.
"""
import json
import time
import datetime

from config import (
    bedrock, memory_table, logger,
    MODEL_ID, DEFAULT_USER_NAME,
    is_income_tx
)


def log_metric(metric_name, value, unit="Count", properties={}):
    logger.info(
        f"Metric: {metric_name}",
        extra={"metric": metric_name, "value": value, "unit": unit, **properties}
    )


def calculate_and_log_cost(response_body, mode):
    try:
        usage        = response_body.get('usage', {})
        input_tokens = usage.get('inputTokens', 0)
        output_tokens= usage.get('outputTokens', 0)
        cost_input   = (input_tokens  / 1000) * 0.00035
        cost_output  = (output_tokens / 1000) * 0.00140
        total_cost   = round(cost_input + cost_output, 7)
        log_metric("AICost", total_cost, unit="USD", properties={
            "mode": mode, "tokens_in": input_tokens, "tokens_out": output_tokens
        })
    except Exception as e:
        logger.warning("Cost calc failed", extra={"details": str(e)})


# ==========================================
# AI SEMANTIC MEMORY
# ==========================================
def get_or_create_monthly_memory(user_id, previous_month_str, previous_month_txs):
    """
    Lee (o genera y persiste) el perfil psicológico del mes anterior.
    Se usa como contexto histórico en el dashboard y en el email diario.
    """
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
            body=json.dumps({
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {"max_new_tokens": 150, "temperature": 0.7}
            }),
            modelId=MODEL_ID
        )
        body_json = json.loads(resp.get("body").read())
        summary   = body_json['output']['message']['content'][0]['text']
        calculate_and_log_cost(body_json, "memory_generation")

        memory_table.put_item(Item={
            'user_id': user_id, 'month': previous_month_str,
            'summary': summary, 'timestamp': datetime.datetime.now().isoformat()
        })
        return summary
    except Exception as e:
        logger.error("Memory Engine Error", extra={"details": str(e)})
        return ""


# ==========================================
# AI BRAIN — PROMPTS BLINDADOS CONTRA ALUCINACIONES
# ==========================================
def invoke_nova_ai(
    daily_txs,            # transacciones de hoy (para el email/alertas)
    total_daily_spent,    # total gastado hoy (para el email)
    monthly_income,       # ingresos del mes en curso
    monthly_expenses,     # gastos del mes en curso
    user_query=None,      # pregunta del usuario desde el chat
    user_name=DEFAULT_USER_NAME,
    current_streak=0,
    historical_memory="",
    ai_tone="brutal",
    is_report_time=False,
    monthly_txs=None      # ← NUEVO: transacciones del mes completo (para el chat)
):
    """
    Invoca Amazon Nova con el contexto financiero adecuado.

    MODO CHAT (user_query != None):
      - Usa monthly_txs (mes completo, máx 30 resumidas) como contexto de gastos.
      - Esto soluciona el bug de "0 gastos" cuando las transacciones de Plaid
        no tienen fecha de hoy pero sí tienen fechas de este mes.

    MODO DASHBOARD (user_query == None, is_report_time == False):
      - Usa daily_txs y los totales mensuales para generar el mensaje del terminal.

    MODO EMAIL (is_report_time == True):
      - Usa daily_txs del día anterior + totales mensuales para el email diario.
    """
    tone_instruction = "Be sharp, ruthless and sarcastic. No sugar-coating."
    if ai_tone == "polite":
        tone_instruction = "The user requested a 'polite' tone. Mock them subtly for being emotionally fragile, then give the financial advice politely."

    # ── Separar ingresos y gastos de las transacciones diarias ──────────────
    ai_expenses_daily = []
    ai_incomes_daily  = []
    for t in daily_txs:
        amt  = float(t.get('amount', 0))
        desc = t.get('description', '')
        tx_data = f"- {desc}: {abs(amt):.2f} EUR"
        if is_income_tx(desc, amt):
            ai_incomes_daily.append(tx_data)
        else:
            ai_expenses_daily.append(tx_data)

    def _parse_tx_amount(tx_str):
        try:
            return float(tx_str.rsplit(': ', 1)[-1].replace(' EUR', '').strip())
        except:
            return 0.0

    actual_daily_expense_total = sum(_parse_tx_amount(e) for e in ai_expenses_daily)
    net_surplus = monthly_income - monthly_expenses

    financial_context = f"""
    FINANCIAL CONTEXT:
    - Monthly Surplus: {net_surplus:.2f} EUR
    - Monthly Income:  {monthly_income:.2f} EUR
    - Monthly Expenses:{monthly_expenses:.2f} EUR
    - Savings Streak:  {current_streak} days.
    - Real daily expenses (money OUT): {actual_daily_expense_total:.2f} EUR
    - Any income/credits are listed separately and must NOT be treated as expenses.
    """

    # ==========================================
    # MODO CHAT — FIX del bug de "0 gastos"
    # ==========================================
    if user_query:
        log_metric("AIChatRequest", 1)

        # Construir lista resumida del mes completo (máx 30 ítems, solo expense)
        # Esto es lo que faltaba: la IA ahora ve los gastos reales del mes,
        # no solo los de hoy (que en Plaid Sandbox están en fechas pasadas).
        monthly_expense_summary = []
        monthly_income_summary  = []

        if monthly_txs:
            for t in monthly_txs[:60]:  # leemos hasta 60 para filtrar bien
                amt  = float(t.get('amount', 0))
                desc = t.get('description', '')
                raw_date = t.get('transaction_date', '').split('#')[0]
                line = f"- [{raw_date}] {desc}: {abs(amt):.2f} EUR"
                if is_income_tx(desc, amt):
                    monthly_income_summary.append(line)
                else:
                    monthly_expense_summary.append(line)

            # Limitamos el contexto para controlar el coste de tokens
            monthly_expense_summary = monthly_expense_summary[:30]
            monthly_income_summary  = monthly_income_summary[:10]

        # Si no hay transacciones del mes, usamos las diarias como fallback
        expenses_ctx = monthly_expense_summary if monthly_expense_summary else ai_expenses_daily
        incomes_ctx  = monthly_income_summary  if monthly_income_summary  else ai_incomes_daily

        prompt = f"""You are {user_name}'s financial advisor. {tone_instruction}
{financial_context}
THIS MONTH'S EXPENSES (use these to answer questions about spending):
{chr(10).join(expenses_ctx) if expenses_ctx else "No expense transactions recorded this month."}

THIS MONTH'S INCOME / CREDITS (do NOT treat as expenses):
{chr(10).join(incomes_ctx) if incomes_ctx else "None"}

USER QUESTION: "{user_query}"
RULES: Answer in max 2 sentences. Use the transaction list above as your source of truth.
If no transactions are listed, say so honestly instead of inventing numbers."""

        try:
            resp = bedrock.invoke_model(
                body=json.dumps({
                    "messages": [{"role": "user", "content": [{"text": prompt}]}],
                    "inferenceConfig": {"max_new_tokens": 120, "temperature": 0.8}
                }),
                modelId=MODEL_ID
            )
            body_json = json.loads(resp.get("body").read())
            calculate_and_log_cost(body_json, "chat_query")
            return body_json['output']['message']['content'][0]['text'], ""
        except Exception:
            return "System Error.", ""

    # ==========================================
    # MODO DASHBOARD (mensaje corto del terminal)
    # ==========================================
    log_metric("AIDashboardRequest", 1)
    dashboard_prompt = (
        f"You are {user_name}'s financial AI. {tone_instruction}\n"
        f"{financial_context}\n"
        f"Historical weaknesses: {historical_memory}\n"
        f"Write ONE sentence summarizing their state. Max 120 chars."
    )

    try:
        resp_dash = bedrock.invoke_model(
            body=json.dumps({
                "messages": [{"role": "user", "content": [{"text": dashboard_prompt}]}],
                "inferenceConfig": {"max_new_tokens": 80, "temperature": 0.8}
            }),
            modelId=MODEL_ID
        )
        body_dash = json.loads(resp_dash.get("body").read())
        calculate_and_log_cost(body_dash, "dashboard")
        dash_text = body_dash['output']['message']['content'][0]['text']

        # ==========================================
        # MODO EMAIL (report diario a las 09:00)
        # ==========================================
        email_text = ""
        if is_report_time:
            email_tone = (
                f"CRITICAL: {user_name} spent {actual_daily_expense_total:.2f}€ in real expenses today. Be brutal."
                if actual_daily_expense_total > 50
                else f"{user_name} only spent {actual_daily_expense_total:.2f}€ today. Suspicious frugality — investigate."
            )

            email_prompt = f"""
Act as {user_name}'s sharp personal finance advisor. {tone_instruction}
{financial_context}
TODAY'S INCOMES / CREDITS (money that came IN — NEVER criticize these): {ai_incomes_daily if ai_incomes_daily else "None"}
TODAY'S EXPENSES (money that went OUT — analyze these): {ai_expenses_daily if ai_expenses_daily else "None"}
{email_tone}

STRICT RULES — VIOLATIONS WILL BE PENALIZED:
- NEVER criticize items from the INCOME/CREDITS list.
- ONLY analyze items from the EXPENSES list.
- The "Real daily expenses" in FINANCIAL CONTEXT is the ground truth.
- If spending is low or zero: briefly acknowledge it, then give a CONCRETE wealth-building action.
- NEVER suggest "spend more money" or "use your savings on something". That is NOT financial advice.
- Differentiate healthy spending (sports, education) from reckless (casinos, excessive dining).
- Do not invent debts unless Monthly Surplus is negative.

FOR THE ADVICE SECTION — choose the most relevant based on their surplus:
- If surplus > 2000€/month: suggest investing 10-15% in index funds (e.g. S&P500 ETF), or allocating a % to crypto (BTC/ETH) as high-risk/high-reward, or maxing out a pension plan.
- If surplus 500-2000€/month: suggest an emergency fund (3-6 months expenses), low-cost ETFs, or an online course to increase income.
- If surplus < 500€/month: suggest automating a fixed monthly savings transfer, cutting one specific recurring expense, or a side income idea.
- Always give a SPECIFIC, actionable step with a concrete % or amount when possible.

FORMATTING (Strict HTML):
1. <h3><b>Summary:</b></h3> [Max 3 sentences. Analyze expenses or acknowledge low spend.]
2. <h3><b>Advice:</b></h3> [1 concrete financial action with specific numbers. Max 3 sentences. NO bold text inside <p>.]
Use <p> tags only. NO markdown. NO <b> or <strong> inside paragraphs.
"""
            resp_email = bedrock.invoke_model(
                body=json.dumps({
                    "messages": [{"role": "user", "content": [{"text": email_prompt}]}],
                    "inferenceConfig": {"max_new_tokens": 400, "temperature": 0.8}
                }),
                modelId=MODEL_ID
            )
            body_email = json.loads(resp_email.get("body").read())
            calculate_and_log_cost(body_email, "daily_email")
            email_text = body_email['output']['message']['content'][0]['text']

        return dash_text.strip(), email_text.replace('```html', '').replace('```', '').strip()

    except Exception as e:
        return "System Offline.", f"AI Error: {str(e)}"
