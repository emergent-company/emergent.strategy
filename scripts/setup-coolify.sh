#!/usr/bin/env bash
# Coolify Environment Configuration Script
# 
# This script generates a complete environment configuration for deploying
# the Spec Server application to Coolify. It:
# - Generates secure random passwords and encryption keys
# - Validates domain formats
# - Creates a complete .env file ready for Coolify
# - Provides step-by-step deployment instructions
#
# Usage:
#   ./scripts/setup-coolify.sh
#
# Output:
#   - coolify.env: Environment variables file for Coolify
#   - Instructions for completing Zitadel setup

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
OUTPUT_FILE="${PROJECT_ROOT}/.env.staging"

# Utility functions
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

# Generate secure random password
generate_password() {
    openssl rand -base64 24 | tr -d "=+/" | cut -c1-24
}

# Generate 32-character key
generate_key() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Validate and normalize domain format
validate_domain() {
    local domain="$1"
    
    # Strip protocol if provided
    domain="${domain#http://}"
    domain="${domain#https://}"
    
    # Strip trailing slash
    domain="${domain%/}"
    
    # Basic domain format check (allow subdomains, hyphens, etc.)
    if [[ ! "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$ ]]; then
        return 1
    fi
    
    # Return normalized domain
    echo "$domain"
    return 0
}

# Prompt for input with validation
prompt_input() {
    local prompt="$1"
    local var_name="$2"
    local validator="${3:-}"
    local default="${4:-}"
    
    while true; do
        if [[ -n "$default" ]]; then
            read -p "$(echo -e ${BLUE}${prompt}${NC} [${default}]: )" value
            value="${value:-$default}"
        else
            read -p "$(echo -e ${BLUE}${prompt}${NC}: )" value
        fi
        
        if [[ -z "$value" ]]; then
            print_error "Value cannot be empty"
            continue
        fi
        
        if [[ -n "$validator" ]]; then
            # Validator should normalize and return the value
            if normalized=$($validator "$value" 2>&1); then
                value="$normalized"
            else
                print_error "Invalid format. Please enter domain without http:// or https://"
                continue
            fi
        fi
        
        eval "$var_name='$value'"
        break
    done
}

# Main script
main() {
    print_header "Coolify Environment Configuration Generator"
    
    echo "This script will help you generate a complete environment configuration"
    echo "for deploying Spec Server to Coolify (staging environment)."
    echo ""
    echo "You will be asked to provide:"
    echo "  - Domain names for your services"
    echo "  - Organization and admin details"
    echo "  - Google API Key"
    echo ""
    echo "The script will generate:"
    echo "  - Secure random passwords for databases"
    echo "  - 32-character encryption keys"
    echo "  - Complete .env.staging file"
    echo ""
    
    read -p "Press Enter to continue..."
    
    # Domain Configuration
    print_header "Domain Configuration"
    
    # Initialize variables
    EXISTING_ZITADEL_DOMAIN=""
    EXISTING_API_DOMAIN=""
    EXISTING_APP_DOMAIN=""
    
    # Check for existing .env.staging file first (primary source)
    STAGING_ENV="${PROJECT_ROOT}/.env.staging"
    LOCAL_ENV="${PROJECT_ROOT}/.env"
    
    if [[ -f "$STAGING_ENV" ]]; then
        print_info "Found existing .env.staging. Loading defaults..."
        EXISTING_ZITADEL_DOMAIN=$(grep "^ZITADEL_DOMAIN=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        EXISTING_API_DOMAIN=$(grep "^VITE_API_URL=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- | sed 's|https\?://||' || echo "")
        EXISTING_APP_DOMAIN=$(grep "^CORS_ORIGIN=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- | sed 's|https\?://||' || echo "")
    elif [[ -f "$LOCAL_ENV" ]]; then
        print_info "No .env.staging found. Reading from local .env for defaults..."
        # Extract from local .env (using localhost values as basis, user can override)
        EXISTING_ZITADEL_DOMAIN=$(grep "^ZITADEL_EXTERNALDOMAIN=" "$LOCAL_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        EXISTING_API_DOMAIN=$(grep "^ZITADEL_EXTERNALDOMAIN=" "$LOCAL_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        EXISTING_APP_DOMAIN=$(grep "^ZITADEL_EXTERNALDOMAIN=" "$LOCAL_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
    fi
    
    print_info "Enter your domain names (with or without http:// or https://)"
    echo "Press Enter to keep existing values if shown."
    echo ""
    
    prompt_input "Zitadel Auth Domain" ZITADEL_DOMAIN validate_domain "${EXISTING_ZITADEL_DOMAIN}"
    prompt_input "Backend API Domain" API_DOMAIN validate_domain "${EXISTING_API_DOMAIN}"
    prompt_input "Frontend App Domain" APP_DOMAIN validate_domain "${EXISTING_APP_DOMAIN}"
    
    print_success "Domains configured"
    print_info "Using:"
    echo "  Zitadel: ${ZITADEL_DOMAIN}"
    echo "  API: ${API_DOMAIN}"
    echo "  App: ${APP_DOMAIN}"
    
    # Organization Configuration
    print_header "Organization Configuration"
    
    # Initialize variables
    EXISTING_ORG_NAME=""
    EXISTING_ADMIN_EMAIL=""
    EXISTING_ADMIN_FIRSTNAME=""
    EXISTING_ADMIN_LASTNAME=""
    
    # Load existing values if available
    if [[ -f "$STAGING_ENV" ]]; then
        EXISTING_ORG_NAME=$(grep "^ZITADEL_ORG_NAME=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        EXISTING_ADMIN_EMAIL=$(grep "^ZITADEL_ADMIN_USERNAME=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        EXISTING_ADMIN_FIRSTNAME=$(grep "^ZITADEL_ADMIN_FIRSTNAME=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        EXISTING_ADMIN_LASTNAME=$(grep "^ZITADEL_ADMIN_LASTNAME=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
    elif [[ -f "$LOCAL_ENV" ]]; then
        # Read from local .env
        EXISTING_ORG_NAME=$(grep "^ZITADEL_FIRSTINSTANCE_ORG_NAME=" "$LOCAL_ENV" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        EXISTING_ADMIN_EMAIL=$(grep "^ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME=" "$LOCAL_ENV" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        # No firstname/lastname in local .env, use defaults
    fi
    
    prompt_input "Organization Name" ORG_NAME "" "${EXISTING_ORG_NAME:-Spec Server}"
    prompt_input "Admin Email" ADMIN_EMAIL "" "${EXISTING_ADMIN_EMAIL:-admin@${ZITADEL_DOMAIN}}"
    prompt_input "Admin First Name" ADMIN_FIRSTNAME "" "${EXISTING_ADMIN_FIRSTNAME:-Admin}"
    prompt_input "Admin Last Name" ADMIN_LASTNAME "" "${EXISTING_ADMIN_LASTNAME:-User}"
    
    print_success "Organization details configured"
    
    # Google API Configuration
    print_header "Google API Configuration"
    
    # Initialize variable
    EXISTING_GOOGLE_API_KEY=""
    
    # Load existing value if available
    if [[ -f "$STAGING_ENV" ]]; then
        EXISTING_GOOGLE_API_KEY=$(grep "^GOOGLE_API_KEY=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
    fi
    
    # Note: local .env uses ADC, not API key, so we can't load it from there
    
    print_info "You need a Google Cloud API key with access to:"
    echo "  - Vertex AI API"
    echo "  - Text Embedding API"
    echo ""
    
    if [[ -n "$EXISTING_GOOGLE_API_KEY" ]]; then
        # Mask the existing key for security
        MASKED_KEY="${EXISTING_GOOGLE_API_KEY:0:10}...${EXISTING_GOOGLE_API_KEY: -4}"
        prompt_input "Google API Key (or press Enter to keep: $MASKED_KEY)" GOOGLE_API_KEY_INPUT "" "$EXISTING_GOOGLE_API_KEY"
        GOOGLE_API_KEY="$GOOGLE_API_KEY_INPUT"
    else
        print_warning "No existing API key found. You must enter one for Coolify deployment."
        prompt_input "Google API Key" GOOGLE_API_KEY
    fi
    
    print_success "Google API key configured"
    
    # Generate Secure Values
    print_header "Generating Secure Values"
    
    # Initialize variables
    EXISTING_POSTGRES_PASSWORD=""
    EXISTING_ADMIN_PASSWORD=""
    EXISTING_ZITADEL_MASTERKEY=""
    EXISTING_INTEGRATION_ENCRYPTION_KEY=""
    
    # Check if we should reuse existing secure values
    REUSE_SECRETS=false
    if [[ -f "$STAGING_ENV" ]]; then
        EXISTING_POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        EXISTING_ADMIN_PASSWORD=$(grep "^ZITADEL_ADMIN_PASSWORD=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        EXISTING_ZITADEL_MASTERKEY=$(grep "^ZITADEL_MASTERKEY=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        EXISTING_INTEGRATION_ENCRYPTION_KEY=$(grep "^INTEGRATION_ENCRYPTION_KEY=" "$STAGING_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        
        if [[ -n "$EXISTING_POSTGRES_PASSWORD" ]]; then
            print_info "Found existing secure values."
            read -p "$(echo -e ${YELLOW}Reuse existing passwords and keys? [Y/n]:${NC} )" reuse_response
            if [[ -z "$reuse_response" || "$reuse_response" =~ ^[Yy] ]]; then
                REUSE_SECRETS=true
                print_success "Reusing existing secure values"
            fi
        fi
    fi
    
    if [[ "$REUSE_SECRETS" == true ]]; then
        POSTGRES_PASSWORD="$EXISTING_POSTGRES_PASSWORD"
        ADMIN_PASSWORD="$EXISTING_ADMIN_PASSWORD"
        ZITADEL_MASTERKEY="$EXISTING_ZITADEL_MASTERKEY"
        INTEGRATION_ENCRYPTION_KEY="$EXISTING_INTEGRATION_ENCRYPTION_KEY"
    else
        print_info "Generating new secure passwords and encryption keys..."
        
        POSTGRES_PASSWORD=$(generate_password)
        ADMIN_PASSWORD=$(generate_password)
        ZITADEL_MASTERKEY=$(generate_key)
        INTEGRATION_ENCRYPTION_KEY=$(generate_key)
        
        print_success "Generated database password"
        print_success "Generated admin password"
        print_success "Generated Zitadel master key"
        print_success "Generated integration encryption key"
    fi
    
    # Create Environment File
    print_header "Creating Environment Configuration"
    
    cat > "$OUTPUT_FILE" <<EOF
# Coolify Staging Environment Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
#
# ⚠️  IMPORTANT: In Coolify, configure these variables as follows:
#
# NODE_ENV              → Runtime Only
# VITE_API_URL          → Build & Runtime
# VITE_ZITADEL_ISSUER   → Build & Runtime
# VITE_ZITADEL_CLIENT_ID → Build & Runtime
# VITE_APP_ENV          → Build & Runtime
#
# All other variables   → Runtime Only (default)
#
# After first deployment, update these from Zitadel:
# - ZITADEL_CLIENT_ID
# - ZITADEL_CLIENT_SECRET
# - ZITADEL_MAIN_ORG_ID

# ═══════════════════════════════════════════════════════════
# Database Configuration
# ═══════════════════════════════════════════════════════════

POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER=spec
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=spec

# ═══════════════════════════════════════════════════════════
# Zitadel Authentication
# ═══════════════════════════════════════════════════════════

# Domain Configuration
ZITADEL_DOMAIN=${ZITADEL_DOMAIN}
ZITADEL_ISSUER=https://${ZITADEL_DOMAIN}
ZITADEL_INTROSPECTION_URL=https://${ZITADEL_DOMAIN}/oauth/v2/introspect

# Initial Admin Setup (used only on first deployment)
ZITADEL_ORG_NAME=${ORG_NAME}
ZITADEL_ADMIN_USERNAME=${ADMIN_EMAIL}
ZITADEL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
ZITADEL_ADMIN_FIRSTNAME=${ADMIN_FIRSTNAME}
ZITADEL_ADMIN_LASTNAME=${ADMIN_LASTNAME}
ZITADEL_MASTERKEY=${ZITADEL_MASTERKEY}

# Client Configuration (⚠️ UPDATE AFTER FIRST DEPLOYMENT)
ZITADEL_CLIENT_ID=REPLACE_AFTER_ZITADEL_SETUP
ZITADEL_CLIENT_SECRET=REPLACE_AFTER_ZITADEL_SETUP
ZITADEL_MAIN_ORG_ID=REPLACE_AFTER_ZITADEL_SETUP

# ═══════════════════════════════════════════════════════════
# Backend API Configuration
# ═══════════════════════════════════════════════════════════

# Server Runtime
PORT=3002
NODE_ENV=production
DB_AUTOINIT=true

# Google AI/Embeddings
GOOGLE_API_KEY=${GOOGLE_API_KEY}
EMBEDDING_DIMENSION=1536

# Integration Security
INTEGRATION_ENCRYPTION_KEY=${INTEGRATION_ENCRYPTION_KEY}

# CORS Configuration
CORS_ORIGIN=https://${APP_DOMAIN}

# Optional Features
ORGS_DEMO_SEED=false
CHAT_ENABLE_MCP=1

# ═══════════════════════════════════════════════════════════
# Frontend Configuration (Build & Runtime)
# ═══════════════════════════════════════════════════════════

VITE_API_URL=https://${API_DOMAIN}
VITE_ZITADEL_ISSUER=https://${ZITADEL_DOMAIN}
VITE_ZITADEL_CLIENT_ID=REPLACE_AFTER_ZITADEL_SETUP
VITE_APP_ENV=production

# ═══════════════════════════════════════════════════════════
# Notes
# ═══════════════════════════════════════════════════════════

# 1. Copy all variables to Coolify environment settings
# 2. Set NODE_ENV as "Runtime Only" (CRITICAL!)
# 3. Set all VITE_* variables as "Build & Runtime"
# 4. Deploy application
# 5. Configure Zitadel (see instructions below)
# 6. Update ZITADEL_CLIENT_ID, ZITADEL_CLIENT_SECRET, ZITADEL_MAIN_ORG_ID
# 7. Redeploy application

EOF
    
    print_success "Environment file created: ${OUTPUT_FILE}"
    
    # Display Next Steps
    print_header "Next Steps"
    
    echo "1. Copy environment variables to Coolify:"
    echo "   ${OUTPUT_FILE}"
    echo ""
    
    print_warning "CRITICAL: Configure NODE_ENV in Coolify"
    echo "   - Find NODE_ENV variable in Coolify"
    echo "   - Change from 'Build & Runtime' to 'Runtime Only'"
    echo "   - This prevents build failures"
    echo ""
    
    echo "2. Configure VITE_* variables as 'Build & Runtime'"
    echo "   - VITE_API_URL"
    echo "   - VITE_ZITADEL_ISSUER"
    echo "   - VITE_ZITADEL_CLIENT_ID"
    echo "   - VITE_APP_ENV"
    echo ""
    
    echo "3. Deploy application in Coolify"
    echo ""
    
    echo "4. After deployment, configure Zitadel:"
    echo "   a. Access Zitadel: https://${ZITADEL_DOMAIN}"
    echo "   b. Login with:"
    echo "      Email: ${ADMIN_EMAIL}"
    echo "      Password: ${ADMIN_PASSWORD}"
    echo ""
    echo "   c. Create Web Application:"
    echo "      - Go to your organization"
    echo "      - Create new 'Web Application'"
    echo "      - Set redirect URIs:"
    echo "        • https://${APP_DOMAIN}/callback"
    echo "        • https://${APP_DOMAIN}"
    echo "      - Save and copy Client ID and Client Secret"
    echo ""
    echo "   d. Get Organization ID:"
    echo "      - Navigate to organization settings"
    echo "      - Copy Organization ID"
    echo ""
    
    echo "5. Update Coolify environment variables:"
    echo "   - ZITADEL_CLIENT_ID (from step 4c)"
    echo "   - ZITADEL_CLIENT_SECRET (from step 4c)"
    echo "   - ZITADEL_MAIN_ORG_ID (from step 4d)"
    echo "   - VITE_ZITADEL_CLIENT_ID (same as ZITADEL_CLIENT_ID)"
    echo ""
    
    echo "6. Redeploy application"
    echo ""
    
    print_header "Important Security Notes"
    
    print_warning "Keep these credentials secure:"
    echo "  - Postgres Password: ${POSTGRES_PASSWORD}"
    echo "  - Admin Password: ${ADMIN_PASSWORD}"
    echo "  - Zitadel Master Key: ${ZITADEL_MASTERKEY}"
    echo "  - Integration Encryption Key: ${INTEGRATION_ENCRYPTION_KEY}"
    echo ""
    echo "Store these in a password manager immediately!"
    echo ""
    
    print_info "For detailed deployment guide, see:"
    echo "  docs/COOLIFY_DEPLOYMENT.md"
    echo ""
    
    print_success "Configuration complete!"
}

# Run main function
main "$@"
