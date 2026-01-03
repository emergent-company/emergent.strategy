#!/bin/bash
# EPF Sync Script v2.2
# Ensures EPF framework is synchronized across canonical repo and product instances
#
# CRITICAL: git subtree push CANNOT exclude directories, so we use a different approach:
# - PULL: Uses git subtree (safe, canonical → product), auto-restores product .gitignore
# - PUSH: Clones canonical, copies files, commits, pushes (excludes _instances/)
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
        log_warn "RECOMMENDED: Use ./scripts/classify-changes.sh to check if version bump needed"
        log_info "Then: ./scripts/bump-framework-version.sh \"X.Y.Z\" \"Description\""
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
    
    # Run classifier in check mode (doesn't exit on version bump needed)
    cd "$EPF_PREFIX"
    local classifier_output=$(./scripts/classify-changes.sh 2>&1)
    local classifier_exit=$?
    cd - > /dev/null
    
    echo "$classifier_output"
    
    if [[ $classifier_exit -ne 0 ]]; then
        echo ""
        log_error "⚠️  Framework changes detected that require version bump!"
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

restore_product_gitignore() {
    local product_name="$1"
    local gitignore_file="$EPF_PREFIX/.gitignore"
    local backup_file="$EPF_PREFIX/.gitignore.product-backup"
    
    if [[ -z "$product_name" ]]; then
        log_warn "Could not detect product name - .gitignore may need manual fix"
        log_info "Check: $gitignore_file should NOT ignore your instance folder"
        return 1
    fi
    
    # Check if current .gitignore is the canonical version (ignores all instances)
    if grep -q "^# This is the CANONICAL EPF repo" "$gitignore_file" 2>/dev/null; then
        log_warn ".gitignore was overwritten with canonical version - restoring product version..."
        
        cat > "$gitignore_file" << EOF
# EPF Framework .gitignore
# This is the $product_name product repo - the $product_name instance IS tracked here

# Instance folders - only $product_name instance is tracked
# Other instances are ignored (if syncing from canonical repo)
_instances/*
!_instances/README.md
!_instances/$product_name
!_instances/$product_name/**

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
EOF
        
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
    fi
    
    # Backup current .gitignore if it's product-specific
    local gitignore_file="$EPF_PREFIX/.gitignore"
    local backup_file="$EPF_PREFIX/.gitignore.product-backup"
    if [[ -f "$gitignore_file" ]] && ! grep -q "^# This is the CANONICAL EPF repo" "$gitignore_file"; then
        cp "$gitignore_file" "$backup_file"
    fi
    
    log_step "Attempting git subtree pull..."
    
    # Try git subtree first, but have fallback ready
    # Temporarily disable exit on error for this command
    set +e
    git subtree pull --prefix="$EPF_PREFIX" "$CANONICAL_REMOTE" "$CANONICAL_BRANCH" --squash \
        -m "EPF: Pull framework updates from canonical repo" 2>&1
    local subtree_exit_code=$?
    set -e
    
    if [[ $subtree_exit_code -eq 0 ]]; then
        log_info "Git subtree pull successful ✓"
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
        if [[ -d "$EPF_PREFIX/phases/READY" ]]; then
            for template in "$EPF_PREFIX/phases/READY"/*.yaml; do
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
    
    # Create/update product-specific .gitignore
    log_step "Setting up product-specific .gitignore..."
    
    cat > "$gitignore_file" << EOF
# EPF Framework .gitignore
# This is the $product_name product repo - the $product_name instance IS tracked here

# Instance folders - only $product_name instance is tracked
# Other instances are ignored (if syncing from canonical repo)
_instances/*
!_instances/README.md
!_instances/$product_name
!_instances/$product_name/**

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
EOF
    
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
        echo "EPF Sync Script v2.2"
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
