#!/usr/bin/env bash
# Update Coolify Environment Variables using Direct API
#
# Prerequisites:
#   - COOLIFY_URL set in environment or .env file
#   - COOLIFY_API_TOKEN set in environment or .env file
#   - .env file exists with COOLIFY_APP_UUID
#
# Usage:
#   ./scripts/update-coolify-env.sh --env=staging
#   ./scripts/update-coolify-env.sh --env=production
#
# Environment variables can be set via:
#   export COOLIFY_URL="https://your-coolify.com"
#   export COOLIFY_API_TOKEN="your-api-token"
# Or add them to your .env.staging file (they won't be synced to Coolify)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=""
APP_UUID=""
ENV_NAME=""
COOLIFY_URL="${COOLIFY_URL:-}"
COOLIFY_API_TOKEN="${COOLIFY_API_TOKEN:-}"

print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
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
                # Assume it's an APP_UUID if not a flag
                if [[ -z "$APP_UUID" ]] && [[ ! "$arg" =~ ^-- ]]; then
                    APP_UUID="$arg"
                fi
                shift
                ;;
        esac
    done
    
    # Default to .env.staging if no --env flag provided
    if [[ -z "$ENV_FILE" ]]; then
        ENV_NAME="staging"
        ENV_FILE="${PROJECT_ROOT}/.env.staging"
    fi
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check if jq is installed (needed for JSON parsing)
    if ! command -v jq &> /dev/null; then
        print_error "jq not found - required for JSON parsing"
        echo "Install it with:"
        echo "  macOS: brew install jq"
        echo "  Ubuntu: apt-get install jq"
        exit 1
    fi
    print_success "jq installed"
    
    # Check if env file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        print_error "Environment file not found at: $ENV_FILE"
        echo "Run: ./scripts/setup-coolify.sh to generate it"
        exit 1
    fi
    print_success "Environment file found: .env.${ENV_NAME}"
    
    # Load COOLIFY_URL and COOLIFY_API_TOKEN from env file if not set
    if [[ -z "$COOLIFY_URL" ]] && grep -q "^COOLIFY_URL=" "$ENV_FILE"; then
        COOLIFY_URL=$(grep "^COOLIFY_URL=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' "'"'"'')
    fi
    
    if [[ -z "$COOLIFY_API_TOKEN" ]] && grep -q "^COOLIFY_API_TOKEN=" "$ENV_FILE"; then
        COOLIFY_API_TOKEN=$(grep "^COOLIFY_API_TOKEN=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' "'"'"'')
    fi
    
    # Prompt for missing values
    if [[ -z "$COOLIFY_URL" ]]; then
        print_warning "COOLIFY_URL not found"
        read -rp "Enter your Coolify URL (e.g., https://coolify.example.com): " COOLIFY_URL
    fi
    
    if [[ -z "$COOLIFY_API_TOKEN" ]]; then
        print_warning "COOLIFY_API_TOKEN not found"
        echo "Get your API token from: $COOLIFY_URL/security/api-tokens"
        read -rsp "Enter your Coolify API Token: " COOLIFY_API_TOKEN
        echo ""
    fi
    
    # Validate required values
    if [[ -z "$COOLIFY_URL" ]] || [[ -z "$COOLIFY_API_TOKEN" ]]; then
        print_error "COOLIFY_URL and COOLIFY_API_TOKEN are required"
        exit 1
    fi
    
    print_success "Coolify URL: $COOLIFY_URL"
    print_success "API Token: ${COOLIFY_API_TOKEN:0:10}..."
}

# Get APP_UUID
get_app_uuid() {
    # If APP_UUID already set from command line, use it
    if [[ -n "$APP_UUID" ]]; then
        print_success "Using APP_UUID from command line: $APP_UUID"
        return
    fi
    
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

# Parse .env file and create separate files for runtime and build-time vars
prepare_env_files() {
    print_header "Preparing Environment Files" >&2
    
    local runtime_file="${PROJECT_ROOT}/.env.${ENV_NAME}.runtime"
    local buildtime_file="${PROJECT_ROOT}/.env.${ENV_NAME}.buildtime"
    
    # Clear existing files
    > "$runtime_file"
    > "$buildtime_file"
    
    # Warn about NODE_ENV if present in env file
    if grep -q "^NODE_ENV=" "$ENV_FILE"; then
        echo "" >&2
        print_warning "⚠️  NODE_ENV found in ${ENV_FILE} - will be SKIPPED" >&2
        print_warning "   NODE_ENV must be configured manually in Coolify UI as 'Runtime Only'" >&2
        print_warning "   See 'Next Steps' section after script completes" >&2
        echo "" >&2
    fi
    
    # Build-time variables (VITE_* prefix)
    local buildtime_vars=(
        "VITE_API_URL"
        "VITE_ZITADEL_ISSUER"
        "VITE_ZITADEL_CLIENT_ID"
        "VITE_APP_ENV"
    )
    
    # Variables to skip (not needed in Coolify)
    local skip_vars=(
        "COOLIFY_APP_UUID"
        "COOLIFY_URL"
        "COOLIFY_API_TOKEN"
        "NODE_ENV"  # Must be configured manually in Coolify UI as "Runtime Only"
    )
    
    # Read env file and separate variables
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$line" ]] && continue
        
        # Extract key=value
        if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"
            
            # Skip certain variables
            skip=false
            for skipvar in "${skip_vars[@]}"; do
                if [[ "$key" == "$skipvar" ]]; then
                    skip=true
                    break
                fi
            done
            
            if [[ "$skip" == true ]]; then
                continue
            fi
            
            # Check if it's a build-time variable
            is_buildtime=false
            for bvar in "${buildtime_vars[@]}"; do
                if [[ "$key" == "$bvar" ]]; then
                    is_buildtime=true
                    break
                fi
            done
            
            if [[ "$is_buildtime" == true ]]; then
                echo "$line" >> "$buildtime_file"
            else
                echo "$line" >> "$runtime_file"
            fi
        fi
    done < "$ENV_FILE"
    
    local runtime_count=$(grep -c "=" "$runtime_file" 2>/dev/null || echo "0")
    local buildtime_count=$(grep -c "=" "$buildtime_file" 2>/dev/null || echo "0")
    
    print_success "Prepared $runtime_count runtime variables" >&2
    print_success "Prepared $buildtime_count build-time variables" >&2
    
    # Return file paths on stdout (not stderr)
    printf "%s %s" "$runtime_file" "$buildtime_file"
}

# Update or create a single environment variable via API
# Note: Coolify API doesn't support PATCH for envs, so we use DELETE + POST
# Build-time/runtime flags cannot be set via API - must be configured manually in UI
update_env_var() {
    local key=$1
    local value=$2
    local is_build_time=$3
    
    echo -n "  Processing $key... "
    
    # Get existing variable UUID
    local response=$(curl -s -X GET \
        "${COOLIFY_URL}/api/v1/applications/${APP_UUID}/envs" \
        -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
        -H "Accept: application/json")
    
    local uuid=$(echo "$response" | jq -r ".[] | select(.key == \"${key}\") | .uuid" | head -n1)
    
    # If variable exists, delete it first (Coolify doesn't support PATCH)
    if [[ -n "$uuid" ]] && [[ "$uuid" != "null" ]]; then
        local delete_response=$(curl -s -X DELETE \
            "${COOLIFY_URL}/api/v1/applications/${APP_UUID}/envs/${uuid}" \
            -H "Authorization: Bearer ${COOLIFY_API_TOKEN}")
        sleep 0.3
    fi
    
    # Create variable with just key and value
    # API does not allow setting is_buildtime/is_runtime flags during creation
    local create_response=$(curl -s -w "\n%{http_code}" -X POST \
        "${COOLIFY_URL}/api/v1/applications/${APP_UUID}/envs" \
        -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "{\"key\": \"${key}\", \"value\": \"${value}\"}")
    
    local http_code=$(echo "$create_response" | tail -n1)
    local body=$(echo "$create_response" | sed '$d')
    
    if [[ "$http_code" == "201" ]] || [[ "$http_code" == "200" ]]; then
        if [[ -n "$uuid" ]] && [[ "$uuid" != "null" ]]; then
            echo -e "${GREEN}✓ Updated${NC}"
        else
            echo -e "${GREEN}✓ Created${NC}"
        fi
    else
        echo -e "${RED}✗ Failed (HTTP $http_code)${NC}"
        if [[ -n "$body" ]]; then
            echo "    Error: $(echo "$body" | jq -r '.message // .error // .' 2>/dev/null || echo "$body")" >&2
        fi
        return 1
    fi
    
    sleep 0.5  # Rate limiting
}

# Sync runtime variables via API
sync_runtime_vars() {
    local runtime_file="$1"
    
    print_header "Syncing Runtime Variables"
    
    # Check if file exists and is not empty
    if [[ ! -f "$runtime_file" ]]; then
        print_error "Runtime file not found: $runtime_file"
        return 1
    fi
    
    if [[ ! -s "$runtime_file" ]]; then
        print_warning "No runtime variables to sync"
        return
    fi
    
    local count=0
    local success=0
    
    # Read runtime variables and update via API
    while IFS= read -r line; do
        # Skip empty lines
        [[ -z "$line" ]] && continue
        
        if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"
            
            ((count++))
            if update_env_var "$key" "$value" "false"; then
                ((success++))
            fi
        fi
    done < "$runtime_file"
    
    echo ""
    print_success "Synced $success/$count runtime variables"
}

# Update build-time variables via API
update_buildtime_vars() {
    local buildtime_file="$1"
    
    print_header "Updating Build-Time Variables"
    
    # Check if file exists and is not empty
    if [[ ! -f "$buildtime_file" ]] || [[ ! -s "$buildtime_file" ]]; then
        print_info "No build-time variables to update"
        return
    fi
    
    local count=0
    local success=0
    
    # Read build-time variables and update via API
    while IFS= read -r line; do
        # Skip empty lines
        [[ -z "$line" ]] && continue
        
        if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"
            
            ((count++))
            if update_env_var "$key" "$value" "true"; then
                ((success++))
            fi
        fi
    done < "$buildtime_file"
    
    echo ""
    print_success "Updated $success/$count build-time variables"
}

# Verify configuration via API
verify_config() {
    print_header "Verifying Configuration"
    
    print_info "Fetching current environment variables from Coolify..."
    echo ""
    
    local response=$(curl -s -X GET \
        "${COOLIFY_URL}/api/v1/applications/${APP_UUID}/envs" \
        -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
        -H "Accept: application/json")
    
    # Show NODE_ENV status (critical)
    print_info "NODE_ENV Configuration:"
    local node_env=$(echo "$response" | jq -r '.[] | select(.is_preview == true and .key == "NODE_ENV")')
    
    if [[ -n "$node_env" ]] && [[ "$node_env" != "null" ]]; then
        local value=$(echo "$node_env" | jq -r '.value')
        local is_build_time=$(echo "$node_env" | jq -r '.is_build_time')
        
        echo "  Key: NODE_ENV"
        echo "  Value: $value"
        echo "  Build Time: $is_build_time"
        echo "  Runtime: $(if [[ "$is_build_time" == "true" ]]; then echo "No"; else echo "Yes"; fi)"
        echo ""
        
        if [[ "$is_build_time" == "true" ]]; then
            print_error "NODE_ENV is set as build-time variable!"
            print_warning "This will cause build failures. Update it in Coolify web UI"
        else
            print_success "NODE_ENV is correctly configured (Runtime Only)"
        fi
    else
        print_warning "NODE_ENV not found"
    fi
    echo ""
    
    # Show VITE variables
    print_info "Build-Time Variables (VITE_*):"
    echo "$response" | jq -r '.[] | select(.is_preview == true and (.key | startswith("VITE_"))) | 
        "  \(.key) = \(.value)\n    Build Time: \(.is_build_time)"' || echo "  None found"
    echo ""
}

# Show manual steps
show_manual_steps() {
    print_header "Next Steps"
    
    echo "1. Verify variables in Coolify web UI:"
    print_info "   ${COOLIFY_URL}/application/$APP_UUID/environment-variables"
    echo ""
    echo "2. ⚠️  CRITICAL: Configure NODE_ENV manually in Coolify UI:"
    print_warning "   - Find NODE_ENV variable"
    print_warning "   - UNCHECK 'Available at Buildtime'"
    print_warning "   - Keep 'Available at Runtime' CHECKED"
    print_warning "   - Set value to: production"
    print_warning "   - This is required or build will fail!"
    echo ""
    echo "3. Verify VITE_* variables are set as 'Build & Runtime'"
    echo ""
    echo "4. After first deployment, update Zitadel credentials:"
    echo "   - ZITADEL_CLIENT_ID"
    echo "   - ZITADEL_CLIENT_SECRET"
    echo "   - ZITADEL_MAIN_ORG_ID"
    echo "   - VITE_ZITADEL_CLIENT_ID (same as ZITADEL_CLIENT_ID)"
    echo ""
    echo "5. Trigger a new deployment"
    echo ""
    
    print_info "For detailed deployment guide, see: docs/COOLIFY_DEPLOYMENT.md"
}

# Cleanup temporary files
cleanup() {
    local runtime_file="${PROJECT_ROOT}/.env.${ENV_NAME}.runtime"
    local buildtime_file="${PROJECT_ROOT}/.env.${ENV_NAME}.buildtime"
    
    rm -f "$runtime_file" "$buildtime_file"
}

# Main execution
main() {
    print_header "Coolify Environment Update Script (API Mode)"
    echo "This script updates Coolify environment variables using direct API calls"
    echo ""
    
    # Parse command line arguments
    parse_args "$@"
    
    print_info "Environment: ${ENV_NAME}"
    print_info "Config file: .env.${ENV_NAME}"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Get APP_UUID
    get_app_uuid
    
    # Prepare environment files
    local runtime_file buildtime_file
    read -r runtime_file buildtime_file <<< "$(prepare_env_files)"
    
    # Sync runtime variables
    sync_runtime_vars "$runtime_file"
    
    # Update build-time variables
    update_buildtime_vars "$buildtime_file"
    
    # Verify configuration
    verify_config
    
    # Show manual steps
    show_manual_steps
    
    # Cleanup
    cleanup
    
    print_header "Update Complete"
    print_success "Environment variables have been updated in Coolify via API"
    print_warning "Review the verification output above"
}

# Run main function
main "$@"
