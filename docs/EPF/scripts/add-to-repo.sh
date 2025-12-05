#!/bin/bash
# =============================================================================
# EPF Add to Repository Script
# =============================================================================
# This script adds the EPF framework to a new product repository.
# Run this FROM the target product repo, or pass the repo path as argument.
#
# USAGE:
#   # Option 1: Run from inside the target repo
#   cd /path/to/your-product-repo
#   curl -sSL https://raw.githubusercontent.com/eyedea-io/epf/main/scripts/add-to-repo.sh | bash -s -- your-product-name
#
#   # Option 2: Run with repo path
#   ./add-to-repo.sh your-product-name /path/to/your-product-repo
#
# WHAT THIS SCRIPT DOES:
#   1. Validates the target is a git repository
#   2. Adds EPF remote if not present
#   3. Adds EPF as a git subtree at docs/EPF/
#   4. Creates product-specific instance folder
#   5. Copies starter templates
#   6. Commits the changes
#
# PREREQUISITES:
#   - Git installed
#   - Target directory is a git repository
#   - No uncommitted changes in target repo
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Arguments
PRODUCT_NAME="${1:-}"
TARGET_REPO="${2:-$(pwd)}"

# EPF Repository
EPF_REPO="git@github.com:eyedea-io/epf.git"
EPF_REPO_HTTPS="https://github.com/eyedea-io/epf.git"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          EPF Add to Repository Script                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 0: Validate arguments
# -----------------------------------------------------------------------------
if [ -z "$PRODUCT_NAME" ]; then
    echo -e "${RED}ERROR: Product name is required${NC}"
    echo ""
    echo "Usage: $0 <product-name> [target-repo-path]"
    echo ""
    echo "Examples:"
    echo "  $0 my-saas-product"
    echo "  $0 my-saas-product /path/to/repo"
    exit 1
fi

echo -e "${YELLOW}Product Name:${NC} $PRODUCT_NAME"
echo -e "${YELLOW}Target Repo:${NC}  $TARGET_REPO"
echo ""

# -----------------------------------------------------------------------------
# Step 1: Validate target repository
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Step 1: Validating target repository...${NC}"

cd "$TARGET_REPO" || {
    echo -e "${RED}ERROR: Cannot access target directory: $TARGET_REPO${NC}"
    exit 1
}

if [ ! -d ".git" ]; then
    echo -e "${RED}ERROR: Target is not a git repository${NC}"
    echo "Initialize with: git init"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}ERROR: Target repository has uncommitted changes${NC}"
    echo "Please commit or stash changes first:"
    echo "  git status"
    echo "  git stash"
    exit 1
fi

echo -e "${GREEN}✓ Target repository validated${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 2: Check if EPF already exists
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Step 2: Checking for existing EPF installation...${NC}"

if [ -d "docs/EPF" ]; then
    echo -e "${RED}ERROR: docs/EPF already exists in this repository${NC}"
    echo ""
    echo "If you want to update EPF, use:"
    echo "  git subtree pull --prefix=docs/EPF epf main --squash"
    echo ""
    echo "If you want to reinstall, first remove it:"
    echo "  rm -rf docs/EPF"
    echo "  git commit -am 'Remove EPF for reinstall'"
    exit 1
fi

echo -e "${GREEN}✓ No existing EPF installation found${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 3: Add EPF remote
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Step 3: Setting up EPF remote...${NC}"

if git remote | grep -q "^epf$"; then
    echo "  EPF remote already exists"
else
    # Try SSH first, fall back to HTTPS
    if git ls-remote "$EPF_REPO" &>/dev/null; then
        git remote add epf "$EPF_REPO"
        echo "  Added EPF remote (SSH)"
    else
        git remote add epf "$EPF_REPO_HTTPS"
        echo "  Added EPF remote (HTTPS)"
    fi
fi

echo -e "${GREEN}✓ EPF remote configured${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 4: Add EPF as subtree
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Step 4: Adding EPF as git subtree...${NC}"

git subtree add --prefix=docs/EPF epf main --squash

echo -e "${GREEN}✓ EPF framework added to docs/EPF/${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 5: Create product instance folder
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Step 5: Creating product instance folder...${NC}"

INSTANCE_DIR="docs/EPF/_instances/$PRODUCT_NAME"
mkdir -p "$INSTANCE_DIR"
mkdir -p "$INSTANCE_DIR/feature_definitions"
mkdir -p "$INSTANCE_DIR/value_models"
mkdir -p "$INSTANCE_DIR/workflows"

# Create _meta.yaml
cat > "$INSTANCE_DIR/_meta.yaml" << EOF
# EPF Instance Metadata
# Generated on $(date +%Y-%m-%d)

product_name: "$PRODUCT_NAME"
epf_version: "1.9.4"
cycle: 1
status: "initializing"

created_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
created_by: "EPF add-to-repo script"

notes: |
  This instance was created automatically.
  Start by filling out 00_north_star.yaml with your product's vision.
EOF

# Copy starter templates
echo "  Copying starter templates..."
cp docs/EPF/phases/READY/00_north_star.yaml "$INSTANCE_DIR/"
cp docs/EPF/phases/READY/01_insight_analyses.yaml "$INSTANCE_DIR/"
cp docs/EPF/phases/READY/02_strategy_foundations.yaml "$INSTANCE_DIR/"
cp docs/EPF/phases/READY/03_insight_opportunity.yaml "$INSTANCE_DIR/"
cp docs/EPF/phases/READY/04_strategy_formula.yaml "$INSTANCE_DIR/"
cp docs/EPF/phases/READY/05_roadmap_recipe.yaml "$INSTANCE_DIR/"

# Create instance README
cat > "$INSTANCE_DIR/README.md" << EOF
# $PRODUCT_NAME EPF Instance

This folder contains the EPF (Emergent Product Framework) instance for **$PRODUCT_NAME**.

## Getting Started

1. Start with \`00_north_star.yaml\` - define your product vision
2. Work through the READY phase files in order (00 → 05)
3. Use the wizards in \`docs/EPF/wizards/\` for AI-assisted filling

## Files

| File | Purpose | Status |
|------|---------|--------|
| \`00_north_star.yaml\` | Product vision and north star metrics | 🔲 Not started |
| \`01_insight_analyses.yaml\` | Market and internal analyses | 🔲 Not started |
| \`02_strategy_foundations.yaml\` | Strategic foundations | 🔲 Not started |
| \`03_insight_opportunity.yaml\` | Opportunities from insights | 🔲 Not started |
| \`04_strategy_formula.yaml\` | Strategic initiatives | 🔲 Not started |
| \`05_roadmap_recipe.yaml\` | Roadmap and work packages | 🔲 Not started |

## Cycle Information

- **Current Cycle:** 1
- **EPF Version:** 1.9.4
- **Created:** $(date +%Y-%m-%d)

## Need Help?

- See \`docs/EPF/MAINTENANCE.md\` for framework documentation
- Use wizards in \`docs/EPF/wizards/\` for AI-assisted content creation
- Check schemas in \`docs/EPF/schemas/\` for validation
EOF

echo -e "${GREEN}✓ Product instance folder created: $INSTANCE_DIR${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 6: Commit changes
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Step 6: Committing changes...${NC}"

git add docs/EPF/_instances/
git commit -m "EPF: Initialize $PRODUCT_NAME instance

- Added EPF framework v1.9.4 via git subtree
- Created product instance folder at docs/EPF/_instances/$PRODUCT_NAME/
- Copied READY phase templates for customization

Next steps:
1. Fill out 00_north_star.yaml with product vision
2. Work through READY phase files (00 → 05)
3. See docs/EPF/MAINTENANCE.md for guidance"

echo -e "${GREEN}✓ Changes committed${NC}"
echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Setup Complete!                         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}EPF has been added to your repository!${NC}"
echo ""
echo -e "${YELLOW}Structure created:${NC}"
echo "  docs/EPF/                           # Framework (synced via subtree)"
echo "  docs/EPF/_instances/$PRODUCT_NAME/  # Your product instance"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Open docs/EPF/_instances/$PRODUCT_NAME/00_north_star.yaml"
echo "  2. Fill in your product's vision and north star metrics"
echo "  3. Work through files 01 → 05 in order"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  # Pull EPF framework updates"
echo "  git subtree pull --prefix=docs/EPF epf main --squash -m 'EPF: Pull updates'"
echo ""
echo "  # Push framework improvements back (if you improve EPF itself)"
echo "  git subtree push --prefix=docs/EPF epf main"
echo ""
echo -e "${YELLOW}AI Assistant tip:${NC}"
echo "  Tell Copilot: 'Help me fill out my North Star using the EPF wizard'"
echo "  See docs/EPF/wizards/ for AI-assisted content creation prompts"
echo ""
echo -e "${GREEN}Done!${NC}"
