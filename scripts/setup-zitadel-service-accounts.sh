#!/bin/bash
# Setup dual service accounts for Zitadel
# This script creates two service accounts:
# 1. introspection-service - For verifying frontend user tokens
# 2. management-api-service - For creating and managing users

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ZITADEL_DOMAIN="${ZITADEL_DOMAIN}"
ADMIN_TOKEN="${ZITADEL_ADMIN_TOKEN}"
PROJECT_ID="${ZITADEL_PROJECT_ID}"
ORG_ID="${ZITADEL_ORG_ID}"

# Validate required environment variables
if [ -z "$ZITADEL_DOMAIN" ]; then
    echo -e "${RED}Error: ZITADEL_DOMAIN is not set${NC}"
    echo "Example: export ZITADEL_DOMAIN=auth.yourdomain.com"
    exit 1
fi

if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}Error: ZITADEL_ADMIN_TOKEN is not set${NC}"
    echo "Get your admin token from Zitadel console"
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}Warning: ZITADEL_PROJECT_ID is not set${NC}"
    echo "Permissions will not be granted automatically"
fi

if [ -z "$ORG_ID" ]; then
    echo -e "${YELLOW}Warning: ZITADEL_ORG_ID is not set${NC}"
fi

# Check for required tools
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed${NC}"
    echo "Install with: brew install jq"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}🚀 Creating Zitadel service accounts...${NC}"
echo "Domain: $ZITADEL_DOMAIN"
echo ""

# 1. Create introspection service account
echo -e "${GREEN}📝 Creating introspection service account...${NC}"
INTROSPECTION_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/machine" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "introspection-service",
    "name": "Token Introspection Service",
    "description": "For verifying frontend user access tokens",
    "accessTokenType": "ACCESS_TOKEN_TYPE_JWT"
  }')

HTTP_CODE=$(echo "$INTROSPECTION_RESPONSE" | tail -n1)
INTROSPECTION_USER=$(echo "$INTROSPECTION_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}❌ Failed to create introspection service account (HTTP $HTTP_CODE)${NC}"
    echo "$INTROSPECTION_USER" | jq '.' 2>/dev/null || echo "$INTROSPECTION_USER"
    exit 1
fi

INTROSPECTION_USER_ID=$(echo "$INTROSPECTION_USER" | jq -r '.userId')
echo -e "${GREEN}✅ Introspection service created: ${INTROSPECTION_USER_ID}${NC}"

# 2. Create Management API service account
echo -e "${GREEN}📝 Creating Management API service account...${NC}"
API_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/machine" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "management-api-service",
    "name": "Management API Service",
    "description": "For creating and managing users, roles, and grants",
    "accessTokenType": "ACCESS_TOKEN_TYPE_JWT"
  }')

HTTP_CODE=$(echo "$API_RESPONSE" | tail -n1)
API_USER=$(echo "$API_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}❌ Failed to create Management API service account (HTTP $HTTP_CODE)${NC}"
    echo "$API_USER" | jq '.' 2>/dev/null || echo "$API_USER"
    exit 1
fi

API_USER_ID=$(echo "$API_USER" | jq -r '.userId')
echo -e "${GREEN}✅ Management API service created: ${API_USER_ID}${NC}"

# 3. Generate keys for both accounts
echo ""
echo -e "${GREEN}🔑 Generating service account keys...${NC}"

# Generate introspection key
INTROSPECTION_KEY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/${INTROSPECTION_USER_ID}/keys" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "KEY_TYPE_JSON",
    "expirationDate": "2026-12-31T23:59:59Z"
  }')

HTTP_CODE=$(echo "$INTROSPECTION_KEY_RESPONSE" | tail -n1)
INTROSPECTION_KEY=$(echo "$INTROSPECTION_KEY_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}❌ Failed to generate introspection key (HTTP $HTTP_CODE)${NC}"
    echo "$INTROSPECTION_KEY" | jq '.' 2>/dev/null || echo "$INTROSPECTION_KEY"
    exit 1
fi

# Generate Management API key
API_KEY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://${ZITADEL_DOMAIN}/management/v1/users/${API_USER_ID}/keys" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "KEY_TYPE_JSON",
    "expirationDate": "2026-12-31T23:59:59Z"
  }')

HTTP_CODE=$(echo "$API_KEY_RESPONSE" | tail -n1)
API_KEY=$(echo "$API_KEY_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}❌ Failed to generate Management API key (HTTP $HTTP_CODE)${NC}"
    echo "$API_KEY" | jq '.' 2>/dev/null || echo "$API_KEY"
    exit 1
fi

# 4. Save keys to files
OUTPUT_DIR="."
if [ -n "$1" ]; then
    OUTPUT_DIR="$1"
    mkdir -p "$OUTPUT_DIR"
fi

echo "$INTROSPECTION_KEY" | jq '.' > "${OUTPUT_DIR}/zitadel-client-service-account.json"
echo "$API_KEY" | jq '.' > "${OUTPUT_DIR}/zitadel-api-service-account.json"

echo -e "${GREEN}✅ Keys saved to:${NC}"
echo "   - ${OUTPUT_DIR}/zitadel-client-service-account.json (for introspection)"
echo "   - ${OUTPUT_DIR}/zitadel-api-service-account.json (for Management API)"

# 5. Grant appropriate permissions (if PROJECT_ID is set)
if [ -n "$PROJECT_ID" ]; then
    echo ""
    echo -e "${GREEN}🔐 Granting permissions...${NC}"
    
    # Grant introspection account project access
    echo "Granting introspection account access to project..."
    INTROSPECTION_GRANT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      "https://${ZITADEL_DOMAIN}/management/v1/users/${INTROSPECTION_USER_ID}/grants" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"projectId\": \"${PROJECT_ID}\",
        \"roleKeys\": []
      }" 2>/dev/null || echo "0")
    
    HTTP_CODE=$(echo "$INTROSPECTION_GRANT_RESPONSE" | tail -n1)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo -e "${GREEN}✅ Introspection account granted project access${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not grant introspection account permissions (HTTP $HTTP_CODE)${NC}"
        echo "You may need to grant permissions manually in Zitadel console"
    fi
    
    # Grant Management API account project access with user management roles
    echo "Granting Management API account access to project..."
    API_GRANT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      "https://${ZITADEL_DOMAIN}/management/v1/users/${API_USER_ID}/grants" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"projectId\": \"${PROJECT_ID}\",
        \"roleKeys\": []
      }" 2>/dev/null || echo "0")
    
    HTTP_CODE=$(echo "$API_GRANT_RESPONSE" | tail -n1)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo -e "${GREEN}✅ Management API account granted project access${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not grant Management API account permissions (HTTP $HTTP_CODE)${NC}"
        echo "You may need to grant permissions manually in Zitadel console"
    fi
else
    echo ""
    echo -e "${YELLOW}⚠️  Skipping permission grants (ZITADEL_PROJECT_ID not set)${NC}"
    echo "You'll need to grant permissions manually in Zitadel console:"
    echo "1. Go to your project in Zitadel console"
    echo "2. Add both service accounts as project members"
    echo "3. Grant appropriate roles to each account"
fi

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Review the generated service account files:"
echo "   cat ${OUTPUT_DIR}/zitadel-client-service-account.json"
echo "   cat ${OUTPUT_DIR}/zitadel-api-service-account.json"
echo ""
echo "2. Copy service account files to server:"
echo "   scp ${OUTPUT_DIR}/zitadel-client-service-account.json root@kucharz.net:/home/spec-server/"
echo "   scp ${OUTPUT_DIR}/zitadel-api-service-account.json root@kucharz.net:/home/spec-server/"
echo ""
echo "3. Update environment variables on server:"
echo "   ZITADEL_CLIENT_JWT_PATH=/home/spec-server/zitadel-client-service-account.json"
echo "   ZITADEL_API_JWT_PATH=/home/spec-server/zitadel-api-service-account.json"
echo ""
echo "4. Update your application code to use separate service accounts"
echo "   See docs/ZITADEL_DUAL_SERVICE_ACCOUNT_MIGRATION.md for details"
echo ""
echo "5. Restart server container after code deployment"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "- Service account keys expire on 2026-12-31"
echo "- Save these JSON files securely"
echo "- Consider setting up key rotation before expiration"
echo ""
