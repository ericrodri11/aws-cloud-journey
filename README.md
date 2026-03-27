# ☁️ AWS Cloud Journey: From Python Developer to Serverless Architect

[![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)
[![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)](https://www.python.org/)
[![100 Days of Cloud](https://img.shields.io/badge/Challenge-%23100DaysOfCloud-blue?style=for-the-badge)](https://www.100daysofcloud.com/)

> **Objective:** Documenting my daily transition from a Python Developer to a Cloud Solutions Architect, focusing on Serverless technologies and Automation.

## 🚀 About This Repository

I started this journey on **December 24, 2025**, with a clear goal: to master the AWS ecosystem not just by reading documentation, but by **building** real-world scenarios.

This repository serves as my living lab where I commit my code, infrastructure scripts (IaC), and architectural notes.

## 📂 Daily Progress Log

| Day | Project / Topic | Key Services | Key Learning |
| :--- | :--- | :--- | :--- |
| **42** | [Gamification Engine](./Day-42-Gamification-Engine) | `DynamoDB Single Table` `Python` | Overcame stateless serverless limitations by implementing a Savings Streak engine. Stored user profile metadata alongside transactional records securely without adding database bloat. |
| **41** | [Enterprise Observability](./Day-41-Structured-Logging) | `Lambda Powertools` `CloudWatch Insights` | Migrated from native print statements to structured JSON logging. Injected dynamic user identity into the logging context and AI prompts to enable scalable, queryable monitoring. |
| **40** | [FinOps & Guardrails](./Day-40-FinOps-Guardrails) | `AWS Budgets` `Cost Explorer` | Implemented a Zero Spend Budget and forecast alarms. Learned the hard way that missing FinOps controls leads to bill shock. Security requires financial boundaries. |
| **39** | [Vulnerability Remediation](./Day-39-Security-Remediation) | `Amazon Inspector` `Lambda` | Acted on Inspector findings. Disabled the unintended automated scanning of historical Lambda artifacts to immediately stop cost hemorrhage and secure the environment. |
| **38** | [Deep Security Scanning](./Day-38-Amazon-Inspector) | `Amazon Inspector` `Vulnerability Management` | Activated Amazon Inspector to scan Lambda functions and dependencies for CVEs. Discovered the hidden costs of enterprise-grade security tools in Free Tier accounts. |
| **37** | [RAG Upgrades & Serverless v2](./Day-37-Knowledge-Base) | `Bedrock Knowledge Base` `Aurora Serverless` | Attempted to upgrade the agent's memory using Bedrock Knowledge Bases. Unintentionally provisioned an Aurora Serverless v2 cluster, learning a critical lesson about default configurations vs. Serverless pricing. |
| **36** | [Distributed Tracing (X-Ray)](./Day-36-XRay-Tracing) | `AWS X-Ray` `CloudWatch Service Map` | Enabled Active Tracing to visualize the end-to-end journey of requests. Moved from "guessing" latency to "seeing" bottlenecks in the Service Map. |
| **35** | [Resilience Patterns (DLQ)](./Day-35-Resilience-DLQ) | `Amazon SQS` `Lambda Async` | Implemented a Dead Letter Queue to catch failed events. Adopted a "Fail Safe" architecture ensuring no financial transaction data is lost during crashes. |
| **34** | [Zero Trust Security](./Day-34-SSM-Parameters) | `Systems Manager` `IAM` | Migrated sensitive credentials from Environment Variables to encrypted SSM Parameter Store. Hardened security posture by decoupling configuration from code. |
| **33** | [Observability Cockpit](./Day-33-CloudWatch-Dashboard) | `CloudWatch Logs Insights` `Custom Metrics` | Built a custom dashboard to track AI Latency and Cost per Transaction. Used Structured JSON logging to turn text logs into queryable business data. |
| **32** | [Smart SMS Alerts](./Day-32-SMS-Logic) | `Amazon SNS` `Python Logic` | Engineered an anti-spam logic using DynamoDB locks to allow hourly checks without bombarding the user. Implemented "High Spending" triggers. |
| **31** | [Smart Caching System](./Day-31-Caching-Strategy) | `DynamoDB TTL` `Hashing` | Reduced AI costs and latency by implementing a caching layer. Responses for identical financial states are stored and retrieved via SHA-256 hashes. |
| **30** | [FinOps & Cost Tracking](./Day-30-FinOps-Calculator) | `Python` `CloudWatch` | Implemented real-time cost calculation for GenAI tokens. Logging financial impact per execution to monitor cloud spend against budget. |
| **29** | [Interactive Chat Mode](./Day-29-Chat-Interface) | `Bedrock` `Prompt Engineering` | Evolved the agent from a static reporter to an interactive chatbot. Configured distinct system prompts for "Analysis" vs "Conversational" modes. |
| **28** | [Modular Refactoring](./Day-28-Code-Modularity) | `Python` `Clean Code` | Refactored the growing monolithic Lambda into specialized helper functions (Ingestion, Brain, Notification) to improve maintainability. |
| **27** | [Predictive Analytics Module](./Day-27-Predictive-Analytics) | `Python` `Math` `Forecasting` | Shifted from descriptive to predictive analytics. Implemented a linear projection engine to forecast month-end spending based on daily velocity. |
| **26** | [AI Financial Scoring Engine](./Day-26-Scoring-Engine) | `Python` `Algorithms` `Gamification` | Built a custom credit-bureau algorithm. It calculates a "Financial Health Score" (0-100) based on savings rate and cashflow, providing a transparent audit log. |
| **25** | [Pro UI Visualization](./Day-25-Pro-Dashboard) | `React` `Recharts` `Tailwind` | Upgraded the dashboard from basic lists to professional Data Visualization. Implemented Donut Charts with auto-categorization and dynamic color mapping. |
| **24** | [Backend Logic & Email Refactor](./Day-24-Connecting-Wires) | `Python` `HTML/CSS` `Logic` | Refactored the notification system to handle complex logic. Designed "Tough Love" AI prompts and fixed synchronized data parsing between Frontend and Backend. |
| **23** | [Frontend Integration & Prompt Engineering](./Day-23-Frontend-Connect) | `API Gateway` `Bedrock` `Prompting` | Connected a web frontend to Lambda via Function URL. Refined AI persona with prompt engineering to avoid safety filters. |
| **22** | [Serverless Dependency Injection](./Day-22-Lambda-Layers) | `AWS Lambda Layers` `Zip Packaging` | Migrated local scripts to the cloud. Created and deployed a custom Lambda Layer to inject external Python libraries (`plaid-python`) into the serverless environment. |
| **21** | [Hybrid Banking Connector](./Day-21-Bank-Connectors) | `Python` `Plaid API` `Wise API` | Overcame API restrictions by architecting a hybrid solution: Plaid Sandbox for UI data simulation and Wise API for real-time production monitoring. |
| **20** | [Pro HTML Emails with SES](./Day-20-SES-HTML-Emails) | `Amazon SES` `Python` `HTML/CSS` | Replaced SNS plain text with rich HTML email templates. Configured dynamic dark mode alerts and prompt engineering for actionable advice. |
| **19** | [Smart Alerts Logic](./Day-19-Smart-Alerts) | `Python` `SNS` | Added business logic to calculate totals and trigger conditional "High Spending" email alerts. |
| **18** | [CloudFront CDN & HTTPS](./Day-18-CDN-HTTPS) | `CloudFront` `OAC` | Implemented a CDN to serve the React app via HTTPS globally and secured the S3 bucket with Origin Access Control. |
| **17** | [Full Stack Integration](./Day-17-Full-Stack-Integration) | `React` `Fetch API` | Connected the S3 Frontend to the API Gateway. Replaced mock data with live DynamoDB feeds. |
| **16** | [Serverless API Gateway](./Day-16-API-Gateway) | `API Gateway` `Lambda` `CORS` | Created a public HTTP API to expose DynamoDB data as JSON for the Frontend. |
| **15** | [Frontend Dashboard on S3](./Day-15-Frontend-S3) | `S3` `React` `Vite` | Deployed a modern React SPA dashboard using S3 Static Website Hosting. |
| **14** | [Automation with EventBridge](./Day-14-Automation) | `EventBridge` `Cron` | Configured a serverless scheduler to trigger the AI analysis automatically every day at 09:00 AM. |
| **13** | [Automated Email Alerts](./Day-13-Notifications) | `SNS` `Amazon Nova` | Integrated Amazon SNS to send AI-generated financial reports to email. Migrated from Titan to Nova Micro. |
| **12** | [Context-Aware AI (RAG)](./Day-12-AI-Context) | `Bedrock` `DynamoDB` | Built a Retrieval-Augmented Generation pipeline to let AI read DB history. |
| **11** | [Generative AI with Bedrock](./Day-11-Bedrock-AI) | `Bedrock` `Titan` | Integrated Amazon Titan (Foundation Model) to analyze text via API. |
| **10** | [NoSQL Database Design](./Day-10-DynamoDB) | `DynamoDB` `Boto3` | Designing Single Table Design schemas and persisting data. |
| **09** | [Banking API Connect](./Day-09-Banking-Connection) | `Lambda` `Python` | Connecting to external APIs and implementing Mock Strategy. |
| **08** | [Secrets Management](./Day-08-Secrets-Manager) | `Secrets Manager` `IAM` | Avoiding hardcoded credentials in Python scripts. |
| **07** | [AI Agent Architecture](./Day-07-Architecture) | `Draw.io` `System Design` | Designing a Fintech App flow before coding. |
| **06** | [Serverless API](./Day-05-Lambda-Serverless) | `API Gateway` | Exposing Lambda functions to the public internet via HTTP. |
| **05** | [Serverless Function (NoOps)](./Day-05-Lambda-Serverless) | `Lambda` `Python` | Running code without provisioning servers. Cost efficiency. |
| **04** | [Automated EC2 Web Server](./Day-04-EC2-UserData) | `EC2` `User Data` | Bootstrapping instances automatically. IaC basics. |
| **03** | [Static Website Hosting](./Day-03-S3-Website) | `S3` | Hosting a portfolio site with high availability and low cost. |
| **01-02** | AWS Foundations | `IAM` `Billing` | Setting up MFA, Budgets, and secure root access. |

## 🏗️ Architecture Diagram (Day 7)

```mermaid
graph LR
    Bank[Bank API] -- Secure Data --> Lambda[AWS Lambda]
    Lambda -- Store Secrets --> Secrets[AWS Secrets Manager]
    Lambda -- Save Tx --> Dynamo[DynamoDB]
    Lambda -- Analyze --> Bedrock[AWS Bedrock AI]
    style Secrets fill:#DD0000,stroke:#333,color:white
    style Bedrock fill:#228B22,stroke:#333,color:white

## 🛠️ Tech Stack & Tools

* **Cloud Provider:** AWS (Amazon Web Services)
* **Languages:** Python (Logic), Bash (Automation), HTML/CSS (Frontend)
* **Focus Area:** Serverless Architecture, Event-Driven Patterns, Cloud Security.

## 🌟 Why I'm doing this

Coming from a software development background (Harvard CS50P), I realized that understanding **where** code runs is just as important as the code itself. My mission is to bridge the gap between "Writing Code" and "Architecting Solutions" to help other developers overcome the fear of the cloud.

---
*Created by [Eric Rodríguez](https://www.linkedin.com/in/eric-rodriguez1998/) - Aspiring AWS Community Builder 2026*