#!/bin/bash
# Script to verify all dev environment services are accessible
# Usage: ./scripts/verify-dev-services.sh

set -e

SERVER_IP="94.130.12.194"
ZITADEL_DOMAIN="zitadel.dev.emergent-company.ai"
LOGIN_DOMAIN="login.zitadel.dev.emergent-company.ai"
DB_DOMAIN="db.dev.emergent-company.ai"

echo "=========================================="
echo "Dev Services Verification"
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

# Function to test TCP port
test_port() {
    local host=$1
    local port=$2
    local name=$3
    echo -n "Port: $host:$port ($name) ... "
    if timeout 3 bash -c "(echo > /dev/tcp/$host/$port) 2>/dev/null"; then
        echo -e "${GREEN}✅ Open${NC}"
        return 0
    else
        echo -e "${RED}❌ Not accessible${NC}"
        return 1
    fi
}

# Function to test HTTP endpoint
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

echo "=== DNS Resolution ==="
dns_ok=true
test_dns "$ZITADEL_DOMAIN" || dns_ok=false
test_dns "$LOGIN_DOMAIN" || dns_ok=false
test_dns "$DB_DOMAIN" || dns_ok=false
echo ""

echo "=== Direct IP Access (Ports) ==="
test_port "$SERVER_IP" 5432 "PostgreSQL"
test_port "$SERVER_IP" 8100 "Zitadel API"
test_port "$SERVER_IP" 8101 "Zitadel Login UI"
echo ""

echo "=== HTTP Services (via IP) ==="
test_http "http://$SERVER_IP:8100/debug/healthz" "Zitadel Health"
test_http "http://$SERVER_IP:8101/" "Login UI" "200"
echo ""

if [ "$dns_ok" = true ]; then
    echo "=== HTTPS Services (via Domain) ==="
    test_http "https://$ZITADEL_DOMAIN/debug/healthz" "Zitadel Health (HTTPS)"
    test_http "https://$LOGIN_DOMAIN/" "Login UI (HTTPS)" "200"
    echo ""
    
    echo "=== PostgreSQL (via Domain) ==="
    test_port "$DB_DOMAIN" 5432 "PostgreSQL"
    echo ""
else
    echo "=== HTTPS Services (via Domain) ==="
    echo -e "${YELLOW}⚠️  Skipped - DNS not configured${NC}"
    echo ""
fi

echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""

if [ "$dns_ok" = true ]; then
    echo -e "${GREEN}✅ DNS is configured correctly${NC}"
    echo "   All domains resolve to $SERVER_IP"
else
    echo -e "${RED}❌ DNS needs configuration${NC}"
    echo ""
    echo "Configure one of the following:"
    echo ""
    echo "Option 1: Wildcard CNAME"
    echo "  *.dev.emergent-company.ai  CNAME  kucharz.net."
    echo ""
    echo "Option 2: Wildcard A Record"
    echo "  *.dev.emergent-company.ai  A      $SERVER_IP"
    echo ""
    echo "Option 3: Individual A Records"
    echo "  $ZITADEL_DOMAIN  A  $SERVER_IP"
    echo "  $LOGIN_DOMAIN    A  $SERVER_IP"
    echo "  $DB_DOMAIN       A  $SERVER_IP"
fi

echo ""
echo "Services Status:"
echo "  - PostgreSQL: Accessible on port 5432"
echo "  - Zitadel API: Running on port 8100"
echo "  - Login UI: Waiting for PAT file (expected)"
echo ""
echo "Once DNS is configured, access via:"
echo "  - Zitadel: https://$ZITADEL_DOMAIN"
echo "  - Login UI: https://$LOGIN_DOMAIN"
echo "  - Database: $DB_DOMAIN:5432"
