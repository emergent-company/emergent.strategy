#!/bin/bash
# EPF Sync Script v2.4
# Ensures EPF framework is synchronized across canonical repo and product instances
#
# ═══════════════════════════════════════════════════════════════════════════════
# 🚨 🤖 CRITICAL FOR AI ASSISTANTS 🤖 🚨
# ═══════════════════════════════════════════════════════════════════════════════
#
# ⛔ NEVER USE MANUAL GIT COMMANDS FOR EPF SYNC ⛔
#
# ❌ DO NOT DO THIS:
#    git push origin main
#    git add docs/EPF/
#    git commit -m "update EPF"
#    git subtree push --prefix=docs/EPF epf main
#
# ✅ ALWAYS DO THIS INSTEAD:
#    ./docs/EPF/scripts/sync-repos.sh push    # Push TO canonical
#    ./docs/EPF/scripts/sync-repos.sh pull    # Pull FROM canonical
#
# ═══════════════════════════════════════════════════════════════════════════════
#
# WHY THIS SCRIPT EXISTS:
# - Product repos have docs/EPF/ (framework) + docs/EPF/_instances/ (product data)
# - Manual git commands CANNOT distinguish between these
# - This script EXCLUDES _instances/ to prevent canonical contamination
# - Manual push would upload product secrets/data to public EPF repo
#
# WHAT THIS SCRIPT DOES:
# - Automatically excludes _instances/ directory (product data)
# - Validates version consistency before syncing
# - Uses safe clone-copy-push workflow
# - Prevents canonical contamination with product-specific content
# - Automatically restores product-specific .gitignore after pull operations
# - SELF-UPDATES: Before pulling, checks if canonical has newer sync script
#   and uses the newer version to perform the sync (prevents bootstrap problems)
#
# SELF-UPDATE MECHANISM (v2.4+):
# Problem: Product repo may have old/broken sync script that can't properly sync
# Solution: Before any pull operation:
#   1. Fetch canonical sync script version
#   2. If canonical is newer, download it
#   3. Re-execute with the newer script
#   4. This ensures sync logic improvements take effect immediately
#
# GITIGNORE HANDLING:
# - Canonical repo uses .gitignore that ignores ALL instances
# - Product repos need .gitignore that tracks THEIR specific instance
# - During pull, canonical .gitignore overwrites product .gitignore
# - This script automatically restores product-specific .gitignore
# - Uses templates/product.gitignore.template to regenerate correct .gitignore
# - Detection: looks for "CANONICAL REPOSITORY" comment in .gitignore header
#
# USAGE:
#   ./docs/EPF/scripts/sync-repos.sh         # Interactive mode
#   ./docs/EPF/scripts/sync-repos.sh push    # Push changes to canonical
#   ./docs/EPF/scripts/sync-repos.sh pull    # Pull updates from canonical
#
# See: docs/EPF/.ai-agent-instructions.md for complete guidance
#
# CRITICAL: git subtree push CANNOT exclude directories, so we use a different approach:
# - PULL: Uses git subtree (safe, canonical → product), auto-restores product .gitignore
# - PUSH: Clones canonical, copies files, commits, pushes (excludes _instances/)
#
# Version 2.4 Changes:
# - Added SELF-UPDATE MECHANISM: Before pulling, checks if canonical has newer sync script
# - Downloads and uses newer sync script for the sync operation itself
# - Prevents broken old sync scripts from causing infinite loops or sync failures
# - Self-update only triggers for 'pull' operations (not push/check/validate)
#
# Version 2.3 Changes:
# - Improved .gitignore detection with explicit "CANONICAL REPOSITORY" marker
# - Added templates/product.gitignore.template for robust restoration
# - Better fallback handling when subtree operations fail
# - Clearer error messages and recovery instructions
#
# Version 2.2 Changes:
# - Integrated with classify-changes.sh for version bump detection
# - Push operations now require version bump if framework content changed
# - Recommends classify-changes.sh instead of manual version management
#
# Usage: ./sync-repos.sh [push|pull|check|validate|classify]
#   push     - Push framework changes from this repo to canonical EPF (excludes _instances/)
#   pull     - Pull framework updates from canonical EPF to this repo
#   check    - Verify sync status without making changes
#   validate - Check version consistency
#   classify - Run change classifier to check if version bump needed

set -e

# Configuration
CANONICAL_REMOTE="epf"
CANONICAL_BRANCH="main"
CANONICAL_URL="git@github.com:eyedea-io/epf-canonical-definition.git"

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
# NOTE: This function dynamically discovers all items in docs/EPF/
# EXCEPT: _instances/, .epf-work/, and product-specific files
get_framework_items() {
    local epf_dir="$EPF_PREFIX"
    local items=()
    
    # Get all items in EPF root, excluding product-specific content
    while IFS= read -r -d '' item; do
        local basename=$(basename "$item")
        
        # Skip instance folders and ephemeral work
        if [[ "$basename" == "_instances" || "$basename" == ".epf-work" ]]; then
            continue
        fi
        
        # Skip product-specific backup files
        if [[ "$basename" == *.product-backup ]]; then
            continue
        fi
        
        # Add to items list (relative path from EPF root)
        items+=("$basename")
    done < <(find "$epf_dir" -mindepth 1 -maxdepth 1 -print0 2>/dev/null)
    
    printf '%s\n' "${items[@]}"
}

# Legacy: Keep for backward compatibility and validation checks
# These are the MINIMUM expected framework items
FRAMEWORK_ITEMS_LEGACY=(
    "VERSION"
    "README.md"
    "MAINTENANCE.md"
    ".ai-agent-instructions.md"
    "integration_specification.yaml"
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

# ═══════════════════════════════════════════════════════════════════════════════
# SELF-UPDATE MECHANISM
# ═══════════════════════════════════════════════════════════════════════════════
# Problem: When pulling updates, the OLD sync script (in product repo) is used.
#          If the sync mechanism improved in canonical, we want to use the NEW one.
# Solution: Before any sync operation, check if canonical has a newer sync script.
#           If so, download it and re-execute with the same arguments.
# ═══════════════════════════════════════════════════════════════════════════════

SYNC_SCRIPT_VERSION="2.4"  # Increment when making changes to sync logic
SELF_UPDATE_MARKER="/tmp/.epf-sync-self-updated-$$"

get_local_sync_version() {
    # Extract version from this script's header comment
    grep -E "^# EPF Sync Script v" "${BASH_SOURCE[0]}" 2>/dev/null | head -1 | sed 's/.*v\([0-9.]*\).*/\1/' || echo "0"
}

get_canonical_sync_version() {
    # Fetch canonical sync script and extract version
    git fetch "$CANONICAL_REMOTE" "$CANONICAL_BRANCH" --quiet 2>/dev/null || return 1
    git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:scripts/sync-repos.sh" 2>/dev/null | \
        grep -E "^# EPF Sync Script v" | head -1 | sed 's/.*v\([0-9.]*\).*/\1/' || echo "0"
}

version_gt() {
    # Returns 0 (true) if $1 > $2 using version comparison
    test "$(printf '%s\n' "$1" "$2" | sort -V | head -n 1)" != "$1"
}

self_update_if_needed() {
    # Skip if we already self-updated in this execution
    if [[ -f "$SELF_UPDATE_MARKER" ]]; then
        return 0
    fi
    
    # Only self-update for pull operations (where we're getting newer code)
    if [[ "${1:-}" != "pull" ]]; then
        return 0
    fi
    
    echo -e "${BLUE}[BOOTSTRAP]${NC} Checking for sync script updates..."
    
    # Ensure remote is configured
    if ! git remote get-url "$CANONICAL_REMOTE" &>/dev/null; then
        git remote add "$CANONICAL_REMOTE" "$CANONICAL_URL" 2>/dev/null || true
    fi
    
    local local_version=$(get_local_sync_version)
    local canonical_version=$(get_canonical_sync_version)
    
    if [[ -z "$canonical_version" || "$canonical_version" == "0" ]]; then
        echo -e "${YELLOW}[BOOTSTRAP]${NC} Could not determine canonical sync version, proceeding with local"
        return 0
    fi
    
    echo -e "${BLUE}[BOOTSTRAP]${NC} Local sync version: v$local_version"
    echo -e "${BLUE}[BOOTSTRAP]${NC} Canonical sync version: v$canonical_version"
    
    if version_gt "$canonical_version" "$local_version"; then
        echo ""
        echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
        echo -e "${YELLOW}  NEWER SYNC SCRIPT AVAILABLE (v$local_version → v$canonical_version)${NC}"
        echo -e "${YELLOW}  Downloading and using the newer version for this sync...${NC}"
        echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
        echo ""
        
        # Download the newer sync script to a temp location
        local new_script="/tmp/epf-sync-updated-$$.sh"
        git show "$CANONICAL_REMOTE/$CANONICAL_BRANCH:scripts/sync-repos.sh" > "$new_script" 2>/dev/null
        
        if [[ ! -s "$new_script" ]]; then
            echo -e "${YELLOW}[BOOTSTRAP]${NC} Could not download newer sync script, proceeding with local"
            rm -f "$new_script"
            return 0
        fi
        
        chmod +x "$new_script"
        
        # Create marker to prevent infinite loop
        touch "$SELF_UPDATE_MARKER"
        
        # Re-execute with the newer script
        echo -e "${BLUE}[BOOTSTRAP]${NC} Re-executing with updated sync script..."
        echo ""
        
        # Export variables the new script needs
        export EPF_BOOTSTRAP_REPO_ROOT="$REPO_ROOT"
        export EPF_BOOTSTRAP_EPF_PREFIX="$EPF_PREFIX"
        
        # Execute the new script with original arguments
        exec "$new_script" "$@"
        
        # exec replaces this process, so we never reach here
        # But just in case:
        exit $?
    else
        echo -e "${GREEN}[BOOTSTRAP]${NC} Sync script is up to date ✓"
    fi
}

# Clean up self-update marker on exit
cleanup_self_update() {
    rm -f "$SELF_UPDATE_MARKER"
}
trap cleanup_self_update EXIT

# Run self-update check before anything else (only for pull operations)
self_update_if_needed "$@"

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
    log_info "Validating version consistency across all framework files..."
    
    # Use the comprehensive health check for version validation
    if [[ -f "$EPF_PREFIX/scripts/epf-health-check.sh" ]]; then
        cd "$EPF_PREFIX"
        
        # Run health check in silent mode, capture output
        local health_output=$(./scripts/epf-health-check.sh 2>&1)
        local health_exit=$?
        
        cd - > /dev/null
        
        # If health check failed, display relevant output
        if [[ $health_exit -ne 0 ]]; then
            echo ""
            log_error "EPF health check failed - version inconsistency detected!"
            echo "$health_output" | grep -E "(CRITICAL|ERROR|Version)" || echo "$health_output"
            echo ""
            log_error "Cannot push to canonical EPF with version inconsistencies!"
            log_warn "RECOMMENDED FIXES:"
            log_info "  Auto-fix: ./docs/EPF/scripts/epf-health-check.sh --fix"
            log_info "  Or manual: ./docs/EPF/scripts/bump-framework-version.sh \"X.Y.Z\" \"Description\""
            echo ""
            return 1
        fi
        
        log_info "All versions consistent and framework health verified ✓"
        return 0
    else
        # Fallback to basic integration_specification.yaml check
        log_warn "epf-health-check.sh not found - using basic version check"
        
        local file="$EPF_PREFIX/integration_specification.yaml"
        
        if [[ ! -f "$file" ]]; then
            log_error "File not found: $file"
            return 1
        fi
        
        local comment_version=$(grep "^# Version:" "$file" | sed 's/.*Version: \([0-9.]*\).*/\1/')
        local spec_version=$(grep "^  version:" "$file" | head -1 | sed 's/.*"\(.*\)".*/\1/')
        
        if [[ "$comment_version" != "$spec_version" ]]; then
            log_error "Version mismatch in integration_specification.yaml"
            log_error "  Header: $comment_version vs Spec: $spec_version"
            return 1
        fi
        
        log_info "integration_specification.yaml version consistent: $spec_version ✓"
        return 0
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
        
        # Get framework items dynamically
        local framework_items=()
        while IFS= read -r item; do
            framework_items+=("$item")
        done < <(get_framework_items)
        
        # Compare key files
        local diffs=0
        for item in "${framework_items[@]}"; do
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

check_framework_changes() {
    log_info "Checking for framework content changes..."
    
    if [[ ! -f "$EPF_PREFIX/scripts/classify-changes.sh" ]]; then
        log_warn "classify-changes.sh not found - skipping change classification"
        return 0
    fi
    
    # Check 1: Uncommitted changes
    cd "$EPF_PREFIX"
    local uncommitted_output=$(./scripts/classify-changes.sh 2>&1)
    local uncommitted_exit=$?
    
    if [[ $uncommitted_exit -ne 0 ]]; then
        cd - > /dev/null
        echo "$uncommitted_output"
        echo ""
        log_error "⚠️  Uncommitted framework changes require version bump!"
        log_warn "You must bump the version before pushing to canonical EPF"
        echo ""
        log_info "Steps to fix:"
        log_info "  1. Review changes: ./docs/EPF/scripts/classify-changes.sh"
        log_info "  2. Bump version: ./docs/EPF/scripts/bump-framework-version.sh \"X.Y.Z\" \"Description\""
        log_info "  3. Commit version bump"
        log_info "  4. Try push again: ./docs/EPF/scripts/sync-repos.sh push"
        echo ""
        return 1
    fi
    
    # Check 2: Recent commits (HEAD~5..HEAD) for framework changes without version bump
    log_info "Checking recent commits for version bump compliance..."
    
    # Get list of files changed in recent commits, excluding non-framework paths
    local changed_files=$(git log --name-only --format="" --no-merges HEAD~5..HEAD 2>/dev/null | sort -u)
    
    # Filter to framework files only (exclude instances, work files, etc.)
    local framework_changes=""
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        case "$file" in
            _instances/*|.epf-work/*|.github/*|_legacy/*|VERSION|integration_specification.yaml)
                continue
                ;;
            *)
                framework_changes="yes"
                break
                ;;
        esac
    done <<< "$changed_files"
    
    if [[ -n "$framework_changes" ]]; then
        # Check if any recent commits also modified VERSION file
        local version_commits=$(git log --oneline --no-merges HEAD~5..HEAD -- VERSION integration_specification.yaml 2>/dev/null)
        
        if [[ -z "$version_commits" ]]; then
            cd - > /dev/null
            echo ""
            log_error "⚠️  Recent framework commits found without version bump!"
            echo ""
            echo "Framework commits (last 5):"
            git log --oneline --no-merges HEAD~5..HEAD 2>/dev/null | head -3
            echo ""
            log_warn "Framework changes require version bump before syncing to canonical"
            echo ""
            log_info "Steps to fix:"
            log_info "  1. Review recent changes: git log --oneline HEAD~5..HEAD -- docs/EPF/"
            log_info "  2. Classify changes: cd docs/EPF && ./scripts/classify-changes.sh --since-commit HEAD~5"
            log_info "  3. Bump version: ./docs/EPF/scripts/bump-framework-version.sh \"X.Y.Z\" \"Description\""
            log_info "  4. Try push again: ./docs/EPF/scripts/sync-repos.sh push"
            echo ""
            return 1
        fi
    fi
    
    cd - > /dev/null
    log_info "No framework changes requiring version bump ✓"
    return 0
}

push_to_canonical() {
    log_info "Pushing framework changes to canonical EPF repo..."
    log_warn "This uses file copy (not git subtree) to exclude _instances/"
    echo ""
    
    # CRITICAL: Check if version bump is needed BEFORE pushing
    check_framework_changes || exit 1
    echo ""
    
    check_remote
    validate_version_consistency || exit 1
    check_no_instances_in_canonical || log_warn "Proceeding anyway..."
    
    log_step "1/5: Cloning canonical repo to temp directory..."
    rm -rf "$TEMP_DIR"
    git clone --depth=1 "$CANONICAL_URL" "$TEMP_DIR" --quiet
    
    log_step "2/5: Copying framework files (excluding _instances/ and .epf-work/)..."
    
    # Get all framework items dynamically
    local framework_items=()
    while IFS= read -r item; do
        framework_items+=("$item")
    done < <(get_framework_items)
    
    local copied_count=0
    for item in "${framework_items[@]}"; do
        if [[ -e "$EPF_PREFIX/$item" ]]; then
            if [[ -d "$EPF_PREFIX/$item" ]]; then
                rm -rf "$TEMP_DIR/$item"
                cp -R "$EPF_PREFIX/$item" "$TEMP_DIR/$item"
            else
                cp "$EPF_PREFIX/$item" "$TEMP_DIR/$item"
            fi
            echo "  Copied: $item"
            ((copied_count++))
        fi
    done
    
    log_info "Copied $copied_count framework items (auto-discovered) ✓"
    
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

detect_product_name() {
    # Try to detect product name from existing instance folders
    local instances_dir="$EPF_PREFIX/_instances"
    if [[ -d "$instances_dir" ]]; then
        for dir in "$instances_dir"/*/; do
            local dirname=$(basename "$dir")
            if [[ "$dirname" != "README.md" && -d "$dir" ]]; then
                echo "$dirname"
                return 0
            fi
        done
    fi
    echo ""
}

is_canonical_gitignore() {
    local gitignore_file="$1"
    # Check for explicit canonical marker in .gitignore header
    # This marker is set in the canonical repo's .gitignore
    if grep -q "CANONICAL REPOSITORY" "$gitignore_file" 2>/dev/null; then
        return 0  # true - is canonical
    fi
    return 1  # false - not canonical (is product-specific or unknown)
}

restore_product_gitignore() {
    local product_name="$1"
    local gitignore_file="$EPF_PREFIX/.gitignore"
    local template_file="$EPF_PREFIX/templates/product.gitignore.template"
    local backup_file="$EPF_PREFIX/.gitignore.product-backup"
    
    if [[ -z "$product_name" ]]; then
        log_warn "Could not detect product name - .gitignore may need manual fix"
        log_info "Check: $gitignore_file should NOT ignore your instance folder"
        log_info "Fix: Find your instance folder name and run:"
        log_info "  sed 's/{{PRODUCT_NAME}}/YOUR_PRODUCT/g' $template_file > $gitignore_file"
        return 1
    fi
    
    # Check if current .gitignore is the canonical version (ignores all instances)
    if is_canonical_gitignore "$gitignore_file"; then
        log_warn ".gitignore was overwritten with canonical version - restoring product version..."
        
        # Prefer using template if available
        if [[ -f "$template_file" ]]; then
            log_info "Using template: $template_file"
            sed "s/{{PRODUCT_NAME}}/$product_name/g" "$template_file" > "$gitignore_file"
        else
            # Fallback to inline generation
            log_warn "Template not found, generating inline..."
            cat > "$gitignore_file" << EOF
# ════════════════════════════════════════════════════════════════════════════════
# EPF Framework .gitignore - $product_name Product Repo
# ════════════════════════════════════════════════════════════════════════════════
#
# This is the $product_name product repository.
# The $product_name instance is TRACKED here, other instances are ignored.
#
# ════════════════════════════════════════════════════════════════════════════════

# Instance folders - only $product_name instance is tracked
_instances/*
!_instances/README.md
!_instances/$product_name
!_instances/$product_name/**

# Working directory
.epf-work/*
!.epf-work/README.md

# OS files
.DS_Store
Thumbs.db
Desktop.ini

# Editor files
*.swp
*.swo
*~
.idea/
.vscode/

# Temporary files
*.tmp
*.temp
*.bak
*.backup
*.product-backup
*.log

# Build artifacts
node_modules/
__pycache__/
*.pyc
dist/
build/
EOF
        fi
        
        log_info "Restored product-specific .gitignore for '$product_name'"
        git add "$gitignore_file"
        return 0
    fi
    
    # Check if .gitignore already tracks this product's instance
    if grep -q "!_instances/$product_name" "$gitignore_file" 2>/dev/null; then
        log_info ".gitignore correctly tracks '$product_name' instance ✓"
        return 0
    fi
    
    log_warn ".gitignore may not correctly track '$product_name' instance - please verify"
    return 1
}

pull_from_canonical() {
    log_info "Pulling framework updates from canonical EPF repo..."
    echo ""
    
    check_remote
    check_no_instances_in_canonical || exit 1
    
    # Detect product name BEFORE pull (in case .gitignore gets overwritten)
    local product_name=$(detect_product_name)
    if [[ -n "$product_name" ]]; then
        log_info "Detected product instance: $product_name"
    else
        log_warn "No product instance detected - are you in the canonical EPF repo?"
        log_info "If this is a product repo, create your instance folder first:"
        log_info "  mkdir -p $EPF_PREFIX/_instances/YOUR_PRODUCT_NAME"
    fi
    
    # Backup current .gitignore if it's product-specific (not canonical)
    local gitignore_file="$EPF_PREFIX/.gitignore"
    local backup_file="$EPF_PREFIX/.gitignore.product-backup"
    if [[ -f "$gitignore_file" ]] && ! is_canonical_gitignore "$gitignore_file"; then
        log_info "Backing up product-specific .gitignore..."
        cp "$gitignore_file" "$backup_file"
    fi
    
    log_step "Attempting git subtree pull..."
    
    # Check for uncommitted changes (git subtree pull fails with "working tree has modifications")
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        log_warn "Uncommitted changes detected in working tree"
        log_info "Git subtree pull requires clean working tree - attempting to stage and commit first..."
        
        # Check if there are actually changes to commit
        if git diff --quiet && git diff --cached --quiet; then
            log_info "False alarm - working tree is actually clean ✓"
        else
            log_info "Attempting to auto-commit changes before subtree pull..."
            
            # Stage all EPF changes except instances
            git add "$EPF_PREFIX"
            
            # Create auto-commit if there are staged changes
            if ! git diff --cached --quiet; then
                git commit -m "Auto-commit: Prepare for EPF framework sync" --no-verify
                log_info "Auto-committed changes ✓"
            fi
        fi
    fi
    
    # Try git subtree first, but have fallback ready
    # Temporarily disable exit on error for this command
    set +e
    git subtree pull --prefix="$EPF_PREFIX" "$CANONICAL_REMOTE" "$CANONICAL_BRANCH" --squash \
        -m "EPF: Pull framework updates from canonical repo" 2>&1
    local subtree_exit_code=$?
    set -e
    
    if [[ $subtree_exit_code -eq 0 ]]; then
        log_info "Git subtree pull successful ✓"
        
        # Check for merge conflicts in .gitignore
        if git status --porcelain | grep -q "^UU.*\.gitignore"; then
            log_warn ".gitignore has merge conflict - auto-resolving..."
            
            if [[ -n "$product_name" ]]; then
                # Resolve conflict using template or inline generation
                restore_product_gitignore "$product_name"
                git commit -m "EPF: Resolve .gitignore merge conflict (keep $product_name instance tracking)" --no-verify
                log_info "Auto-resolved .gitignore conflict ✓"
            else
                log_warn "Cannot auto-resolve - product name unknown. Manual resolution required."
                log_info "To fix manually:"
                log_info "  1. Create your instance folder: mkdir -p $EPF_PREFIX/_instances/YOUR_PRODUCT"
                log_info "  2. Generate .gitignore: sed 's/{{PRODUCT_NAME}}/YOUR_PRODUCT/g' $EPF_PREFIX/templates/product.gitignore.template > $EPF_PREFIX/.gitignore"
                log_info "  3. Stage and commit: git add $EPF_PREFIX/.gitignore && git commit -m 'Fix .gitignore'"
            fi
        fi
    else
        log_warn "Git subtree pull failed (exit code: $subtree_exit_code) - falling back to manual sync..."
        log_info "This can happen when git subtree history is broken by manual commits"
        echo ""
        
        log_step "Fallback: Cloning canonical repo for manual sync..."
        local temp_epf="/tmp/epf-fallback-$$"
        rm -rf "$temp_epf"
        git clone --depth=1 --branch "$CANONICAL_BRANCH" "$CANONICAL_URL" "$temp_epf" --quiet
        
        log_step "Fallback: Copying framework files (excluding _instances/)..."
        
        # Get all framework items dynamically from canonical repo
        local framework_items=()
        while IFS= read -r item; do
            local basename=$(basename "$item")
            
            # Skip instance folders and ephemeral work
            if [[ "$basename" == "_instances" || "$basename" == ".epf-work" ]]; then
                continue
            fi
            
            # Skip product-specific backup files
            if [[ "$basename" == *.product-backup ]]; then
                continue
            fi
            
            framework_items+=("$basename")
        done < <(find "$temp_epf" -mindepth 1 -maxdepth 1 -print0 2>/dev/null)
        
        local copied=0
        for item in "${framework_items[@]}"; do
            if [[ -e "$temp_epf/$item" ]]; then
                if [[ -d "$temp_epf/$item" ]]; then
                    rm -rf "$EPF_PREFIX/$item"
                    cp -R "$temp_epf/$item" "$EPF_PREFIX/$item"
                else
                    cp "$temp_epf/$item" "$EPF_PREFIX/$item"
                fi
                echo "  Copied: $item"
                ((copied++))
            fi
        done
        
        rm -rf "$temp_epf"
        log_info "Manual sync completed ($copied items copied) ✓"
        
        log_warn "Note: Git subtree tracking remains broken until you reset it"
        log_info "To restore git subtree (optional):"
        log_info "  1. Commit these changes normally"
        log_info "  2. Run: git subtree pull --prefix=$EPF_PREFIX $CANONICAL_REMOTE $CANONICAL_BRANCH --squash"
        log_info "  3. Resolve any conflicts, then commit"
        echo ""
    fi
    
    log_step "Checking .gitignore after pull..."
    if [[ -n "$product_name" ]]; then
        restore_product_gitignore "$product_name"
    fi
    
    # Clean up backup if it exists
    rm -f "$backup_file"
    
    log_step "Validating pulled version..."
    validate_version_consistency
    
    log_info "Pull complete! ✓"
    log_warn "Note: Your _instances/ folder is preserved (not affected by pull)"
}

init_product_instance() {
    local product_name="${1:-}"
    
    if [[ -z "$product_name" ]]; then
        echo "Usage: $0 init <product-name>"
        echo ""
        echo "Example: $0 init myproduct"
        echo ""
        echo "This will:"
        echo "  1. Create _instances/<product-name>/ folder structure"
        echo "  2. Create a product-specific .gitignore that tracks your instance"
        echo "  3. Copy template files for your instance"
        exit 1
    fi
    
    log_info "Initializing EPF instance for '$product_name'..."
    echo ""
    
    local instances_dir="$EPF_PREFIX/_instances/$product_name"
    local gitignore_file="$EPF_PREFIX/.gitignore"
    
    # Check if instance already exists
    if [[ -d "$instances_dir" ]]; then
        log_warn "Instance folder already exists: $instances_dir"
        echo ""
    else
        log_step "Creating instance folder structure..."
        mkdir -p "$instances_dir/feature_definitions"
        
        # Copy template files from READY phase
        if [[ -d "$EPF_PREFIX/templates/READY" ]]; then
            for template in "$EPF_PREFIX/templates/READY"/*.yaml; do
                if [[ -f "$template" ]]; then
                    local basename=$(basename "$template")
                    cp "$template" "$instances_dir/$basename"
                    echo "  Copied: $basename"
                fi
            done
        fi
        
        # Create instance README
        cat > "$instances_dir/README.md" << EOF
# EPF Instance: $product_name

This folder contains the EPF artifacts specific to the **$product_name** product.

## Structure

- \`*.yaml\` - READY phase artifacts (strategy, roadmap, assumptions)
- \`feature_definitions/\` - FIRE phase feature definitions

## Getting Started

1. Edit the READY phase templates to define your product strategy
2. Create feature definitions in \`feature_definitions/\` as you plan work
3. Run validation: \`./docs/EPF/scripts/validate-instance.sh $product_name\`

See the main EPF README for full documentation.
EOF
        
        log_info "Created instance folder: $instances_dir"
    fi
    
    # Create/update product-specific .gitignore using template
    log_step "Setting up product-specific .gitignore..."
    
    local template_file="$EPF_PREFIX/templates/product.gitignore.template"
    if [[ -f "$template_file" ]]; then
        sed "s/{{PRODUCT_NAME}}/$product_name/g" "$template_file" > "$gitignore_file"
        log_info "Generated .gitignore from template"
    else
        # Fallback to inline generation
        log_warn "Template not found at $template_file - using inline generation"
        cat > "$gitignore_file" << EOF
# ════════════════════════════════════════════════════════════════════════════════
# EPF Framework .gitignore - $product_name Product Repo
# ════════════════════════════════════════════════════════════════════════════════

# Instance folders - only $product_name instance is tracked
_instances/*
!_instances/README.md
!_instances/$product_name
!_instances/$product_name/**

# Working directory
.epf-work/*
!.epf-work/README.md

# OS files
.DS_Store
Thumbs.db

# Editor files
*.swp
*.swo
*~
.idea/
.vscode/

# Temporary files
*.tmp
*.temp
*.bak
*.log
EOF
    fi
    
    log_info "Created product-specific .gitignore for '$product_name'"
    
    echo ""
    log_info "EPF instance initialized! ✓"
    echo ""
    echo "Next steps:"
    echo "  1. Edit your instance files in: $instances_dir/"
    echo "  2. Commit: git add $EPF_PREFIX && git commit -m 'EPF: Initialize $product_name instance'"
    echo "  3. Validate: ./docs/EPF/scripts/validate-instance.sh $product_name"
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
    classify)
        check_framework_changes
        ;;
    init)
        init_product_instance "$2"
        ;;
    *)
        echo "EPF Sync Script v2.4"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  check       Verify sync status (default)"
        echo "  validate    Check version consistency within files"
        echo "  classify    Run change classifier (check if version bump needed)"
        echo "  push        Push framework to canonical repo (excludes _instances/)"
        echo "  pull        Pull framework from canonical repo (auto-restores .gitignore)"
        echo "  init <name> Initialize a new product instance"
        echo ""
        echo "🔄 SELF-UPDATE: When running 'pull', this script automatically checks"
        echo "   if a newer sync script exists in canonical and uses it instead."
        echo "   This prevents old/broken sync logic from causing problems."
        echo ""
        echo "⚠️  IMPORTANT: Before pushing framework changes:"
        echo "  1. Run: ./sync-repos.sh classify"
        echo "  2. If version bump needed, run: ./scripts/bump-framework-version.sh"
        echo "  3. Commit version bump"
        echo "  4. Then: ./sync-repos.sh push"
        echo ""
        echo "The push command uses file copy instead of git subtree to properly"
        echo "exclude _instances/ which should never be in the canonical repo."
        echo ""
        echo "The pull command automatically restores the product-specific .gitignore"
        echo "if it gets overwritten by the canonical version."
        exit 1
        ;;
esac
