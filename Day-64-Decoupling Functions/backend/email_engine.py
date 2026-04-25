"""
email_engine.py — Generador del HTML del email diario y lógica de envío de SMS.
Separado del ai_engine para que los templates se puedan editar sin tocar la IA.
"""
import datetime
import random
import time

from config import (
    ses, sns, cache_table, dynamodb,
    logger, SNS_TOPIC_ARN, SPENDING_LIMIT,
    is_income_tx
)


def log_metric(metric_name, value, unit="Count", properties={}):
    logger.info(
        f"Metric: {metric_name}",
        extra={"metric": metric_name, "value": value, "unit": unit, **properties}
    )


# ==========================================
# GENERADOR HTML DEL EMAIL DIARIO
# ==========================================
def generate_html_email(subject, ai_analysis, total_spent, is_alert, transactions):
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

    status_label = "High Spending Day" if is_alert else "Daily Summary"
    status_color = "#ef4444"           if is_alert else "#16a34a"

    # ── Preheader anti-spam ─────────────────────────────────────────────────
    preview_text = f"Your daily financial update — {actual_display_spend:.2f}€ spent yesterday."
    padding      = "&zwnj;&nbsp;" * 60
    preheader    = (
        f'<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;'
        f'max-height:0;max-width:0;opacity:0;overflow:hidden;">'
        f'{preview_text}{padding}</div>'
    )

    # ── Icono por categoría de gasto ────────────────────────────────────────
    CATEGORY_ICONS = {
        'starbucks': '☕', 'coffee': '☕',
        'mcdonald': '🍔', 'burger': '🍔', 'kfc': '🍗', 'restaurant': '🍽️', 'food': '🍽️',
        'uber': '🚗', 'lyft': '🚗', 'taxi': '🚗', 'transport': '🚌',
        'airline': '✈️', 'united': '✈️', 'flight': '✈️', 'travel': '✈️',
        'amazon': '📦', 'shop': '🛍️', 'store': '🛍️',
        'apple': '💻', 'sparkfun': '🔧', 'electronics': '📱',
        'netflix': '🎬', 'spotify': '🎵', 'hbo': '🎬', 'disney': '🎬',
        'gym': '💪', 'climb': '🧗', 'sport': '🏋️',
        'pharmacy': '💊', 'doctor': '🏥', 'health': '💊',
        'deposit': '💰', 'payroll': '💰', 'refund': '↩️', 'credit': '💰',
    }

    def get_icon(description):
        d = description.lower()
        for keyword, icon in CATEGORY_ICONS.items():
            if keyword in d:
                return icon
        return '💳'

    # ── Construir filas de transacciones ────────────────────────────────────
    def build_rows(tx_list, is_income_section):
        rows = ''
        for t in tx_list:
            amt          = abs(float(t.get('amount', 0)))
            desc         = t.get('description', '')
            icon         = get_icon(desc)
            sign         = '+' if is_income_section else '−'
            amount_color = '#16a34a' if is_income_section else '#111827'
            rows += f"""
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="36" style="vertical-align:middle;">
                        <div style="width:32px;height:32px;background-color:#f9fafb;border-radius:8px;
                                    text-align:center;line-height:32px;font-size:16px;">{icon}</div>
                      </td>
                      <td style="vertical-align:middle;padding-left:10px;">
                        <span style="font-size:13px;color:#374151;font-weight:500;">{desc}</span>
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
        <!-- Activity -->
        <tr><td style="padding:24px 0 0 0;">
          <p style="margin:0 0 12px 0;font-size:10px;font-weight:700;color:#9ca3af;
                    text-transform:uppercase;letter-spacing:1px;">Yesterday's Activity</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            {expense_block}
            {income_block}
          </table>
        </td></tr>"""

    hero_label = "Yesterday's Expenses"
    hero_value = f"{actual_display_spend:.2f} €"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>FinAI.Agent Daily Update</title>
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
                               letter-spacing:-0.5px;">FinAI<span style="color:#16a34a;">.Agent</span></span>
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
                    Your Daily Report
                  </h1>
                </td>
              </tr>

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
                          {hero_value}
                        </span>
                      </td>
                      <td width="6" style="background-color:{status_color};"></td>
                    </tr>
                  </table>
                </td>
              </tr>

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
                        <a href="#" style="display:inline-block;padding:11px 22px;
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
                <td>
                  <span style="font-size:11px;color:#9ca3af;">
                    FinAI.Agent &mdash; Your AI-powered financial advisor
                  </span>
                </td>
                <td align="right">
                  <a href="#" style="font-size:11px;color:#9ca3af;text-decoration:none;">
                    Unsubscribe
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
# SMS ALERT (lock atómico anti-duplicados)
# ==========================================
def send_sms_if_needed(amount, user_id):
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    lock_key = f"sms_sent_{date_str}_{user_id}"
    phrases  = [
        "You said you were going to start saving!",
        "Do you really need that?",
        "Your wallet is crying right now."
    ]
    try:
        # Lock atómico: solo la primera Lambda escribe. La segunda lanza ConditionalCheckFailedException.
        cache_table.put_item(
            Item={
                'cache_key': lock_key, 'status': 'sent',
                'ttl': int(time.time()) + 86400, 'user_id': user_id
            },
            ConditionExpression='attribute_not_exists(cache_key)'
        )
        sns.publish(
            TopicArn=SNS_TOPIC_ARN,
            Message=f"🚨 FINAI: You spent {amount:.2f} EUR today. {random.choice(phrases)}",
            Subject="High Spending"
        )
        logger.info("SMS sent", extra={"amount": amount})
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        logger.info("SMS already sent today, skipping duplicate.", extra={"user_id": user_id})
    except Exception as e:
        logger.error("Error SMS", extra={"details": str(e)})
