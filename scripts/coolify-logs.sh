#!/bin/bash
# Fetch application logs from Coolify API
# Usage: ./scripts/coolify-logs.sh [service_name] [lines]

set -e

# Configuration
COOLIFY_URL="${COOLIFY_URL:-https://kucharz.net}"
COOLIFY_APP_UUID="${COOLIFY_APP_UUID:-t4cok0o4cwwoo8o0ccs8ogkg}"
COOLIFY_API_TOKEN="${COOLIFY_API_TOKEN:-}"

# Parameters
SERVICE="${1:-}"
LINES="${2:-100}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Load from .env.staging if token not set
if [[ -z "$COOLIFY_API_TOKEN" ]] && [[ -f ".env.staging" ]]; then
    print_info "Loading API token from .env.staging..."
    COOLIFY_API_TOKEN=$(grep "^COOLIFY_API_TOKEN=" .env.staging | cut -d'=' -f2 | tr -d ' "'"'"'')
fi

if [[ -z "$COOLIFY_API_TOKEN" ]]; then
    print_error "COOLIFY_API_TOKEN not set"
    echo "Get your API token from: $COOLIFY_URL/security/api-tokens"
    echo "Then either:"
    echo "  1. Set environment variable: export COOLIFY_API_TOKEN='your-token'"
    echo "  2. Add to .env.staging: COOLIFY_API_TOKEN=your-token"
    exit 1
fi

print_info "Fetching logs from Coolify..."
echo "URL: ${COOLIFY_URL}/api/v1/applications/${COOLIFY_APP_UUID}/logs"
echo ""

# Fetch logs
# Note: Coolify API only supports 'lines' parameter for docker-compose apps
# It returns logs from the main container only (typically the first service)
if [[ -n "$SERVICE" ]]; then
    print_warning "Note: Coolify API doesn't support per-service logs for docker-compose apps"
    print_info "Fetching logs with $LINES lines (showing main container only)"
fi

RESPONSE=$(curl -s "${COOLIFY_URL}/api/v1/applications/${COOLIFY_APP_UUID}/logs?lines=${LINES}" \
    -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
    -H "Accept: application/json")

# Check if response has logs field
if echo "$RESPONSE" | jq -e '.logs' > /dev/null 2>&1; then
    # Parse and format logs
    echo "$RESPONSE" | jq -r '.logs' | tail -n "$LINES"
    
    # Show summary
    echo ""
    TOTAL_LINES=$(echo "$RESPONSE" | jq -r '.logs' | wc -l | tr -d ' ')
    print_success "Displayed last $LINES of $TOTAL_LINES total log lines"
else
    print_error "No logs found in response"
    echo ""
    echo "Response:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi

# Show limitation notice
echo ""
print_warning "API Limitation: Coolify only returns logs from the main container (admin/nginx)"
print_info "To view server or database logs, use the Coolify web UI:"
echo "  https://kucharz.net/project/lkck84kwscgs0wo0kc8wc00s/environment/g0s0go0okcsosksowc0cwgow/application/t4cok0o4cwwoo8o0ccs8ogkg/logs"
echo ""
print_info "Available services (not accessible via API):"
echo "  - admin (nginx frontend) - ✓ Shown in API"
echo "  - server (NestJS API) - ✗ Not in API (use Web UI)"
echo "  - db (PostgreSQL) - ✗ Not in API (use Web UI)"
echo ""
echo "Usage:"
echo "  ./scripts/coolify-logs.sh       # Fetch last 100 lines (admin only)"
echo "  ./scripts/coolify-logs.sh _ 500 # Fetch last 500 lines"
