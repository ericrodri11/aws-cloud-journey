"""
lambda_function.py — Router y orquestador principal de la Lambda.

Estructura de módulos:
  config.py       → Constantes, clientes AWS/Plaid, helper is_income_tx
  plaid_client.py → Ingesta Plaid + lectura/escritura DynamoDB
  scoring.py      → Score financiero, proyección, ofertas, perfil, caché, payroll offset
  ai_engine.py    → Amazon Nova (chat, dashboard, email), memoria semántica
  email_engine.py → Template HTML del email diario + SMS alert

FIX incluido en esta versión:
  MODO CHAT: se pasan las transacciones del mes completo (monthly_txs) a invoke_nova_ai.
  La IA ya no ve un array vacío cuando las fechas de Plaid no son exactamente "hoy".
"""
import json
import base64
import datetime
import time
from decimal import Decimal

from config import (
    logger, sqs, ses, cache_table, dynamodb,
    DEFAULT_USER_ID, DEFAULT_USER_NAME, USER_EMAIL, SQS_QUEUE_URL,
    is_income_tx
)
from plaid_client import ingest_plaid_data, save_to_dynamo, get_transactions_from_dynamo
from scoring import (
    get_user_profile, save_user_profile, update_user_streak,
    get_accounting_month, calculate_financial_score,
    calculate_projection, generate_financial_offers,
    generate_cache_key, get_cached_response, save_to_cache
)
from ai_engine import invoke_nova_ai, get_or_create_monthly_memory
from email_engine import generate_html_email, send_sms_if_needed


# ==========================================
# LAMBDA HANDLER (API ROUTER & SQS WORKER)
# ==========================================
@logger.inject_lambda_context(log_event=False)
def lambda_handler(event, context):
    try:

        # ──────────────────────────────────────────────────────────────────────
        # MODO 1: SQS WORKER (trabajo asíncrono pesado: email diario + alertas)
        # ──────────────────────────────────────────────────────────────────────
        if 'Records' in event:
            for record in event['Records']:
                payload = json.loads(record['body'])
                user_id = payload.get('user_id')
                task    = payload.get('task')

                logger.info(f"SQS Worker executing task: {task}", extra={"user_id": user_id})

                if task in ['daily_report', 'hourly_alert_check']:
                    profile = get_user_profile(user_id, DEFAULT_USER_NAME)

                    # Solo el daily_report sincroniza Plaid (hay un time.sleep(8) dentro).
                    # El hourly_alert_check lee DynamoDB directamente para evitar timeouts.
                    if task == 'daily_report':
                        saved_items = save_to_dynamo(ingest_plaid_data(), user_id)
                    else:
                        saved_items = get_transactions_from_dynamo(user_id)
                        if not saved_items:
                            logger.info("Hourly check: no transactions in DynamoDB yet, skipping.", extra={"user_id": user_id})
                            continue

                    today_str   = datetime.datetime.now().strftime('%Y-%m-%d')
                    target_date = (
                        (datetime.datetime.now() - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
                        if task == 'daily_report'
                        else today_str
                    )

                    daily_items = [
                        t for t in saved_items
                        if t.get('transaction_date', '').startswith(target_date)
                    ]

                    total_daily_spent = 0.0
                    for t in daily_items:
                        amt  = float(t.get('amount', 0))
                        desc = t.get('description', '')
                        if not is_income_tx(desc, amt) and amt > 0:
                            total_daily_spent += amt

                    # 🚨 VIGILANCIA DE ALERTAS (cada hora)
                    is_alert = total_daily_spent > 100.0  # SPENDING_LIMIT
                    if is_alert:
                        send_sms_if_needed(total_daily_spent, user_id)
                        logger.info("SMS Alert checked/sent", extra={"spent": total_daily_spent})

                    # 📧 REPORTE DIARIO (solo a las 09:00 AM)
                    if task == 'daily_report':
                        email_lock_key = f"email_report_{target_date}_{user_id}"
                        try:
                            cache_table.put_item(
                                Item={
                                    'cache_key': email_lock_key, 'status': 'sent',
                                    'ttl': int(time.time()) + 86400, 'user_id': user_id
                                },
                                ConditionExpression='attribute_not_exists(cache_key)'
                            )
                            logger.info("Idempotency lock acquired.", extra={"date": target_date})
                        except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
                            logger.warning("Email already sent today, skipping.", extra={"date": target_date})
                            continue
                        except Exception as lock_err:
                            logger.warning("Could not acquire lock, proceeding", extra={"details": str(lock_err)})

                        current_month_str  = datetime.datetime.now().strftime('%Y-%m')
                        last_month        = datetime.datetime.now().replace(day=1) - datetime.timedelta(days=1)
                        previous_month_str = last_month.strftime('%Y-%m')

                        total_income, total_expenses, last_month_income = 0.0, 0.0, 0.0
                        for t in saved_items:
                            amount   = float(t.get('amount', 0))
                            desc     = t.get('description', '')
                            t_date_raw = t.get('transaction_date', '').split('#')[0]
                            income   = is_income_tx(desc, amount)
                            acct_m   = get_accounting_month(t_date_raw, income)

                            if acct_m == current_month_str:
                                if income: total_income   += abs(amount)
                                else:      total_expenses += abs(amount)
                            elif acct_m == previous_month_str:
                                if income: last_month_income += abs(amount)

                        projected_monthly_income = total_income if total_income > 0 else last_month_income
                        if projected_monthly_income == 0:
                            projected_monthly_income = 1500.00

                        current_streak, _, _ = update_user_streak(profile, total_daily_spent, projected_monthly_income)
                        historical_memory    = get_or_create_monthly_memory(
                            user_id, previous_month_str,
                            [t for t in saved_items if t.get('transaction_date', '').startswith(previous_month_str)]
                        )

                        _, email_html_body = invoke_nova_ai(
                            daily_txs=daily_items,
                            total_daily_spent=total_daily_spent,
                            monthly_income=total_income,
                            monthly_expenses=total_expenses,
                            user_name=profile.get('display_name', 'User'),
                            current_streak=current_streak,
                            historical_memory=historical_memory,
                            ai_tone=profile.get('ai_tone', 'brutal'),
                            is_report_time=True
                        )

                        ses.send_email(
                            Source="ai@duromoney.com",
                            Destination={'ToAddresses': [USER_EMAIL]},
                            Message={
                                'Subject': {'Data': f"{'🚨' if is_alert else '✅'} Daily Update: {datetime.datetime.now().strftime('%d %b')}"},
                                'Body': {'Html': {'Data': generate_html_email("Update", email_html_body, total_daily_spent, is_alert, daily_items)}}
                            }
                        )
            return {'statusCode': 200}

        # ──────────────────────────────────────────────────────────────────────
        # MODO 2: EVENTBRIDGE / SCHEDULER (fan-out a SQS)
        # ──────────────────────────────────────────────────────────────────────
        is_scheduled_event = event.get('source') in ('aws.events', 'aws.scheduler')
        query_params = event.get('queryStringParameters') or {}
        test_email   = query_params.get('test_email') == 'true'

        if is_scheduled_event or test_email:
            try:
                now_utc       = datetime.datetime.now(datetime.timezone.utc)
                adjusted_time = now_utc + datetime.timedelta(minutes=5)
                current_hour  = adjusted_time.hour

                REPORT_HOUR_UTC = 7
                is_report_time  = (current_hour == REPORT_HOUR_UTC) or test_email
                task_name       = 'daily_report' if is_report_time else 'hourly_alert_check'

                valid_users = []
                if test_email:
                    valid_users = [{'user_id': DEFAULT_USER_ID}]
                else:
                    admin_profile = get_user_profile(DEFAULT_USER_ID, DEFAULT_USER_NAME)
                    if admin_profile.get('wants_daily_email', True):
                        valid_users.append(admin_profile)

                logger.info(f"Fan-out: queuing task '{task_name}' for user '{DEFAULT_USER_ID}'.")
                for u in valid_users:
                    sqs.send_message(
                        QueueUrl=SQS_QUEUE_URL,
                        MessageBody=json.dumps({"task": task_name, "user_id": u.get('user_id')})
                    )
                logger.info(f"Fan-out complete. Queued {len(valid_users)} task(s) of type '{task_name}'.")
                return {
                    'statusCode': 200,
                    'headers': {"Content-Type": "application/json"},
                    'body': json.dumps(f"Tasks ({task_name}) queued successfully for {len(valid_users)} users.")
                }
            except Exception as e:
                logger.error("Fan-out failed", extra={"details": str(e)})
                return {'statusCode': 500, 'body': "Failed to queue reports"}

        # ──────────────────────────────────────────────────────────────────────
        # MODO 3: HTTP API WEB FRONTEND
        # ──────────────────────────────────────────────────────────────────────
        headers    = event.get('headers', {})
        auth_header= headers.get('authorization', headers.get('Authorization', ''))

        user_id   = DEFAULT_USER_ID
        user_name = DEFAULT_USER_NAME

        if auth_header.startswith('Bearer '):
            try:
                token       = auth_header.split(' ')[1]
                payload_b64 = token.split('.')[1]
                payload_b64+= '=' * (-len(payload_b64) % 4)
                payload     = json.loads(base64.b64decode(payload_b64).decode('utf-8'))
                user_id     = payload.get('sub', DEFAULT_USER_ID)
                user_email  = payload.get('email', '')
                if user_email:
                    user_name = user_email.split('@')[0].capitalize()
            except Exception as e:
                logger.error("Error decoding JWT", extra={"details": str(e)})

        logger.append_keys(user_id=user_id)
        user_profile = get_user_profile(user_id, user_name)
        display_name = user_profile.get('display_name', user_name)
        ai_tone      = user_profile.get('ai_tone', 'brutal')

        http_method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')

        # ── POST: guardar preferencias ────────────────────────────────────────
        if http_method == 'POST' or query_params.get('action') == 'save_preferences':
            body = json.loads(event.get('body', '{}'))
            user_profile['display_name']      = body.get('display_name', display_name)
            ahorro_seguro                     = max(0.0, float(body.get('daily_savings_goal', user_profile.get('daily_savings_goal', 5.0))))
            user_profile['daily_savings_goal']= Decimal(str(ahorro_seguro))
            user_profile['ai_tone']           = body.get('ai_tone', ai_tone)
            save_user_profile(user_profile)
            return {
                'statusCode': 200,
                'headers': {"Content-Type": "application/json"},
                'body': json.dumps({"status": "success", "message": "Preferences saved"})
            }

        # ── GET: leer preferencias ────────────────────────────────────────────
        if query_params.get('action') == 'get_preferences':
            return {
                'statusCode': 200,
                'headers': {"Content-Type": "application/json"},
                'body': json.dumps({"status": "success", "data": user_profile}, default=str)
            }

        # ── GET: datos del dashboard ──────────────────────────────────────────
        user_query = query_params.get('query')
        force_sync = query_params.get('sync') == 'true'

        if force_sync:
            saved_items = save_to_dynamo(ingest_plaid_data(), user_id)
        else:
            saved_items = get_transactions_from_dynamo(user_id)
            if not saved_items:
                saved_items = save_to_dynamo(ingest_plaid_data(), user_id)

        # ── Calcular totales mensuales con Payroll Offset ─────────────────────
        current_month_str  = datetime.datetime.now().strftime('%Y-%m')
        last_month        = datetime.datetime.now().replace(day=1) - datetime.timedelta(days=1)
        previous_month_str = last_month.strftime('%Y-%m')

        total_income, total_expenses, last_month_income = 0.0, 0.0, 0.0
        for t in saved_items:
            amount     = float(t.get('amount', 0))
            desc       = t.get('description', '')
            t_date_raw = t.get('transaction_date', '').split('#')[0]
            income     = is_income_tx(desc, amount)
            acct_m     = get_accounting_month(t_date_raw, income)

            if acct_m == current_month_str:
                if income: total_income   += abs(amount)
                else:      total_expenses += abs(amount)
            elif acct_m == previous_month_str:
                if income: last_month_income += abs(amount)

        projected_monthly_income = total_income if total_income > 0 else last_month_income
        if projected_monthly_income == 0:
            projected_monthly_income = 1500.00

        # ── Transacciones de hoy (para alertas y compatibilidad) ──────────────
        today_str   = datetime.datetime.now().strftime('%Y-%m-%d')
        daily_items = [t for t in saved_items if t.get('transaction_date', '').startswith(today_str)]

        total_daily_spent = 0.0
        for t in daily_items:
            amt  = float(t.get('amount', 0))
            desc = t.get('description', '')
            if not is_income_tx(desc, amt) and amt > 0:
                total_daily_spent += amt

        # ── Transacciones del mes actual (para el chat) ───────────────────────
        # FIX: estas son las que se pasan a la IA cuando el usuario hace una pregunta
        current_month_txs = [
            t for t in saved_items
            if t.get('transaction_date', '').startswith(current_month_str)
        ]

        current_streak = int(user_profile.get('current_streak', 0))
        fin_score, score_short_reasons, score_audit_log, score_feedback = calculate_financial_score(total_income, total_expenses)
        projected_spend   = calculate_projection(total_expenses)
        financial_offers  = generate_financial_offers(fin_score, projected_monthly_income, total_expenses)

        from_cache, dash_message = False, ""

        # ── Caché (solo para el dashboard, nunca para el chat) ─────────────────
        if not user_query and not force_sync:
            cache_key = generate_cache_key(saved_items, total_income, total_expenses, f"dashboard_{ai_tone}", user_id)
            cached_message, cache_hit = get_cached_response(cache_key)
            if cache_hit:
                dash_message, from_cache = f"⚡ {cached_message}", True

        if not dash_message:
            previous_month_txs = [
                t for t in saved_items
                if t.get('transaction_date', '').startswith(previous_month_str)
            ]
            historical_memory = get_or_create_monthly_memory(user_id, previous_month_str, previous_month_txs)

            # ─────────────────────────────────────────────────────────────────
            # LLAMADA A LA IA — ahora con monthly_txs cuando hay user_query
            # ─────────────────────────────────────────────────────────────────
            dash_message, _ = invoke_nova_ai(
                daily_txs=daily_items,
                total_daily_spent=total_daily_spent,
                monthly_income=total_income,
                monthly_expenses=total_expenses,
                user_query=user_query,
                user_name=display_name,
                current_streak=current_streak,
                historical_memory=historical_memory,
                ai_tone=ai_tone,
                is_report_time=False,
                monthly_txs=current_month_txs  # ← FIX: contexto real del mes para el chat
            )

            if not user_query:
                save_to_cache(
                    generate_cache_key(saved_items, total_income, total_expenses, f"dashboard_{ai_tone}", user_id),
                    dash_message, user_id
                )

        return {
            'statusCode': 200,
            'headers': {"Content-Type": "application/json"},
            'body': json.dumps({
                "status": "success",
                "data": {
                    "transactions":       saved_items,
                    "dashboard_message":  dash_message,
                    "from_cache":         from_cache,
                    "financial_score":    fin_score,
                    "score_short_reasons":score_short_reasons,
                    "score_audit_log":    score_audit_log,
                    "total_income":       projected_monthly_income,
                    "total_expenses":     total_expenses,
                    "projected_spend":    projected_spend,
                    "current_streak":     current_streak,
                    "financial_offers":   financial_offers
                }
            }, default=str)
        }

    except Exception as e:
        logger.error("Lambda Handler Failed", extra={"details": str(e)})
        return {
            'statusCode': 500,
            'headers': {"Content-Type": "application/json"},
            'body': json.dumps(f"Error: {str(e)}")
        }
