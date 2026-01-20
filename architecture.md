# 🏦 AI Financial Agent - System Architecture

### Project: #100DaysOfCloud Challenge
**Day 23 Milestone:** Banking Integration & Serverless Ingestion.

---

## 🏗️ Architecture Diagram

```mermaid
graph TD
    %% --- External Actors ---
    User((User))
    BankAPI["Banking APIs<br/>(Plaid / Wise)"]

    %% --- Frontend Layer ---
    subgraph AWS_Frontend [Frontend Hosting]
        style AWS_Frontend fill:#f9f9f9,stroke:#333,stroke-width:1px
        CF[CloudFront CDN]
        S3["S3 Bucket<br/>(React App)"]
    end

    %% --- Backend Layer ---
    subgraph AWS_Backend [Serverless Backend]
        style AWS_Backend fill:#e6fffa,stroke:#00b8d9,stroke-width:2px
        LambdaIngest["Lambda Function:<br/>Ingestion Engine"]
        Layer[["Lambda Layer:<br/>Python Libs"]]
        DB[("DynamoDB:<br/>Transactions Table")]
    end

    %% --- AI Layer (Next Steps) ---
    subgraph AI_Layer [GenAI Analysis]
        style AI_Layer fill:#fff0f6,stroke:#d63384,stroke-width:1px
        Bedrock["Amazon Bedrock<br/>(Claude 3 / Titan)"]
    end

    %% --- Data Flow ---
    User -->|Visits Web| CF
    CF --> S3
    
    Layer -.->|Injects Dependencies| LambdaIngest
    BankAPI -->|JSON Transaction Data| LambdaIngest
    LambdaIngest -->|Stores Structured Data| DB
    
    %% --- Future Integration ---
    DB -.->|Retrieves Context| Bedrock
```

## 🛠️ Tech Stack & Components
Ingestion Engine (Python 3.13):

AWS Lambda: Executes the logic to fetch data securely.

Lambda Layers: Custom package containing plaid-python and requests libraries.

Environment Variables: Stores API Keys securely (non-hardcoded).

Storage (NoSQL):

Amazon DynamoDB: Stores transaction records with partition keys for fast retrieval.

External Integrations:

Plaid Sandbox: Simulates banking flows and realistic data for UI testing.

Wise API: Connects to real production accounts for personal finance tracking.

AI Analysis (Next Step):

Amazon Bedrock: Will consume data from DynamoDB to generate financial insights using Generative AI.