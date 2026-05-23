"""
email_engine.py — Generador del HTML del email diario y lógica de envío de Telegram.
Implementa inyección de SVGs inline (Lucide Icons) para una UI de correo premium.
"""
import datetime
import random
import time
import os
import urllib.request
import urllib.parse

from config import (
    ses, sns, cache_table, dynamodb,
    logger, SNS_TOPIC_ARN, SPENDING_LIMIT,
    is_income_tx
)

API_URL = "https://vdwaba4uy35hpeohz77buz6p640yvslf.lambda-url.eu-north-1.on.aws/"

# Variables de entorno para Telegram
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '')

def log_metric(metric_name, value, unit="Count", properties={}):
    logger.info(
        f"Metric: {metric_name}",
        extra={"metric": metric_name, "value": value, "unit": unit, **properties}
    )

# ==========================================
# GENERADOR HTML DEL EMAIL DIARIO
# ==========================================
def generate_html_email(subject, ai_analysis, total_spent, is_alert, transactions, user_id, is_welcome=False):
    date_str = datetime.datetime.now().strftime("%d %b %Y")
    weekday  = datetime.datetime.now().strftime("%A")

    # ── Calcular gasto real (excluye ingresos) ──────────────────────────────
    actual_display_spend = 0.0
    income_txs  = []
    expense_txs = []

    if transactions:
        for t in transactions:
            amt  = float(t.get('amount', 0))
            desc = t.get('description', '')
            if is_income_tx(desc, amt):
                income_txs.append(t)
            else:
                expense_txs.append(t)
                actual_display_spend += abs(amt)

    # Configuración de etiquetas dinámicas
    status_label = "System Initialization" if is_welcome else ("High Spending Day" if is_alert else "Daily Summary")
    status_color = "#ef4444" if is_alert else "#16a34a"
    hero_label = "Account Status" if is_welcome else "Yesterday's Expenses"
    main_heading = "Agent Activation Sequence" if is_welcome else "Your Daily Report"

    # ── Preheader anti-spam ─────────────────────────────────────────────────
    if is_welcome:
        preview_text = "Your financial monitoring starts now. Do not disappoint me."
    else:
        preview_text = f"Your daily financial update — {actual_display_spend:.2f}€ spent yesterday."

    padding      = "&zwnj;&nbsp;" * 60
    preheader    = (
        f'<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;'
        f'max-height:0;max-width:0;opacity:0;overflow:hidden;">'
        f'{preview_text}{padding}</div>'
    )

    # ── Mapas vectoriales SVG (Lucide Icons) para inyección directa en Email ──
    CATEGORY_ICONS = {
        'housing':       ('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', '#6366f1'),
        'groceries':     ('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>', '#10b981'),
        'bills':         ('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>', '#fb923c'),
        'coffee':        ('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>', '#06b6d4'),
        'food':          ('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>', '#f59e0b'),
        'transport':     ('<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>', '#f97316'),
        'travel':        ('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.6L3 8l5 5-3 3-3-1-2 2 5 5 2-2-1-3 3-3 5 5 1.2-.7c.4-.2.7-.6.6-1.1z"/>', '#3b82f6'),
        'entertainment': ('<rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"/><line x1="7" x2="7" y1="2" y2="22"/><line x1="17" x2="17" y1="2" y2="22"/><line x1="2" x2="7" y1="12" y2="12"/><line x1="2" x2="7" y1="7" y2="7"/><line x1="2" x2="7" y1="17" y2="17"/><line x1="17" x2="22" y1="12" y2="12"/><line x1="17" x2="22" y1="7" y2="7"/><line x1="17" x2="22" y1="17" y2="17"/>', '#a855f7'),
        'care':          ('<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>', '#f43f5e'),
        'shop':          ('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>', '#ec4899'),
        'tech':          ('<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>', '#8b5cf6'),
        'leisure':       ('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', '#4ade80'),
        'financial':     ('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>', '#ef4444'),
        'income':        ('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>', '#16a34a'),
        'general':       ('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>', '#9ca3af')
    }

    def get_category_svg(description, amount):
        d = description.lower()
        if is_income_tx(d, amount): return CATEGORY_ICONS['income']
        if any(k in d for k in ['rent', 'mortgage', 'housing']): return CATEGORY_ICONS['housing']
        if any(k in d for k in ['market', 'grocery', 'mercadona', 'tesco', 'walmart']): return CATEGORY_ICONS['groceries']
        if any(k in d for k in ['bill', 'electric', 'water', 'internet', 'pg&e']): return CATEGORY_ICONS['bills']
        if any(k in d for k in ['payment', 'credit', 'tectra']): return CATEGORY_ICONS['financial']
        if any(k in d for k in ['starbucks', 'coffee']): return CATEGORY_ICONS['coffee']
        if any(k in d for k in ['mcdonald', 'burger', 'kfc', 'restaurant', 'food', 'dining']): return CATEGORY_ICONS['food']
        if any(k in d for k in ['uber', 'lyft', 'taxi', 'transit']): return CATEGORY_ICONS['transport']
        if any(k in d for k in ['united', 'airline', 'hotel', 'airbnb']): return CATEGORY_ICONS['travel']
        if any(k in d for k in ['movie', 'cinema', 'ticket', 'entertainment']): return CATEGORY_ICONS['entertainment']
        if any(k in d for k in ['pharmacy', 'cvs', 'health', 'care', 'doctor']): return CATEGORY_ICONS['care']
        if any(k in d for k in ['amazon', 'shop', 'store', 'target']): return CATEGORY_ICONS['shop']
        if any(k in d for k in ['apple', 'sparkfun', 'electronics', 'netflix', 'spotify', 'hbo', 'software']): return CATEGORY_ICONS['tech']
        if any(k in d for k in ['gym', 'climb', 'sport', 'fitness']): return CATEGORY_ICONS['leisure']
        return CATEGORY_ICONS['general']

    # ── Construir filas de transacciones ────────────────────────────────────
    def build_rows(tx_list, is_income_section):
        rows = ''
        for t in tx_list:
            amt          = abs(float(t.get('amount', 0)))
            desc         = t.get('description', '')
            svg_path, c_color = get_category_svg(desc, float(t.get('amount', 0)))
            sign         = '+' if is_income_section else '−'
            amount_color = '#16a34a' if is_income_section else '#111827'
            
            # SVG inline inyectado directamente para que herede el color dinámico y eluda bloqueos de clientes de correo
            svg_markup = f'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="{c_color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{svg_path}</svg>'

            rows += f"""
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="36" style="vertical-align:middle;">
                        <div style="width:32px;height:32px;background-color:{c_color}15;border-radius:8px;
                                    text-align:center;line-height:38px;">
                          {svg_markup}
                        </div>
                      </td>
                      <td style="vertical-align:middle;padding-left:10px;">
                        <span style="font-size:13px;color:#374151;font-weight:600;">{desc}</span>
                      </td>
                      <td align="right" style="vertical-align:middle;white-space:nowrap;">
                        <span style="font-size:14px;font-weight:700;color:{amount_color};">
                          {sign}{amt:.2f}&nbsp;€
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>"""
        return rows

    expense_rows = build_rows(expense_txs, False)
    income_rows  = build_rows(income_txs,  True)

    # ── Sección de actividad ─────────────────────────────────────────────────
    activity_section = ''
    if expense_rows or income_rows:
        expense_block = ''
        if expense_rows:
            expense_block = f"""
            <tr>
              <td style="padding:16px 0 4px 0;">
                <span style="font-size:10px;font-weight:700;color:#9ca3af;
                             text-transform:uppercase;letter-spacing:1px;">Expenses</span>
              </td>
            </tr>
            {expense_rows}"""

        income_block = ''
        if income_rows:
            income_block = f"""
            <tr>
              <td style="padding:16px 0 4px 0;">
                <span style="font-size:10px;font-weight:700;color:#9ca3af;
                             text-transform:uppercase;letter-spacing:1px;">Income & Credits</span>
              </td>
            </tr>
            {income_rows}"""

        activity_section = f"""
        <tr><td style="padding:24px 0 0 0;">
          <p style="margin:0 0 12px 0;font-size:10px;font-weight:700;color:#9ca3af;
                    text-transform:uppercase;letter-spacing:1px;">Yesterday's Activity</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            {expense_block}
            {income_block}
          </table>
        </td></tr>"""

    # FIX: Si es correo de bienvenida, ocultamos por completo la caja gigante.
    hero_block = ""
    if not is_welcome:
        hero_block = f"""
              <tr>
                <td style="padding-bottom:24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0"
                         style="background-color:#f9fafb;border:1px solid #e5e7eb;
                                border-radius:12px;overflow:hidden;">
                    <tr>
                      <td style="padding:20px 24px;vertical-align:middle;">
                        <span style="display:block;font-size:11px;font-weight:600;
                                     color:#9ca3af;text-transform:uppercase;
                                     letter-spacing:1px;margin-bottom:4px;">{hero_label}</span>
                        <span style="display:block;font-size:36px;font-weight:900;
                                     color:#111827;letter-spacing:-1px;line-height:1;">
                          {actual_display_spend:.2f} €
                        </span>
                      </td>
                      <td width="6" style="background-color:{status_color};"></td>
                    </tr>
                  </table>
                </td>
              </tr>
        """

    unsubscribe_url = f"{API_URL}?action=unsubscribe&user_id={user_id}"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>DuroMoney Daily Update</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  {preheader}

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f9fafb;padding:32px 16px;">
    <tr><td align="center">

      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;background-color:#ffffff;border-radius:16px;
                    border:1px solid #e5e7eb;overflow:hidden;">

        <tr>
          <td style="background-color:{status_color};padding:4px 0;"></td>
        </tr>

        <tr>
          <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <span style="font-size:18px;font-weight:900;color:#111827;
                               letter-spacing:-0.5px;">DuroMoney<span style="color:#16a34a;">.Agent</span></span>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="font-size:11px;font-weight:600;color:#6b7280;">
                    {weekday}, {date_str}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 32px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">

              <tr>
                <td style="padding-bottom:20px;">
                  <span style="display:inline-block;padding:3px 10px;border-radius:20px;
                               font-size:10px;font-weight:700;text-transform:uppercase;
                               letter-spacing:1px;background-color:{'#fef2f2' if is_alert else '#f0fdf4'};
                               color:{status_color};">{status_label}</span>
                  <h1 style="margin:10px 0 0 0;font-size:22px;font-weight:900;
                             color:#111827;letter-spacing:-0.5px;">
                    {main_heading}
                  </h1>
                </td>
              </tr>

              {hero_block}

              <tr>
                <td style="padding-bottom:8px;">
                  <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#9ca3af;
                            text-transform:uppercase;letter-spacing:1px;">AI Analysis</p>
                  <div style="font-size:14px;color:#374151;line-height:1.7;">
                    {ai_analysis}
                  </div>
                </td>
              </tr>

              {activity_section}

              <tr>
                <td style="padding-top:28px;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background-color:#111827;border-radius:8px;">
                        <a href="https://www.duromoney.com" style="display:inline-block;padding:11px 22px;
                                           font-size:13px;font-weight:700;color:#ffffff;
                                           text-decoration:none;letter-spacing:0.3px;">
                          Open Dashboard &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px;background-color:#f9fafb;
                     border-top:1px solid #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right: 10px;">
                  <span style="font-size:11px;color:#9ca3af;">
                    DuroMoney &mdash; Your AI-powered financial advisor
                  </span>
                </td>
                <td align="right" width="80" nowrap="nowrap" style="white-space: nowrap;">
                  <a href="{unsubscribe_url}" style="font-size:11px;color:#9ca3af;text-decoration:underline; white-space:nowrap;">
                    <span>Unsubscribe</span>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>

</body>
</html>"""


# ==========================================
# TELEGRAM ALERT (lock atómico anti-duplicados)
# ==========================================
def send_sms_if_needed(amount, user_id):
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    lock_key = f"tg_sent_{date_str}_{user_id}"
    phrases  = [
        "You said you were going to start saving! 📉",
        "Do you really need that? 🛑",
        "Your wallet is crying right now. 💸"
    ]
    try:
        cache_table.put_item(
            Item={
                'cache_key': lock_key, 'status': 'sent',
                'ttl': int(time.time()) + 86400, 'user_id': user_id
            },
            ConditionExpression='attribute_not_exists(cache_key)'
        )
        if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
            msg = f"🚨 *DuroMoney Alert*: You spent {amount:.2f} EUR today.\n_{random.choice(phrases)}_"
            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            data = urllib.parse.urlencode({'chat_id': TELEGRAM_CHAT_ID, 'text': msg, 'parse_mode': 'Markdown'}).encode('utf-8')
            
            req = urllib.request.Request(url, data=data)
            with urllib.request.urlopen(req) as response:
                logger.info("Telegram alert sent successfully", extra={"amount": amount})
        else:
            logger.warning("Telegram env variables missing, alert skipped.")
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        logger.info("Alert already sent today, skipping duplicate.", extra={"user_id": user_id})
    except Exception as e:
        logger.error("Error sending Alert", extra={"details": str(e)})