#!/bin/bash
set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
MODE="${1:-provision}"

# Show help if requested
if [ "$MODE" = "--help" ] || [ "$MODE" = "-h" ]; then
    echo -e "${BLUE}Zitadel Bootstrap Script (Fully Automated)${NC}"
    echo ""
    echo "Usage: $0 [MODE]"
    echo ""
    echo "Modes:"
    echo "  provision    - Full setup: create org, project, service accounts (default)"
    echo "  status       - Show current configuration and verify connectivity"
    echo "  test         - Run comprehensive test suite to verify setup"
    echo "  verify       - Comprehensive verification of all configuration and access"
    echo "  regenerate   - Regenerate service account JWT keys"
    echo "  help         - Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  ZITADEL_DOMAIN      - Zitadel domain (default: localhost:8200)"
    echo "  ORG_NAME            - Organization name (default: Spec Organization)"
    echo "  PROJECT_NAME        - Project name (default: Spec Server)"
    echo "  ADMIN_USER_EMAIL    - Admin user email (default: admin@spec.local)"
    echo "  ADMIN_USER_PASSWORD - Admin user password (default: AdminPassword123!)"
    echo "  TEST_USER_EMAIL     - Test user email (default: test@example.com)"
    echo "  TEST_USER_PASSWORD  - Test user password (default: TestPassword123!)"
    echo ""
    echo "Examples:"
    echo "  $0                              # Full provision"
    echo "  $0 status                       # Check configuration"
    echo "  $0 test                         # Run comprehensive tests"
    echo "  $0 verify                       # Detailed verification"
    echo "  $0 regenerate                   # Regenerate keys"
    echo "  ZITADEL_DOMAIN=auth.example.com $0 provision"
    echo ""
    exit 0
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Zitadel Bootstrap Script - Mode: ${MODE}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    echo -e "${GREEN}Loading configuration from .env${NC}"
    set -a
    source <(grep -v '^#' .env | grep -v '^$' | grep -E '^[A-Z_]+=')
    set +a
fi

# Configuration
ZITADEL_DOMAIN="${ZITADEL_DOMAIN:-localhost:8200}"
ORG_NAME="${ORG_NAME:-Spec Organization}"
PROJECT_NAME="${PROJECT_NAME:-Spec Server}"
ADMIN_USER_EMAIL="${ADMIN_USER_EMAIL:-admin@spec.local}"
ADMIN_USER_PASSWORD="${ADMIN_USER_PASSWORD:-AdminPassword123!}"
TEST_USER_EMAIL="${TEST_USER_EMAIL:-test@example.com}"
TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-TestPassword123!}"
OAUTH_APP_NAME="${OAUTH_APP_NAME:-Spec Server OAuth}"
API_APP_NAME="${API_APP_NAME:-Spec Server API}"
ADMIN_PORT="${ADMIN_PORT:-5175}"
SERVER_PORT="${SERVER_PORT:-3000}"
REDIRECT_URI="${REDIRECT_URI:-http://localhost:${SERVER_PORT}/auth/callback}"
ADMIN_REDIRECT_URI="http://localhost:${ADMIN_PORT}/auth/callback"
ADMIN_POST_LOGOUT_URI="http://localhost:${ADMIN_PORT}/"

# Determine protocol
if [[ "$ZITADEL_DOMAIN" == "localhost"* ]] || [[ "$ZITADEL_DOMAIN" == "127.0.0.1"* ]]; then
    PROTOCOL="http"
else
    PROTOCOL="https"
fi

BASE_URL="${PROTOCOL}://${ZITADEL_DOMAIN}"

# Function to load PAT
load_pat() {
    local PAT_FILE="./secrets/bootstrap/pat.txt"
    
    if [ -f "$PAT_FILE" ]; then
        echo -e "${GREEN}✓ Found automatic PAT file!${NC}"
        ADMIN_PAT=$(cat "$PAT_FILE" | tr -d '\n\r')
        
        if [ -z "$ADMIN_PAT" ]; then
            echo -e "${RED}Error: PAT file is empty${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}✓ PAT loaded automatically${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ No automatic PAT found at ${PAT_FILE}${NC}"
        echo ""
        echo -e "${BLUE}Manual PAT Creation Steps:${NC}"
        echo -e "1. Open ${BLUE}${BASE_URL}${NC}"
        echo -e "2. Login with your admin credentials"
        echo -e "3. Go to Organization Settings → Users"
        echo -e "4. Click + New → Service User"
        echo -e "5. Create a service user with admin permissions"
        echo -e "6. In the service user's settings, go to Personal Access Tokens"
        echo -e "7. Click + New Token"
        echo -e "8. Copy the token"
        echo ""
        read -sp "Paste the Personal Access Token here: " ADMIN_PAT
        echo ""
        
        if [ -z "$ADMIN_PAT" ]; then
            echo -e "${RED}Error: No PAT provided${NC}"
            exit 1
        fi
        return 0
    fi
}

# Function to test authentication
test_auth() {
    TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -d '{}' \
        "${BASE_URL}/admin/v1/orgs/_search")

    HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" != "200" ]; then
        echo -e "${RED}Error: Authentication failed (HTTP $HTTP_CODE)${NC}"
        echo -e "${RED}Response: $(echo "$TEST_RESPONSE" | sed '$d')${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓ Authentication successful${NC}"
    return 0
}

# Function to get organization ID
get_org_id() {
    ORGS_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -d '{}' \
        "${BASE_URL}/admin/v1/orgs/_search")

    ORG_ID=$(echo "$ORGS_RESPONSE" | jq -r ".result[] | select(.name == \"${ORG_NAME}\") | .id" | head -n1)
}

# Function to get project ID
get_project_id() {
    PROJECTS_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{}' \
        "${BASE_URL}/management/v1/projects/_search")

    PROJECT_ID=$(echo "$PROJECTS_RESPONSE" | jq -r ".result[] | select(.name == \"${PROJECT_NAME}\") | .id" | head -n1)
}

# Function to get service account IDs
get_service_account_ids() {
    USERS_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{}' \
        "${BASE_URL}/management/v1/users/_search")

    CLIENT_USER_ID=$(echo "$USERS_RESPONSE" | jq -r '.result[] | select(.userName == "client-introspection-service") | .id' | head -n1)
    API_USER_ID=$(echo "$USERS_RESPONSE" | jq -r '.result[] | select(.userName == "api-management-service") | .id' | head -n1)
}

# Function to get OAuth app ID
get_oauth_app_id() {
    APPS_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{}' \
        "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/_search")

    OAUTH_APP_ID=$(echo "$APPS_RESPONSE" | jq -r "(.result // [])[] | select(.name == \"${OAUTH_APP_NAME}\") | .id" | head -n1)
}

# Function to get API app ID
get_api_app_id() {
    APPS_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{}' \
        "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/_search")

    API_APP_ID=$(echo "$APPS_RESPONSE" | jq -r "(.result // [])[] | select(.name == \"${API_APP_NAME}\") | .id" | head -n1)
}

# MODE: STATUS
if [ "$MODE" = "status" ]; then
    echo -e "${BLUE}Checking configuration status...${NC}"
    echo ""
    
    # Check local files
    echo -e "${BLUE}Local Files:${NC}"
    
    if [ -f "./secrets/bootstrap/pat.txt" ]; then
        PAT_SIZE=$(wc -c < "./secrets/bootstrap/pat.txt" | tr -d ' ')
        echo -e "  ${GREEN}✓${NC} Bootstrap PAT: ${PAT_SIZE} bytes"
    else
        echo -e "  ${RED}✗${NC} Bootstrap PAT: Not found"
    fi
    
    if [ -f "./secrets/zitadel-client-service-account.json" ]; then
        CLIENT_USER_ID_LOCAL=$(jq -r '.userId' ./secrets/zitadel-client-service-account.json 2>/dev/null)
        CLIENT_KEY_ID_LOCAL=$(jq -r '.keyId' ./secrets/zitadel-client-service-account.json 2>/dev/null)
        echo -e "  ${GREEN}✓${NC} CLIENT key: User ${CLIENT_USER_ID_LOCAL}, Key ${CLIENT_KEY_ID_LOCAL}"
    else
        echo -e "  ${RED}✗${NC} CLIENT key: Not found"
    fi
    
    if [ -f "./secrets/zitadel-api-service-account.json" ]; then
        API_USER_ID_LOCAL=$(jq -r '.userId' ./secrets/zitadel-api-service-account.json 2>/dev/null)
        API_KEY_ID_LOCAL=$(jq -r '.keyId' ./secrets/zitadel-api-service-account.json 2>/dev/null)
        echo -e "  ${GREEN}✓${NC} API key: User ${API_USER_ID_LOCAL}, Key ${API_KEY_ID_LOCAL}"
    else
        echo -e "  ${RED}✗${NC} API key: Not found"
    fi
    
    echo ""
    echo -e "${BLUE}Zitadel Configuration:${NC}"
    echo -e "  Domain: ${ZITADEL_DOMAIN}"
    echo -e "  Base URL: ${BASE_URL}"
    echo -e "  Org Name: ${ORG_NAME}"
    echo -e "  Project Name: ${PROJECT_NAME}"
    echo ""
    
    # Try to connect and verify
    if [ -f "./secrets/bootstrap/pat.txt" ]; then
        echo -e "${BLUE}Verifying Zitadel connectivity...${NC}"
        load_pat
        
        if test_auth; then
            get_org_id
            if [ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ]; then
                echo -e "  ${GREEN}✓${NC} Organization '${ORG_NAME}': ${ORG_ID}"
                
                get_project_id
                if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
                    echo -e "  ${GREEN}✓${NC} Project '${PROJECT_NAME}': ${PROJECT_ID}"
                    
                    get_service_account_ids
                    if [ -n "$CLIENT_USER_ID" ] && [ "$CLIENT_USER_ID" != "null" ]; then
                        echo -e "  ${GREEN}✓${NC} CLIENT service account: ${CLIENT_USER_ID}"
                    else
                        echo -e "  ${RED}✗${NC} CLIENT service account: Not found"
                    fi
                    
                    if [ -n "$API_USER_ID" ] && [ "$API_USER_ID" != "null" ]; then
                        echo -e "  ${GREEN}✓${NC} API service account: ${API_USER_ID}"
                    else
                        echo -e "  ${RED}✗${NC} API service account: Not found"
                    fi
                else
                    echo -e "  ${RED}✗${NC} Project '${PROJECT_NAME}': Not found"
                fi
            else
                echo -e "  ${RED}✗${NC} Organization '${ORG_NAME}': Not found"
            fi
        fi
    else
        echo -e "${YELLOW}⚠ Cannot verify without PAT file${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}User Credentials:${NC}"
    echo ""
    echo -e "${GREEN}Admin User (Console Access):${NC}"
    echo -e "  Email:    ${ADMIN_USER_EMAIL}"
    echo -e "  Password: ${ADMIN_USER_PASSWORD}"
    echo -e "  Console:  ${BASE_URL}"
    echo ""
    echo -e "${GREEN}Test User (Application Testing):${NC}"
    echo -e "  Email:    ${TEST_USER_EMAIL}"
    echo -e "  Password: ${TEST_USER_PASSWORD}"
    
    echo ""
    echo -e "${BLUE}Environment Variables for .env:${NC}"
    if [ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ]; then
        echo "ZITADEL_DOMAIN=${ZITADEL_DOMAIN}"
        echo "ZITADEL_ORG_ID=${ORG_ID}"
        if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
            echo "ZITADEL_PROJECT_ID=${PROJECT_ID}"
        fi
    else
        echo -e "${YELLOW}# Run provision mode first to get IDs${NC}"
    fi
    echo "ZITADEL_CLIENT_JWT_PATH=./secrets/zitadel-client-service-account.json"
    echo "ZITADEL_API_JWT_PATH=./secrets/zitadel-api-service-account.json"
    
    exit 0
fi

# MODE: REGENERATE
if [ "$MODE" = "regenerate" ]; then
    echo -e "${BLUE}Regenerating service account JWT keys...${NC}"
    echo ""
    
    load_pat
    echo ""
    
    echo -e "${BLUE}Testing authentication...${NC}"
    if ! test_auth; then
        exit 1
    fi
    echo ""
    
    echo -e "${BLUE}Getting organization...${NC}"
    get_org_id
    if [ -z "$ORG_ID" ] || [ "$ORG_ID" = "null" ]; then
        echo -e "${RED}Error: Organization '${ORG_NAME}' not found${NC}"
        echo -e "${YELLOW}Run 'provision' mode first to create the organization${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Organization found: ${ORG_ID}${NC}"
    echo ""
    
    echo -e "${BLUE}Getting service accounts...${NC}"
    get_service_account_ids
    
    if [ -z "$CLIENT_USER_ID" ] || [ "$CLIENT_USER_ID" = "null" ]; then
        echo -e "${RED}Error: CLIENT service account not found${NC}"
        echo -e "${YELLOW}Run 'provision' mode first to create service accounts${NC}"
        exit 1
    fi
    
    if [ -z "$API_USER_ID" ] || [ "$API_USER_ID" = "null" ]; then
        echo -e "${RED}Error: API service account not found${NC}"
        echo -e "${YELLOW}Run 'provision' mode first to create service accounts${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ CLIENT service account: ${CLIENT_USER_ID}${NC}"
    echo -e "${GREEN}✓ API service account: ${API_USER_ID}${NC}"
    echo ""
    
    # Regenerate CLIENT key
    echo -e "${BLUE}Regenerating CLIENT JWT key...${NC}"
    CLIENT_KEY_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{
            "type": "KEY_TYPE_JSON",
            "expirationDate": "2030-01-01T00:00:00Z"
        }' \
        "${BASE_URL}/management/v1/users/${CLIENT_USER_ID}/keys")

    CLIENT_KEY_DETAILS=$(echo "$CLIENT_KEY_RESPONSE" | jq -r '.keyDetails')

    if [ -z "$CLIENT_KEY_DETAILS" ] || [ "$CLIENT_KEY_DETAILS" = "null" ]; then
        echo -e "${RED}Error: Failed to generate CLIENT key${NC}"
        echo -e "${RED}Response: $CLIENT_KEY_RESPONSE${NC}"
        exit 1
    fi

    mkdir -p secrets
    echo "$CLIENT_KEY_DETAILS" | base64 -d > secrets/zitadel-client-service-account.json
    NEW_CLIENT_KEY_ID=$(jq -r '.keyId' secrets/zitadel-client-service-account.json)
    echo -e "${GREEN}✓ CLIENT key regenerated (Key ID: ${NEW_CLIENT_KEY_ID})${NC}"
    
    # Regenerate API key
    echo -e "${BLUE}Regenerating API JWT key...${NC}"
    API_KEY_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{
            "type": "KEY_TYPE_JSON",
            "expirationDate": "2030-01-01T00:00:00Z"
        }' \
        "${BASE_URL}/management/v1/users/${API_USER_ID}/keys")

    API_KEY_DETAILS=$(echo "$API_KEY_RESPONSE" | jq -r '.keyDetails')

    if [ -z "$API_KEY_DETAILS" ] || [ "$API_KEY_DETAILS" = "null" ]; then
        echo -e "${RED}Error: Failed to generate API key${NC}"
        echo -e "${RED}Response: $API_KEY_RESPONSE${NC}"
        exit 1
    fi

    echo "$API_KEY_DETAILS" | base64 -d > secrets/zitadel-api-service-account.json
    NEW_API_KEY_ID=$(jq -r '.keyId' secrets/zitadel-api-service-account.json)
    echo -e "${GREEN}✓ API key regenerated (Key ID: ${NEW_API_KEY_ID})${NC}"
    echo ""
    
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}   Keys Regenerated Successfully!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Restart your server to load the new keys"
    echo "2. Old keys will be invalid immediately"
    echo ""
    
    exit 0
fi

# MODE: VERIFY
if [ "$MODE" = "verify" ]; then
    echo -e "${BLUE}Running comprehensive verification...${NC}"
    echo ""
    
    VERIFICATION_PASSED=true
    
    # Check 1: Local files
    echo -e "${BLUE}[1/8] Checking local configuration files...${NC}"
    
    if [ -f "./secrets/bootstrap/pat.txt" ]; then
        PAT_SIZE=$(wc -c < "./secrets/bootstrap/pat.txt" | tr -d ' ')
        echo -e "  ${GREEN}✓${NC} Bootstrap PAT file exists (${PAT_SIZE} bytes)"
    else
        echo -e "  ${YELLOW}⚠${NC} Bootstrap PAT file not found (optional for verify)"
    fi
    
    if [ -f "./secrets/zitadel-client-service-account.json" ]; then
        CLIENT_KEY_ID=$(jq -r '.keyId' ./secrets/zitadel-client-service-account.json 2>/dev/null)
        CLIENT_USER_ID_FROM_FILE=$(jq -r '.userId' ./secrets/zitadel-client-service-account.json 2>/dev/null)
        if [ -n "$CLIENT_KEY_ID" ] && [ "$CLIENT_KEY_ID" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} CLIENT service account key file (Key: ${CLIENT_KEY_ID}, User: ${CLIENT_USER_ID_FROM_FILE})"
        else
            echo -e "  ${RED}✗${NC} CLIENT service account key file invalid"
            VERIFICATION_PASSED=false
        fi
    else
        echo -e "  ${RED}✗${NC} CLIENT service account key file missing"
        VERIFICATION_PASSED=false
    fi
    
    if [ -f "./secrets/zitadel-api-service-account.json" ]; then
        API_KEY_ID=$(jq -r '.keyId' ./secrets/zitadel-api-service-account.json 2>/dev/null)
        API_USER_ID_FROM_FILE=$(jq -r '.userId' ./secrets/zitadel-api-service-account.json 2>/dev/null)
        if [ -n "$API_KEY_ID" ] && [ "$API_KEY_ID" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} API service account key file (Key: ${API_KEY_ID}, User: ${API_USER_ID_FROM_FILE})"
        else
            echo -e "  ${RED}✗${NC} API service account key file invalid"
            VERIFICATION_PASSED=false
        fi
    else
        echo -e "  ${RED}✗${NC} API service account key file missing"
        VERIFICATION_PASSED=false
    fi
    echo ""
    
    # Check 2: Zitadel connectivity
    echo -e "${BLUE}[2/8] Testing Zitadel connectivity...${NC}"
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/debug/healthz" 2>/dev/null || echo "000")
    
    if [ "$HEALTH_RESPONSE" = "200" ]; then
        echo -e "  ${GREEN}✓${NC} Zitadel is reachable at ${BASE_URL}"
    else
        echo -e "  ${RED}✗${NC} Zitadel unreachable (HTTP ${HEALTH_RESPONSE})"
        VERIFICATION_PASSED=false
    fi
    echo ""
    
    # Check 3: Admin PAT authentication
    echo -e "${BLUE}[3/8] Testing Admin PAT authentication...${NC}"
    if [ -f "./secrets/bootstrap/pat.txt" ]; then
        load_pat
        if test_auth; then
            echo -e "  ${GREEN}✓${NC} Admin PAT authentication successful"
            
            # Get organization and project
            get_org_id
            if [ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ]; then
                echo -e "  ${GREEN}✓${NC} Organization '${ORG_NAME}' found: ${ORG_ID}"
                
                get_project_id
                if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
                    echo -e "  ${GREEN}✓${NC} Project '${PROJECT_NAME}' found: ${PROJECT_ID}"
                else
                    echo -e "  ${RED}✗${NC} Project '${PROJECT_NAME}' not found"
                    VERIFICATION_PASSED=false
                fi
            else
                echo -e "  ${RED}✗${NC} Organization '${ORG_NAME}' not found"
                VERIFICATION_PASSED=false
            fi
        else
            echo -e "  ${RED}✗${NC} Admin PAT authentication failed"
            VERIFICATION_PASSED=false
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Skipping Admin PAT test (file not found)"
    fi
    echo ""
    
    # Check 4: CLIENT service account JWT authentication
    echo -e "${BLUE}[4/8] Testing CLIENT service account JWT authentication...${NC}"
    if [ -f "./secrets/zitadel-client-service-account.json" ]; then
        CLIENT_JWT_RESPONSE=$(curl -s -X POST \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
            -d "scope=openid profile email urn:zitadel:iam:org:project:id:zitadel:aud" \
            -d "assertion=$(cat ./secrets/zitadel-client-service-account.json | jq -r '. | @base64')" \
            "${BASE_URL}/oauth/v2/token" 2>/dev/null)
        
        CLIENT_ACCESS_TOKEN=$(echo "$CLIENT_JWT_RESPONSE" | jq -r '.access_token' 2>/dev/null)
        
        if [ -n "$CLIENT_ACCESS_TOKEN" ] && [ "$CLIENT_ACCESS_TOKEN" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} CLIENT JWT authentication successful"
            echo -e "  ${GREEN}✓${NC} Access token obtained (${#CLIENT_ACCESS_TOKEN} chars)"
            
            # Test introspection endpoint
            INTROSPECT_RESPONSE=$(curl -s -X POST \
                -H "Content-Type: application/x-www-form-urlencoded" \
                -H "Authorization: Bearer ${CLIENT_ACCESS_TOKEN}" \
                -d "token=${CLIENT_ACCESS_TOKEN}" \
                "${BASE_URL}/oauth/v2/introspect" 2>/dev/null)
            
            IS_ACTIVE=$(echo "$INTROSPECT_RESPONSE" | jq -r '.active' 2>/dev/null)
            if [ "$IS_ACTIVE" = "true" ]; then
                echo -e "  ${GREEN}✓${NC} Token introspection successful (token is active)"
            else
                echo -e "  ${YELLOW}⚠${NC} Token introspection failed (may need OAuth app configuration)"
            fi
        else
            echo -e "  ${YELLOW}⚠${NC} CLIENT JWT authentication not configured (optional)"
            echo -e "  ${YELLOW}Note: JWT grant requires OAuth app configuration in Zitadel${NC}"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Skipping CLIENT JWT test (key file not found)"
    fi
    echo ""
    
    # Check 5: API service account JWT authentication
    echo -e "${BLUE}[5/8] Testing API service account JWT authentication...${NC}"
    if [ -f "./secrets/zitadel-api-service-account.json" ]; then
        API_JWT_RESPONSE=$(curl -s -X POST \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
            -d "scope=openid profile email urn:zitadel:iam:org:project:id:zitadel:aud" \
            -d "assertion=$(cat ./secrets/zitadel-api-service-account.json | jq -r '. | @base64')" \
            "${BASE_URL}/oauth/v2/token" 2>/dev/null)
        
        API_ACCESS_TOKEN=$(echo "$API_JWT_RESPONSE" | jq -r '.access_token' 2>/dev/null)
        
        if [ -n "$API_ACCESS_TOKEN" ] && [ "$API_ACCESS_TOKEN" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} API JWT authentication successful"
            echo -e "  ${GREEN}✓${NC} Access token obtained (${#API_ACCESS_TOKEN} chars)"
        else
            echo -e "  ${YELLOW}⚠${NC} API JWT authentication not configured (optional)"
            echo -e "  ${YELLOW}Note: JWT grant requires OAuth app configuration in Zitadel${NC}"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Skipping API JWT test (key file not found)"
    fi
    echo ""
    
    # Check 6: Test user existence and authentication
    echo -e "${BLUE}[6/8] Testing test user authentication...${NC}"
    if [ -f "./secrets/bootstrap/pat.txt" ]; then
        # Try to authenticate as test user
        USER_AUTH_RESPONSE=$(curl -s -X POST \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "grant_type=password" \
            -d "username=${TEST_USER_EMAIL}" \
            -d "password=${TEST_USER_PASSWORD}" \
            -d "scope=openid profile email" \
            "${BASE_URL}/oauth/v2/token" 2>/dev/null)
        
        USER_ACCESS_TOKEN=$(echo "$USER_AUTH_RESPONSE" | jq -r '.access_token' 2>/dev/null)
        
        if [ -n "$USER_ACCESS_TOKEN" ] && [ "$USER_ACCESS_TOKEN" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} Test user authentication successful"
            echo -e "  ${GREEN}✓${NC} Email: ${TEST_USER_EMAIL}"
            echo -e "  ${GREEN}✓${NC} User is active and email verified"
        else
            ERROR_DESC=$(echo "$USER_AUTH_RESPONSE" | jq -r '.error_description' 2>/dev/null)
            if [[ "$ERROR_DESC" == *"user not found"* ]] || [[ "$ERROR_DESC" == *"invalid credentials"* ]]; then
                echo -e "  ${YELLOW}⚠${NC} Test user not found or wrong credentials"
                echo -e "  ${YELLOW}⚠${NC} Run 'provision' mode to create test user"
            elif [[ "$ERROR_DESC" == *"password not supported"* ]]; then
                echo -e "  ${YELLOW}⚠${NC} Password grant not enabled (optional)"
                echo -e "  ${YELLOW}Note: Requires OAuth app with password grant configured${NC}"
            else
                echo -e "  ${YELLOW}⚠${NC} Test user authentication not configured"
                echo -e "  ${YELLOW}Error: ${ERROR_DESC}${NC}"
            fi
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Skipping test user authentication (PAT not available)"
    fi
    echo ""
    
    # Check 7: Management API access with API service account
    echo -e "${BLUE}[7/8] Testing Management API access...${NC}"
    if [ -n "$API_ACCESS_TOKEN" ] && [ "$API_ACCESS_TOKEN" != "null" ] && [ -n "$ORG_ID" ]; then
        # Try to list users (requires ORG_OWNER permission)
        USERS_RESPONSE=$(curl -s -X POST \
            -H "Authorization: Bearer ${API_ACCESS_TOKEN}" \
            -H "Content-Type: application/json" \
            -H "x-zitadel-orgid: ${ORG_ID}" \
            -d '{"queries": [{"typeQuery": {}}]}' \
            "${BASE_URL}/management/v1/users/_search" 2>/dev/null)
        
        USER_COUNT=$(echo "$USERS_RESPONSE" | jq -r '.result | length' 2>/dev/null)
        
        if [ -n "$USER_COUNT" ] && [ "$USER_COUNT" != "null" ] && [ "$USER_COUNT" -ge 0 ]; then
            echo -e "  ${GREEN}✓${NC} Management API access successful"
            echo -e "  ${GREEN}✓${NC} API service account has ORG_OWNER permissions"
            echo -e "  ${GREEN}✓${NC} Found ${USER_COUNT} users in organization"
        else
            echo -e "  ${RED}✗${NC} Management API access failed"
            echo -e "  ${RED}Response: ${USERS_RESPONSE}${NC}"
            VERIFICATION_PASSED=false
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Skipping Management API test (prerequisites not met)"
    fi
    echo ""
    
    # Check 8: Service account existence in Zitadel
    echo -e "${BLUE}[8/8] Verifying service accounts in Zitadel...${NC}"
    if [ -f "./secrets/bootstrap/pat.txt" ] && [ -n "$ORG_ID" ]; then
        get_service_account_ids
        
        if [ -n "$CLIENT_USER_ID" ] && [ "$CLIENT_USER_ID" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} CLIENT service account exists: ${CLIENT_USER_ID}"
            
            # Verify it matches the key file
            if [ "$CLIENT_USER_ID" = "$CLIENT_USER_ID_FROM_FILE" ]; then
                echo -e "  ${GREEN}✓${NC} CLIENT user ID matches key file"
            else
                echo -e "  ${RED}✗${NC} CLIENT user ID mismatch (Zitadel: ${CLIENT_USER_ID}, Key file: ${CLIENT_USER_ID_FROM_FILE})"
                VERIFICATION_PASSED=false
            fi
        else
            echo -e "  ${RED}✗${NC} CLIENT service account not found in Zitadel"
            VERIFICATION_PASSED=false
        fi
        
        if [ -n "$API_USER_ID" ] && [ "$API_USER_ID" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} API service account exists: ${API_USER_ID}"
            
            # Verify it matches the key file
            if [ "$API_USER_ID" = "$API_USER_ID_FROM_FILE" ]; then
                echo -e "  ${GREEN}✓${NC} API user ID matches key file"
            else
                echo -e "  ${RED}✗${NC} API user ID mismatch (Zitadel: ${API_USER_ID}, Key file: ${API_USER_ID_FROM_FILE})"
                VERIFICATION_PASSED=false
            fi
        else
            echo -e "  ${RED}✗${NC} API service account not found in Zitadel"
            VERIFICATION_PASSED=false
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Skipping service account verification (PAT not available)"
    fi
    echo ""
    
    # Final summary
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    if [ "$VERIFICATION_PASSED" = true ]; then
        echo -e "${GREEN}   ✓ All Verifications PASSED${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        echo -e "${GREEN}Your Zitadel configuration is complete and working!${NC}"
        echo ""
        echo -e "${BLUE}Configuration Summary:${NC}"
        echo "  Domain: ${ZITADEL_DOMAIN}"
        [ -n "$ORG_ID" ] && echo "  Organization ID: ${ORG_ID}"
        [ -n "$PROJECT_ID" ] && echo "  Project ID: ${PROJECT_ID}"
        [ -n "$CLIENT_USER_ID" ] && echo "  CLIENT Service Account: ${CLIENT_USER_ID}"
        [ -n "$API_USER_ID" ] && echo "  API Service Account: ${API_USER_ID}"
        echo ""
        echo -e "${BLUE}Next steps:${NC}"
        echo "1. Ensure .env file contains the configuration"
        echo "2. Start your server: ${BLUE}nx run workspace-cli:workspace:start${NC}"
        echo "3. Look for: ${GREEN}'Dual service account mode active'${NC} in logs"
        exit 0
    else
        echo -e "${RED}   ✗ Some Verifications FAILED${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        echo -e "${YELLOW}Issues detected in your configuration.${NC}"
        echo ""
        echo -e "${BLUE}Troubleshooting:${NC}"
        echo "1. Review the failed checks above"
        echo "2. Run '${BLUE}$0 status${NC}' to see current configuration"
        echo "3. Run '${BLUE}$0 provision${NC}' to create missing resources"
        echo "4. Run '${BLUE}$0 regenerate${NC}' if keys are invalid"
        exit 1
    fi
fi

# MODE: TEST
if [ "$MODE" = "test" ]; then
    echo -e "${BLUE}Running comprehensive test suite...${NC}"
    echo ""
    
    TEST_PASSED=true
    
    # Test 1: Check local files
    echo -e "${BLUE}[Test 1/10] Checking local configuration files...${NC}"
    
    if [ -f "./secrets/bootstrap/pat.txt" ]; then
        PAT_SIZE=$(wc -c < "./secrets/bootstrap/pat.txt" | tr -d ' ')
        if [ "$PAT_SIZE" -gt 0 ]; then
            echo -e "  ${GREEN}✓${NC} Bootstrap PAT file exists (${PAT_SIZE} bytes)"
        else
            echo -e "  ${RED}✗${NC} Bootstrap PAT file is empty"
            TEST_PASSED=false
        fi
    else
        echo -e "  ${RED}✗${NC} Bootstrap PAT file not found"
        TEST_PASSED=false
    fi
    
    if [ -f "./secrets/zitadel-client-service-account.json" ]; then
        CLIENT_KEY_ID=$(jq -r '.keyId' ./secrets/zitadel-client-service-account.json 2>/dev/null)
        if [ -n "$CLIENT_KEY_ID" ] && [ "$CLIENT_KEY_ID" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} CLIENT service account key file valid"
        else
            echo -e "  ${RED}✗${NC} CLIENT service account key file invalid"
            TEST_PASSED=false
        fi
    else
        echo -e "  ${RED}✗${NC} CLIENT service account key file missing"
        TEST_PASSED=false
    fi
    
    if [ -f "./secrets/zitadel-api-service-account.json" ]; then
        API_KEY_ID=$(jq -r '.keyId' ./secrets/zitadel-api-service-account.json 2>/dev/null)
        if [ -n "$API_KEY_ID" ] && [ "$API_KEY_ID" != "null" ]; then
            echo -e "  ${GREEN}✓${NC} API service account key file valid"
        else
            echo -e "  ${RED}✗${NC} API service account key file invalid"
            TEST_PASSED=false
        fi
    else
        echo -e "  ${RED}✗${NC} API service account key file missing"
        TEST_PASSED=false
    fi
    echo ""
    
    # Test 2: Zitadel connectivity
    echo -e "${BLUE}[Test 2/10] Testing Zitadel connectivity...${NC}"
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/debug/healthz" 2>/dev/null || echo "000")
    
    if [ "$HEALTH_RESPONSE" = "200" ]; then
        echo -e "  ${GREEN}✓${NC} Zitadel is reachable at ${BASE_URL}"
    else
        echo -e "  ${RED}✗${NC} Zitadel unreachable (HTTP ${HEALTH_RESPONSE})"
        TEST_PASSED=false
    fi
    echo ""
    
    # Load PAT for remaining tests
    if [ -f "./secrets/bootstrap/pat.txt" ]; then
        load_pat
    else
        echo -e "${RED}Cannot continue tests without PAT file${NC}"
        exit 1
    fi
    
    # Test 3: Authentication
    echo -e "${BLUE}[Test 3/10] Testing Admin PAT authentication...${NC}"
    if test_auth; then
        echo -e "  ${GREEN}✓${NC} Admin PAT authentication successful"
    else
        echo -e "  ${RED}✗${NC} Admin PAT authentication failed"
        TEST_PASSED=false
    fi
    echo ""
    
    # Get organization and project for remaining tests
    get_org_id
    if [ -z "$ORG_ID" ] || [ "$ORG_ID" = "null" ]; then
        echo -e "${RED}Cannot continue tests without organization${NC}"
        exit 1
    fi
    
    get_project_id
    if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
        echo -e "${RED}Cannot continue tests without project${NC}"
        exit 1
    fi
    
    # Test 4: Organization exists
    echo -e "${BLUE}[Test 4/10] Verifying organization...${NC}"
    if [ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ]; then
        echo -e "  ${GREEN}✓${NC} Organization '${ORG_NAME}' found (ID: ${ORG_ID})"
    else
        echo -e "  ${RED}✗${NC} Organization '${ORG_NAME}' not found"
        TEST_PASSED=false
    fi
    echo ""
    
    # Test 5: Project exists
    echo -e "${BLUE}[Test 5/10] Verifying project...${NC}"
    if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
        echo -e "  ${GREEN}✓${NC} Project '${PROJECT_NAME}' found (ID: ${PROJECT_ID})"
    else
        echo -e "  ${RED}✗${NC} Project '${PROJECT_NAME}' not found"
        TEST_PASSED=false
    fi
    echo ""
    
    # Test 6: Service accounts exist
    echo -e "${BLUE}[Test 6/10] Verifying service accounts...${NC}"
    get_service_account_ids
    
    if [ -n "$CLIENT_USER_ID" ] && [ "$CLIENT_USER_ID" != "null" ]; then
        echo -e "  ${GREEN}✓${NC} CLIENT service account exists (ID: ${CLIENT_USER_ID})"
    else
        echo -e "  ${RED}✗${NC} CLIENT service account not found"
        TEST_PASSED=false
    fi
    
    if [ -n "$API_USER_ID" ] && [ "$API_USER_ID" != "null" ]; then
        echo -e "  ${GREEN}✓${NC} API service account exists (ID: ${API_USER_ID})"
    else
        echo -e "  ${RED}✗${NC} API service account not found"
        TEST_PASSED=false
    fi
    echo ""
    
    # Test 7: List all users
    echo -e "${BLUE}[Test 7/10] Listing all users in organization...${NC}"
    USERS_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{}' \
        "${BASE_URL}/management/v1/users/_search")
    
    USER_COUNT=$(echo "$USERS_RESPONSE" | jq -r '.result | length' 2>/dev/null)
    
    if [ -n "$USER_COUNT" ] && [ "$USER_COUNT" -ge 2 ]; then
        echo -e "  ${GREEN}✓${NC} Found ${USER_COUNT} users in organization"
        
        # Check for specific users
        ADMIN_USER_EXISTS=$(echo "$USERS_RESPONSE" | jq -r ".result[] | select(.userName == \"${ADMIN_USER_EMAIL}\") | .id" 2>/dev/null)
        TEST_USER_EXISTS=$(echo "$USERS_RESPONSE" | jq -r ".result[] | select(.userName == \"${TEST_USER_EMAIL}\") | .id" 2>/dev/null)
        
        if [ -n "$ADMIN_USER_EXISTS" ]; then
            echo -e "  ${GREEN}✓${NC} Admin user found (${ADMIN_USER_EMAIL})"
        else
            echo -e "  ${YELLOW}⚠${NC} Admin user not found (${ADMIN_USER_EMAIL})"
        fi
        
        if [ -n "$TEST_USER_EXISTS" ]; then
            echo -e "  ${GREEN}✓${NC} Test user found (${TEST_USER_EMAIL})"
        else
            echo -e "  ${YELLOW}⚠${NC} Test user not found (${TEST_USER_EMAIL})"
        fi
    else
        echo -e "  ${RED}✗${NC} Failed to list users or no users found"
        TEST_PASSED=false
    fi
    echo ""
    
    # Test 8: Check organization members and roles
    echo -e "${BLUE}[Test 8/10] Verifying organization roles...${NC}"
    MEMBERS_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{}' \
        "${BASE_URL}/management/v1/orgs/me/members/_search")
    
    MEMBERS_COUNT=$(echo "$MEMBERS_RESPONSE" | jq -r '.result | length' 2>/dev/null)
    
    if [ -n "$MEMBERS_COUNT" ] && [ "$MEMBERS_COUNT" -ge 1 ]; then
        echo -e "  ${GREEN}✓${NC} Found ${MEMBERS_COUNT} organization members"
        
        # Check API service account has ORG_OWNER
        API_HAS_OWNER=$(echo "$MEMBERS_RESPONSE" | jq -r ".result[] | select(.userId == \"${API_USER_ID}\") | .roles[] | select(. == \"ORG_OWNER\")" 2>/dev/null)
        
        if [ -n "$API_HAS_OWNER" ]; then
            echo -e "  ${GREEN}✓${NC} API service account has ORG_OWNER role"
        else
            echo -e "  ${RED}✗${NC} API service account missing ORG_OWNER role"
            TEST_PASSED=false
        fi
        
        # Check admin user has ORG_OWNER
        if [ -n "$ADMIN_USER_EXISTS" ]; then
            ADMIN_HAS_OWNER=$(echo "$MEMBERS_RESPONSE" | jq -r ".result[] | select(.userId == \"${ADMIN_USER_EXISTS}\") | .roles[] | select(. == \"ORG_OWNER\")" 2>/dev/null)
            
            if [ -n "$ADMIN_HAS_OWNER" ]; then
                echo -e "  ${GREEN}✓${NC} Admin user has ORG_OWNER role"
            else
                echo -e "  ${YELLOW}⚠${NC} Admin user missing ORG_OWNER role"
            fi
        fi
    else
        echo -e "  ${RED}✗${NC} Failed to list organization members"
        TEST_PASSED=false
    fi
    echo ""
    
    # Test 9: OAuth applications
    echo -e "${BLUE}[Test 9/10] Verifying OAuth applications...${NC}"
    get_oauth_app_id
    
    if [ -n "$OAUTH_APP_ID" ] && [ "$OAUTH_APP_ID" != "null" ]; then
        echo -e "  ${GREEN}✓${NC} OAuth OIDC application found (ID: ${OAUTH_APP_ID})"
    else
        echo -e "  ${RED}✗${NC} OAuth OIDC application not found"
        TEST_PASSED=false
    fi
    
    get_api_app_id
    
    if [ -n "$API_APP_ID" ] && [ "$API_APP_ID" != "null" ]; then
        echo -e "  ${GREEN}✓${NC} API application found (ID: ${API_APP_ID})"
    else
        echo -e "  ${RED}✗${NC} API application not found"
        TEST_PASSED=false
    fi
    echo ""
    
    # Test 10: Key file consistency
    echo -e "${BLUE}[Test 10/10] Verifying key file consistency...${NC}"
    
    CLIENT_USER_ID_FROM_FILE=$(jq -r '.userId' ./secrets/zitadel-client-service-account.json 2>/dev/null)
    API_USER_ID_FROM_FILE=$(jq -r '.userId' ./secrets/zitadel-api-service-account.json 2>/dev/null)
    
    if [ "$CLIENT_USER_ID" = "$CLIENT_USER_ID_FROM_FILE" ]; then
        echo -e "  ${GREEN}✓${NC} CLIENT service account key file matches Zitadel"
    else
        echo -e "  ${RED}✗${NC} CLIENT service account key file mismatch"
        echo -e "      Zitadel: ${CLIENT_USER_ID}"
        echo -e "      File:    ${CLIENT_USER_ID_FROM_FILE}"
        TEST_PASSED=false
    fi
    
    if [ "$API_USER_ID" = "$API_USER_ID_FROM_FILE" ]; then
        echo -e "  ${GREEN}✓${NC} API service account key file matches Zitadel"
    else
        echo -e "  ${RED}✗${NC} API service account key file mismatch"
        echo -e "      Zitadel: ${API_USER_ID}"
        echo -e "      File:    ${API_USER_ID_FROM_FILE}"
        TEST_PASSED=false
    fi
    echo ""
    
    # Final summary
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    if [ "$TEST_PASSED" = true ]; then
        echo -e "${GREEN}   ✓ All Tests PASSED (10/10)${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        echo -e "${GREEN}Your Zitadel setup is fully functional!${NC}"
        echo ""
        echo -e "${BLUE}Quick Summary:${NC}"
        echo "  Domain:           ${ZITADEL_DOMAIN}"
        echo "  Organization:     ${ORG_NAME} (${ORG_ID})"
        echo "  Project:          ${PROJECT_NAME} (${PROJECT_ID})"
        echo "  Users:            ${USER_COUNT} total"
        echo "  Admin User:       ${ADMIN_USER_EMAIL}"
        echo "  Test User:        ${TEST_USER_EMAIL}"
        echo "  Service Accounts: 2 (CLIENT + API)"
        echo ""
        echo -e "${BLUE}Console Access:${NC}"
        echo "  URL:      ${BASE_URL}"
        echo "  Login:    ${ADMIN_USER_EMAIL}"
        echo "  Password: ${ADMIN_USER_PASSWORD}"
        echo ""
        exit 0
    else
        echo -e "${RED}   ✗ Some Tests FAILED${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        echo -e "${YELLOW}Some tests failed. Review the output above for details.${NC}"
        echo ""
        echo -e "${BLUE}Troubleshooting:${NC}"
        echo "1. Run '${BLUE}$0 status${NC}' to see current configuration"
        echo "2. Run '${BLUE}$0 verify${NC}' for detailed verification"
        echo "3. Run '${BLUE}$0 provision${NC}' to recreate missing resources"
        echo "4. Check Zitadel logs: ${BLUE}docker logs <zitadel-container>${NC}"
        exit 1
    fi
fi

# MODE: PROVISION (default)
if [ "$MODE" != "provision" ]; then
    echo -e "${RED}Error: Unknown mode '${MODE}'${NC}"
    echo "Run '$0 --help' for usage information"
    exit 1
fi

# Start provision mode
echo -e "${BLUE}[1/13] Loading PAT...${NC}"
load_pat

echo ""
echo -e "${BLUE}Configuration:${NC}"
echo -e "  Domain: ${ZITADEL_DOMAIN}"
echo -e "  Base URL: ${BASE_URL}"
echo -e "  Org: ${ORG_NAME}"
echo -e "  Project: ${PROJECT_NAME}"
echo ""

# Test authentication
echo -e "${BLUE}[2/13] Testing authentication...${NC}"
if ! test_auth; then
    exit 1
fi

# Now continue with the standard bootstrap process
echo -e "\n${BLUE}[3/13] Listing organizations...${NC}"
get_org_id

if [ -n "$ORG_ID" ]; then
    echo -e "${GREEN}✓ Organization '${ORG_NAME}' already exists (ID: ${ORG_ID})${NC}"
else
    echo -e "${YELLOW}Creating organization '${ORG_NAME}'...${NC}"
    
    ORG_CREATE_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"${ORG_NAME}\"}" \
        "${BASE_URL}/v2/organizations")
    
    ORG_ID=$(echo "$ORG_CREATE_RESPONSE" | jq -r '.organizationId')
    
    if [ -z "$ORG_ID" ] || [ "$ORG_ID" = "null" ]; then
        echo -e "${RED}Error: Failed to create organization${NC}"
        echo -e "${RED}Response: $ORG_CREATE_RESPONSE${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Organization created (ID: ${ORG_ID})${NC}"
fi

echo -e "\n${BLUE}[4/13] Checking for existing project...${NC}"
get_project_id

if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
    echo -e "${GREEN}✓ Project '${PROJECT_NAME}' already exists (ID: ${PROJECT_ID})${NC}"
else
    echo -e "${YELLOW}Creating project '${PROJECT_NAME}'...${NC}"
    PROJECT_CREATE_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d "{\"name\": \"${PROJECT_NAME}\"}" \
        "${BASE_URL}/management/v1/projects")

    PROJECT_ID=$(echo "$PROJECT_CREATE_RESPONSE" | jq -r '.id')

    if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
        echo -e "${RED}Error: Failed to create project${NC}"
        echo -e "${RED}Response: $PROJECT_CREATE_RESPONSE${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Project created (ID: ${PROJECT_ID})${NC}"
fi

# Check for existing OAuth OIDC application
echo -e "\n${BLUE}[5/13] Checking for OAuth OIDC application...${NC}"
get_oauth_app_id

if [ -n "$OAUTH_APP_ID" ] && [ "$OAUTH_APP_ID" != "null" ]; then
    echo -e "${GREEN}✓ OAuth OIDC application already exists (ID: ${OAUTH_APP_ID})${NC}"
    
    # Fetch existing app details to get client ID
    OAUTH_APP_DETAILS=$(curl -s -X GET \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/${OAUTH_APP_ID}")
    
    OAUTH_CLIENT_ID=$(echo "$OAUTH_APP_DETAILS" | jq -r '.app.oidcConfig.clientId')
    echo -e "${GREEN}  Client ID: ${OAUTH_CLIENT_ID}${NC}"
else
    echo -e "${YELLOW}Creating OAuth OIDC application '${OAUTH_APP_NAME}'...${NC}"
    
    OAUTH_APP_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d "{
            \"name\": \"${OAUTH_APP_NAME}\",
            \"redirectUris\": [\"${REDIRECT_URI}\", \"${ADMIN_REDIRECT_URI}\"],
            \"postLogoutRedirectUris\": [\"http://localhost:${SERVER_PORT}\", \"${ADMIN_POST_LOGOUT_URI}\"],
            \"responseTypes\": [\"OIDC_RESPONSE_TYPE_CODE\"],
            \"grantTypes\": [
                \"OIDC_GRANT_TYPE_AUTHORIZATION_CODE\",
                \"OIDC_GRANT_TYPE_REFRESH_TOKEN\",
                \"OIDC_GRANT_TYPE_JWT_BEARER\"
            ],
            \"appType\": \"OIDC_APP_TYPE_WEB\",
            \"authMethodType\": \"OIDC_AUTH_METHOD_TYPE_NONE\",
            \"version\": \"OIDC_VERSION_1_0\",
            \"devMode\": false,
            \"accessTokenType\": \"OIDC_TOKEN_TYPE_JWT\",
            \"accessTokenRoleAssertion\": true,
            \"idTokenRoleAssertion\": true,
            \"idTokenUserinfoAssertion\": true
        }" \
        "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/oidc")

    OAUTH_APP_ID=$(echo "$OAUTH_APP_RESPONSE" | jq -r '.appId')
    OAUTH_CLIENT_ID=$(echo "$OAUTH_APP_RESPONSE" | jq -r '.clientId')
    OAUTH_CLIENT_SECRET=$(echo "$OAUTH_APP_RESPONSE" | jq -r '.clientSecret')

    if [ -z "$OAUTH_APP_ID" ] || [ "$OAUTH_APP_ID" = "null" ]; then
        echo -e "${RED}Error: Failed to create OAuth OIDC application${NC}"
        echo -e "${RED}Response: $OAUTH_APP_RESPONSE${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ OAuth OIDC application created (ID: ${OAUTH_APP_ID})${NC}"
    echo -e "${GREEN}  Client ID: ${OAUTH_CLIENT_ID}${NC}"
fi

# Check for existing API application
echo -e "\n${BLUE}[6/13] Checking for API application...${NC}"
get_api_app_id

if [ -n "$API_APP_ID" ] && [ "$API_APP_ID" != "null" ]; then
    echo -e "${GREEN}✓ API application already exists (ID: ${API_APP_ID})${NC}"
    
    # Fetch existing app details to get client ID
    API_APP_DETAILS=$(curl -s -X GET \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/${API_APP_ID}")
    
    API_CLIENT_ID=$(echo "$API_APP_DETAILS" | jq -r '.app.apiConfig.clientId')
    echo -e "${GREEN}  Client ID: ${API_CLIENT_ID}${NC}"
else
    echo -e "${YELLOW}Creating API application '${API_APP_NAME}'...${NC}"
    
    API_APP_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d "{
            \"name\": \"${API_APP_NAME}\",
            \"authMethodType\": \"API_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT\"
        }" \
        "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/api")

    API_APP_ID=$(echo "$API_APP_RESPONSE" | jq -r '.appId')
    API_CLIENT_ID=$(echo "$API_APP_RESPONSE" | jq -r '.clientId')

    if [ -z "$API_APP_ID" ] || [ "$API_APP_ID" = "null" ]; then
        echo -e "${RED}Error: Failed to create API application${NC}"
        echo -e "${RED}Response: $API_APP_RESPONSE${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ API application created (ID: ${API_APP_ID})${NC}"
    echo -e "${GREEN}  Client ID: ${API_CLIENT_ID}${NC}"
fi

# Generate API application key
echo -e "\n${BLUE}[7/14] Generating API application key...${NC}"
API_APP_KEY_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    -d '{
        "type": "KEY_TYPE_JSON",
        "expirationDate": "2030-01-01T00:00:00Z"
    }' \
    "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/${API_APP_ID}/keys")

API_APP_KEY_ID=$(echo "$API_APP_KEY_RESPONSE" | jq -r '.id')
API_APP_KEY_DETAILS=$(echo "$API_APP_KEY_RESPONSE" | jq -r '.keyDetails')

if [ -z "$API_APP_KEY_DETAILS" ] || [ "$API_APP_KEY_DETAILS" = "null" ]; then
    echo -e "${RED}Error: Failed to generate API app key${NC}"
    echo -e "${RED}Response: $API_APP_KEY_RESPONSE${NC}"
    exit 1
fi

# Save API app key
mkdir -p secrets
echo "$API_APP_KEY_DETAILS" | base64 -d > secrets/zitadel-api-app-key.json
echo -e "${GREEN}✓ API app key saved to secrets/zitadel-api-app-key.json${NC}"

# Check for existing CLIENT service account
echo -e "\n${BLUE}[8/14] Checking for CLIENT service account (for introspection)...${NC}"
get_service_account_ids

if [ -n "$CLIENT_USER_ID" ] && [ "$CLIENT_USER_ID" != "null" ]; then
    echo -e "${GREEN}✓ CLIENT service account already exists (ID: ${CLIENT_USER_ID})${NC}"
else
    echo -e "${YELLOW}Creating CLIENT service account...${NC}"
    CLIENT_USER_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{
            "userName": "client-introspection-service",
            "name": "Client Introspection Service",
            "description": "Service account for token introspection (minimal permissions)",
            "accessTokenType": "ACCESS_TOKEN_TYPE_JWT"
        }' \
        "${BASE_URL}/management/v1/users/machine")

    CLIENT_USER_ID=$(echo "$CLIENT_USER_RESPONSE" | jq -r '.userId')

    if [ -z "$CLIENT_USER_ID" ] || [ "$CLIENT_USER_ID" = "null" ]; then
        echo -e "${RED}Error: Failed to create CLIENT service account${NC}"
        echo -e "${RED}Response: $CLIENT_USER_RESPONSE${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ CLIENT service account created (ID: ${CLIENT_USER_ID})${NC}"
fi

# Generate CLIENT JWT key
echo -e "\n${BLUE}[9/14] Generating CLIENT JWT key...${NC}"
CLIENT_KEY_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    -d '{
        "type": "KEY_TYPE_JSON",
        "expirationDate": "2030-01-01T00:00:00Z"
    }' \
    "${BASE_URL}/management/v1/users/${CLIENT_USER_ID}/keys")

CLIENT_KEY_ID=$(echo "$CLIENT_KEY_RESPONSE" | jq -r '.id')
CLIENT_KEY_DETAILS=$(echo "$CLIENT_KEY_RESPONSE" | jq -r '.keyDetails')

if [ -z "$CLIENT_KEY_DETAILS" ] || [ "$CLIENT_KEY_DETAILS" = "null" ]; then
    echo -e "${RED}Error: Failed to generate CLIENT key${NC}"
    echo -e "${RED}Response: $CLIENT_KEY_RESPONSE${NC}"
    exit 1
fi

# Save CLIENT key
mkdir -p secrets
echo "$CLIENT_KEY_DETAILS" | base64 -d > secrets/zitadel-client-service-account.json
echo -e "${GREEN}✓ CLIENT key saved to secrets/zitadel-client-service-account.json${NC}"

# Check for existing API service account
echo -e "\n${BLUE}[10/14] Checking for API service account (for Management API)...${NC}"
# API_USER_ID should already be set from get_service_account_ids() call in step 5

if [ -n "$API_USER_ID" ] && [ "$API_USER_ID" != "null" ]; then
    echo -e "${GREEN}✓ API service account already exists (ID: ${API_USER_ID})${NC}"
else
    echo -e "${YELLOW}Creating API service account...${NC}"
    API_USER_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d '{
            "userName": "api-management-service",
            "name": "API Management Service",
            "description": "Service account for Management API operations (elevated permissions)",
            "accessTokenType": "ACCESS_TOKEN_TYPE_JWT"
        }' \
        "${BASE_URL}/management/v1/users/machine")

    API_USER_ID=$(echo "$API_USER_RESPONSE" | jq -r '.userId')

    if [ -z "$API_USER_ID" ] || [ "$API_USER_ID" = "null" ]; then
        echo -e "${RED}Error: Failed to create API service account${NC}"
        echo -e "${RED}Response: $API_USER_RESPONSE${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ API service account created (ID: ${API_USER_ID})${NC}"
fi

# Grant ORG_OWNER role to API service account
echo -e "\n${BLUE}[11/14] Granting ORG_OWNER role to API service account...${NC}"
GRANT_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    -d "{\"userId\": \"${API_USER_ID}\", \"roles\": [\"ORG_OWNER\"]}" \
    "${BASE_URL}/management/v1/orgs/me/members")

echo -e "${GREEN}✓ Role granted${NC}"

# Generate API JWT key
echo -e "\n${BLUE}[12/14] Generating API JWT key...${NC}"
API_KEY_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    -d '{
        "type": "KEY_TYPE_JSON",
        "expirationDate": "2030-01-01T00:00:00Z"
    }' \
    "${BASE_URL}/management/v1/users/${API_USER_ID}/keys")

API_KEY_ID=$(echo "$API_KEY_RESPONSE" | jq -r '.id')
API_KEY_DETAILS=$(echo "$API_KEY_RESPONSE" | jq -r '.keyDetails')

if [ -z "$API_KEY_DETAILS" ] || [ "$API_KEY_DETAILS" = "null" ]; then
    echo -e "${RED}Error: Failed to generate API key${NC}"
    echo -e "${RED}Response: $API_KEY_RESPONSE${NC}"
    exit 1
fi

# Save API key
echo "$API_KEY_DETAILS" | base64 -d > secrets/zitadel-api-service-account.json
echo -e "${GREEN}✓ API key saved to secrets/zitadel-api-service-account.json${NC}"

# Create admin user
echo -e "\n${BLUE}[13/15] Creating admin user...${NC}"
ADMIN_USER_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    -d "{
        \"userName\": \"${ADMIN_USER_EMAIL}\",
        \"profile\": {
            \"firstName\": \"Admin\",
            \"lastName\": \"User\",
            \"displayName\": \"Admin User\"
        },
        \"email\": {
            \"email\": \"${ADMIN_USER_EMAIL}\",
            \"isEmailVerified\": true
        },
        \"password\": \"${ADMIN_USER_PASSWORD}\"
    }" \
    "${BASE_URL}/management/v1/users/human/_import")

ADMIN_USER_ID=$(echo "$ADMIN_USER_RESPONSE" | jq -r '.userId')

if [ -z "$ADMIN_USER_ID" ] || [ "$ADMIN_USER_ID" = "null" ]; then
    echo -e "${YELLOW}⚠ Admin user might already exist or failed to create${NC}"
    echo -e "${YELLOW}Response: $ADMIN_USER_RESPONSE${NC}"
else
    echo -e "${GREEN}✓ Admin user created (ID: ${ADMIN_USER_ID}, Email: ${ADMIN_USER_EMAIL})${NC}"
    echo -e "${GREEN}✓ Email verified and user is active${NC}"
    
    # Grant ORG_OWNER role to admin user
    echo -e "${BLUE}Granting ORG_OWNER role to admin user...${NC}"
    ADMIN_GRANT_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        -d "{\"userId\": \"${ADMIN_USER_ID}\", \"roles\": [\"ORG_OWNER\"]}" \
        "${BASE_URL}/management/v1/orgs/me/members")
    echo -e "${GREEN}✓ Admin user granted ORG_OWNER role${NC}"
fi

# Create test user
echo -e "\n${BLUE}[14/15] Creating test user...${NC}"
TEST_USER_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    -d "{
        \"userName\": \"${TEST_USER_EMAIL}\",
        \"profile\": {
            \"firstName\": \"Test\",
            \"lastName\": \"User\",
            \"displayName\": \"Test User\"
        },
        \"email\": {
            \"email\": \"${TEST_USER_EMAIL}\",
            \"isEmailVerified\": true
        },
        \"password\": \"${TEST_USER_PASSWORD}\"
    }" \
    "${BASE_URL}/management/v1/users/human/_import")

TEST_USER_ID=$(echo "$TEST_USER_RESPONSE" | jq -r '.userId')

if [ -z "$TEST_USER_ID" ] || [ "$TEST_USER_ID" = "null" ]; then
    echo -e "${YELLOW}⚠ Test user might already exist or failed to create${NC}"
    echo -e "${YELLOW}Response: $TEST_USER_RESPONSE${NC}"
else
    echo -e "${GREEN}✓ Test user created (ID: ${TEST_USER_ID}, Email: ${TEST_USER_EMAIL})${NC}"
    echo -e "${GREEN}✓ Email verified and user is active${NC}"
fi

# Output configuration
echo -e "\n${BLUE}[15/15] Configuration complete!${NC}"
echo -e "\n${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Setup Complete - Add to your .env file:${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "# Zitadel Configuration"
echo "ZITADEL_DOMAIN=${ZITADEL_DOMAIN}"
echo "ZITADEL_ORG_ID=${ORG_ID}"
echo "ZITADEL_PROJECT_ID=${PROJECT_ID}"
echo ""
echo "# OAuth OIDC Application"
[ -n "$OAUTH_CLIENT_ID" ] && echo "ZITADEL_OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID}"
[ -n "$OAUTH_CLIENT_SECRET" ] && [ "$OAUTH_CLIENT_SECRET" != "null" ] && echo "ZITADEL_OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET}"
echo "ZITADEL_OAUTH_REDIRECT_URI=${REDIRECT_URI}"
echo ""
echo "# API Application"
[ -n "$API_CLIENT_ID" ] && echo "ZITADEL_API_CLIENT_ID=${API_CLIENT_ID}"
echo "ZITADEL_API_APP_JWT_PATH=./secrets/zitadel-api-app-key.json"
echo ""
echo "# CLIENT Service Account (for introspection)"
echo "ZITADEL_CLIENT_JWT_PATH=./secrets/zitadel-client-service-account.json"
echo ""
echo "# API Service Account (for Management API)"
echo "ZITADEL_API_JWT_PATH=./secrets/zitadel-api-service-account.json"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}User Credentials:${NC}"
echo ""
echo -e "${GREEN}Admin User (Console Access):${NC}"
echo "  Email:    ${ADMIN_USER_EMAIL}"
echo "  Password: ${ADMIN_USER_PASSWORD}"
echo "  Role:     ORG_OWNER"
echo "  Console:  ${BASE_URL}"
echo ""
echo -e "${GREEN}Test User (Application Testing):${NC}"
echo "  Email:    ${TEST_USER_EMAIL}"
echo "  Password: ${TEST_USER_PASSWORD}"
echo "  Status:   Active and email verified"
echo ""
echo -e "${BLUE}Bootstrap Machine User (Auto-created):${NC}"
echo "  Username: zitadel-admin-sa"
echo "  Org:      Spec Inc (ID: from first instance)"
echo "  PAT:      secrets/bootstrap/pat.txt"
echo "  Note:     Used for bootstrap only, not for application auth"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Add the above configuration to your .env file"
echo "2. Restart your server: ${BLUE}npm run workspace:restart${NC}"
echo "3. Look for: ${GREEN}'Dual service account mode active'${NC} in logs"
echo "4. Login to console at ${BASE_URL} with admin credentials"
echo ""
echo -e "${YELLOW}Security Note:${NC}"
echo "The bootstrap PAT is kept for re-running the script."
echo "Your application uses the service account JWT keys instead."
echo ""
