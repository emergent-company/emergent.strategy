#!/bin/bash
# EPF Sync Script v2.0
# Ensures EPF framework is synchronized across canonical repo and product instances
#
# CRITICAL: git subtree push CANNOT exclude directories, so we use a different approach:
# - PULL: Uses git subtree (safe, canonical → product)
# - PUSH: Clones canonical, copies files, commits, pushes (excludes _instances/)
#
# Usage: ./sync-repos.sh [push|pull|check|validate]
#   push  - Push framework changes from this repo to canonical EPF (excludes _instances/)
#   pull  - Pull framework updates from canonical EPF to this repo
#   check - Verify sync status without making changes
#   validate - Check version consistency

set -e

# Configuration
CANONICAL_REMOTE="epf"
CANONICAL_BRANCH="main"
CANONICAL_URL="git@github.com:eyedea-io/epf.git"

# Detect EPF root directory (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$EPF_ROOT/../.." && pwd)"
EPF_PREFIX="docs/EPF"

TEMP_DIR="/tmp/epf-sync-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Framework files/directories to sync (NOT _instances/)
FRAMEWORK_ITEMS=(
    "README.md"
    "MAINTENANCE.md"
    "NORTH_STAR.md"
    "STRATEGY_FOUNDATIONS.md"
    "TRACK_BASED_ARCHITECTURE.md"
    ".ai-agent-instructions.md"
    "integration_specification.yaml"
    "phases"
    "schemas"
    "wizards"
    "scripts"
    ".github"
)

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# Change to repo root for consistent paths
cd "$REPO_ROOT"

check_remote() {
    if ! git remote get-url "$CANONICAL_REMOTE" &>/dev/null; then
        log_warn "Remote '$CANONICAL_REMOTE' not configured"
        log_info "Adding remote: git remote add $CANONICAL_REMOTE $CANONICAL_URL"
        git remote add "$CANONICAL_REMOTE" "$CANONICAL_URL"
    fi
    log_info "Remote '$CANONICAL_REMOTE': $(git remote get-url $CANONICAL_REMOTE)"
}

get_local_version() {
    grep -E "^  version:" "$EPF_PREFIX/integration_specification.yaml" 2>/dev/null | head -1 | sed 's/.*"\(.*\)".*/\1/'
}

get_remote_version() {
    git fetch "$CANONICAL_REMOTE" "$CANONICAL_BRANCH" --quiet 2>/dev/null || true
    git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:integration_specification.yaml" 2>/dev/null | \
        grep -E "^  version:" | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "unknown"
}

validate_version_consistency() {
    log_info "Validating version consistency..."
    
    local file="$EPF_PREFIX/integration_specification.yaml"
    
    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        return 1
    fi
    
    local comment_version=$(grep "^# Version:" "$file" | sed 's/.*Version: \([0-9.]*\).*/\1/')
    local spec_version=$(grep "^  version:" "$file" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    local changelog_version=$(grep -A2 "^  changelog:" "$file" | grep "version:" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    
    local errors=0
    
    if [[ "$comment_version" != "$spec_version" ]]; then
        log_error "Version mismatch: header comment ($comment_version) != spec.version ($spec_version)"
        ((errors++))
    fi
    
    if [[ "$spec_version" != "$changelog_version" ]]; then
        log_error "Version mismatch: spec.version ($spec_version) != latest changelog ($changelog_version)"
        ((errors++))
    fi
    
    if [[ $errors -eq 0 ]]; then
        log_info "All versions consistent: $spec_version ✓"
        return 0
    else
        log_error "Fix version inconsistencies before syncing!"
        log_info "Use: ./scripts/bump-version.sh <version> \"<description>\""
        return 1
    fi
}

check_no_instances_in_canonical() {
    log_info "Checking canonical repo for accidental instances..."
    
    git fetch "$CANONICAL_REMOTE" "$CANONICAL_BRANCH" --quiet 2>/dev/null || return 0
    
    local instances=$(git ls-tree -r --name-only "$CANONICAL_REMOTE/$CANONICAL_BRANCH" 2>/dev/null | grep "^_instances/" | grep -v "README.md" || true)
    
    if [[ -n "$instances" ]]; then
        log_error "Instance files found in canonical repo (this is wrong!):"
        echo "$instances" | head -10
        log_warn "Fix: Clone canonical repo, delete _instances/*, commit, push"
        return 1
    fi
    
    log_info "Canonical repo clean (no instance files) ✓"
    return 0
}

check_sync_status() {
    log_info "Checking EPF sync status..."
    echo ""
    
    check_remote
    
    local local_ver=$(get_local_version)
    local remote_ver=$(get_remote_version)
    
    echo "  Local integration_specification version:  $local_ver"
    echo "  Canonical repo version:                   $remote_ver"
    echo ""
    
    validate_version_consistency || true
    echo ""
    check_no_instances_in_canonical || true
    echo ""
    
    if [[ "$local_ver" == "$remote_ver" ]]; then
        log_info "Versions match - checking for file differences..."
        
        # Compare key files
        local diffs=0
        for item in "${FRAMEWORK_ITEMS[@]}"; do
            if [[ -f "$EPF_PREFIX/$item" ]]; then
                local remote_content=$(git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:$item" 2>/dev/null || echo "")
                local local_content=$(cat "$EPF_PREFIX/$item" 2>/dev/null || echo "")
                
                if [[ "$remote_content" != "$local_content" && -n "$remote_content" ]]; then
                    log_warn "Differs: $item"
                    ((diffs++))
                fi
            fi
        done
        
        if [[ $diffs -eq 0 ]]; then
            log_info "All framework files in sync ✓"
        else
            log_warn "$diffs file(s) differ - consider push or pull"
        fi
    else
        if [[ "$(printf '%s\n' "$local_ver" "$remote_ver" | sort -V | tail -1)" == "$local_ver" ]]; then
            log_warn "Local is AHEAD ($local_ver > $remote_ver)"
            log_info "Consider: ./sync-repos.sh push"
        else
            log_warn "Canonical is AHEAD ($remote_ver > $local_ver)"
            log_info "Consider: ./sync-repos.sh pull"
        fi
    fi
}

push_to_canonical() {
    log_info "Pushing framework changes to canonical EPF repo..."
    log_warn "This uses file copy (not git subtree) to exclude _instances/"
    echo ""
    
    check_remote
    validate_version_consistency || exit 1
    check_no_instances_in_canonical || log_warn "Proceeding anyway..."
    
    log_step "1/5: Cloning canonical repo to temp directory..."
    rm -rf "$TEMP_DIR"
    git clone --depth=1 "$CANONICAL_URL" "$TEMP_DIR" --quiet
    
    log_step "2/5: Copying framework files (excluding _instances/)..."
    for item in "${FRAMEWORK_ITEMS[@]}"; do
        if [[ -e "$EPF_PREFIX/$item" ]]; then
            if [[ -d "$EPF_PREFIX/$item" ]]; then
                rm -rf "$TEMP_DIR/$item"
                cp -R "$EPF_PREFIX/$item" "$TEMP_DIR/$item"
            else
                cp "$EPF_PREFIX/$item" "$TEMP_DIR/$item"
            fi
            echo "  Copied: $item"
        fi
    done
    
    log_step "3/5: Checking for changes..."
    cd "$TEMP_DIR"
    git add -A
    
    if git diff --cached --quiet; then
        log_info "No changes to push - canonical repo is up to date"
        return 0
    fi
    
    log_step "4/5: Committing changes..."
    local version=$(grep "^  version:" integration_specification.yaml | head -1 | sed 's/.*"\(.*\)".*/\1/')
    git commit -m "EPF: Update framework to v$version

Synced from product repo via sync-repos.sh
Framework files only (no instances)"
    
    log_step "5/5: Pushing to canonical repo..."
    git push origin main
    
    cd - > /dev/null
    log_info "Push complete! ✓"
    log_info "Don't forget to update other product repos with: ./sync-repos.sh pull"
}

pull_from_canonical() {
    log_info "Pulling framework updates from canonical EPF repo..."
    echo ""
    
    check_remote
    check_no_instances_in_canonical || exit 1
    
    log_step "Running git subtree pull..."
    git subtree pull --prefix="$EPF_PREFIX" "$CANONICAL_REMOTE" "$CANONICAL_BRANCH" --squash \
        -m "EPF: Pull framework updates from canonical repo"
    
    log_step "Validating pulled version..."
    validate_version_consistency
    
    log_info "Pull complete! ✓"
    log_warn "Note: Your _instances/ folder is preserved (not affected by pull)"
}

# Main
case "${1:-check}" in
    push)
        push_to_canonical
        ;;
    pull)
        pull_from_canonical
        ;;
    check)
        check_sync_status
        ;;
    validate)
        validate_version_consistency
        ;;
    *)
        echo "EPF Sync Script v2.0"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  check     Verify sync status (default)"
        echo "  validate  Check version consistency within files"
        echo "  push      Push framework to canonical repo (excludes _instances/)"
        echo "  pull      Pull framework from canonical repo"
        echo ""
        echo "The push command uses file copy instead of git subtree to properly"
        echo "exclude _instances/ which should never be in the canonical repo."
        exit 1
        ;;
esac
