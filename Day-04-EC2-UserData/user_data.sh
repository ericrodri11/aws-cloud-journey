#!/bin/bash
# Script to automate Apache installation on EC2 boot
# Day 4 Challenge: Launching a server without SSH

yum update -y
yum install -y httpd
systemctl start httpd
systemctl enable httpd
echo "<h1>Hello from my EC2 Server (t3.micro) - Eric Cloud Journey</h1>" > /var/www/html/index.html