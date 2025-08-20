#!/bin/bash

# Generate a self-signed certificate for HTTPS development
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=192.168.100.8"

echo "Certificate generated! You can now use HTTPS in development."
echo "Add these files to your Vite config:"
echo "https: {"
echo "  key: fs.readFileSync('key.pem'),"
echo "  cert: fs.readFileSync('cert.pem')"
echo "}"
