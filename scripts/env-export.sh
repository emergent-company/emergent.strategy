#!/usr/bin/env bash

# =============================================================================
# Environment Export Script
# =============================================================================
# 
# Exports Infisical secrets to .env files for fallback/troubleshooting.
# This script is primarily for local development when Infisical is unavailable.
#
# ⚠️ WARNING: Dev/staging/production should ALWAYS use Infisical directly.
# This script is NOT intended for production use.
#
# Usage:
#   ./scripts/env-export.sh [options]
#
# Options:
#   --env <environment>    Environment to export (local/dev/staging/production)
#   --path <path>          Specific Infisical path to export (/workspace, /docker, /server, /admin)
#   --output <file>        Output file (default: determined by path)
#   --overwrite            Overwrite existing files without prompting
#   --help                 Show this help message
#
# Examples:
#   ./scripts/env-export.sh --env local
#   ./scripts/env-export.sh --env local --path /server
#   ./scripts/env-export.sh --env staging --path /docker --output docker/.env.staging
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
PATH_FILTER=""
OUTPUT_FILE=""
OVERWRITE=false

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
Environment Export Script

Exports Infisical secrets to .env files for local development fallback.

⚠️ WARNING: This is for LOCAL DEVELOPMENT ONLY when Infisical is unavailable.
Dev/staging/production should ALWAYS use Infisical directly.

Usage:
  ./scripts/env-export.sh [options]

Options:
  --env <environment>    Environment to export (local/dev/staging/production)
                         If not specified, uses ENVIRONMENT from .env file
  --path <path>          Specific Infisical path to export (/workspace, /docker, /server, /admin)
  --output <file>        Output file (default: determined by path)
  --overwrite            Overwrite existing files without prompting
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
  # Export all paths for local environment
  ./scripts/env-export.sh                       # Use ENVIRONMENT from .env
  ./scripts/env-export.sh --env local           # Override ENVIRONMENT

  # Export only server secrets
  ./scripts/env-export.sh --path /server

  # Export to custom file
  ./scripts/env-export.sh --env staging --path /docker --output docker/.env.staging

Default Output Files:
  /workspace → .env
  /docker    → docker/.env
  /server    → apps/server/.env
  /admin     → apps/admin/.env

Limitations:
  - Exported .env files are static snapshots
  - Changes to Infisical won't be reflected until re-exported
  - Services must be restarted to load changes
  - NOT suitable for production environments

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

get_default_output_file() {
    local path=$1
    
    case "$path" in
        /workspace)
            echo "$PROJECT_ROOT/.env"
            ;;
        /docker)
            echo "$PROJECT_ROOT/docker/.env"
            ;;
        /server)
            echo "$PROJECT_ROOT/apps/server/.env"
            ;;
        /admin)
            echo "$PROJECT_ROOT/apps/admin/.env"
            ;;
        *)
            log_error "Unknown path: $path"
            exit 1
            ;;
    esac
}

export_path() {
    local env=$1
    local path=$2
    local output=$3
    
    log_info "Exporting $path for $env environment..."
    
    # Check if output file exists
    if [ -f "$output" ] && [ "$OVERWRITE" = false ]; then
        log_warning "File already exists: $output"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipped $path"
            return
        fi
    fi
    
    # Build domain flag if INFISICAL_HOST is set
    local domain_flag=""
    if [ -n "${INFISICAL_HOST:-}" ]; then
        domain_flag="--domain https://${INFISICAL_HOST}/api"
    fi
    
    # Create directory if needed
    mkdir -p "$(dirname "$output")"
    
    # Export secrets
    local temp_file
    temp_file=$(mktemp)
    
    if ! infisical export --env "$env" --path "$path" $domain_flag > "$temp_file" 2>/dev/null; then
        log_error "Failed to export $path"
        log_warning "Path may not exist or may be empty"
        rm -f "$temp_file"
        return 1
    fi
    
    # Add warning header
    cat > "$output" << EOF
# =============================================================================
# EXPORTED FROM INFISICAL - DO NOT EDIT DIRECTLY
# =============================================================================
#
# This file was automatically exported from Infisical.
# Environment: $env
# Path: $path
# Exported: $(date)
#
# ⚠️ WARNING:
# - This is a STATIC SNAPSHOT - changes to Infisical won't be reflected
# - Restart services after modifying this file
# - For local development FALLBACK ONLY when Infisical unavailable
# - Dev/staging/production should use Infisical directly
# - NEVER commit this file with real credentials
#
# To update from Infisical:
#   ./scripts/env-export.sh --env $env --path $path --overwrite
#
# To use Infisical directly (recommended):
#   - Ensure INFISICAL_ENABLED=true
#   - Restart services
#
# =============================================================================

EOF
    
    # Clean up the exported secrets by removing trailing whitespace from quoted values
    # This fixes an issue where Infisical export preserves trailing newlines in secrets
    # 
    # The issue: Infisical exports multi-line like this:
    #   KEY='value
    #   '
    # We need to convert to: KEY='value'
    #
    # Strategy: Join lines where a quote is on its own line, then trim whitespace
    
    # Use awk to handle multi-line quoted values
    awk '
    BEGIN { in_value = 0; line_buffer = "" }
    
    # Line with just a closing quote
    /^['\''"]$/ {
        if (in_value) {
            # Remove trailing whitespace before the quote
            gsub(/[[:space:]]+$/, "", line_buffer)
            print line_buffer $0
            in_value = 0
            line_buffer = ""
            next
        }
    }
    
    # Line starting with KEY= and opening quote but no closing quote
    /^[A-Z_][A-Z0-9_]*=['\''"]/ && !/['\''"]$/ {
        in_value = 1
        line_buffer = $0
        next
    }
    
    # If we are in a multi-line value, skip this line (its part of the value)
    {
        if (!in_value) {
            print $0
        }
    }
    ' "$temp_file" >> "$output"
    
    rm -f "$temp_file"
    
    log_success "Exported to: $output"
    
    # Show file size and secret count
    local secret_count
    secret_count=$(grep -c "^[A-Z_]" "$output" || echo "0")
    local file_size
    file_size=$(du -h "$output" | cut -f1)
    log_info "  Secrets: $secret_count, Size: $file_size"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    echo ""
    echo "=========================================="
    echo "  Environment Export Script"
    echo "=========================================="
    echo ""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --path)
                PATH_FILTER="$2"
                shift 2
                ;;
            --output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --overwrite)
                OVERWRITE=true
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
    
    # Warn if not local
    if [ "$ENVIRONMENT" != "local" ]; then
        log_warning "Exporting $ENVIRONMENT environment to .env files"
        log_warning "This is NOT recommended for dev/staging/production"
        log_warning "These environments should use Infisical directly"
        echo ""
        read -p "Are you sure you want to continue? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Aborted"
            exit 0
        fi
    fi
    
    log_info "Environment: $ENVIRONMENT"
    
    # Check prerequisites
    check_prerequisites
    
    echo ""
    log_info "Starting export..."
    echo ""
    
    # Export specific path or all paths
    if [ -n "$PATH_FILTER" ]; then
        # Export single path
        local output
        if [ -n "$OUTPUT_FILE" ]; then
            output="$OUTPUT_FILE"
        else
            output=$(get_default_output_file "$PATH_FILTER")
        fi
        
        export_path "$ENVIRONMENT" "$PATH_FILTER" "$output"
    else
        # Export all paths
        if [ -n "$OUTPUT_FILE" ]; then
            log_error "Cannot use --output without --path"
            echo "Specify --path when using --output"
            exit 1
        fi
        
        for path in "/workspace" "/docker" "/server" "/admin"; do
            local output
            output=$(get_default_output_file "$path")
            export_path "$ENVIRONMENT" "$path" "$output" || true
            echo ""
        done
    fi
    
    echo "=========================================="
    log_success "EXPORT COMPLETE"
    echo ""
    echo "Next steps:"
    echo "  1. Review exported .env files"
    echo "  2. Update any placeholder values (API keys, passwords)"
    echo "  3. Restart services to load new configuration:"
    echo "     npm run workspace:restart"
    echo ""
    echo "⚠️ IMPORTANT:"
    echo "  - Exported files are STATIC - won't update from Infisical automatically"
    echo "  - Re-run this script to refresh from Infisical"
    echo "  - Consider using Infisical directly (INFISICAL_ENABLED=true)"
    echo "  - NEVER commit .env files with real credentials"
    echo "=========================================="
    echo ""
}

main "$@"
