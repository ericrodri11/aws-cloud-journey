import json

def lambda_handler(event, context):
    """
    AWS Lambda function for Day 5 Challenge.
    Demonstrates Serverless compute with Python.
    """
    # Simple logic to demonstrate execution
    message = "Hello! I am running on AWS Lambda. No servers managed!"
    print(message)
    
    return {
        'statusCode': 200,
        'body': json.dumps(message)
    }