#!/bin/bash
# =============================================================================
# EPF Create Product Repository Script
# Version: 2.3.3
# =============================================================================
# This script creates a new GitHub repository under eyedea-io organization,
# clones it locally, adds the EPF framework, and pushes everything to GitHub.
#
# USAGE:
#   ./scripts/create-epf-product-repo.sh <product-name> [target-directory]
#
# EXAMPLES:
#   # Create repo and clone to default location (~/code/)
#   ./scripts/create-epf-product-repo.sh my-new-product
#
#   # Create repo and clone to specific location
#   ./scripts/create-epf-product-repo.sh my-new-product /Users/me/projects
#
# WHAT THIS SCRIPT DOES:
#   1. Checks GitHub CLI authentication
#   2. Creates private repository under eyedea-io
#   3. Clones repository locally
#   4. Creates initial commit (required for git subtree)
#   5. Runs add-to-repo.sh to add EPF framework
#   6. Pushes EPF setup to GitHub
#
# PREREQUISITES:
#   - GitHub CLI (gh) installed and authenticated
#   - Access to eyedea-io organization
#   - Git configured with name and email
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Arguments
PRODUCT_NAME="${1:-}"
TARGET_DIR="${2:-$HOME/code}"
ORGANIZATION="eyedea-io"

# Script location (to find add-to-repo.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(dirname "$SCRIPT_DIR")"

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║        EPF Create Product Repository Script                ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_error() {
    echo -e "${RED}✗ Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

print_step() {
    echo -e "${YELLOW}Step $1: $2${NC}"
}

# =============================================================================
# Validation
# =============================================================================

print_header

# Check if product name provided
if [ -z "$PRODUCT_NAME" ]; then
    print_error "Product name is required"
    echo ""
    echo "Usage: $0 <product-name> [target-directory]"
    echo ""
    echo "Examples:"
    echo "  $0 my-new-product"
    echo "  $0 my-new-product /Users/me/projects"
    exit 1
fi

# Check for help flag
if [[ "$PRODUCT_NAME" == "-h" ]] || [[ "$PRODUCT_NAME" == "--help" ]] || [[ "$PRODUCT_NAME" == "help" ]]; then
    echo "Usage: $0 <product-name> [target-directory]"
    echo ""
    echo "Creates a new GitHub repository with EPF framework."
    echo ""
    echo "Arguments:"
    echo "  product-name       Name of the product/repository to create"
    echo "  target-directory   Local directory to clone into (default: ~/code/)"
    echo ""
    echo "Examples:"
    echo "  $0 my-new-product"
    echo "  $0 my-new-product /Users/me/projects"
    echo ""
    echo "Prerequisites:"
    echo "  - GitHub CLI (gh) installed and authenticated"
    echo "  - Access to eyedea-io organization"
    exit 0
fi

# Validate product name format
if [[ ! "$PRODUCT_NAME" =~ ^[a-z0-9-]+$ ]]; then
    print_error "Invalid product name format"
    echo ""
    echo "Product name must contain only lowercase letters, numbers, and hyphens"
    echo "Example: my-product, acme-platform, test-app-123"
    exit 1
fi

echo -e "${CYAN}Configuration:${NC}"
echo "  Product Name: $PRODUCT_NAME"
echo "  Organization: $ORGANIZATION"
echo "  Target Directory: $TARGET_DIR"
echo ""

# =============================================================================
# Step 1: Check GitHub CLI Authentication
# =============================================================================

print_step 1 "Checking GitHub CLI authentication..."

if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed"
    echo ""
    echo "Install with: brew install gh"
    echo "Then authenticate: gh auth login"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    print_error "Not authenticated with GitHub CLI"
    echo ""
    echo "Run: gh auth login"
    exit 1
fi

print_success "GitHub CLI authenticated"
echo ""

# =============================================================================
# Step 2: Create GitHub Repository
# =============================================================================

print_step 2 "Creating GitHub repository..."

REPO_URL="https://github.com/$ORGANIZATION/$PRODUCT_NAME"

# Check if repository already exists
if gh repo view "$ORGANIZATION/$PRODUCT_NAME" &> /dev/null; then
    print_error "Repository $ORGANIZATION/$PRODUCT_NAME already exists"
    echo ""
    echo "Repository URL: $REPO_URL"
    echo ""
    read -p "Do you want to clone and add EPF to the existing repo? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
    REPO_EXISTS=true
else
    # Create new repository
    gh repo create "$ORGANIZATION/$PRODUCT_NAME" \
        --private \
        --description "EPF-enabled product repository" \
        --add-readme=false
    
    print_success "Repository created: $REPO_URL"
    REPO_EXISTS=false
fi

echo ""

# =============================================================================
# Step 3: Clone Repository Locally
# =============================================================================

print_step 3 "Cloning repository locally..."

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

REPO_PATH="$TARGET_DIR/$PRODUCT_NAME"

# Check if directory already exists
if [ -d "$REPO_PATH" ]; then
    print_error "Directory $REPO_PATH already exists"
    echo ""
    read -p "Remove and re-clone? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$REPO_PATH"
    else
        echo "Using existing directory..."
    fi
fi

# Clone if directory doesn't exist
if [ ! -d "$REPO_PATH" ]; then
    cd "$TARGET_DIR"
    gh repo clone "$ORGANIZATION/$PRODUCT_NAME"
    print_success "Repository cloned to $REPO_PATH"
else
    print_info "Using existing directory: $REPO_PATH"
fi

cd "$REPO_PATH"
echo ""

# =============================================================================
# Step 4: Create Initial Commit (if new repo)
# =============================================================================

if [ "$REPO_EXISTS" = false ]; then
    print_step 4 "Creating initial commit..."
    
    # Check if there's already a commit
    if ! git rev-parse HEAD &> /dev/null; then
        echo "# $PRODUCT_NAME" > README.md
        git add README.md
        git commit -m "Initial commit"
        
        # Determine default branch name
        DEFAULT_BRANCH=$(git branch --show-current)
        git push -u origin "$DEFAULT_BRANCH"
        
        print_success "Initial commit created and pushed"
    else
        print_info "Repository already has commits"
    fi
    echo ""
else
    print_info "Step 4: Skipped (existing repository)"
    echo ""
fi

# =============================================================================
# Step 5: Add EPF Framework
# =============================================================================

print_step 5 "Adding EPF framework..."

# Run add-to-repo.sh script
bash "$SCRIPT_DIR/add-to-repo.sh" "$PRODUCT_NAME"

echo ""

# =============================================================================
# Step 6: Create AI Assistant Guidance Files
# =============================================================================

print_step 6 "Creating AI assistant guidance files..."

# Create .github directory if it doesn't exist
mkdir -p "$REPO_PATH/.github"

# Create .vscode directory if it doesn't exist
mkdir -p "$REPO_PATH/.vscode"

# Create .github/copilot-instructions.md
cat > "$REPO_PATH/.github/copilot-instructions.md" << 'EOF'
# EPF Quick Reference (Copilot Instructions)

> **File Purpose**: Quick command reference and EPF sync operations  
> **When to use**: Daily work in **product repos using EPF**  
> **For framework modifications**: See `docs/EPF/.ai-agent-instructions.md`

## 📁 When to Use Which File

| Your Situation | Use This File |
|----------------|---------------|
| **User adopting EPF for first time** | → [`docs/EPF/.ai-agent-first-contact.md`](../docs/EPF/.ai-agent-first-contact.md) |
| **Daily operations in product repo** (commands, sync) | → **This file** (you're in the right place) |
| **Modifying EPF framework** (schemas, templates) | → [`docs/EPF/.ai-agent-instructions.md`](../docs/EPF/.ai-agent-instructions.md) |
| **Enriching instance artifacts** (YAML files) | → [`docs/EPF/.ai-agent-instructions.md`](../docs/EPF/.ai-agent-instructions.md) |

---

## 🚨 CRITICAL: EPF Sync Rules 🚨

**THIS PRODUCT REPO CONTAINS EPF FRAMEWORK AS A GIT SUBTREE**

### ❌ NEVER DO THIS:
```bash
# DO NOT use manual git commands on docs/EPF/
git push origin main  # ⛔ Will contaminate canonical EPF with product data
git add docs/EPF/     # ⛔ Risks mixing framework and instance changes
```

### ✅ ALWAYS DO THIS:
```bash
# Sync framework changes TO canonical EPF repo
./docs/EPF/scripts/sync-repos.sh push

# Sync framework changes FROM canonical EPF repo
./docs/EPF/scripts/sync-repos.sh pull
```

**Why this matters:**
- `docs/EPF/` is a **subtree** of the canonical EPF framework repo
- `docs/EPF/_instances/` contains **product-specific** data that must NEVER go to canonical
- Manual git commands don't distinguish between framework and instance changes
- `sync-repos.sh` uses filtered operations to maintain separation

**When to sync:**
- ✅ After fixing bugs in `docs/EPF/scripts/`, `docs/EPF/outputs/`, schemas, templates
- ✅ After updating EPF documentation or framework tools
- ❌ Never sync when changes are only in `docs/EPF/_instances/`
- ❌ Never sync product-specific application outputs

---

## ⚡ Quick Command Reference

**Sync between repos:**
```bash
./docs/EPF/scripts/sync-repos.sh push   # Sync TO canonical
./docs/EPF/scripts/sync-repos.sh pull   # Sync FROM canonical
```

**Version management:**
```bash
./docs/EPF/scripts/bump-framework-version.sh "X.Y.Z" "Release notes"
```

**Validation:**
```bash
# Comprehensive health check (run before commits)
./docs/EPF/scripts/epf-health-check.sh

# Schema validation
./docs/EPF/scripts/validate-schemas.sh path/to/file.yaml

# Field coverage analysis
./docs/EPF/scripts/analyze-field-coverage.sh path/to/instance/

# Content quality assessment (scores, grades, enrichment guidance)
./docs/EPF/scripts/check-content-readiness.sh path/to/artifact.yaml
./docs/EPF/scripts/check-content-readiness.sh path/to/instance/READY
```

**Available scripts:**
```bash
ls docs/EPF/scripts/  # Always check existing tooling first
```

---

## 📖 Full Documentation

**For comprehensive guidelines, workflows, and protocols:**

**→ Read `docs/EPF/.ai-agent-instructions.md`**

That file contains:
- Schema-first enrichment workflow (how to populate EPF artifacts correctly)
- Version management and breaking change protocol
- Comprehensive validation procedures
- Consistency check protocols
- Canonical vs product repo rules

**Additional references:**
- `docs/EPF/MAINTENANCE.md` - Detailed consistency protocol
- `docs/EPF/CANONICAL_PURITY_RULES.md` - Framework vs instance separation
- `docs/EPF/outputs/README.md` - Output generator documentation
EOF

# Create .vscode/settings.json
cat > "$REPO_PATH/.vscode/settings.json" << 'EOF'
{
  "github.copilot.chat.codeGeneration.instructions": [
    {
      "file": ".github/copilot-instructions.md"
    }
  ]
}
EOF

# Add to git
cd "$REPO_PATH"
git add .github/copilot-instructions.md .vscode/settings.json
git commit -m "Add AI assistant guidance files

- .github/copilot-instructions.md: EPF sync rules and quick reference
- .vscode/settings.json: Configure Copilot to read guidance file

These files ensure AI assistants understand EPF's git subtree architecture
and use sync-repos.sh instead of manual git commands."

print_success "AI assistant guidance files created"
echo ""

# =============================================================================
# Step 7: Push to GitHub
# =============================================================================

print_step 7 "Pushing EPF setup to GitHub..."

git push

print_success "EPF setup pushed to GitHub"
echo ""

# =============================================================================
# Success Summary
# =============================================================================

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Success! 🎉                              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Repository:${NC} $REPO_URL"
echo -e "${CYAN}Local path:${NC} $REPO_PATH"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. cd $REPO_PATH"
echo "  2. Open docs/EPF/_instances/$PRODUCT_NAME/READY/00_north_star.yaml"
echo "  3. Fill in your product's vision and north star metrics"
echo "  4. Work through files 01 → 05 in order"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  # Pull EPF framework updates"
echo "  ./docs/EPF/scripts/sync-repos.sh pull"
echo ""
echo "  # Validate your instance"
echo "  ./docs/EPF/scripts/validate-instance.sh _instances/$PRODUCT_NAME"
echo ""
echo -e "${CYAN}AI Assistant tip:${NC}"
echo "  Tell Copilot: 'Help me fill out my North Star using the EPF wizard'"
echo ""
