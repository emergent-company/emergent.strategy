#!/bin/bash
# EPF Status Check Script
# Version: 1.0.0
#
# Checks if the local EPF framework is in sync with the canonical repo.
# Can also check all known product repos if run with --all flag.
#
# Usage:
#   ./scripts/epf-status.sh          # Check current repo only
#   ./scripts/epf-status.sh --all    # Check all known product repos
#   ./scripts/epf-status.sh --sync   # Sync current repo if outdated
#
# This script should be run from within a product repo that has EPF installed,
# or from the canonical EPF repo itself.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CANONICAL_EPF_REPO="git@github.com:eyedea-io/epf-canonical-definition.git"
KNOWN_REPOS=("twentyfirst" "huma-blueprint-ui" "lawmatics" "emergent")
CODE_DIR="${EPF_CODE_DIR:-$HOME/code}"

# Detect script location and EPF root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine if we're in canonical EPF or a product repo
if [[ "$SCRIPT_DIR" == */docs/EPF/scripts ]]; then
    # We're in a product repo
    EPF_ROOT="$(dirname "$SCRIPT_DIR")"
    REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
    REPO_NAME="$(basename "$REPO_ROOT")"
    IN_PRODUCT_REPO=true
elif [[ "$SCRIPT_DIR" == */scripts ]] && [[ -f "$(dirname "$SCRIPT_DIR")/VERSION" ]]; then
    # We're in canonical EPF repo
    EPF_ROOT="$(dirname "$SCRIPT_DIR")"
    REPO_ROOT="$EPF_ROOT"
    REPO_NAME="epf (canonical)"
    IN_PRODUCT_REPO=false
else
    echo -e "${RED}[ERROR]${NC} Cannot determine EPF location. Run from EPF scripts directory."
    exit 1
fi

# Function to get canonical version (works for private repos)
get_canonical_version() {
    local version
    local tmp_dir
    
    # Method 1: Try to fetch from git archive (fastest, works for private repos with SSH)
    tmp_dir=$(mktemp -d)
    if git archive --remote="$CANONICAL_EPF_REPO" HEAD VERSION 2>/dev/null | tar -xO -C "$tmp_dir" VERSION 2>/dev/null; then
        version=$(cat "$tmp_dir/VERSION" 2>/dev/null | tr -d '\n\r')
        rm -rf "$tmp_dir"
        if [[ -n "$version" ]]; then
            echo "$version"
            return 0
        fi
    fi
    rm -rf "$tmp_dir"
    
    # Method 2: Shallow clone to temp (slower but reliable)
    tmp_dir=$(mktemp -d)
    if git clone --depth 1 --single-branch "$CANONICAL_EPF_REPO" "$tmp_dir/epf" 2>/dev/null; then
        version=$(cat "$tmp_dir/epf/VERSION" 2>/dev/null | tr -d '\n\r')
        rm -rf "$tmp_dir"
        if [[ -n "$version" ]]; then
            echo "$version"
            return 0
        fi
    fi
    rm -rf "$tmp_dir"
    
    # Method 3: Check if canonical EPF exists locally
    if [[ -f "$CODE_DIR/epf/VERSION" ]]; then
        version=$(cat "$CODE_DIR/epf/VERSION" | tr -d '\n\r')
        echo "$version"
        return 0
    fi
    
    echo "unknown"
}

# Function to get local version
get_local_version() {
    local epf_path="$1"
    if [[ -f "$epf_path/VERSION" ]]; then
        cat "$epf_path/VERSION" | tr -d '\n\r'
    else
        # Fallback to script comment version
        grep "# Version:" "$epf_path/scripts/validate-instance.sh" 2>/dev/null | head -1 | awk '{print $3}' | tr -d '\n\r'
    fi
}

# Function to check single repo
check_repo() {
    local repo_path="$1"
    local repo_name="$2"
    local epf_path="$repo_path/docs/EPF"
    local canonical_version="$3"
    
    if [[ ! -d "$epf_path" ]]; then
        echo -e "${YELLOW}⚠${NC}  $repo_name: EPF not installed"
        return 1
    fi
    
    local local_version
    local_version=$(get_local_version "$epf_path")
    
    if [[ "$local_version" == "$canonical_version" ]]; then
        echo -e "${GREEN}✅${NC} $repo_name: v$local_version (current)"
        return 0
    else
        echo -e "${RED}❌${NC} $repo_name: v$local_version (outdated, canonical is v$canonical_version)"
        return 1
    fi
}

# Function to sync current repo
sync_current_repo() {
    if [[ "$IN_PRODUCT_REPO" != true ]]; then
        echo -e "${YELLOW}[WARN]${NC} Cannot sync canonical EPF repo with itself"
        return 1
    fi
    
    local sync_script="$EPF_ROOT/scripts/sync-repos.sh"
    if [[ -x "$sync_script" ]]; then
        echo -e "${BLUE}[INFO]${NC} Running sync..."
        cd "$REPO_ROOT"
        "$sync_script" pull
    else
        echo -e "${RED}[ERROR]${NC} Sync script not found or not executable: $sync_script"
        return 1
    fi
}

# Main logic
main() {
    local mode="${1:-check}"
    
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  EPF Status Check${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Get canonical version
    echo -e "${BLUE}[INFO]${NC} Fetching canonical EPF version..."
    local canonical_version
    canonical_version=$(get_canonical_version)
    
    if [[ "$canonical_version" == "unknown" ]]; then
        echo -e "${RED}[ERROR]${NC} Could not fetch canonical version. Check internet connection."
        exit 1
    fi
    
    echo -e "${BLUE}[INFO]${NC} Canonical EPF version: ${GREEN}v$canonical_version${NC}"
    echo ""
    
    local any_outdated=false
    
    case "$mode" in
        --all|-a)
            echo -e "${BLUE}[INFO]${NC} Checking all known repos in $CODE_DIR..."
            echo ""
            
            for repo in "${KNOWN_REPOS[@]}"; do
                local repo_path="$CODE_DIR/$repo"
                if [[ -d "$repo_path" ]]; then
                    if ! check_repo "$repo_path" "$repo" "$canonical_version"; then
                        any_outdated=true
                    fi
                else
                    echo -e "${YELLOW}⚠${NC}  $repo: Not found at $repo_path"
                fi
            done
            ;;
            
        --sync|-s)
            echo -e "${BLUE}[INFO]${NC} Checking and syncing current repo..."
            echo ""
            
            local local_version
            if [[ "$IN_PRODUCT_REPO" == true ]]; then
                local_version=$(get_local_version "$EPF_ROOT")
            else
                local_version=$(get_local_version "$REPO_ROOT")
            fi
            
            if [[ "$local_version" == "$canonical_version" ]]; then
                echo -e "${GREEN}✅${NC} $REPO_NAME: v$local_version (already current)"
            else
                echo -e "${YELLOW}⚠${NC}  $REPO_NAME: v$local_version (outdated)"
                sync_current_repo
            fi
            ;;
            
        *)
            # Default: check current repo only
            echo -e "${BLUE}[INFO]${NC} Checking current repo: $REPO_NAME"
            echo ""
            
            local local_version
            if [[ "$IN_PRODUCT_REPO" == true ]]; then
                local_version=$(get_local_version "$EPF_ROOT")
                if ! check_repo "$REPO_ROOT" "$REPO_NAME" "$canonical_version"; then
                    any_outdated=true
                fi
            else
                local_version=$(get_local_version "$REPO_ROOT")
                echo -e "${GREEN}✅${NC} $REPO_NAME: v$local_version (this is canonical)"
            fi
            ;;
    esac
    
    echo ""
    
    if [[ "$any_outdated" == true ]]; then
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}  Some repos are outdated. To sync:${NC}"
        echo -e "${YELLOW}    ./docs/EPF/scripts/epf-status.sh --sync   # Current repo${NC}"
        echo -e "${YELLOW}    ./docs/EPF/scripts/sync-repos.sh pull     # Manual sync${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        exit 1
    else
        echo -e "${GREEN}All checked repos are up to date!${NC}"
    fi
}

main "$@"
