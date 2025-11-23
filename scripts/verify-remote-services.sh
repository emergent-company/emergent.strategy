#!/bin/bash
# Script to verify remote dev services are accessible from local machine
# Usage: ./scripts/verify-remote-services.sh

set -e

SERVER_IP="94.130.12.194"
ZITADEL_DOMAIN="zitadel.dev.emergent-company.ai"
DB_DOMAIN="db.dev.emergent-company.ai"

echo "=========================================="
echo "Remote Services Verification (Local → Remote)"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test DNS
test_dns() {
    local domain=$1
    echo -n "DNS: $domain ... "
    if host "$domain" 2>/dev/null | grep -q "has address\|is an alias"; then
        ip=$(host "$domain" 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1)
        echo -e "${GREEN}✅ Resolves to $ip${NC}"
        return 0
    else
        echo -e "${RED}❌ Does not resolve${NC}"
        return 1
    fi
}

# Function to test TCP port from local machine
test_port() {
    local host=$1
    local port=$2
    local name=$3
    echo -n "Port: $host:$port ($name) ... "
    if timeout 3 bash -c "(echo > /dev/tcp/$host/$port) 2>/dev/null"; then
        echo -e "${GREEN}✅ Reachable${NC}"
        return 0
    else
        echo -e "${RED}❌ Not reachable${NC}"
        return 1
    fi
}

# Function to test HTTP endpoint from local
test_http() {
    local url=$1
    local name=$2
    local expected_code=${3:-200}
    echo -n "HTTP: $url ($name) ... "
    status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null || echo "000")
    if [ "$status" = "$expected_code" ]; then
        echo -e "${GREEN}✅ Status $status${NC}"
        return 0
    elif [ "$status" = "000" ]; then
        echo -e "${RED}❌ Connection failed${NC}"
        return 1
    else
        echo -e "${YELLOW}⚠️  Status $status (expected $expected_code)${NC}"
        return 1
    fi
}

# Function to test database connection
test_database() {
    local host=$1
    local port=$2
    local user=$3
    local db=$4
    local password=$5
    
    echo -n "Database: $user@$host:$port/$db ... "
    
    if ! command -v psql &> /dev/null; then
        echo -e "${YELLOW}⚠️  psql not installed (skipping)${NC}"
        return 0
    fi
    
    if PGPASSWORD="$password" psql -h "$host" -p "$port" -U "$user" -d "$db" -c "SELECT 1" &>/dev/null; then
        echo -e "${GREEN}✅ Connected${NC}"
        return 0
    else
        echo -e "${RED}❌ Connection failed${NC}"
        return 1
    fi
}

echo "=== DNS Resolution ==="
dns_ok=true
test_dns "$ZITADEL_DOMAIN" || dns_ok=false
test_dns "$DB_DOMAIN" || dns_ok=false
echo ""

echo "=== Network Connectivity (Local → Remote) ==="
test_port "$SERVER_IP" 5432 "PostgreSQL"
test_port "$SERVER_IP" 8100 "Zitadel API"
echo ""

echo "=== HTTP Services (via Domain) ==="
test_http "http://$ZITADEL_DOMAIN:8100/debug/healthz" "Zitadel Health"
echo ""

echo "=== Database Connection Test ==="
# Try to connect to database (will skip if psql not installed)
test_database "94.130.12.194" "5432" "spec" "zitadel" "spec"
echo ""

echo "=========================================="
echo "Configuration Validation"
echo "=========================================="
echo ""

# Check if local .env.local exists
if [ -f ".env.local" ]; then
    echo -e "${GREEN}✅ Root .env.local exists${NC}"
    
    # Check key variables
    if grep -q "POSTGRES_HOST=94.130.12.194" .env.local; then
        echo -e "${GREEN}✅ POSTGRES_HOST configured for remote${NC}"
    else
        echo -e "${YELLOW}⚠️  POSTGRES_HOST not set to remote (should be 94.130.12.194)${NC}"
    fi
    
    if grep -q "ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai" .env.local; then
        echo -e "${GREEN}✅ ZITADEL_DOMAIN configured for remote${NC}"
    else
        echo -e "${YELLOW}⚠️  ZITADEL_DOMAIN not set to remote${NC}"
    fi
else
    echo -e "${RED}❌ Root .env.local not found${NC}"
    echo "   Create from template: cp .env.local.remote .env.local"
fi

echo ""

# Check server .env.local
if [ -f "apps/server/.env.local" ]; then
    echo -e "${GREEN}✅ apps/server/.env.local exists${NC}"
    
    if grep -q "POSTGRES_HOST=94.130.12.194" apps/server/.env.local; then
        echo -e "${GREEN}✅ Server POSTGRES_HOST configured for remote${NC}"
    else
        echo -e "${YELLOW}⚠️  Server POSTGRES_HOST not set to remote${NC}"
    fi
    
    if grep -q "ZITADEL_ISSUER=http://zitadel.dev.emergent-company.ai:8100" apps/server/.env.local; then
        echo -e "${GREEN}✅ Server ZITADEL_ISSUER configured for remote${NC}"
    else
        echo -e "${YELLOW}⚠️  Server ZITADEL_ISSUER not set to remote${NC}"
    fi
    
    if grep -q "ZITADEL_ORG_ID=347883699234147332" apps/server/.env.local; then
        echo -e "${GREEN}✅ Server ZITADEL_ORG_ID configured${NC}"
    else
        echo -e "${YELLOW}⚠️  Server ZITADEL_ORG_ID not set${NC}"
    fi
    
    if grep -q "ZITADEL_PROJECT_ID=347883699653577732" apps/server/.env.local; then
        echo -e "${GREEN}✅ Server ZITADEL_PROJECT_ID configured${NC}"
    else
        echo -e "${YELLOW}⚠️  Server ZITADEL_PROJECT_ID not set${NC}"
    fi
else
    echo -e "${RED}❌ apps/server/.env.local not found${NC}"
    echo "   Create from template: cp apps/server/.env.local.remote apps/server/.env.local"
fi

echo ""
echo "=========================================="
echo "Summary & Next Steps"
echo "=========================================="
echo ""

if [ "$dns_ok" = true ]; then
    echo -e "${GREEN}✅ DNS is configured correctly${NC}"
else
    echo -e "${RED}❌ DNS not resolving - check your network/hosts file${NC}"
fi

echo ""
echo "Quick Setup:"
echo "  1. Copy configuration templates:"
echo "     cp .env.local.remote .env.local"
echo "     cp apps/server/.env.local.remote apps/server/.env.local"
echo ""
echo "  2. Update secrets in apps/server/.env.local:"
echo "     - ZITADEL_CLIENT_JWT (service account)"
echo "     - ZITADEL_API_JWT (API service account)"
echo "     - GOOGLE_API_KEY (for AI features)"
echo ""
echo "  3. Start local services (without dependencies):"
echo "     nx run workspace-cli:workspace:start -- --skip-deps"
echo ""
echo "  4. Access local app connected to remote services:"
echo "     - Admin UI: http://localhost:5176"
echo "     - Server API: http://localhost:3002"
echo "     - Remote Zitadel: http://zitadel.dev.emergent-company.ai:8100"
echo "     - Remote Database: 94.130.12.194:5432"
echo ""
echo "Documentation:"
echo "  - Database connection: secrets-dev/DATABASE_CONNECTION.md"
echo "  - Full setup guide: COOLIFY_DEV_SETUP.md"
echo "  - Remote config: secrets-dev/config.env"

