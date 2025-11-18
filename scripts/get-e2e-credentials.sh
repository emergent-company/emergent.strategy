#!/bin/bash
# Get E2E Test User Credentials
# Usage: ./scripts/get-e2e-credentials.sh

set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  E2E Test User Credentials${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Load environment variables from .env
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo -e "${YELLOW}Copy .env.example to .env and configure it before running this script${NC}"
    exit 1
fi

echo -e "${GREEN}Loading configuration from .env${NC}"

# Load .env variables
set -a
while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value="${value%\"}"
    value="${value#\"}"
    export "$key=$value"
done < <(grep -v '^#' .env | grep -v '^$' | grep -E '^[A-Z_]+=')
set +a

# Set defaults if not in .env
E2E_TEST_USER_EMAIL="${E2E_TEST_USER_EMAIL:-e2e-test@example.com}"
E2E_TEST_USER_PASSWORD="${E2E_TEST_USER_PASSWORD:-E2eTestPassword123!}"
ADMIN_PORT="${ADMIN_PORT:-5176}"
SERVER_PORT="${SERVER_PORT:-3002}"
ZITADEL_DOMAIN="${ZITADEL_DOMAIN:-localhost:8200}"

echo ""
echo -e "${GREEN}E2E Test User Credentials:${NC}"
echo -e "  Email:    ${E2E_TEST_USER_EMAIL}"
echo -e "  Password: ${E2E_TEST_USER_PASSWORD}"
echo ""
echo -e "${GREEN}Application URLs:${NC}"
echo -e "  Admin:    http://localhost:${ADMIN_PORT}"
echo -e "  API:      http://localhost:${SERVER_PORT}"
echo -e "  Zitadel:  http://${ZITADEL_DOMAIN}"
echo ""
echo -e "${BLUE}Purpose:${NC}"
echo -e "  This user is dedicated for automated E2E tests only."
echo -e "  For manual testing, use the regular test user (TEST_USER_EMAIL)."
echo ""
echo -e "${BLUE}To test manually with DevTools MCP:${NC}"
echo -e "  1. Start Chrome with debugging: ${GREEN}npm run chrome:debug${NC}"
echo -e "  2. Login with credentials above"
echo -e "  3. Navigate to feature you want to test"
echo -e "  4. Ask AI to inspect browser state with DevTools MCP"
echo ""
echo -e "${BLUE}Example AI commands:${NC}"
echo -e "  • Check the browser console for errors"
echo -e "  • What network requests failed?"
echo -e "  • Show me the DOM structure of this page"
echo -e "  • What selectors should I use for this button?"
echo ""
