#!/usr/bin/env bash

# =============================================================================
# Environment Initialization Script
# =============================================================================
# 
# Populates Infisical with default values from .env.example files.
# This script helps initialize a new environment (local/dev/staging/production)
# with sensible defaults.
#
# Usage:
#   ./scripts/env-init.sh [options]
#
# Options:
#   --env <environment>    Environment to initialize (local/dev/staging/production)
#   --dry-run              Show what would be set without actually setting
#   --force                Overwrite existing secrets without prompting
#   --backup               Backup existing secrets before overwriting
#   --help                 Show this help message
#
# Examples:
#   ./scripts/env-init.sh --env local
#   ./scripts/env-init.sh --env staging --dry-run
#   ./scripts/env-init.sh --env production --backup
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load ENVIRONMENT from .env file if it exists
if [ -f "$PROJECT_ROOT/.env" ]; then
    # Use grep to extract ENVIRONMENT, avoiding issues with other variables
    ENV_FROM_FILE=$(grep -E '^ENVIRONMENT=' "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | xargs || echo "")
    if [ -n "$ENV_FROM_FILE" ]; then
        ENVIRONMENT="$ENV_FROM_FILE"
    else
        ENVIRONMENT=""
    fi
else
    ENVIRONMENT=""
fi

# Load INFISICAL_TOKEN and other overrides from .env.local if it exists
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # Export variables from .env.local (mainly INFISICAL_TOKEN)
    set -a
    source "$PROJECT_ROOT/.env.local"
    set +a
    
    # .env.local can override ENVIRONMENT too
    if [ -n "${ENVIRONMENT:-}" ]; then
        ENV_FROM_FILE="$ENVIRONMENT"
    fi
fi

# Use the loaded ENVIRONMENT as default
ENVIRONMENT="${ENV_FROM_FILE:-}"

# Default values (ENVIRONMENT loaded from .env above, can be overridden by --env flag)
DRY_RUN=false
FORCE=false
BACKUP=false

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    cat << EOF
Environment Initialization Script

Populates Infisical with default values from .env.example files.

Usage:
  ./scripts/env-init.sh [options]

Options:
  --env <environment>    Environment to initialize (local/dev/staging/production)
                         If not specified, uses ENVIRONMENT from .env file
  --dry-run              Show what would be set without actually setting
  --force                Overwrite existing secrets without prompting
  --backup               Backup existing secrets before overwriting
  --help                 Show this help message

Configuration:
  Set ENVIRONMENT in .env file to avoid passing --env every time:
    echo "ENVIRONMENT=dev" >> .env

Authentication:
  The script supports two authentication methods:
  
  1. Interactive login (local development):
     infisical login
     infisical init
  
  2. Service token (CI/CD, remote):
     Set INFISICAL_TOKEN in .env.local:
     echo "INFISICAL_TOKEN=st.your-token-here" >> .env.local

Examples:
  ./scripts/env-init.sh                         # Use ENVIRONMENT from .env
  ./scripts/env-init.sh --env local             # Override ENVIRONMENT
  ./scripts/env-init.sh --env staging --dry-run
  ./scripts/env-init.sh --env production --backup

Infisical Paths:
  /workspace - Workspace configuration (~15 secrets)
  /docker    - Docker dependencies (~11 secrets)
  /server    - Backend application (~118 secrets)
  /admin     - Frontend application (~10 secrets)

Environment-Specific Transformations:
  - Local: Uses localhost domains and ports
  - Dev: Uses dev-specific domains
  - Staging: Uses staging domains with HTTPS
  - Production: Uses production domains with HTTPS

EOF
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if infisical CLI is installed
    if ! command -v infisical &> /dev/null; then
        log_error "Infisical CLI is not installed"
        echo "Install it with: brew install infisical/get-cli/infisical"
        echo "Or see: https://infisical.com/docs/cli/overview"
        exit 1
    fi
    
    # Check if authenticated (either via login or token)
    if [ -z "$INFISICAL_TOKEN" ]; then
        # No token, check if logged in
        if ! infisical user &> /dev/null; then
            log_error "Not authenticated with Infisical"
            echo ""
            echo "Option 1 (Local development - recommended):"
            echo "  Run: infisical login"
            echo ""
            echo "Option 2 (CI/CD or remote - use service token):"
            echo "  Set INFISICAL_TOKEN in .env.local:"
            echo "  echo 'INFISICAL_TOKEN=st.your-token-here' >> .env.local"
            echo ""
            echo "Get your token from: https://infiscal.kucharz.net"
            exit 1
        fi
        log_info "Using Infisical interactive login"
    else
        log_info "Using INFISICAL_TOKEN from environment"
    fi
    
    # Check if .infisical.json exists (only required for interactive login)
    if [ -z "$INFISICAL_TOKEN" ] && [ ! -f "$PROJECT_ROOT/.infisical.json" ]; then
        log_error ".infisical.json not found"
        echo "Run: infisical init"
        echo "Or set INFISICAL_TOKEN in .env.local for token-based authentication"
        exit 1
    fi
    
    log_success "Prerequisites OK"
}

parse_env_file() {
    local file=$1
    local skip_secrets=${2:-false}
    
    if [ ! -f "$file" ]; then
        log_warning "File not found: $file"
        return
    fi
    
    # Parse .env file, skip comments and empty lines
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        if [[ $key =~ ^[[:space:]]*# ]] || [[ -z $key ]]; then
            continue
        fi
        
        # Trim whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        
        # Skip if key is empty
        if [[ -z $key ]]; then
            continue
        fi
        
        # Skip secrets if requested (lines with SECRET comment)
        if [ "$skip_secrets" = true ]; then
            if grep -q "$key.*SECRET" "$file"; then
                continue
            fi
        fi
        
        echo "$key=$value"
    done < <(grep -v '^[[:space:]]*#' "$file" | grep '=')
}

transform_value_for_env() {
    local key=$1
    local value=$2
    local env=$3
    
    # Environment-specific transformations
    case "$env" in
        local)
            # Local uses localhost
            value=$(echo "$value" | sed 's|https://|http://|g')
            value=$(echo "$value" | sed 's|auth\.example\.com|localhost:8200|g')
            value=$(echo "$value" | sed 's|api\.example\.com|localhost:3002|g')
            value=$(echo "$value" | sed 's|app\.example\.com|localhost:5176|g')
            ;;
        dev)
            # Dev uses dev-specific domains
            value=$(echo "$value" | sed 's|http://localhost:8200|https://auth-dev.example.com|g')
            value=$(echo "$value" | sed 's|http://localhost:3002|https://api-dev.example.com|g')
            value=$(echo "$value" | sed 's|http://localhost:5176|https://app-dev.example.com|g')
            value=$(echo "$value" | sed 's|localhost:8200|auth-dev.example.com|g')
            value=$(echo "$value" | sed 's|localhost|dev-db.internal|g') # For database host
            ;;
        staging)
            # Staging uses staging-specific domains
            value=$(echo "$value" | sed 's|http://localhost:8200|https://auth-staging.example.com|g')
            value=$(echo "$value" | sed 's|http://localhost:3002|https://api-staging.example.com|g')
            value=$(echo "$value" | sed 's|http://localhost:5176|https://app-staging.example.com|g')
            value=$(echo "$value" | sed 's|localhost:8200|auth-staging.example.com|g')
            value=$(echo "$value" | sed 's|localhost|postgres|g') # Docker service name
            ;;
        production)
            # Production uses production domains
            value=$(echo "$value" | sed 's|http://localhost:8200|https://auth.example.com|g')
            value=$(echo "$value" | sed 's|http://localhost:3002|https://api.example.com|g')
            value=$(echo "$value" | sed 's|http://localhost:5176|https://app.example.com|g')
            value=$(echo "$value" | sed 's|localhost:8200|auth.example.com|g')
            value=$(echo "$value" | sed 's|localhost|postgres|g') # Docker service name
            ;;
    esac
    
    echo "$value"
}

set_secret() {
    local key=$1
    local value=$2
    local env=$3
    local path=$4
    
    # Build domain flag if INFISICAL_HOST is set
    local domain_flag=""
    if [ -n "${INFISICAL_HOST:-}" ]; then
        domain_flag="--domain https://${INFISICAL_HOST}/api"
    fi
    
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY-RUN] Would set: $key=$value (env: $env, path: $path)"
        return
    fi
    
    # Check if secret already exists
    local existing_value
    existing_value=$(infisical secrets get "$key" --env "$env" --path "$path" $domain_flag 2>/dev/null | grep -oP '(?<=Value: ).*' || echo "")
    
    if [ -n "$existing_value" ] && [ "$FORCE" = false ]; then
        log_warning "Secret $key already exists at $path"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipped $key"
            return
        fi
    fi
    
    # Set the secret
    if infisical secrets set "$key=$value" --env "$env" --path "$path" $domain_flag &> /dev/null; then
        log_success "Set $key at $path"
    else
        log_error "Failed to set $key at $path"
    fi
}

backup_secrets() {
    local env=$1
    local backup_dir="$PROJECT_ROOT/backups/infisical"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    
    # Build domain flag if INFISICAL_HOST is set
    local domain_flag=""
    if [ -n "${INFISICAL_HOST:-}" ]; then
        domain_flag="--domain https://${INFISICAL_HOST}/api"
    fi
    
    mkdir -p "$backup_dir"
    
    log_info "Backing up secrets for $env environment..."
    
    for path in "/workspace" "/docker" "/server" "/admin"; do
        local backup_file="$backup_dir/${env}${path//\//-}-${timestamp}.env"
        if infisical export --env "$env" --path "$path" $domain_flag > "$backup_file" 2>/dev/null; then
            log_success "Backed up $path to $backup_file"
        else
            log_warning "Could not backup $path (may not exist yet)"
        fi
    done
}

initialize_workspace_secrets() {
    local env=$1
    
    log_info "Initializing /workspace secrets..."
    
    local env_file="$PROJECT_ROOT/.env.example"
    
    while IFS='=' read -r line; do
        if [[ -z $line ]] || [[ $line =~ ^# ]]; then
            continue
        fi
        
        local key=$(echo "$line" | cut -d'=' -f1 | xargs)
        local value=$(echo "$line" | cut -d'=' -f2- | xargs)
        
        # Skip empty keys
        if [[ -z $key ]]; then
            continue
        fi
        
        # Transform value for environment
        value=$(transform_value_for_env "$key" "$value" "$env")
        
        # Set secret
        set_secret "$key" "$value" "$env" "/workspace"
        
    done < <(parse_env_file "$env_file")
}

initialize_docker_secrets() {
    local env=$1
    
    log_info "Initializing /docker secrets..."
    
    # Docker secrets from docker/.env.example
    local env_file="$PROJECT_ROOT/docker/.env.example"
    
    if [ ! -f "$env_file" ]; then
        log_warning "Docker .env.example not found, using defaults"
        # Set common Docker defaults
        set_secret "POSTGRES_USER" "spec" "$env" "/docker"
        set_secret "POSTGRES_PASSWORD" "spec" "$env" "/docker"
        set_secret "POSTGRES_DB" "spec_db" "$env" "/docker"
        set_secret "ZITADEL_MASTERKEY" "MasterkeyNeedsToHave32Characters" "$env" "/docker"
        set_secret "ZITADEL_EXTERNALDOMAIN" "$(transform_value_for_env "ZITADEL_DOMAIN" "localhost:8200" "$env")" "$env" "/docker"
        
        if [ "$env" = "local" ]; then
            set_secret "ZITADEL_EXTERNALSECURE" "false" "$env" "/docker"
        else
            set_secret "ZITADEL_EXTERNALSECURE" "true" "$env" "/docker"
        fi
        return
    fi
    
    while IFS='=' read -r line; do
        if [[ -z $line ]] || [[ $line =~ ^# ]]; then
            continue
        fi
        
        local key=$(echo "$line" | cut -d'=' -f1 | xargs)
        local value=$(echo "$line" | cut -d'=' -f2- | xargs)
        
        if [[ -z $key ]]; then
            continue
        fi
        
        value=$(transform_value_for_env "$key" "$value" "$env")
        set_secret "$key" "$value" "$env" "/docker"
        
    done < <(parse_env_file "$env_file")
}

initialize_server_secrets() {
    local env=$1
    
    log_info "Initializing /server secrets..."
    
    local env_file="$PROJECT_ROOT/apps/server/.env.example"
    
    while IFS='=' read -r line; do
        if [[ -z $line ]] || [[ $line =~ ^# ]]; then
            continue
        fi
        
        local key=$(echo "$line" | cut -d'=' -f1 | xargs)
        local value=$(echo "$line" | cut -d'=' -f2- | xargs)
        
        if [[ -z $key ]]; then
            continue
        fi
        
        value=$(transform_value_for_env "$key" "$value" "$env")
        set_secret "$key" "$value" "$env" "/server"
        
    done < <(parse_env_file "$env_file")
}

initialize_admin_secrets() {
    local env=$1
    
    log_info "Initializing /admin secrets..."
    
    local env_file="$PROJECT_ROOT/apps/admin/.env.example"
    
    if [ ! -f "$env_file" ]; then
        log_warning "Admin .env.example not found, using defaults"
        # Set common admin defaults
        set_secret "VITE_ZITADEL_ISSUER" "$(transform_value_for_env "ZITADEL_ISSUER" "http://localhost:8200" "$env")" "$env" "/admin"
        set_secret "VITE_ZITADEL_CLIENT_ID" "your-client-id-here" "$env" "/admin"
        set_secret "VITE_API_BASE" "" "$env" "/admin"
        set_secret "ADMIN_PORT" "5176" "$env" "/admin"
        return
    fi
    
    while IFS='=' read -r line; do
        if [[ -z $line ]] || [[ $line =~ ^# ]]; then
            continue
        fi
        
        local key=$(echo "$line" | cut -d'=' -f1 | xargs)
        local value=$(echo "$line" | cut -d'=' -f2- | xargs)
        
        if [[ -z $key ]]; then
            continue
        fi
        
        value=$(transform_value_for_env "$key" "$value" "$env")
        set_secret "$key" "$value" "$env" "/admin"
        
    done < <(parse_env_file "$env_file")
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    echo ""
    echo "=========================================="
    echo "  Environment Initialization Script"
    echo "=========================================="
    echo ""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --backup)
                BACKUP=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    # Validate environment
    if [ -z "$ENVIRONMENT" ]; then
        log_error "Environment not specified"
        echo "Use: --env <local|dev|staging|production>"
        echo "Or set ENVIRONMENT in .env file"
        exit 1
    fi
    
    if [[ ! "$ENVIRONMENT" =~ ^(local|dev|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        echo "Must be one of: local, dev, staging, production"
        exit 1
    fi
    
    log_info "Environment: $ENVIRONMENT"
    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY RUN MODE - No changes will be made"
    fi
    
    # Check prerequisites
    check_prerequisites
    
    # Backup if requested
    if [ "$BACKUP" = true ] && [ "$DRY_RUN" = false ]; then
        backup_secrets "$ENVIRONMENT"
    fi
    
    # Confirm before proceeding (unless force or dry-run)
    if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ]; then
        echo ""
        log_warning "This will populate Infisical secrets for $ENVIRONMENT environment"
        log_warning "Existing secrets may be overwritten (you will be prompted)"
        read -p "Continue? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Aborted"
            exit 0
        fi
    fi
    
    echo ""
    log_info "Starting initialization..."
    echo ""
    
    # Initialize all paths
    initialize_workspace_secrets "$ENVIRONMENT"
    echo ""
    initialize_docker_secrets "$ENVIRONMENT"
    echo ""
    initialize_server_secrets "$ENVIRONMENT"
    echo ""
    initialize_admin_secrets "$ENVIRONMENT"
    
    echo ""
    echo "=========================================="
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN COMPLETE"
        echo "Run without --dry-run to apply changes"
    else
        log_success "INITIALIZATION COMPLETE"
        echo ""
        echo "Next steps:"
        echo "  1. Review secrets: infisical secrets list --env $ENVIRONMENT --path /workspace"
        echo "  2. Update bootstrap-generated values after running bootstrap:"
        echo "     - ZITADEL_ORG_ID"
        echo "     - ZITADEL_PROJECT_ID"
        echo "     - ZITADEL_OAUTH_CLIENT_ID"
        echo "     - VITE_ZITADEL_CLIENT_ID"
        echo "  3. Update sensitive values (API keys, passwords)"
        echo "  4. Start services to test configuration"
    fi
    echo "=========================================="
    echo ""
}

main "$@"
