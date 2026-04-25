"""
config.py — Constantes globales y clientes AWS/Plaid.
Importado por todos los demás módulos. No contiene lógica de negocio.
"""
import os
import boto3
import plaid
from plaid.api import plaid_api
from aws_lambda_powertools import Logger

# ==========================================
# CONSTANTES DE CONFIGURACIÓN
# ==========================================
REGION_RESOURCE  = 'eu-north-1'
REGION_BEDROCK   = 'us-east-1'
TABLE_NAME       = "FinanceAgent-Transactions"
CACHE_TABLE_NAME = "FinanceAgent-Cache"
MEMORY_TABLE_NAME= "FinanceAgent-Memory"
MODEL_ID         = "amazon.nova-micro-v1:0"
SQS_QUEUE_URL    = "https://sqs.eu-north-1.amazonaws.com/723013807294/FinanceAgent-SyncQueue"
SNS_TOPIC_ARN    = "arn:aws:sns:eu-north-1:723013807294:FinanceAgent-Alerts"

PLAID_CLIENT_ID  = os.environ.get('PLAID_CLIENT_ID')
PLAID_SECRET     = os.environ.get('PLAID_SECRET')
USER_EMAIL       = os.environ.get('USER_EMAIL', 'ericridri11@gmail.com')
DEFAULT_USER_ID  = os.environ.get('USER_ID', 'user_eric')
DEFAULT_USER_NAME= os.environ.get('USER_NAME', 'Eric')

SPENDING_LIMIT     = 100.00
STRICT_DAILY_BUDGET= 15.00
DAYS_LOOKBACK      = 120
CACHE_TTL_HOURS    = 1

# ==========================================
# CLIENTES AWS
# ==========================================
dynamodb = boto3.resource('dynamodb', region_name=REGION_RESOURCE)
table         = dynamodb.Table(TABLE_NAME)
cache_table   = dynamodb.Table(CACHE_TABLE_NAME)
memory_table  = dynamodb.Table(MEMORY_TABLE_NAME)
ses    = boto3.client('ses',             region_name=REGION_RESOURCE)
sns    = boto3.client('sns',             region_name=REGION_RESOURCE)
sqs    = boto3.client('sqs',             region_name=REGION_RESOURCE)
bedrock= boto3.client('bedrock-runtime', region_name=REGION_BEDROCK)

logger = Logger(service="FinanceAgent")

# ==========================================
# CLIENTE PLAID
# ==========================================
_plaid_config = plaid.Configuration(
    host=plaid.Environment.Sandbox,
    api_key={'clientId': PLAID_CLIENT_ID, 'secret': PLAID_SECRET}
)
_api_client  = plaid.ApiClient(_plaid_config)
plaid_client = plaid_api.PlaidApi(_api_client)

# ==========================================
# HELPER: INCOME KEYWORD CHECK
# Centralizado aquí para que todos los módulos
# usen exactamente el mismo criterio.
# ==========================================
INCOME_KEYWORDS = ['deposit', 'payroll', 'gusto', 'refund', 'united airlines']

def is_income_tx(description: str, amount: float) -> bool:
    """Devuelve True si la transacción es un ingreso/crédito."""
    desc = description.lower()
    return any(kw in desc for kw in INCOME_KEYWORDS) or amount < 0
