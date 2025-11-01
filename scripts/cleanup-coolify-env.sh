#!/usr/bin/env bash
#
# Coolify Environment Cleanup Script
# 
# This script deletes ALL environment variables from a Coolify application.
# Use this to reset environment configuration before running update-coolify-env.sh
#
# Usage:
#   ./scripts/cleanup-coolify-env.sh --env=staging
#   ./scripts/cleanup-coolify-env.sh --env=production
#
# Requires:
#   - jq (brew install jq)
#   - COOLIFY_URL, COOLIFY_API_TOKEN, COOLIFY_APP_UUID in .env file

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
ENV_NAME=""
ENV_FILE=""
APP_UUID=""
COOLIFY_URL=""
COOLIFY_API_TOKEN=""

# Print functions
print_header() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo -e "${BLUE}$1${NC}"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Parse command line arguments
parse_args() {
    for arg in "$@"; do
        case $arg in
            --env=*)
                ENV_NAME="${arg#*=}"
                ENV_FILE="${PROJECT_ROOT}/.env.${ENV_NAME}"
                shift
                ;;
            *)
                print_error "Unknown argument: $arg"
                echo ""
                echo "Usage: $0 --env=staging"
                exit 1
                ;;
        esac
    done
    
    if [[ -z "$ENV_NAME" ]]; then
        print_error "Missing required argument: --env"
        echo ""
        echo "Usage: $0 --env=staging"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed. Install it with: brew install jq"
        exit 1
    fi
    print_success "jq installed"
    
    # Check if env file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        print_error "Environment file not found: $ENV_FILE"
        exit 1
    fi
    print_success "Environment file found: $ENV_FILE"
    
    # Read Coolify URL and API token from env file
    if ! grep -q "^COOLIFY_URL=" "$ENV_FILE"; then
        print_error "COOLIFY_URL not found in $ENV_FILE"
        exit 1
    fi
    COOLIFY_URL=$(grep "^COOLIFY_URL=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' "'"'"'')
    print_success "Coolify URL: $COOLIFY_URL"
    
    if ! grep -q "^COOLIFY_API_TOKEN=" "$ENV_FILE"; then
        print_error "COOLIFY_API_TOKEN not found in $ENV_FILE"
        exit 1
    fi
    COOLIFY_API_TOKEN=$(grep "^COOLIFY_API_TOKEN=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' "'"'"'')
    local masked_token="${COOLIFY_API_TOKEN:0:12}..."
    print_success "API Token: $masked_token"
}

# Get APP_UUID
get_app_uuid() {
    # Try to read COOLIFY_APP_UUID from env file
    if grep -q "^COOLIFY_APP_UUID=" "$ENV_FILE"; then
        APP_UUID=$(grep "^COOLIFY_APP_UUID=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' "'"'"'')
        
        if [[ -n "$APP_UUID" ]]; then
            print_success "Using APP_UUID from .env.${ENV_NAME}: $APP_UUID"
            return
        fi
    fi
    
    # Prompt for APP_UUID if not found
    print_warning "COOLIFY_APP_UUID not found in .env.${ENV_NAME}"
    print_info "You can find your APP_UUID in the Coolify URL:"
    print_info "https://your-coolify.com/application/[APP_UUID]/..."
    echo ""
    read -rp "Enter your Coolify APP_UUID: " APP_UUID
    
    if [[ -z "$APP_UUID" ]]; then
        print_error "APP_UUID is required"
        exit 1
    fi
    
    print_success "Using APP_UUID: $APP_UUID"
}

# Delete all environment variables
delete_all_vars() {
    print_header "Deleting All Environment Variables"
    
    print_warning "⚠️  This will DELETE ALL environment variables for this application!"
    print_info "Application: ${COOLIFY_URL}/application/${APP_UUID}"
    echo ""
    read -rp "Are you sure you want to continue? (yes/no): " confirm
    
    if [[ "$confirm" != "yes" ]]; then
        print_info "Cleanup cancelled"
        exit 0
    fi
    
    echo ""
    print_info "Fetching current environment variables..."
    
    # Get all environment variables
    local response=$(curl -s -X GET \
        "${COOLIFY_URL}/api/v1/applications/${APP_UUID}/envs" \
        -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
        -H "Accept: application/json")
    
    local total=$(echo "$response" | jq 'length')
    
    if [[ "$total" == "0" ]]; then
        print_info "No environment variables found"
        return
    fi
    
    print_info "Found $total environment variables. Deleting..."
    echo ""
    
    local deleted=0
    local failed=0
    
    # Delete each variable
    echo "$response" | jq -r '.[] | .uuid' | while read -r uuid; do
        local key=$(echo "$response" | jq -r ".[] | select(.uuid == \"${uuid}\") | .key")
        echo -n "  Deleting $key... "
        
        local delete_response=$(curl -s -w "\n%{http_code}" -X DELETE \
            "${COOLIFY_URL}/api/v1/applications/${APP_UUID}/envs/${uuid}" \
            -H "Authorization: Bearer ${COOLIFY_API_TOKEN}")
        
        local http_code=$(echo "$delete_response" | tail -n1)
        
        if [[ "$http_code" == "200" ]] || [[ "$http_code" == "204" ]]; then
            echo -e "${GREEN}✓${NC}"
            ((deleted++))
        else
            echo -e "${RED}✗ (HTTP $http_code)${NC}"
            ((failed++))
        fi
        
        sleep 0.3  # Rate limiting
    done
    
    echo ""
    print_success "Deleted $deleted/$total variables"
    
    if [[ $failed -gt 0 ]]; then
        print_warning "$failed deletions failed"
    fi
}

# Show next steps
show_next_steps() {
    print_header "Next Steps"
    
    echo "1. Run the update script to recreate variables:"
    print_info "   ./scripts/update-coolify-env.sh --env=${ENV_NAME}"
    echo ""
    echo "2. Manually configure NODE_ENV in Coolify UI:"
    print_info "   ${COOLIFY_URL}/application/${APP_UUID}/environment-variables"
    print_warning "   - UNCHECK 'Available at Buildtime'"
    print_warning "   - Keep 'Available at Runtime' CHECKED"
    print_warning "   - Set value to: production"
    echo ""
    echo "3. Verify VITE_* variables are set as 'Build & Runtime'"
    echo ""
    echo "4. Trigger a new deployment"
}

# Main execution
main() {
    print_header "Coolify Environment Cleanup Script"
    
    echo "This script deletes ALL environment variables from Coolify"
    echo ""
    print_info "Environment: ${ENV_NAME:-not set}"
    print_info "Config file: ${ENV_FILE:-not set}"
    echo ""
    
    parse_args "$@"
    check_prerequisites
    get_app_uuid
    delete_all_vars
    show_next_steps
    
    print_header "Cleanup Complete"
    
    print_success "All environment variables have been deleted"
    print_warning "Run update-coolify-env.sh to recreate them"
}

main "$@"
