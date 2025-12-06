#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get backend URL from user
echo -e "${YELLOW}Enter your Vercel backend URL (e.g., https://your-app.vercel.app):${NC}"
read BACKEND_URL

echo -e "\n${YELLOW}Testing backend endpoints...${NC}\n"

# Test 1: Root endpoint
echo -e "${YELLOW}1. Testing root endpoint: ${BACKEND_URL}/${NC}"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/")
if [ "$RESPONSE" -eq 200 ]; then
    echo -e "${GREEN}✓ Root endpoint works (200 OK)${NC}"
else
    echo -e "${RED}✗ Root endpoint failed (HTTP $RESPONSE)${NC}"
fi

# Test 2: Health check
echo -e "\n${YELLOW}2. Testing health endpoint: ${BACKEND_URL}/health${NC}"
HEALTH=$(curl -s "$BACKEND_URL/health")
if [ -n "$HEALTH" ]; then
    echo -e "${GREEN}✓ Health check works${NC}"
    echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
else
    echo -e "${RED}✗ Health check failed${NC}"
fi

# Test 3: Login endpoint
echo -e "\n${YELLOW}3. Testing login endpoint: ${BACKEND_URL}/v1/auth/login${NC}"
LOGIN_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"786engeeneringworks@gmail.com","password":"786@786A"}' \
  "$BACKEND_URL/v1/auth/login")

if echo "$LOGIN_RESPONSE" | grep -q "tokens\|user"; then
    echo -e "${GREEN}✓ Login endpoint works${NC}"
    echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
else
    echo -e "${RED}✗ Login endpoint failed${NC}"
    echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
fi

# Test 4: Company endpoint
echo -e "\n${YELLOW}4. Testing company endpoint: ${BACKEND_URL}/v1/company${NC}"
COMPANY_RESPONSE=$(curl -s "$BACKEND_URL/v1/company")
echo "$COMPANY_RESPONSE" | jq '.' 2>/dev/null || echo "$COMPANY_RESPONSE"

echo -e "\n${YELLOW}================================${NC}"
echo -e "${YELLOW}Testing complete!${NC}"
echo -e "${YELLOW}================================${NC}"
