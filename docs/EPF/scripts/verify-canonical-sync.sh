#!/bin/bash
# =============================================================================
# EPF Canonical Sync Verification Script
# Version: 2.7.2
# =============================================================================
# Verifies that a product repo's EPF framework files are identical to canonical.
# Goes beyond version checking to compare actual file contents.
#
# USAGE:
#   ./docs/EPF/scripts/verify-canonical-sync.sh [--verbose] [--fix]
#
# OPTIONS:
#   --verbose    Show details of each file comparison
#   --fix        Automatically sync if differences found (runs sync-repos.sh pull)
#
# EXIT CODES:
#   0 - All files match canonical
#   1 - Differences found (out of sync)
#   2 - Error (missing dependencies, network issues)
#
# 🤖 FOR AI ASSISTANTS:
# Run this when you need DEEP verification that a product repo's EPF is truly
# in sync with canonical. Use cases:
#   - Before making EPF framework changes in a product repo
#   - When health check passes but user reports unexpected behavior
#   - After manual edits to EPF files (which should never happen)
#   - When debugging "works in canonical, fails in product repo" issues
#
# This is more thorough than check-epf-version.sh (which only compares VERSION).
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

# Parse arguments
VERBOSE=false
FIX_MODE=false
for arg in "$@"; do
    case $arg in
        --verbose) VERBOSE=true ;;
        --fix) FIX_MODE=true ;;
    esac
done

# Counters
TOTAL_FILES=0
MATCHING_FILES=0
DIFFERENT_FILES=0
MISSING_LOCAL=0
EXTRA_LOCAL=0

# Arrays to track differences
declare -a DIFF_FILES=()
declare -a MISSING_FILES=()

# Helper functions
log_info() {
    echo -e "${CYAN}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "  ${NC}$1"
    fi
}

# Ensure we're in a product repo (not canonical)
check_environment() {
    # Check if this looks like a product repo (EPF in docs/EPF/)
    if [[ ! -d "$EPF_ROOT/_instances" ]] && [[ "$EPF_ROOT" == *"/docs/EPF" ]]; then
        return 0  # Product repo
    fi
    
    # Check if this is canonical (EPF at root, _instances only has README)
    local instance_count
    instance_count=$(find "$EPF_ROOT/_instances" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
    
    if [[ "$instance_count" -eq 0 ]] && [[ -f "$EPF_ROOT/_instances/README.md" ]]; then
        log_error "This appears to be the canonical EPF repository"
        log_info "This script is designed for product repos to verify sync with canonical"
        log_info "Run from: /path/to/product-repo/docs/EPF/scripts/verify-canonical-sync.sh"
        exit 2
    fi
    
    return 0
}

# Setup canonical remote if needed
setup_remote() {
    # Find the repo root (go up from EPF_ROOT until we find .git)
    local repo_root="$EPF_ROOT"
    while [[ ! -d "$repo_root/.git" ]] && [[ "$repo_root" != "/" ]]; do
        repo_root="$(dirname "$repo_root")"
    done
    
    if [[ ! -d "$repo_root/.git" ]]; then
        log_error "Could not find git repository root"
        exit 2
    fi
    
    cd "$repo_root"
    
    # Ensure remote exists
    if ! git remote get-url "$CANONICAL_REMOTE" &> /dev/null; then
        log_info "Adding remote: $CANONICAL_REMOTE ($CANONICAL_URL)"
        git remote add "$CANONICAL_REMOTE" "$CANONICAL_URL" 2>/dev/null || true
    fi
    
    # Fetch latest
    log_info "Fetching latest from canonical..."
    if ! git fetch "$CANONICAL_REMOTE" "$CANONICAL_BRANCH" --quiet 2>/dev/null; then
        log_error "Failed to fetch from canonical remote"
        log_info "Check network connection or remote configuration"
        exit 2
    fi
}

# Compare a single file
compare_file() {
    local rel_path="$1"
    local local_file="$EPF_ROOT/$rel_path"
    
    ((TOTAL_FILES++))
    
    # Get canonical content
    local canonical_content
    canonical_content=$(git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:$rel_path" 2>/dev/null) || {
        # File doesn't exist in canonical - this is extra local file
        log_verbose "Extra local: $rel_path (not in canonical)"
        ((EXTRA_LOCAL++))
        return 0
    }
    
    # Check if local file exists
    if [[ ! -f "$local_file" ]]; then
        log_verbose "Missing local: $rel_path"
        MISSING_FILES+=("$rel_path")
        ((MISSING_LOCAL++))
        return 1
    fi
    
    # Compare content
    local local_content
    local_content=$(cat "$local_file")
    
    if [[ "$canonical_content" == "$local_content" ]]; then
        log_verbose "Match: $rel_path"
        ((MATCHING_FILES++))
        return 0
    else
        log_verbose "Different: $rel_path"
        DIFF_FILES+=("$rel_path")
        ((DIFFERENT_FILES++))
        return 1
    fi
}

# Get list of framework files to check
get_framework_files() {
    # These are the framework files that should be identical to canonical
    # Excludes: _instances/, .epf-work/, any product-specific content
    
    local files=()
    
    # Scripts
    while IFS= read -r file; do
        files+=("scripts/$(basename "$file")")
    done < <(git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:scripts/" 2>/dev/null | grep -E "\.sh$" || true)
    
    # Schemas
    while IFS= read -r file; do
        files+=("schemas/$(basename "$file")")
    done < <(git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:schemas/" 2>/dev/null | grep -E "\.json$" || true)
    
    # Core files
    files+=("VERSION")
    files+=("README.md")
    files+=("MAINTENANCE.md")
    files+=("CANONICAL_PURITY_RULES.md")
    files+=("integration_specification.yaml")
    files+=(".ai-agent-instructions.md")
    files+=(".ai-agent-first-contact.md")
    
    # Wizards
    while IFS= read -r file; do
        files+=("wizards/$(basename "$file")")
    done < <(git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:wizards/" 2>/dev/null | grep -E "\.md$" || true)
    
    # Templates (READY and FIRE)
    for template_dir in "templates/READY" "templates/FIRE" "templates/AIM"; do
        while IFS= read -r file; do
            [[ -n "$file" ]] && files+=("$template_dir/$file")
        done < <(git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:$template_dir/" 2>/dev/null | grep -E "\.yaml$|\.md$" || true)
    done
    
    # Output unique files
    printf '%s\n' "${files[@]}" | sort -u
}

# Main verification
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║        EPF Canonical Sync Verification                     ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    check_environment
    setup_remote
    
    echo ""
    log_info "Comparing framework files against canonical EPF..."
    echo ""
    
    # Get and check each framework file
    local has_differences=false
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        if ! compare_file "$file"; then
            has_differences=true
        fi
    done < <(get_framework_files)
    
    # Summary
    echo ""
    echo -e "${BLUE}━━━ Summary ━━━${NC}"
    echo "Total framework files checked: $TOTAL_FILES"
    echo -e "  ${GREEN}Matching:${NC}  $MATCHING_FILES"
    
    if [[ $DIFFERENT_FILES -gt 0 ]]; then
        echo -e "  ${RED}Different:${NC} $DIFFERENT_FILES"
    fi
    
    if [[ $MISSING_LOCAL -gt 0 ]]; then
        echo -e "  ${YELLOW}Missing:${NC}   $MISSING_LOCAL"
    fi
    
    if [[ $EXTRA_LOCAL -gt 0 ]]; then
        echo -e "  ${CYAN}Extra:${NC}     $EXTRA_LOCAL (local-only files, OK)"
    fi
    
    echo ""
    
    # Report differences
    if [[ ${#DIFF_FILES[@]} -gt 0 ]]; then
        echo -e "${RED}Files that differ from canonical:${NC}"
        for file in "${DIFF_FILES[@]}"; do
            echo "  • $file"
        done
        echo ""
    fi
    
    if [[ ${#MISSING_FILES[@]} -gt 0 ]]; then
        echo -e "${YELLOW}Files missing locally:${NC}"
        for file in "${MISSING_FILES[@]}"; do
            echo "  • $file"
        done
        echo ""
    fi
    
    # Final result
    if [[ $DIFFERENT_FILES -eq 0 ]] && [[ $MISSING_LOCAL -eq 0 ]]; then
        log_success "EPF framework is fully in sync with canonical!"
        echo ""
        log_info "All framework files match canonical EPF v$(cat "$EPF_ROOT/VERSION")"
        exit 0
    else
        log_error "EPF framework is OUT OF SYNC with canonical"
        echo ""
        
        if [[ "$FIX_MODE" == "true" ]]; then
            log_info "Attempting automatic sync..."
            echo ""
            if "$SCRIPT_DIR/sync-repos.sh" pull; then
                log_success "Sync completed. Re-run this script to verify."
            else
                log_error "Sync failed. Manual intervention required."
                exit 1
            fi
        else
            echo "To fix, run one of:"
            echo "  ${CYAN}./docs/EPF/scripts/sync-repos.sh pull${NC}     # Sync from canonical"
            echo "  ${CYAN}./docs/EPF/scripts/verify-canonical-sync.sh --fix${NC}  # Auto-fix"
            echo ""
            log_info "This will update all framework files to match canonical EPF"
        fi
        exit 1
    fi
}

main
