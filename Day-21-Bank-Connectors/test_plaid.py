import plaid
from plaid.api import plaid_api
from plaid.model.products import Products
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
import datetime
import time 
from secrets import PLAID_CLIENT_ID, PLAID_SECRET

# 1. Plaid Client Configuration
configuration = plaid.Configuration(
    host=plaid.Environment.Sandbox,
    api_key={
        'clientId': PLAID_CLIENT_ID,
        'secret': PLAID_SECRET,
    }
)
api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)

def test_plaid_flow():
    print("🏦 Starting Plaid Simulation (Sandbox)...")

    # 2. Create Fake Public Token (Sandbox)
    # Simulates a user logging into their bank and authorizing access
    pt_request = SandboxPublicTokenCreateRequest(
        institution_id='ins_109508', # Standard Sandbox Bank (Platypus Bank)
        initial_products=[Products('transactions')]
    )
    pt_response = client.sandbox_public_token_create(pt_request)
    public_token = pt_response['public_token']
    print("✅ User simulated and logged in successfully.")

    # 3. Exchange Public Token for Access Token
    # This 'access_token' is the master key to fetch data
    exchange_request = ItemPublicTokenExchangeRequest(
        public_token=public_token
    )
    exchange_response = client.item_public_token_exchange(exchange_request)
    access_token = exchange_response['access_token']
    print(f"🔑 Access Token generated: {access_token[:10]}...")

    # --- WAITING FOR DATA GENERATION ---
    print("⏳ Waiting for Plaid to generate fake data (5 seconds)...")
    time.sleep(5) 
    # -----------------------------------

    # 4. Fetch Transactions (Simulated)
    # We ask for the last 30 days of history
    start_date = (datetime.datetime.now() - datetime.timedelta(days=30)).date()
    end_date = datetime.datetime.now().date()
    
    request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start_date,
        end_date=end_date,
        options=TransactionsGetRequestOptions(
            count=5 # Limit to 5 for testing
        )
    )
    response = client.transactions_get(request)
    transactions = response['transactions']

    print("\n📊 RETRIEVED TRANSACTIONS (SANDBOX):")
    for t in transactions:
        amount = t['amount']
        name = t['name']
        date = t['date']
        currency = t['iso_currency_code']
        print(f" - [{date}] {name}: {amount} {currency}")

if __name__ == "__main__":
    test_plaid_flow()