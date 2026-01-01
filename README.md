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
| **08** | [Secrets Management](./Day-08-Secrets-Manager) | `Secrets Manager` `IAM` | Avoiding hardcoded credentials in Python scripts. |
| **07** | [AI Agent Architecture](./Day-07-Architecture) | `Draw.io` `System Design` | Designing a Fintech App flow before coding. |
| **06** | [Serverless API](./Day-05-Lambda-Serverless) | `API Gateway` | Exposing Lambda functions to the public internet via HTTP. |
| **05** | [Serverless Function (NoOps)](./Day-05-Lambda-Serverless) | `Lambda` `Python` | Running code without provisioning servers. Cost efficiency. |
| **04** | [Automated EC2 Web Server](./Day-04-EC2-UserData) | `EC2` `User Data` `Bash` | Bootstrapping instances automatically. IaC basics. |
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
🛠️ Tech Stack & Tools
Cloud Provider: AWS (Amazon Web Services)

Languages: Python (Logic), Bash (Automation)

Focus Area: Serverless Architecture, Event-Driven Patterns, Cloud Security, FinOps.

🌟 Why I'm doing this
Coming from a software development background, I realized that understanding where code runs is just as important as the code itself. My mission is to bridge the gap between "Writing Code" and "Architecting Solutions" to help other developers overcome the fear of the cloud.

Created by Eric Rodríguez - Aspiring AWS Community Builder 2026
