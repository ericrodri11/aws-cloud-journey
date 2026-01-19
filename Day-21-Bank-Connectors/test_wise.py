import requests
import json
from secrets import WISE_API_TOKEN

BASE_URL = "https://api.wise.com/v1"
HEADERS = {"Authorization": f"Bearer {WISE_API_TOKEN}"}

def get_wise_data():
    print("🌍 Conectando con Wise API (Datos Reales)...")
    
    # 1. Obtener ID de Perfil
    resp = requests.get(f"{BASE_URL}/profiles", headers=HEADERS)
    if resp.status_code != 200:
        print(f"❌ Error: {resp.text}")
        return

    profile_id = resp.json()[0]['id']
    print(f"✅ Perfil Autorizado ID: {profile_id}")

    # 2. Obtener Cuentas
    resp_acc = requests.get(f"{BASE_URL}/borderless-accounts?profileId={profile_id}", headers=HEADERS)
    accounts = resp_acc.json()
    
    print("\n💰 TUS SALDOS REALES:")
    for account in accounts:
        for balance in account['balances']:
            # Solo mostramos si hay dinero
            if float(balance['amount']['value']) > 0:
                print(f" - {balance['currency']}: {balance['amount']['value']} {balance['currency']}")

if __name__ == "__main__":
    get_wise_data()