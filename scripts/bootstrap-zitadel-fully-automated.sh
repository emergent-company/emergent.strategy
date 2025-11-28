#!/bin/bash
set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load ENVIRONMENT from .env file if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -E '^ENVIRONMENT=' | xargs)
fi

# Load INFISICAL_TOKEN and other secrets from .env.local if it exists
if [ -f .env.local ]; then
    set -a
    source .env.local
    set +a
fi

# Parse command line arguments
MODE="${1:-provision}"
PUSH_TO_INFISICAL=false
INFISICAL_ENV="${ENVIRONMENT:-local}"  # Use ENVIRONMENT from .env, default to local
INFISICAL_PATH="/server"

# Parse all arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --push-to-infisical)
            PUSH_TO_INFISICAL=true
            shift
            ;;
        --infisical-env)
            INFISICAL_ENV="$2"
            shift 2
            ;;
        --infisical-path)
            INFISICAL_PATH="$2"
            shift 2
            ;;
        provision|status|test|verify|regenerate|help|--help|-h)
            MODE="$1"
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Show help if requested
if [ "$MODE" = "--help" ] || [ "$MODE" = "-h" ] || [ "$MODE" = "help" ]; then
    echo -e "${BLUE}Zitadel Bootstrap Script (Fully Automated)${NC}"
    echo ""
    echo "Usage: $0 [MODE] [OPTIONS]"
    echo ""
    echo "Modes:"
    echo "  provision    - Full setup: create org, project, service accounts (default)"
    echo "  status       - Show current configuration and verify connectivity"
    echo "  test         - Run comprehensive test suite to verify setup"
    echo "  verify       - Comprehensive verification of all configuration and access"
    echo "  regenerate   - Regenerate service account JWT keys"
    echo "  help         - Show this help message"
    echo ""
    echo "Options:"
    echo "  --push-to-infisical       - Automatically push generated secrets to Infisical"
    echo "  --infisical-env ENV       - Infisical environment (default: from ENVIRONMENT in .env, or local)"
    echo "  --infisical-path PATH     - Infisical path to push secrets (default: /server)"
    echo ""
    echo "Configuration:"
    echo "  All configuration is loaded from Infisical"
    echo "  Environment: Set ENVIRONMENT in .env file (local, dev, staging, production)"
    echo ""
    echo "  Authentication (choose one):"
    echo "    1. Interactive login: infisical login && infisical init"
    echo "    2. Service token: Set INFISICAL_TOKEN in .env.local"
    echo "       echo 'INFISICAL_TOKEN=st.your-token-here' >> .env.local"
    echo ""
    echo "  Required Infisical paths:"
    echo "    /workspace - NAMESPACE, ADMIN_PORT, SERVER_PORT"
    echo "    /docker    - ZITADEL_DOMAIN, ZITADEL_EXTERNALDOMAIN, VITE_ZITADEL_ISSUER"
    echo ""
    echo "  Optional variables (with defaults):"
    echo "    ORG_NAME                - Organization name (default: Spec Organization)"
    echo "    PROJECT_NAME            - Project name (default: Spec Server)"
    echo "    ADMIN_USER_EMAIL        - Admin user email (default: admin@spec.local)"
    echo "    ADMIN_USER_PASSWORD     - Admin user password (default: AdminPassword123!)"
    echo "    TEST_USER_EMAIL         - Test user email (default: test@example.com)"
    echo "    TEST_USER_PASSWORD      - Test user password (default: TestPassword123!)"
    echo "    E2E_TEST_USER_EMAIL     - E2E test user email (default: e2e-test@example.com)"
    echo "    E2E_TEST_USER_PASSWORD  - E2E test user password (default: E2eTestPassword123!)"
    echo ""
    echo "Examples:"
    echo "  $0                                      # Full provision (loads config from Infisical)"
    echo "  $0 provision --push-to-infisical        # Provision and push secrets to Infisical"
    echo "  $0 provision --push-to-infisical --infisical-env dev"
    echo "  $0 status                               # Check configuration"
    echo "  $0 test                                 # Run comprehensive tests"
    echo "  $0 verify                               # Detailed verification"
    echo "  $0 regenerate                           # Regenerate keys"
    echo ""
    exit 0
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Zitadel Bootstrap Script - Mode: ${MODE}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Load environment variables from Infisical
echo -e "${GREEN}Loading configuration from Infisical...${NC}"

# Check if Infisical CLI is installed
if ! command -v infisical &> /dev/null; then
    echo -e "${RED}Error: Infisical CLI not found${NC}"
    echo -e "${YELLOW}Install Infisical CLI: brew install infisical/brew/infisical${NC}"
    exit 1
fi

# Check if authenticated (either via login or token)
if [ -z "$INFISICAL_TOKEN" ]; then
    # No token, check if logged in
    if ! infisical user &> /dev/null; then
        echo -e "${RED}Error: Not authenticated with Infisical${NC}"
        echo ""
        echo -e "${YELLOW}Option 1 (Local development - recommended):${NC}"
        echo "  Run: infisical login"
        echo ""
        echo -e "${YELLOW}Option 2 (CI/CD or remote - use service token):${NC}"
        echo "  Set INFISICAL_TOKEN in .env.local:"
        echo "  echo 'INFISICAL_TOKEN=st.your-token-here' >> .env.local"
        echo ""
        echo "Get your token from: https://infiscal.kucharz.net"
        exit 1
    fi
    echo -e "${BLUE}Using Infisical interactive login${NC}"
else
    echo -e "${BLUE}Using INFISICAL_TOKEN from environment${NC}"
fi

# Build domain flag if INFISICAL_HOST is set
DOMAIN_FLAG=""
if [ -n "${INFISICAL_HOST:-}" ]; then
    DOMAIN_FLAG="--domain https://${INFISICAL_HOST}/api"
    echo -e "${BLUE}Using self-hosted Infisical: https://${INFISICAL_HOST}/api${NC}"
fi

# Load workspace secrets (NAMESPACE, ports, etc.)
echo -e "${BLUE}Loading workspace secrets from Infisical /workspace...${NC}"
eval "$(infisical secrets export --env=local --path=/workspace --format=dotenv-export $DOMAIN_FLAG 2>/dev/null)"

# Load Docker secrets (Zitadel configuration)
echo -e "${BLUE}Loading Docker secrets from Infisical /docker...${NC}"
eval "$(infisical secrets export --env=local --path=/docker --format=dotenv-export $DOMAIN_FLAG 2>/dev/null)"

echo -e "${GREEN}✓ Configuration loaded from Infisical${NC}"

# Configuration - all values must be set in .env (no fallbacks)
# Validate required environment variables
REQUIRED_VARS=(
    "ZITADEL_DOMAIN"
    "NAMESPACE"
    "ADMIN_PORT"
    "SERVER_PORT"
)

OPTIONAL_WITH_DEFAULTS=(
    "ORG_NAME:Spec Organization"
    "PROJECT_NAME:Spec Server"
    "ADMIN_USER_EMAIL:admin@spec.local"
    "ADMIN_USER_PASSWORD:AdminPassword123!"
    "TEST_USER_EMAIL:test@example.com"
    "TEST_USER_PASSWORD:TestPassword123!"
    "E2E_TEST_USER_EMAIL:e2e-test@example.com"
    "E2E_TEST_USER_PASSWORD:E2eTestPassword123!"
    "OAUTH_APP_NAME:Spec Server OAuth"
    "API_APP_NAME:Spec Server API"
)

# Check required variables
MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}Error: Required environment variables are not set:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "  ${RED}✗${NC} $var"
    done
    echo ""
    echo -e "${YELLOW}Add these variables to your .env file and try again${NC}"
    exit 1
fi

# Set optional variables if not provided in .env
for var_default in "${OPTIONAL_WITH_DEFAULTS[@]}"; do
    var="${var_default%%:*}"
    default="${var_default#*:}"
    if [ -z "${!var}" ]; then
        eval "$var=\"$default\""
        echo -e "${BLUE}$var not in .env, using: $default${NC}"
    fi
done

# Determine protocol based on Zitadel domain
if [[ "$ZITADEL_DOMAIN" == "localhost"* ]] || [[ "$ZITADEL_DOMAIN" == "127.0.0.1"* ]]; then
    ZITADEL_PROTOCOL="http"
else
    ZITADEL_PROTOCOL="https"
fi

# Build Zitadel issuer URL (this is where Zitadel is actually accessible)
ZITADEL_ISSUER="${VITE_ZITADEL_ISSUER:-${ZITADEL_PROTOCOL}://${ZITADEL_DOMAIN}}"
BASE_URL="$ZITADEL_ISSUER"

# Determine application URLs based on environment
# For local development, use localhost with configured ports
# For production, use environment-specific domains
if [[ "$ZITADEL_DOMAIN" == "localhost"* ]]; then
    ADMIN_APP_URL="http://localhost:${ADMIN_PORT}"
    SERVER_APP_URL="http://localhost:${SERVER_PORT}"
else
    # For production, these would come from environment
    ADMIN_APP_URL="${ADMIN_APP_URL:-https://admin.${ZITADEL_EXTERNALDOMAIN}}"
    SERVER_APP_URL="${SERVER_APP_URL:-https://api.${ZITADEL_EXTERNALDOMAIN}}"
fi

# Build redirect URIs using the actual application URLs
REDIRECT_URI="${SERVER_APP_URL}/auth/callback"
ADMIN_REDIRECT_URI="${ADMIN_APP_URL}/auth/callback"
ADMIN_POST_LOGOUT_URI="${ADMIN_APP_URL}/"

echo -e "${BLUE}Configuration derived from Infisical:${NC}"
echo -e "  Zitadel Issuer: ${ZITADEL_ISSUER}"
echo -e "  Admin App: ${ADMIN_APP_URL}"
echo -e "  Server API: ${SERVER_APP_URL}"
echo -e "  Admin Redirect URI: ${ADMIN_REDIRECT_URI}"
echo -e "  Server Redirect URI: ${REDIRECT_URI}"
echo ""

# Function to load PAT
load_pat() {
    local PAT_FILE="/machinekey/pat.txt"
    
    # Try to read PAT from Docker container volume first
    echo -e "${BLUE}Checking for automatic PAT in Zitadel container...${NC}"
    ADMIN_PAT=$(docker compose -f docker-compose.dev.yml exec -T zitadel cat "$PAT_FILE" 2>/dev/null | tr -d '\n\r' || echo "")
    
    if [ -n "$ADMIN_PAT" ] && [ "$ADMIN_PAT" != "null" ]; then
        echo -e "${GREEN}✓ Found automatic PAT from Zitadel container!${NC}"
        echo -e "${GREEN}✓ PAT loaded automatically${NC}"
        return 0
    fi
    
    # Fallback: check legacy location for backwards compatibility
    if [ -f "./secrets/bootstrap/pat.txt" ]; then
        echo -e "${YELLOW}⚠ Using legacy PAT file location${NC}"
        ADMIN_PAT=$(cat "./secrets/bootstrap/pat.txt" | tr -d '\n\r')
        
        if [ -z "$ADMIN_PAT" ]; then
            echo -e "${RED}Error: PAT file is empty${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}✓ PAT loaded from legacy location${NC}"
        return 0
    fi
    
    # No automatic PAT found - prompt for manual entry
    echo -e "${YELLOW}⚠ No automatic PAT found in container or legacy location${NC}"
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
    echo -e "${BLUE}[1/7] Checking local configuration files...${NC}"
    
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
    echo -e "${BLUE}[2/7] Testing Zitadel connectivity...${NC}"
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/debug/healthz" 2>/dev/null || echo "000")
    
    if [ "$HEALTH_RESPONSE" = "200" ]; then
        echo -e "  ${GREEN}✓${NC} Zitadel is reachable at ${BASE_URL}"
    else
        echo -e "  ${RED}✗${NC} Zitadel unreachable (HTTP ${HEALTH_RESPONSE})"
        VERIFICATION_PASSED=false
    fi
    echo ""
    
    # Check 3: Admin PAT authentication
    echo -e "${BLUE}[3/7] Testing Admin PAT authentication...${NC}"
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
    
    # Check 4: OAuth Application Configuration (Enhanced)
    echo -e "${BLUE}[4/7] Verifying OAuth application configuration...${NC}"
    if [ -f "./secrets/bootstrap/pat.txt" ] && [ -n "$PROJECT_ID" ]; then
        # Get OAuth app details
        get_oauth_app_id
        
        if [ -n "$OAUTH_APP_ID" ] && [ "$OAUTH_APP_ID" != "null" ]; then
            # Fetch the OAuth client ID
            OAUTH_APP_DETAILS=$(curl -s -X GET \
                -H "Authorization: Bearer ${ADMIN_PAT}" \
                -H "x-zitadel-orgid: ${ORG_ID}" \
                "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/${OAUTH_APP_ID}")
            
            OAUTH_CLIENT_ID=$(echo "$OAUTH_APP_DETAILS" | jq -r '.app.oidcConfig.clientId')
            OAUTH_AUTH_METHOD=$(echo "$OAUTH_APP_DETAILS" | jq -r '.app.oidcConfig.authMethodType')
            OAUTH_GRANT_TYPES=$(echo "$OAUTH_APP_DETAILS" | jq -r '.app.oidcConfig.grantTypes[]' 2>/dev/null)
            
            if [ -n "$OAUTH_CLIENT_ID" ] && [ "$OAUTH_CLIENT_ID" != "null" ]; then
                echo -e "  ${GREEN}✓${NC} OAuth app found (Client ID: ${OAUTH_CLIENT_ID})"
                
                # Check auth method type
                if [ "$OAUTH_AUTH_METHOD" = "OIDC_AUTH_METHOD_TYPE_NONE" ]; then
                    echo -e "  ${GREEN}✓${NC} Auth method: NONE (public client/PKCE)"
                else
                    echo -e "  ${RED}✗${NC} Auth method: ${OAUTH_AUTH_METHOD} (should be NONE)"
                    VERIFICATION_PASSED=false
                fi
                
                # Check grant types
                HAS_AUTH_CODE=false
                HAS_REFRESH=false
                while IFS= read -r grant; do
                    [ "$grant" = "OIDC_GRANT_TYPE_AUTHORIZATION_CODE" ] && HAS_AUTH_CODE=true
                    [ "$grant" = "OIDC_GRANT_TYPE_REFRESH_TOKEN" ] && HAS_REFRESH=true
                done <<< "$OAUTH_GRANT_TYPES"
                
                if [ "$HAS_AUTH_CODE" = true ] && [ "$HAS_REFRESH" = true ]; then
                    echo -e "  ${GREEN}✓${NC} Grant types: AUTHORIZATION_CODE ✓, REFRESH_TOKEN ✓"
                else
                    [ "$HAS_AUTH_CODE" = false ] && echo -e "  ${RED}✗${NC} Missing required grant: AUTHORIZATION_CODE"
                    [ "$HAS_REFRESH" = false ] && echo -e "  ${RED}✗${NC} Missing required grant: REFRESH_TOKEN"
                    VERIFICATION_PASSED=false
                fi
                
                # Test authorization endpoint with PKCE parameters
                # Generate a dummy code challenge for testing
                CODE_CHALLENGE="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
                
                # Test the authorize endpoint (should redirect to login, not error)
                # First try without following redirects to check initial response
                AUTHORIZE_RESPONSE=$(curl -s -w "\n%{http_code}" \
                    "${BASE_URL}/oauth/v2/authorize?response_type=code&client_id=${OAUTH_CLIENT_ID}&redirect_uri=${ADMIN_REDIRECT_URI}&scope=openid+profile+email&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256" 2>/dev/null)
                
                HTTP_CODE=$(echo "$AUTHORIZE_RESPONSE" | tail -1)
                RESPONSE_BODY=$(echo "$AUTHORIZE_RESPONSE" | sed '$d')
                
                # Check if response is a redirect (302) or contains authRequestID (successful)
                if [ "$HTTP_CODE" = "302" ] || echo "$RESPONSE_BODY" | grep -q "authRequestID"; then
                    echo -e "  ${GREEN}✓${NC} OAuth authorize endpoint responding correctly (HTTP ${HTTP_CODE})"
                    echo -e "  ${GREEN}✓${NC} PKCE flow is correctly configured (redirects to login)"
                elif echo "$RESPONSE_BODY" | grep -q "error"; then
                    OAUTH_ERROR=$(echo "$RESPONSE_BODY" | jq -r '.error' 2>/dev/null || echo "unknown")
                    OAUTH_ERROR_DESC=$(echo "$RESPONSE_BODY" | jq -r '.error_description' 2>/dev/null || echo "")
                    echo -e "  ${RED}✗${NC} OAuth error: ${OAUTH_ERROR}"
                    [ -n "$OAUTH_ERROR_DESC" ] && echo -e "  ${RED}  ${OAUTH_ERROR_DESC}${NC}"
                    VERIFICATION_PASSED=false
                else
                    echo -e "  ${YELLOW}⚠${NC} OAuth authorize endpoint returned HTTP ${HTTP_CODE}"
                    echo -e "  ${YELLOW}Note: This might be expected depending on Zitadel configuration${NC}"
                fi
                
                # Check redirect URIs
                REDIRECT_URIS=$(echo "$OAUTH_APP_DETAILS" | jq -r '.app.oidcConfig.redirectUris[]' 2>/dev/null)
                if echo "$REDIRECT_URIS" | grep -q "${ADMIN_REDIRECT_URI}"; then
                    echo -e "  ${GREEN}✓${NC} Admin redirect URI configured: ${ADMIN_REDIRECT_URI}"
                else
                    echo -e "  ${RED}✗${NC} Admin redirect URI not found: ${ADMIN_REDIRECT_URI}"
                    VERIFICATION_PASSED=false
                fi
            else
                echo -e "  ${RED}✗${NC} OAuth client ID not found"
                VERIFICATION_PASSED=false
            fi
        else
            echo -e "  ${YELLOW}⚠${NC} OAuth app not found"
            echo -e "  ${YELLOW}⚠${NC} Run 'provision' mode to create OAuth app"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Skipping OAuth flow test (prerequisites not met)"
    fi
    echo ""
    
    # Check 5: Service account existence in Zitadel
    echo -e "${BLUE}[5/7] Verifying service accounts in Zitadel...${NC}"
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
    
    # Check 6: User accounts
    echo -e "${BLUE}[6/7] Verifying user accounts...${NC}"
    if [ -f "./secrets/bootstrap/pat.txt" ] && [ -n "$ORG_ID" ]; then
        # Search for admin user
        ADMIN_SEARCH=$(curl -s -X POST \
            -H "Authorization: Bearer ${ADMIN_PAT}" \
            -H "Content-Type: application/json" \
            -H "x-zitadel-orgid: ${ORG_ID}" \
            -d "{\"queries\": [{\"emailQuery\": {\"emailAddress\": \"${ADMIN_USER_EMAIL}\", \"method\": \"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
            "${BASE_URL}/management/v1/users/_search" 2>/dev/null)
        
        ADMIN_USER_ID=$(echo "$ADMIN_SEARCH" | jq -r '.result[0].id' 2>/dev/null)
        ADMIN_USER_STATE=$(echo "$ADMIN_SEARCH" | jq -r '.result[0].state' 2>/dev/null)
        
        if [ -n "$ADMIN_USER_ID" ] && [ "$ADMIN_USER_ID" != "null" ]; then
            if [ "$ADMIN_USER_STATE" = "USER_STATE_ACTIVE" ]; then
                echo -e "  ${GREEN}✓${NC} Admin user exists and is active (${ADMIN_USER_EMAIL})"
            else
                echo -e "  ${YELLOW}⚠${NC} Admin user exists but state is: ${ADMIN_USER_STATE}"
            fi
        else
            echo -e "  ${YELLOW}⚠${NC} Admin user not found (${ADMIN_USER_EMAIL})"
        fi
        
        # Search for test user
        TEST_SEARCH=$(curl -s -X POST \
            -H "Authorization: Bearer ${ADMIN_PAT}" \
            -H "Content-Type: application/json" \
            -H "x-zitadel-orgid: ${ORG_ID}" \
            -d "{\"queries\": [{\"emailQuery\": {\"emailAddress\": \"${TEST_USER_EMAIL}\", \"method\": \"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
            "${BASE_URL}/management/v1/users/_search" 2>/dev/null)
        
        TEST_USER_ID=$(echo "$TEST_SEARCH" | jq -r '.result[0].id' 2>/dev/null)
        TEST_USER_STATE=$(echo "$TEST_SEARCH" | jq -r '.result[0].state' 2>/dev/null)
        
        if [ -n "$TEST_USER_ID" ] && [ "$TEST_USER_ID" != "null" ]; then
            if [ "$TEST_USER_STATE" = "USER_STATE_ACTIVE" ]; then
                echo -e "  ${GREEN}✓${NC} Test user exists and is active (${TEST_USER_EMAIL})"
            else
                echo -e "  ${YELLOW}⚠${NC} Test user exists but state is: ${TEST_USER_STATE}"
            fi
        else
            echo -e "  ${YELLOW}⚠${NC} Test user not found (${TEST_USER_EMAIL})"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Skipping user account verification (PAT not available)"
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
        echo -e "${BLUE}User Accounts:${NC}"
        echo -e "${GREEN}Admin User (Console Access):${NC}"
        echo "  Email:    ${ADMIN_USER_EMAIL}"
        echo "  Password: ${ADMIN_USER_PASSWORD}"
        echo "  Console:  ${BASE_URL}"
        echo "  Role:     ORG_OWNER"
        echo ""
        echo -e "${GREEN}Test User (Application Testing):${NC}"
        echo "  Email:    ${TEST_USER_EMAIL}"
        echo "  Password: ${TEST_USER_PASSWORD}"
        echo "  Status:   Active and email verified"
        echo ""
        echo -e "${BLUE}Next steps:${NC}"
        echo "1. Ensure .env file contains the configuration"
        echo -e "2. Start your server: ${BLUE}nx run workspace-cli:workspace:start${NC}"
        echo -e "3. Look for: ${GREEN}'Dual service account mode active'${NC} in logs"
        echo "4. Login to console at ${BASE_URL} with admin credentials"
        exit 0
    else
        echo -e "${RED}   ✗ Some Verifications FAILED${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        echo -e "${YELLOW}Issues detected in your configuration.${NC}"
        echo ""
        echo -e "${BLUE}Troubleshooting:${NC}"
        echo "1. Review the failed checks above"
        echo -e "2. Run '${BLUE}$0 status${NC}' to see current configuration"
        echo -e "3. Run '${BLUE}$0 provision${NC}' to create missing resources"
        echo -e "4. Run '${BLUE}$0 regenerate${NC}' if keys are invalid"
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
        echo -e "1. Run '${BLUE}$0 status${NC}' to see current configuration"
        echo -e "2. Run '${BLUE}$0 verify${NC}' for detailed verification"
        echo -e "3. Run '${BLUE}$0 provision${NC}' to recreate missing resources"
        echo -e "4. Check Zitadel logs: ${BLUE}docker logs <zitadel-container>${NC}"
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
    
    # Verify and fix configuration for existing app
    AUTH_METHOD=$(echo "$OAUTH_APP_DETAILS" | jq -r '.app.oidcConfig.authMethodType')
    GRANT_TYPES=$(echo "$OAUTH_APP_DETAILS" | jq -r '.app.oidcConfig.grantTypes[]' 2>/dev/null)
    
    NEEDS_UPDATE=false
    
    # Check auth method
    if [ "$AUTH_METHOD" != "OIDC_AUTH_METHOD_TYPE_NONE" ]; then
        echo -e "${YELLOW}⚠ Auth method is ${AUTH_METHOD}, should be NONE${NC}"
        NEEDS_UPDATE=true
    fi
    
    # Check grant types
    HAS_AUTH_CODE=false
    HAS_REFRESH=false
    while IFS= read -r grant; do
        [ "$grant" = "OIDC_GRANT_TYPE_AUTHORIZATION_CODE" ] && HAS_AUTH_CODE=true
        [ "$grant" = "OIDC_GRANT_TYPE_REFRESH_TOKEN" ] && HAS_REFRESH=true
    done <<< "$GRANT_TYPES"
    
    if [ "$HAS_AUTH_CODE" = false ] || [ "$HAS_REFRESH" = false ]; then
        echo -e "${YELLOW}⚠ Grant types incomplete, needs REFRESH_TOKEN${NC}"
        NEEDS_UPDATE=true
    fi
    
    # Update both auth method and grant types together (Zitadel API resets fields if not included)
    if [ "$NEEDS_UPDATE" = true ]; then
        curl -s -X PUT \
            -H "Authorization: Bearer ${ADMIN_PAT}" \
            -H "Content-Type: application/json" \
            -H "x-zitadel-orgid: ${ORG_ID}" \
            -d '{
                "authMethodType": "OIDC_AUTH_METHOD_TYPE_NONE",
                "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"]
            }' \
            "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/${OAUTH_APP_ID}/oidc_config" > /dev/null
        echo -e "${GREEN}✓ OAuth app configuration updated${NC}"
        echo -e "${GREEN}  - Auth method: NONE (public client/PKCE)${NC}"
        echo -e "${GREEN}  - Grant types: AUTHORIZATION_CODE, REFRESH_TOKEN${NC}"
    fi
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
    
    # Verify the app was created with correct auth method and grant types
    sleep 1
    OAUTH_APP_VERIFY=$(curl -s -X GET \
        -H "Authorization: Bearer ${ADMIN_PAT}" \
        -H "x-zitadel-orgid: ${ORG_ID}" \
        "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/${OAUTH_APP_ID}")
    
    AUTH_METHOD=$(echo "$OAUTH_APP_VERIFY" | jq -r '.app.oidcConfig.authMethodType')
    GRANT_TYPES=$(echo "$OAUTH_APP_VERIFY" | jq -r '.app.oidcConfig.grantTypes[]' 2>/dev/null)
    
    NEEDS_UPDATE=false
    UPDATE_PAYLOAD="{"
    
    # Check auth method
    if [ "$AUTH_METHOD" != "OIDC_AUTH_METHOD_TYPE_NONE" ]; then
        echo -e "${YELLOW}⚠ Auth method is ${AUTH_METHOD}, should be NONE${NC}"
        UPDATE_PAYLOAD="$UPDATE_PAYLOAD\"authMethodType\": \"OIDC_AUTH_METHOD_TYPE_NONE\","
        NEEDS_UPDATE=true
    fi
    
    # Check grant types (should have AUTHORIZATION_CODE and REFRESH_TOKEN at minimum)
    HAS_AUTH_CODE=false
    HAS_REFRESH=false
    while IFS= read -r grant; do
        [ "$grant" = "OIDC_GRANT_TYPE_AUTHORIZATION_CODE" ] && HAS_AUTH_CODE=true
        [ "$grant" = "OIDC_GRANT_TYPE_REFRESH_TOKEN" ] && HAS_REFRESH=true
    done <<< "$GRANT_TYPES"
    
    if [ "$HAS_AUTH_CODE" = false ] || [ "$HAS_REFRESH" = false ]; then
        echo -e "${YELLOW}⚠ Grant types incomplete, fixing...${NC}"
        UPDATE_PAYLOAD="$UPDATE_PAYLOAD\"grantTypes\": [\"OIDC_GRANT_TYPE_AUTHORIZATION_CODE\", \"OIDC_GRANT_TYPE_REFRESH_TOKEN\"],"
        NEEDS_UPDATE=true
    fi
    
    if [ "$NEEDS_UPDATE" = true ]; then
        # Remove trailing comma and close JSON
        UPDATE_PAYLOAD="${UPDATE_PAYLOAD%,}}"
        
        curl -s -X PUT \
            -H "Authorization: Bearer ${ADMIN_PAT}" \
            -H "Content-Type: application/json" \
            -H "x-zitadel-orgid: ${ORG_ID}" \
            -d "$UPDATE_PAYLOAD" \
            "${BASE_URL}/management/v1/projects/${PROJECT_ID}/apps/${OAUTH_APP_ID}/oidc_config" > /dev/null
        echo -e "${GREEN}✓ OAuth app configuration updated${NC}"
        echo -e "${GREEN}  - Auth method: NONE (public client/PKCE)${NC}"
        echo -e "${GREEN}  - Grant types: AUTHORIZATION_CODE, REFRESH_TOKEN${NC}"
    fi
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
echo -e "\n${BLUE}[14/16] Creating test user...${NC}"
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

# Create E2E test user
echo -e "\n${BLUE}[15/16] Creating E2E test user...${NC}"
E2E_TEST_USER_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${ADMIN_PAT}" \
    -H "Content-Type: application/json" \
    -H "x-zitadel-orgid: ${ORG_ID}" \
    -d "{
        \"userName\": \"${E2E_TEST_USER_EMAIL}\",
        \"profile\": {
            \"firstName\": \"E2E\",
            \"lastName\": \"Test\",
            \"displayName\": \"E2E Test User\"
        },
        \"email\": {
            \"email\": \"${E2E_TEST_USER_EMAIL}\",
            \"isEmailVerified\": true
        },
        \"password\": \"${E2E_TEST_USER_PASSWORD}\"
    }" \
    "${BASE_URL}/management/v1/users/human/_import")

E2E_TEST_USER_ID=$(echo "$E2E_TEST_USER_RESPONSE" | jq -r '.userId')

if [ -z "$E2E_TEST_USER_ID" ] || [ "$E2E_TEST_USER_ID" = "null" ]; then
    echo -e "${YELLOW}⚠ E2E test user might already exist or failed to create${NC}"
    echo -e "${YELLOW}Response: $E2E_TEST_USER_RESPONSE${NC}"
else
    echo -e "${GREEN}✓ E2E test user created (ID: ${E2E_TEST_USER_ID}, Email: ${E2E_TEST_USER_EMAIL})${NC}"
    echo -e "${GREEN}✓ Email verified and user is active${NC}"
fi

# Output configuration
echo -e "\n${BLUE}[16/16] Configuration complete!${NC}"
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
echo "  Purpose:  Manual testing, development, demos"
echo ""
echo -e "${GREEN}E2E Test User (Automated Testing):${NC}"
echo "  Email:    ${E2E_TEST_USER_EMAIL}"
echo "  Password: ${E2E_TEST_USER_PASSWORD}"
echo "  Status:   Active and email verified"
echo "  Purpose:  Automated E2E tests only"
echo ""
echo -e "${BLUE}Bootstrap Machine User (Auto-created):${NC}"
echo "  Username: zitadel-admin-sa"
echo "  Org:      Spec Inc (ID: from first instance)"
echo "  PAT:      secrets/bootstrap/pat.txt"
echo "  Note:     Used for bootstrap only, not for application auth"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Add the above configuration to your .env file"
echo -e "2. Restart your server: ${BLUE}npm run workspace:restart${NC}"
echo -e "3. Look for: ${GREEN}'Dual service account mode active'${NC} in logs"
echo "4. Login to console at ${BASE_URL} with admin credentials"
echo ""
echo -e "${YELLOW}Security Note:${NC}"
echo "The bootstrap PAT is kept for re-running the script."
echo "Your application uses the service account JWT keys instead."
echo ""

# Push to Infisical if requested
if [ "$PUSH_TO_INFISICAL" = true ]; then
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}   Pushing secrets to Infisical${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}Environment: ${INFISICAL_ENV}${NC}"
    echo -e "${GREEN}Path: ${INFISICAL_PATH}${NC}"
    echo ""
    
    # Check if Infisical CLI is available
    if ! command -v infisical &> /dev/null; then
        echo -e "${RED}Error: Infisical CLI not found${NC}"
        echo -e "${YELLOW}Install with: brew install infisical/brew/infisical${NC}"
        exit 1
    fi
    
    # Read the client service account JWT
    if [ -f "./secrets/zitadel-client-service-account.json" ]; then
        CLIENT_JWT=$(cat ./secrets/zitadel-client-service-account.json)
    else
        echo -e "${YELLOW}⚠ Warning: Client service account JWT not found${NC}"
        CLIENT_JWT=""
    fi
    
    # Push secrets to Infisical
    echo -e "${BLUE}Pushing Zitadel configuration...${NC}"
    
    # Core Zitadel configuration
    infisical secrets set ZITADEL_ORG_ID "${ORG_ID}" --env="${INFISICAL_ENV}" --path="${INFISICAL_PATH}" $DOMAIN_FLAG --silent 2>/dev/null
    infisical secrets set ZITADEL_PROJECT_ID "${PROJECT_ID}" --env="${INFISICAL_ENV}" --path="${INFISICAL_PATH}" $DOMAIN_FLAG --silent 2>/dev/null
    
    # OAuth configuration
    if [ -n "$OAUTH_CLIENT_ID" ]; then
        infisical secrets set ZITADEL_OAUTH_CLIENT_ID "${OAUTH_CLIENT_ID}" --env="${INFISICAL_ENV}" --path="${INFISICAL_PATH}" $DOMAIN_FLAG --silent 2>/dev/null
    fi
    
    if [ -n "$OAUTH_CLIENT_SECRET" ] && [ "$OAUTH_CLIENT_SECRET" != "null" ]; then
        infisical secrets set ZITADEL_OAUTH_CLIENT_SECRET "${OAUTH_CLIENT_SECRET}" --env="${INFISICAL_ENV}" --path="${INFISICAL_PATH}" $DOMAIN_FLAG --silent 2>/dev/null
    fi
    
    # API configuration
    if [ -n "$API_CLIENT_ID" ]; then
        infisical secrets set ZITADEL_API_CLIENT_ID "${API_CLIENT_ID}" --env="${INFISICAL_ENV}" --path="${INFISICAL_PATH}" $DOMAIN_FLAG --silent 2>/dev/null
    fi
    
    # Service account JWT (if available)
    if [ -n "$CLIENT_JWT" ]; then
        infisical secrets set ZITADEL_CLIENT_JWT "${CLIENT_JWT}" --env="${INFISICAL_ENV}" --path="${INFISICAL_PATH}" $DOMAIN_FLAG --silent 2>/dev/null
    fi
    
    echo -e "${GREEN}✓ Pushed to Infisical:${NC}"
    echo -e "  - ZITADEL_ORG_ID"
    echo -e "  - ZITADEL_PROJECT_ID"
    [ -n "$OAUTH_CLIENT_ID" ] && echo -e "  - ZITADEL_OAUTH_CLIENT_ID"
    [ -n "$OAUTH_CLIENT_SECRET" ] && [ "$OAUTH_CLIENT_SECRET" != "null" ] && echo -e "  - ZITADEL_OAUTH_CLIENT_SECRET"
    [ -n "$API_CLIENT_ID" ] && echo -e "  - ZITADEL_API_CLIENT_ID"
    [ -n "$CLIENT_JWT" ] && echo -e "  - ZITADEL_CLIENT_JWT"
    echo ""
    
    # Also push admin-specific configuration to /admin path
    echo -e "${BLUE}Pushing admin configuration to /admin path...${NC}"
    if [ -n "$OAUTH_CLIENT_ID" ]; then
        infisical secrets set VITE_ZITADEL_CLIENT_ID "${OAUTH_CLIENT_ID}" --env="${INFISICAL_ENV}" --path="/admin" $DOMAIN_FLAG --silent 2>/dev/null
        echo -e "${GREEN}✓ Updated VITE_ZITADEL_CLIENT_ID in /admin${NC}"
    fi
    
    # Re-export .env files to pick up new values
    echo -e "\n${BLUE}Re-exporting .env files...${NC}"
    if [ -f "./scripts/env-export.sh" ]; then
        ./scripts/env-export.sh --path /server --overwrite > /dev/null 2>&1 && echo -e "${GREEN}✓ Exported server .env${NC}"
        ./scripts/env-export.sh --path /admin --overwrite > /dev/null 2>&1 && echo -e "${GREEN}✓ Exported admin .env${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: env-export.sh not found, skipping .env export${NC}"
    fi
    
    echo -e "\n${BLUE}Next steps:${NC}"
    if [ -n "$INFISICAL_HOST" ]; then
        echo -e "1. Verify secrets: ${BLUE}infisical secrets --env=${INFISICAL_ENV} --path=${INFISICAL_PATH} --domain=https://${INFISICAL_HOST}/api${NC}"
    else
        echo -e "1. Verify secrets: ${BLUE}infisical secrets --env=${INFISICAL_ENV} --path=${INFISICAL_PATH}${NC}"
    fi
    echo -e "2. Restart services: ${BLUE}npm run workspace:restart${NC}"
    echo -e "3. Look for: ${GREEN}'Dual service account mode active'${NC} in logs"
    echo ""
else
    echo -e "${YELLOW}Tip: Use --push-to-infisical to automatically push these secrets to Infisical${NC}"
    echo ""
fi

