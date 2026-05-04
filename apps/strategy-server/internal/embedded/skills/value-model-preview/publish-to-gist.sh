#!/bin/bash
# ============================================
# EPF Value Model Preview - Gist Publisher
# ============================================
# Publishes HTML preview files to GitHub Gist for easy sharing
# 
# Usage:
#   ./publish-to-gist.sh <html-file>           # Create new gist
#   ./publish-to-gist.sh <html-file> <gist-id> # Update existing gist
#
# Requirements:
#   - GitHub CLI (gh) installed and authenticated
#   - Run: gh auth login
#
# Examples:
#   ./publish-to-gist.sh product.emergent-core.preview.html
#   ./publish-to-gist.sh product.epf-runtime.preview.html abc123def456
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check dependencies
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install with: brew install gh"
    exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with GitHub CLI${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Parse arguments
HTML_FILE="$1"
GIST_ID="$2"

if [ -z "$HTML_FILE" ]; then
    echo -e "${YELLOW}Usage: $0 <html-file> [gist-id]${NC}"
    echo ""
    echo "Arguments:"
    echo "  html-file  Path to the HTML preview file"
    echo "  gist-id    (Optional) Existing gist ID to update"
    echo ""
    echo "Examples:"
    echo "  $0 product.emergent-core.preview.html"
    echo "  $0 ../../../_instances/emergent/outputs/value-model-previews/product.epf-runtime.preview.html"
    exit 1
fi

# Resolve full path
if [[ "$HTML_FILE" != /* ]]; then
    HTML_FILE="$(pwd)/$HTML_FILE"
fi

# Check file exists
if [ ! -f "$HTML_FILE" ]; then
    echo -e "${RED}Error: File not found: $HTML_FILE${NC}"
    exit 1
fi

# Extract filename for gist
FILENAME=$(basename "$HTML_FILE")

# Extract product name from filename for description
PRODUCT_NAME=$(echo "$FILENAME" | sed 's/product\.\(.*\)\.preview\.html/\1/' | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

DESCRIPTION="EPF Value Model Preview: $PRODUCT_NAME"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  EPF Value Model Preview - Gist Publisher${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "File: ${GREEN}$FILENAME${NC}"
echo -e "Description: $DESCRIPTION"
echo ""

if [ -n "$GIST_ID" ]; then
    # Update existing gist
    echo -e "${YELLOW}Updating existing gist: $GIST_ID${NC}"
    
    RESULT=$(gh gist edit "$GIST_ID" --add "$HTML_FILE" 2>&1) || {
        echo -e "${RED}Failed to update gist${NC}"
        echo "$RESULT"
        exit 1
    }
    
    GIST_URL="https://gist.github.com/$GIST_ID"
    RAW_URL="https://gist.githubusercontent.com/$(gh api user --jq '.login')/$GIST_ID/raw/$FILENAME"
    PREVIEW_URL="https://htmlpreview.github.io/?$RAW_URL"
    
    echo -e "${GREEN}✓ Gist updated successfully!${NC}"
else
    # Create new gist
    echo -e "${YELLOW}Creating new public gist...${NC}"
    
    RESULT=$(gh gist create "$HTML_FILE" --public --desc "$DESCRIPTION" 2>&1)
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to create gist${NC}"
        echo "$RESULT"
        exit 1
    fi
    
    # Extract gist URL from result
    GIST_URL=$(echo "$RESULT" | grep -o 'https://gist.github.com/[^ ]*')
    GIST_ID=$(basename "$GIST_URL")
    
    # Get username for raw URL
    USERNAME=$(gh api user --jq '.login')
    RAW_URL="https://gist.githubusercontent.com/$USERNAME/$GIST_ID/raw/$FILENAME"
    PREVIEW_URL="https://htmlpreview.github.io/?$RAW_URL"
    
    echo -e "${GREEN}✓ Gist created successfully!${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Shareable Links:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "📄 Gist Page:"
echo -e "   ${GIST_URL}"
echo ""
echo -e "🔗 Raw HTML:"
echo -e "   ${RAW_URL}"
echo ""
echo -e "👁️  Live Preview (recommended for sharing):"
echo -e "   ${PREVIEW_URL}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "To update this gist later, run:"
echo -e "  ${YELLOW}$0 $HTML_FILE $GIST_ID${NC}"
echo ""

# Copy preview URL to clipboard (macOS)
if command -v pbcopy &> /dev/null; then
    echo "$PREVIEW_URL" | pbcopy
    echo -e "${GREEN}✓ Preview URL copied to clipboard!${NC}"
fi

# Save gist mapping for future updates
MAPPING_FILE="$(dirname "$HTML_FILE")/.gist-mappings"
if [ -f "$MAPPING_FILE" ]; then
    # Update existing entry or add new
    grep -v "^$FILENAME=" "$MAPPING_FILE" > "$MAPPING_FILE.tmp" 2>/dev/null || true
    mv "$MAPPING_FILE.tmp" "$MAPPING_FILE"
fi
echo "$FILENAME=$GIST_ID" >> "$MAPPING_FILE"
echo -e "${GREEN}✓ Gist ID saved to .gist-mappings for future updates${NC}"
