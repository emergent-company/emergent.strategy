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
#   curl -sSL https://raw.githubusercontent.com/eyedea-io/epf-canonical-definition/main/scripts/add-to-repo.sh | bash -s -- your-product-name
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
EPF_REPO="git@github.com:eyedea-io/epf-canonical-definition.git"
EPF_REPO_HTTPS="https://github.com/eyedea-io/epf-canonical-definition.git"

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
# Step 5: Create product instance structure
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Step 5: Creating product instance structure...${NC}"

# Use the create-instance-structure script
bash docs/EPF/scripts/create-instance-structure.sh "$PRODUCT_NAME"

# Copy READY phase templates to instance
echo ""
echo "  Copying READY phase templates..."
cp docs/EPF/templates/READY/*.yaml docs/EPF/_instances/"$PRODUCT_NAME"/READY/

# Copy FIRE phase value model templates
echo "  Copying FIRE phase value model templates..."
cp docs/EPF/templates/FIRE/value_models/*.yaml docs/EPF/_instances/"$PRODUCT_NAME"/FIRE/value_models/

# Set up .gitignore to track only this product's instance
echo ""
echo "  Configuring .gitignore..."
cat > docs/EPF/.gitignore << GITIGNORE
# EPF Framework .gitignore - $PRODUCT_NAME Product Repo
# This file tracks the $PRODUCT_NAME product instance while ignoring other instances

# Instance folders - only $PRODUCT_NAME instance is tracked
_instances/*
!_instances/README.md
!_instances/$PRODUCT_NAME
!_instances/$PRODUCT_NAME/**

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
GITIGNORE

echo -e "${GREEN}✓ Product instance structure created${NC}"
echo ""
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
