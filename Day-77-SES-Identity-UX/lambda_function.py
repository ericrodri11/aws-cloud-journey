"""
lambda_function.py — Router y orquestador principal de la Lambda.

Módulos:
  config.py       → Constantes, clientes AWS/Plaid, helper is_income_tx
  plaid_client.py → Ingesta Plaid + lectura/escritura DynamoDB
  wise_client.py  → Ingesta Wise API (datos reales EUR)
  scoring.py      → Score financiero, proyección, ofertas, perfil, caché, payroll offset
  ai_engine.py    → Amazon Nova (chat, dashboard, email), memoria semántica
  email_engine.py → Template HTML del email diario + SMS alert

ENRUTAMIENTO WISE / PLAID:
  El perfil del usuario guarda dos campos:
    - data_source:  'wise' | 'plaid'  (defecto: 'plaid')
    - report_email: email al que llega el reporte diario (defecto: USER_EMAIL del entorno)

  Cuenta outlook  → data_source='wise',  report_email='ericrodriguezpacheco@outlook.com'
  Cuenta principal→ data_source='plaid', report_email=USER_EMAIL (env var)

  Para configurar el perfil Wise por primera vez, llama con POST:
    {"data_source": "wise", "report_email": "ericrodriguezpacheco@outlook.com"}
"""
import json
import base64
import datetime
import time
from decimal import Decimal
import boto3

from config import (
    logger, sqs, ses, cache_table, dynamodb,
    DEFAULT_USER_ID, DEFAULT_USER_NAME, USER_EMAIL, SQS_QUEUE_URL,
    is_income_tx
)

# Inicializa los clientes de AWS
s3_client = boto3.client('s3')
cognito_client = boto3.client('cognito-idp')

# OJO: Cambia esto por el nombre real que le pongas a tu bucket en S3
AVATAR_BUCKET_NAME = 'duromoney-avatars' 
USER_POOL_ID = 'eu-north-1_F7AiUXQ5n'  # Tu User Pool ID

from plaid_client import save_to_dynamo, get_transactions_from_dynamo, ingest_plaid_data
from wise_client import get_wise_transactions, save_wise_to_dynamo
from scoring import (
    get_user_profile, save_user_profile, update_user_streak,
    get_accounting_month, calculate_financial_score,
    calculate_projection, generate_financial_offers,
    generate_cache_key, get_cached_response, save_to_cache
)
from ai_engine import invoke_nova_ai, get_or_create_monthly_memory
from email_engine import generate_html_email, send_sms_if_needed


# ──────────────────────────────────────────────────────────────────────────────
# HELPER: obtener la fuente de datos correcta según el perfil del usuario
# ──────────────────────────────────────────────────────────────────────────────
def fetch_fresh_data(user_id, profile):
    """
    Centraliza la decisión Wise vs Plaid.
    Lee 'data_source' del perfil — nunca del email.
    Devuelve los datos ya listos para save_to_dynamo.
    """
    data_source = profile.get('data_source', 'plaid')
    if data_source == 'wise':
        logger.info(f"📡 Usando Wise API para user_id={user_id}")
        return get_wise_transactions(), 'wise'
    else:
        logger.info(f"📡 Usando Plaid para user_id={user_id}")
        return ingest_plaid_data(), 'plaid'


# ──────────────────────────────────────────────────────────────────────────────
# HELPER: obtener el email de destino del reporte para este usuario
# ──────────────────────────────────────────────────────────────────────────────
def get_report_email(profile):
    """
    Devuelve el email al que se envía el reporte diario.
    Si el perfil tiene 'report_email', lo usa. Si no, usa USER_EMAIL del entorno.
    """
    return profile.get('report_email', USER_EMAIL) or USER_EMAIL


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

                    if task == 'daily_report':
                        # Usamos el perfil para decidir la fuente de datos
                        raw_data, source = fetch_fresh_data(user_id, profile)
                        if source == 'wise':
                            saved_items = save_wise_to_dynamo(raw_data, user_id)
                        else:
                            saved_items = save_to_dynamo(raw_data, user_id)
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

                    # Alerta por gasto alto
                    is_alert = total_daily_spent > 100.0
                    if is_alert:
                        send_sms_if_needed(total_daily_spent, user_id)

                    # Reporte diario
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

                        # El email va al report_email del perfil, no a USER_EMAIL fijo
                        destination_email = get_report_email(profile)
                        logger.info(f"📧 Enviando reporte a {destination_email}")

                        ses.send_email(
                            Source="DuroAI <ai@duromoney.com>",
                            Destination={'ToAddresses': [destination_email]},
                            Message={
                                'Subject': {'Data': f"{'🚨' if is_alert else '✅'} Daily Update: {datetime.datetime.now().strftime('%d %b')}"},
                                'Body': {'Html': {'Data': generate_html_email("Update", email_html_body, total_daily_spent, is_alert, daily_items, user_id)}}
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

                for u in valid_users:
                    sqs.send_message(
                        QueueUrl=SQS_QUEUE_URL,
                        MessageBody=json.dumps({"task": task_name, "user_id": u.get('user_id')})
                    )
                return {
                    'statusCode': 200,
                    'headers': {"Content-Type": "application/json"},
                    'body': json.dumps(f"Tasks queued for {len(valid_users)} users.")
                }
            except Exception as e:
                logger.error("Fan-out failed", extra={"details": str(e)})
                return {'statusCode': 500, 'body': "Failed to queue reports"}

        # ──────────────────────────────────────────────────────────────────────
        # MODO 3: HTTP API WEB FRONTEND
        # ──────────────────────────────────────────────────────────────────────
        headers_req  = event.get('headers', {})
        auth_header  = headers_req.get('authorization', headers_req.get('Authorization', ''))
        http_method  = event.get('requestContext', {}).get('http', {}).get('method', 'GET')

        # Compliance: flujo Unsubscribe
        if http_method == 'GET' and query_params.get('action') == 'unsubscribe':
            unsub_user = query_params.get('user_id')
            if unsub_user:
                profile = get_user_profile(unsub_user, "User")
                profile['wants_daily_email'] = False
                save_user_profile(profile)
                return {
                    'statusCode': 200,
                    'headers': {"Content-Type": "text/html"},
                    'body': """<html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#f9fafb;">
                        <div style="background:#fff;border-radius:12px;padding:30px;max-width:400px;margin:0 auto;">
                            <h2 style="color:#16a34a;">Unsubscribed Successfully</h2>
                            <p style="color:#6b7280;">You will no longer receive daily emails.</p>
                            <p style="font-size:12px;color:#9ca3af;">Re-enable anytime from your dashboard settings.</p>
                        </div></body></html>"""
                }

        user_id   = DEFAULT_USER_ID
        user_name = DEFAULT_USER_NAME
        user_email_jwt = ''

        if auth_header.startswith('Bearer '):
            try:
                token       = auth_header.split(' ')[1]
                payload_b64 = token.split('.')[1]
                payload_b64+= '=' * (-len(payload_b64) % 4)
                payload     = json.loads(base64.b64decode(payload_b64).decode('utf-8'))
                
                raw_email = payload.get('email')
                cognito_user = payload.get('cognito:username', '')
                
                if raw_email:
                    user_email_jwt = raw_email
                elif '@' in cognito_user:
                    user_email_jwt = cognito_user
                else:
                    user_email_jwt = ''
                    
                real_name = payload.get('name') or payload.get('given_name')
                
                # PARCHE DE EMERGENCIA: 
                # Si es tu cuenta de Outlook, forzamos el uso del 'sub' original para reconectar con tus datos de Wise y tu historial intacto.
                # Si es otra cuenta (como el Gmail), usamos el correo para que la cuenta manual y la de Google se unifiquen.
                if user_email_jwt and user_email_jwt.lower() == 'ericrodriguezpacheco@outlook.com':
                    user_id = payload.get('sub', DEFAULT_USER_ID)
                    user_name = real_name if real_name else user_email_jwt.split('@')[0].capitalize()
                elif user_email_jwt:
                    user_id = user_email_jwt.lower()
                    user_name = real_name if real_name else user_email_jwt.split('@')[0].capitalize()
                else:
                    user_id = payload.get('sub', DEFAULT_USER_ID)
                    
            except Exception as e:
                logger.error("Error decoding JWT", extra={"details": str(e)})

        logger.append_keys(user_id=user_id)
        user_profile = get_user_profile(user_id, user_name)
        display_name = user_profile.get('display_name', user_name)
        ai_tone      = user_profile.get('ai_tone', 'brutal')

# ── POST: guardar preferencias & BIENVENIDA ───────────────────────────
        if query_params.get('action') == 'save_preferences':
            body = json.loads(event.get('body', '{}'))
            
            # FIX: Usamos un flag estricto, no dependemos del nombre
            has_received_welcome = user_profile.get('welcome_email_sent', False)
            
            user_profile['display_name']      = body.get('display_name', display_name)
            ahorro_seguro                     = max(0.0, float(body.get('daily_savings_goal', user_profile.get('daily_savings_goal', 5.0))))
            user_profile['daily_savings_goal']= Decimal(str(ahorro_seguro))
            user_profile['ai_tone']           = body.get('ai_tone', ai_tone)
            user_profile['wants_daily_email'] = body.get('wants_daily_email', True)
            
            if 'data_source' in body:
                user_profile['data_source'] = body['data_source']
            if 'report_email' in body:
                user_profile['report_email'] = body['report_email']
            
            # TRIGGER CORREO DE BIENVENIDA
            if not has_received_welcome and user_profile.get('wants_daily_email', True):
                # Si el user_id es un correo (ej. inicio con Google), úsalo. Si no, usa el fallback.
                dest_email = user_id if '@' in user_id else get_report_email(user_profile)
                welcome_analysis = (
                    f"Welcome to the system, {user_profile['display_name']}. "
                    f"I am DuroAI, your new Financial Agent. My core directive is to analyze your spending and ruthlessly eliminate your bad financial habits. "
                    f"You have set a daily savings goal of {ahorro_seguro}€. I will monitor your transactions and send you a daily report. Do not disappoint me."
                )
                html_body = generate_html_email(
                    subject="System Initialization",
                    ai_analysis=welcome_analysis,
                    total_spent=0.0,
                    is_alert=False,
                    transactions=[],
                    user_id=user_id
                )
                try:
                    ses.send_email(
                        Source="DuroAI <ai@duromoney.com>",
                        Destination={'ToAddresses': [dest_email]},
                        Message={
                            'Subject': {'Data': "🤖 Welcome to DuroMoney: Agent Activated"},
                            'Body': {'Html': {'Data': html_body}}
                        }
                    )
                    logger.info("Welcome email sent", extra={"user_id": user_id, "email": dest_email})
                    # Marcamos como enviado para que jamás se repita
                    user_profile['welcome_email_sent'] = True
                except Exception as e:
                    logger.error("Failed to send welcome email", extra={"details": str(e)})

            # Guardamos el perfil finalmente
            save_user_profile(user_profile)

            return {
                'statusCode': 200,
                'headers': {"Content-Type": "application/json"},
                'body': json.dumps({"status": "success", "message": "Preferences saved"})
            }

        # ── POST: Subir Foto de Perfil ──────────────────────────────────────────
        if query_params.get('action') == 'upload_avatar':
            body = json.loads(event.get('body', '{}'))
            image_base64 = body.get('image')
            
            if image_base64:
                image_data = base64.b64decode(image_base64.split(',')[1])
                
                # EL TRUCO MAGICO: Le ponemos la hora exacta al NOMBRE del archivo
                timestamp = int(time.time())
                file_name = f"avatars/{user_id}_{timestamp}.jpg"
                
                s3_client.put_object(
                    Bucket=AVATAR_BUCKET_NAME,
                    Key=file_name,
                    Body=image_data,
                    ContentType='image/jpeg',
                    ACL='public-read'
                )
                
                avatar_url = f"https://dg6avtcmf329x.cloudfront.net/{file_name}"
                user_profile['avatar_url'] = avatar_url
                save_user_profile(user_profile)
                
                return {
                    'statusCode': 200,
                    'headers': {"Content-Type": "application/json"},
                    'body': json.dumps({"status": "success", "avatar_url": avatar_url})
                }

        # ── POST: Borrar Foto de Perfil ─────────────────────────────────────────
        if query_params.get('action') == 'delete_avatar':
            # Extraer el nombre del archivo de la URL guardada
            current_url = user_profile.get('avatar_url', '')
            if current_url and 'cloudfront.net' in current_url:
                file_name = current_url.split('cloudfront.net/')[-1]
                try:
                    s3_client.delete_object(Bucket=AVATAR_BUCKET_NAME, Key=file_name)
                except Exception as e:
                    logger.warning(f"No se pudo borrar de S3: {e}")

            user_profile['avatar_url'] = ''
            save_user_profile(user_profile)
            
            return {
                'statusCode': 200,
                'headers': {"Content-Type": "application/json"},
                'body': json.dumps({"status": "success", "avatar_url": "/default-avatar.png"})
            }

        # ── DELETE: Botón Nuclear (Borrar Cuenta) ──────────────────────────────
        if query_params.get('action') == 'delete_account':
            # 1. Limpieza total de DynamoDB (transacciones + perfil)
            table = dynamodb.Table('FinanceAgent-Transactions')
            response = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('user_id').eq(user_id))
            
            with table.batch_writer() as batch:
                for item in response.get('Items', []):
                    batch.delete_item(
                        Key={'user_id': user_id, 'transaction_date': item['transaction_date']}
                    )
            
            # 2. Borrado de Identidad en Cognito
            # Para federados (Google), Cognito exige el username exacto, no el sub.
            cognito_user_id = payload.get('cognito:username') or payload.get('sub')
            if cognito_user_id:
                try:
                    cognito_client.admin_delete_user(
                        UserPoolId=USER_POOL_ID,
                        Username=cognito_user_id
                    )
                except Exception as e:
                    logger.error("Error borrando de Cognito", extra={"details": str(e)})

            return {
                'statusCode': 200,
                'headers': {"Content-Type": "application/json"},
                'body': json.dumps({"status": "success", "message": "Data & Identity wiped."})
            }

        # ── GET: leer preferencias ────────────────────────────────────────────
        if query_params.get('action') == 'get_preferences':
            return {
                'statusCode': 200,
                'headers': {"Content-Type": "application/json"},
                'body': json.dumps({
                    "status": "success",
                    "data": {
                        "display_name": user_profile.get('display_name', ''),
                        "daily_savings_goal": float(user_profile.get('daily_savings_goal', 5)),
                        "ai_tone": user_profile.get('ai_tone', 'brutal'),
                        "wants_daily_email": user_profile.get('wants_daily_email', True),
                        "avatar_url": user_profile.get('avatar_url', '')
                    }
                }, default=str)
            }

        # ── GET: datos del dashboard ──────────────────────────────────────────
        user_query = query_params.get('query')
        force_sync = query_params.get('sync') == 'true'

        if force_sync:
            raw_data, source = fetch_fresh_data(user_id, user_profile)
            if source == 'wise':
                saved_items = save_wise_to_dynamo(raw_data, user_id)
            else:
                saved_items = save_to_dynamo(raw_data, user_id)
        else:
            saved_items = get_transactions_from_dynamo(user_id)
            if not saved_items:
                raw_data, source = fetch_fresh_data(user_id, user_profile)
                if source == 'wise':
                    saved_items = save_wise_to_dynamo(raw_data, user_id)
                else:
                    saved_items = save_to_dynamo(raw_data, user_id)

        # ── Deduplicación (Plaid Sandbox puede guardar duplicados) ───────────
        unique_items = {}
        for t in saved_items:
            raw_sort   = t.get('transaction_date', '')
            raw_date   = raw_sort.split('T')[0].split('#')[0]
            desc_dedup = t.get('description', '')
            amt_dedup  = t.get('amount', 0)
            unique_key = f"{raw_date}_{desc_dedup}_{amt_dedup}"
            if unique_key not in unique_items:
                unique_items[unique_key] = t
        saved_items = list(unique_items.values())

        # ── Calcular totales mensuales con Payroll Offset ─────────────────────
        current_month_str  = datetime.datetime.now().strftime('%Y-%m')
        last_month        = datetime.datetime.now().replace(day=1) - datetime.timedelta(days=1)
        previous_month_str = last_month.strftime('%Y-%m')

        total_income, total_expenses, last_month_income = 0.0, 0.0, 0.0
        for t in saved_items:
            amount     = float(t.get('amount', 0))
            desc       = t.get('description', '')
            t_date_raw = t.get('transaction_date', '').split('T')[0].split('#')[0]
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

        today_str   = datetime.datetime.now().strftime('%Y-%m-%d')
        daily_items = [t for t in saved_items if t.get('transaction_date', '').split('T')[0].split('#')[0] == today_str]

        total_daily_spent = 0.0
        for t in daily_items:
            amt  = float(t.get('amount', 0))
            desc = t.get('description', '')
            if not is_income_tx(desc, amt) and amt > 0:
                total_daily_spent += amt

        current_month_txs = [
            t for t in saved_items
            if t.get('transaction_date', '').split('T')[0].split('#')[0].startswith(current_month_str)
        ]

        current_streak = int(user_profile.get('current_streak', 0))
        fin_score, score_short_reasons, score_audit_log, score_feedback = calculate_financial_score(total_income, total_expenses)
        projected_spend   = calculate_projection(total_expenses)
        financial_offers  = generate_financial_offers(fin_score, projected_monthly_income, total_expenses)

        from_cache, dash_message = False, ""

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
                monthly_txs=current_month_txs
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
                    "transactions":        saved_items,
                    "dashboard_message":   dash_message,
                    "from_cache":          from_cache,
                    "financial_score":     fin_score,
                    "score_short_reasons": score_short_reasons,
                    "score_audit_log":     score_audit_log,
                    "total_income":        projected_monthly_income,
                    "total_expenses":      total_expenses,
                    "projected_spend":     projected_spend,
                    "current_streak":      current_streak,
                    "financial_offers":    financial_offers
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