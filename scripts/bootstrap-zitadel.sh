#!/bin/bash
# bootstrap-zitadel.sh - Complete Zitadel setup from scratch
# 
# This script bootstraps a fresh Zitadel instance with:
# - Organization (or uses existing)
# - Project
# - CLIENT service account (introspection)
# - API service account (Management API)
#
# Prerequisites:
# - Zitadel instance running (cloud or local)
# - Admin Personal Access Token (PAT)
#
# Usage:
#   ./scripts/bootstrap-zitadel.sh
#
# The script will prompt for:
# - Zitadel domain
# - Admin PAT
# - Organization name (optional, will create if not exists)
# - Project name

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Prompt for inputs
echo ""
echo "=================================================="
echo "  Zitadel Bootstrap - Complete Setup"
echo "=================================================="
echo ""
log_info "This script will set up your Zitadel instance with:"
echo "  1. Organization (create or use existing)"
echo "  2. Project"
echo "  3. CLIENT service account (for introspection)"
echo "  4. API service account (for Management API)"
echo ""

# Get Zitadel domain
read -p "Zitadel domain (e.g., your-instance.zitadel.cloud): " ZITADEL_DOMAIN
ZITADEL_DOMAIN=${ZITADEL_DOMAIN#https://}  # Remove https:// if present
ZITADEL_DOMAIN=${ZITADEL_DOMAIN%/}         # Remove trailing slash

# Get Admin PAT
read -sp "Admin Personal Access Token: " ADMIN_PAT
echo ""

# Test connection
log_info "Testing connection to Zitadel..."
TEST_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    "https://${ZITADEL_DOMAIN}/management/v1/orgs/_search")

HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" != "200" ]; then
    log_error "Failed to connect to Zitadel (HTTP $HTTP_CODE)"
    log_error "Please check your domain and admin token"
    exit 1
fi

log_success "Connected to Zitadel successfully"
echo ""

# Step 1: Organization
echo "=================================================="
echo "Step 1: Organization"
echo "=================================================="
echo ""

# List existing organizations
log_info "Fetching existing organizations..."
ORGS_RESPONSE=$(curl -s \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    "https://${ZITADEL_DOMAIN}/management/v1/orgs/_search" \
    -d '{}')

# Parse organization names and IDs
ORGS_LIST=$(echo "$ORGS_RESPONSE" | jq -r '.result[] | "\(.id) - \(.name)"' 2>/dev/null || echo "")

if [ -n "$ORGS_LIST" ]; then
    echo "Existing organizations:"
    echo "$ORGS_LIST" | nl
    echo ""
fi

read -p "Use existing organization? (y/n): " USE_EXISTING_ORG

if [ "$USE_EXISTING_ORG" = "y" ] || [ "$USE_EXISTING_ORG" = "Y" ]; then
    # Use existing organization
    read -p "Enter organization ID: " ORG_ID
    
    # Verify org exists
    ORG_RESPONSE=$(curl -s \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        "https://${ZITADEL_DOMAIN}/management/v1/orgs/${ORG_ID}")
    
    if echo "$ORG_RESPONSE" | jq -e '.id' >/dev/null 2>&1; then
        ORG_NAME=$(echo "$ORG_RESPONSE" | jq -r '.name')
        log_success "Using organization: $ORG_NAME (ID: $ORG_ID)"
    else
        log_error "Organization not found"
        exit 1
    fi
else
    # Create new organization
    read -p "New organization name: " ORG_NAME
    
    log_info "Creating organization: $ORG_NAME..."
    
    CREATE_ORG_RESPONSE=$(curl -s \
        -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        "https://${ZITADEL_DOMAIN}/admin/v1/orgs" \
        -d "{\"name\": \"${ORG_NAME}\"}")
    
    ORG_ID=$(echo "$CREATE_ORG_RESPONSE" | jq -r '.id')
    
    if [ -z "$ORG_ID" ] || [ "$ORG_ID" = "null" ]; then
        log_error "Failed to create organization"
        echo "$CREATE_ORG_RESPONSE" | jq '.'
        exit 1
    fi
    
    log_success "Created organization: $ORG_NAME (ID: $ORG_ID)"
fi

echo ""

# Step 2: Project
echo "=================================================="
echo "Step 2: Project"
echo "=================================================="
echo ""

read -p "Project name (e.g., 'Spec Server API'): " PROJECT_NAME

log_info "Creating project: $PROJECT_NAME..."

CREATE_PROJECT_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    "https://${ZITADEL_DOMAIN}/management/v1/projects" \
    -d "{\"name\": \"${PROJECT_NAME}\"}")

PROJECT_ID=$(echo "$CREATE_PROJECT_RESPONSE" | jq -r '.id')

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    log_error "Failed to create project"
    echo "$CREATE_PROJECT_RESPONSE" | jq '.'
    exit 1
fi

log_success "Created project: $PROJECT_NAME (ID: $PROJECT_ID)"
echo ""

# Step 3: CLIENT Service Account (Introspection)
echo "=================================================="
echo "Step 3: CLIENT Service Account (Introspection)"
echo "=================================================="
echo ""

log_info "Creating CLIENT service account..."

# Create CLIENT service account
CREATE_CLIENT_SA_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    "https://${ZITADEL_DOMAIN}/management/v1/users/machine" \
    -d '{
        "userName": "client-introspection-service",
        "name": "CLIENT Service Account (Introspection)",
        "description": "Service account for token introspection (minimal permissions)",
        "accessTokenType": "ACCESS_TOKEN_TYPE_JWT"
    }')

CLIENT_USER_ID=$(echo "$CREATE_CLIENT_SA_RESPONSE" | jq -r '.userId')

if [ -z "$CLIENT_USER_ID" ] || [ "$CLIENT_USER_ID" = "null" ]; then
    log_error "Failed to create CLIENT service account"
    echo "$CREATE_CLIENT_SA_RESPONSE" | jq '.'
    exit 1
fi

log_success "Created CLIENT service account (User ID: $CLIENT_USER_ID)"

# Generate CLIENT key
log_info "Generating CLIENT service account key..."

EXPIRATION_DATE="2026-01-01T00:00:00Z"

CLIENT_KEY_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    "https://${ZITADEL_DOMAIN}/management/v1/users/${CLIENT_USER_ID}/keys" \
    -d "{
        \"type\": \"KEY_TYPE_JSON\",
        \"expirationDate\": \"${EXPIRATION_DATE}\"
    }")

CLIENT_KEY_ID=$(echo "$CLIENT_KEY_RESPONSE" | jq -r '.id')
CLIENT_KEY_DETAILS=$(echo "$CLIENT_KEY_RESPONSE" | jq -r '.keyDetails')

if [ -z "$CLIENT_KEY_ID" ] || [ "$CLIENT_KEY_ID" = "null" ]; then
    log_error "Failed to generate CLIENT key"
    echo "$CLIENT_KEY_RESPONSE" | jq '.'
    exit 1
fi

# Save CLIENT key
mkdir -p secrets
echo "$CLIENT_KEY_DETAILS" | base64 -d > secrets/zitadel-client-service-account.json
chmod 600 secrets/zitadel-client-service-account.json

log_success "CLIENT key saved to: secrets/zitadel-client-service-account.json"

# Grant minimal permissions to CLIENT (just introspection)
log_info "Granting introspection permissions to CLIENT..."

# Add CLIENT to project (no roles needed for introspection, just membership)
GRANT_CLIENT_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    "https://${ZITADEL_DOMAIN}/management/v1/users/${CLIENT_USER_ID}/grants" \
    -d "{
        \"projectId\": \"${PROJECT_ID}\",
        \"roleKeys\": []
    }")

log_success "CLIENT service account configured for introspection"
echo ""

# Step 4: API Service Account (Management API)
echo "=================================================="
echo "Step 4: API Service Account (Management API)"
echo "=================================================="
echo ""

log_info "Creating API service account..."

# Create API service account
CREATE_API_SA_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    "https://${ZITADEL_DOMAIN}/management/v1/users/machine" \
    -d '{
        "userName": "api-management-service",
        "name": "API Service Account (Management API)",
        "description": "Service account for Zitadel Management API operations (user creation, role management)",
        "accessTokenType": "ACCESS_TOKEN_TYPE_JWT"
    }')

API_USER_ID=$(echo "$CREATE_API_SA_RESPONSE" | jq -r '.userId')

if [ -z "$API_USER_ID" ] || [ "$API_USER_ID" = "null" ]; then
    log_error "Failed to create API service account"
    echo "$CREATE_API_SA_RESPONSE" | jq '.'
    exit 1
fi

log_success "Created API service account (User ID: $API_USER_ID)"

# Generate API key
log_info "Generating API service account key..."

API_KEY_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    "https://${ZITADEL_DOMAIN}/management/v1/users/${API_USER_ID}/keys" \
    -d "{
        \"type\": \"KEY_TYPE_JSON\",
        \"expirationDate\": \"${EXPIRATION_DATE}\"
    }")

API_KEY_ID=$(echo "$API_KEY_RESPONSE" | jq -r '.id')
API_KEY_DETAILS=$(echo "$API_KEY_RESPONSE" | jq -r '.keyDetails')

if [ -z "$API_KEY_ID" ] || [ "$API_KEY_ID" = "null" ]; then
    log_error "Failed to generate API key"
    echo "$API_KEY_RESPONSE" | jq '.'
    exit 1
fi

# Save API key
echo "$API_KEY_DETAILS" | base64 -d > secrets/zitadel-api-service-account.json
chmod 600 secrets/zitadel-api-service-account.json

log_success "API key saved to: secrets/zitadel-api-service-account.json"

# Grant org-level permissions to API service account
log_info "Granting Management API permissions to API service account..."

# Grant ORG_OWNER role (required for user management)
GRANT_API_RESPONSE=$(curl -s \
    -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    "https://${ZITADEL_DOMAIN}/management/v1/orgs/me/members" \
    -d "{
        \"userId\": \"${API_USER_ID}\",
        \"roles\": [\"ORG_OWNER\"]
    }")

log_success "API service account configured with Management API permissions"
echo ""

# Final summary
echo "=================================================="
echo "  ✅ Bootstrap Complete!"
echo "=================================================="
echo ""
log_success "Your Zitadel instance is now configured!"
echo ""
echo "Configuration Summary:"
echo "  Domain:       ${ZITADEL_DOMAIN}"
echo "  Organization: ${ORG_NAME} (${ORG_ID})"
echo "  Project:      ${PROJECT_NAME} (${PROJECT_ID})"
echo ""
echo "Service Accounts Created:"
echo "  CLIENT: ${CLIENT_USER_ID}"
echo "    Purpose: Token introspection"
echo "    Key:     secrets/zitadel-client-service-account.json"
echo ""
echo "  API:    ${API_USER_ID}"
echo "    Purpose: Management API (user creation, roles)"
echo "    Key:     secrets/zitadel-api-service-account.json"
echo ""
echo "Next Steps:"
echo "  1. Update your .env file with:"
echo ""
echo "     ZITADEL_DOMAIN=${ZITADEL_DOMAIN}"
echo "     ZITADEL_ORG_ID=${ORG_ID}"
echo "     ZITADEL_PROJECT_ID=${PROJECT_ID}"
echo "     ZITADEL_CLIENT_JWT_PATH=/app/secrets/zitadel-client-service-account.json"
echo "     ZITADEL_API_JWT_PATH=/app/secrets/zitadel-api-service-account.json"
echo ""
echo "  2. For Coolify deployment, upload JSON files to:"
echo "     - /app/secrets/zitadel-client-service-account.json"
echo "     - /app/secrets/zitadel-api-service-account.json"
echo ""
echo "  3. Test the setup:"
echo "     nx run workspace-cli:workspace:start"
echo "     Check logs for: '✅ Dual service account mode active'"
echo ""
echo "⚠️  Important:"
echo "  - Keep JSON files secure (never commit to git)"
echo "  - Keys expire on: $(date -d ${EXPIRATION_DATE} +%Y-%m-%d 2>/dev/null || date -j -f '%Y-%m-%dT%H:%M:%SZ' ${EXPIRATION_DATE} +%Y-%m-%d 2>/dev/null || echo ${EXPIRATION_DATE})"
echo "  - Set reminder to rotate keys before expiration"
echo ""
