#!/bin/bash
# =============================================================================
# EPF Version Check Script
# Version: 2.4.2
# =============================================================================
# Quickly checks if product repo's EPF framework is up-to-date with canonical.
# Designed for AI agents to run proactively before making EPF changes.
#
# USAGE:
#   ./docs/EPF/scripts/check-epf-version.sh [--quiet]
#
# EXIT CODES:
#   0 - Up to date
#   1 - Behind canonical (update available)
#   2 - Error checking versions
#
# 🤖 FOR AI ASSISTANTS:
# Run this at the start of EPF-related sessions to ensure you're working
# with the latest framework. If behind, offer to sync before proceeding.
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
CANONICAL_REMOTE="epf"
CANONICAL_BRANCH="main"
CANONICAL_URL="git@github.com:eyedea-io/epf-canonical-definition.git"

# Detect EPF root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(dirname "$SCRIPT_DIR")"
EPF_PREFIX="docs/EPF"

# Parse arguments
QUIET=false
if [[ "$1" == "--quiet" ]]; then
    QUIET=true
fi

# Helper functions
log_info() {
    if [[ "$QUIET" != "true" ]]; then
        echo -e "${CYAN}ℹ ${NC}$1"
    fi
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

# Get versions
get_local_version() {
    if [[ -f "$EPF_ROOT/VERSION" ]]; then
        cat "$EPF_ROOT/VERSION"
    else
        echo "unknown"
    fi
}

get_remote_version() {
    # Ensure remote exists
    if ! git remote get-url "$CANONICAL_REMOTE" &> /dev/null; then
        if [[ "$QUIET" != "true" ]]; then
            log_info "Adding remote: $CANONICAL_REMOTE ($CANONICAL_URL)"
        fi
        git remote add "$CANONICAL_REMOTE" "$CANONICAL_URL" 2>/dev/null || true
    fi
    
    # Fetch latest
    git fetch "$CANONICAL_REMOTE" "$CANONICAL_BRANCH" --quiet 2>/dev/null || true
    
    # Get remote VERSION file
    git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:VERSION" 2>/dev/null || echo "unknown"
}

# Compare versions
version_compare() {
    if [[ "$1" == "$2" ]]; then
        echo "="
    elif [[ "$(printf '%s\n' "$1" "$2" | sort -V | tail -1)" == "$1" ]]; then
        echo ">"
    else
        echo "<"
    fi
}

# Main check
main() {
    if [[ "$QUIET" != "true" ]]; then
        echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║           EPF Version Check                                ║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
    fi
    
    local_ver=$(get_local_version)
    remote_ver=$(get_remote_version)
    
    if [[ "$local_ver" == "unknown" ]]; then
        log_error "Could not determine local EPF version"
        log_info "Are you in a product repo with EPF installed?"
        exit 2
    fi
    
    if [[ "$remote_ver" == "unknown" ]]; then
        log_error "Could not fetch canonical EPF version"
        log_info "Check network connection or remote configuration"
        exit 2
    fi
    
    comparison=$(version_compare "$local_ver" "$remote_ver")
    
    if [[ "$QUIET" != "true" ]]; then
        echo "Local EPF version:     $local_ver"
        echo "Canonical EPF version: $remote_ver"
        echo ""
    fi
    
    case "$comparison" in
        "=")
            log_success "EPF is up to date (v$local_ver)"
            echo ""
            if [[ "$QUIET" != "true" ]]; then
                log_info "Your product repo has the latest EPF framework"
            fi
            exit 0
            ;;
        "<")
            log_warn "EPF is BEHIND canonical ($local_ver < $remote_ver)"
            echo ""
            echo -e "${YELLOW}Update available!${NC}"
            echo ""
            echo "To update EPF framework:"
            echo "  ${CYAN}./docs/EPF/scripts/sync-repos.sh pull${NC}"
            echo ""
            echo "This will:"
            echo "  • Pull latest framework updates from canonical EPF"
            echo "  • Preserve your product-specific instance data"
            echo "  • Update schemas, scripts, templates, and documentation"
            echo ""
            exit 1
            ;;
        ">")
            log_warn "Local EPF is AHEAD of canonical ($local_ver > $remote_ver)"
            echo ""
            if [[ "$QUIET" != "true" ]]; then
                log_info "This is unusual - canonical repo should be ahead"
                log_info "You may have local framework changes not yet synced"
                echo ""
                echo "If you have framework improvements to share:"
                echo "  ./docs/EPF/scripts/sync-repos.sh push"
            fi
            exit 0
            ;;
    esac
}

main
