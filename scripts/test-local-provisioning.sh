#!/bin/bash
#
# Local Testing Script for Dual Service Account Provisioning
#
# This script:
# 1. Starts a fresh local Zitadel instance
# 2. Waits for it to be ready
# 3. Guides you through getting credentials
# 4. Runs the provisioning script
# 5. Verifies the service accounts were created
# 6. Optionally cleans up the test environment
#

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_SECRETS_DIR="$PROJECT_ROOT/secrets-test"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Zitadel Dual Service Account - Local Test Environment    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Start Zitadel test instance
echo -e "${YELLOW}Step 1: Starting local Zitadel test instance...${NC}"
echo "This will start:"
echo "  - PostgreSQL database (port 5433)"
echo "  - Zitadel v4.6.2 (port 8080)"
echo ""

cd "$PROJECT_ROOT"
docker-compose -f docker-compose.test-zitadel.yml up -d

echo ""
echo -e "${YELLOW}Waiting for Zitadel to be ready (this takes ~60 seconds)...${NC}"
echo ""

# Wait for health check
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker-compose -f docker-compose.test-zitadel.yml ps | grep -q "healthy"; then
        echo -e "${GREEN}✅ Zitadel is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 5
    WAITED=$((WAITED + 5))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${RED}❌ Timeout waiting for Zitadel to start${NC}"
    echo "Check logs with: docker-compose -f docker-compose.test-zitadel.yml logs zitadel-test"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Zitadel Console Access                                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  URL:      http://localhost:8080"
echo "  Username: admin@localhost"
echo "  Password: Password1!"
echo ""

# Step 2: Guide user through getting credentials
echo -e "${YELLOW}Step 2: Getting Zitadel credentials${NC}"
echo ""
echo "Please open http://localhost:8080 in your browser and:"
echo ""
echo "1️⃣  Login with the credentials above"
echo ""
echo "2️⃣  Create a Personal Access Token:"
echo "   • Click your profile (top right) → Personal Access Tokens"
echo "   • Click 'New'"
echo "   • Name: 'Test Provisioning'"
echo "   • Expiration: Keep default"
echo "   • Click 'Save'"
echo "   • COPY THE TOKEN (starts with 'dEnN...')"
echo ""
echo "3️⃣  Get Organization ID:"
echo "   • Click 'Test Organization' (top left) → General"
echo "   • Find 'Organization ID' (numeric)"
echo ""
echo "4️⃣  Create a Project (if not exists):"
echo "   • Go to Projects → New"
echo "   • Name: 'Test API'"
echo "   • Click 'Continue'"
echo "   • COPY THE PROJECT ID (numeric)"
echo ""

read -p "Press ENTER when you have gathered all credentials..."

echo ""
echo -e "${YELLOW}Step 3: Running provisioning script${NC}"
echo ""

# Create test secrets directory
mkdir -p "$TEST_SECRETS_DIR"
chmod 700 "$TEST_SECRETS_DIR"

# Gather credentials interactively
read -sp "Enter your Admin Personal Access Token: " ADMIN_TOKEN
echo ""
read -p "Enter your Organization ID: " ORG_ID
read -p "Enter your Project ID: " PROJECT_ID
echo ""

# Confirmation
echo -e "${BLUE}Configuration Summary:${NC}"
echo "  Domain:     localhost:8080"
echo "  Org ID:     $ORG_ID"
echo "  Project ID: $PROJECT_ID"
echo "  Output dir: $TEST_SECRETS_DIR"
echo ""

read -p "Proceed with provisioning? (y/n): " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Run provisioning script
echo ""
echo -e "${YELLOW}Creating service accounts...${NC}"
echo ""

export ZITADEL_DOMAIN="localhost:8080"
export ZITADEL_ADMIN_TOKEN="$ADMIN_TOKEN"
export ZITADEL_ORG_ID="$ORG_ID"
export ZITADEL_PROJECT_ID="$PROJECT_ID"
export ZITADEL_SECURE="false"  # HTTP for local testing

bash "$SCRIPT_DIR/setup-zitadel-service-accounts.sh" "$TEST_SECRETS_DIR/"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Provisioning completed successfully!${NC}"
    echo ""
    
    # Step 4: Verify the created files
    echo -e "${YELLOW}Step 4: Verifying created service accounts${NC}"
    echo ""
    
    if [ -f "$TEST_SECRETS_DIR/zitadel-client-service-account.json" ]; then
        echo -e "${GREEN}✅ CLIENT service account JSON created${NC}"
        echo "   File: $TEST_SECRETS_DIR/zitadel-client-service-account.json"
        CLIENT_KEY_ID=$(jq -r '.keyId' "$TEST_SECRETS_DIR/zitadel-client-service-account.json")
        echo "   Key ID: $CLIENT_KEY_ID"
    else
        echo -e "${RED}❌ CLIENT service account JSON not found${NC}"
    fi
    
    if [ -f "$TEST_SECRETS_DIR/zitadel-api-service-account.json" ]; then
        echo -e "${GREEN}✅ API service account JSON created${NC}"
        echo "   File: $TEST_SECRETS_DIR/zitadel-api-service-account.json"
        API_KEY_ID=$(jq -r '.keyId' "$TEST_SECRETS_DIR/zitadel-api-service-account.json")
        echo "   Key ID: $API_KEY_ID"
    else
        echo -e "${RED}❌ API service account JSON not found${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Test Successful!                                          ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "The provisioning script works correctly!"
    echo ""
    echo "You can verify in Zitadel Console:"
    echo "  1. Go to http://localhost:8080"
    echo "  2. Navigate to Users"
    echo "  3. You should see two service accounts:"
    echo "     • spec-client-service-account"
    echo "     • spec-api-service-account"
    echo ""
    
else
    echo ""
    echo -e "${RED}❌ Provisioning failed!${NC}"
    echo ""
    echo "Check the output above for error messages."
    exit 1
fi

# Cleanup prompt
echo ""
read -p "Do you want to stop and remove the test Zitadel instance? (y/n): " CLEANUP
if [[ $CLEANUP =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Cleaning up test environment...${NC}"
    cd "$PROJECT_ROOT"
    docker-compose -f docker-compose.test-zitadel.yml down -v
    echo -e "${GREEN}✅ Test environment removed${NC}"
    echo ""
    echo "Test secrets are preserved at: $TEST_SECRETS_DIR"
    echo "You can safely delete this directory: rm -rf $TEST_SECRETS_DIR"
else
    echo ""
    echo -e "${BLUE}Test environment is still running.${NC}"
    echo ""
    echo "To stop later:"
    echo "  docker-compose -f docker-compose.test-zitadel.yml down -v"
    echo ""
    echo "To view logs:"
    echo "  docker-compose -f docker-compose.test-zitadel.yml logs -f"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
