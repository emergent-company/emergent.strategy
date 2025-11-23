#!/usr/bin/env bash
#
# consolidate-value-props.sh
# 
# Creates a single consolidated markdown document from all value proposition
# files and supporting documentation for the add-emergent-product-hierarchy change.
#
# Usage:
#   ./scripts/consolidate-value-props.sh [output-file]
#
# Default output: ./openspec/changes/add-emergent-product-hierarchy/CONSOLIDATED.md

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHANGE_DIR="$PROJECT_ROOT/openspec/changes/add-emergent-product-hierarchy"
PRODUCTS_DIR="$PROJECT_ROOT/openspec/specs/products"
DEFAULT_OUTPUT="$CHANGE_DIR/CONSOLIDATED.md"

# Get output file from argument or use default
OUTPUT_FILE="${1:-$DEFAULT_OUTPUT}"

# Ensure output directory exists
OUTPUT_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$OUTPUT_DIR"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

check_file() {
    if [[ ! -f "$1" ]]; then
        log_warning "File not found: $1"
        return 1
    fi
    return 0
}

add_section() {
    local title="$1"
    local file="$2"
    local level="${3:-1}" # Default to top-level heading
    
    if ! check_file "$file"; then
        return 1
    fi
    
    # Add section divider
    echo "" >> "$OUTPUT_FILE"
    echo "---" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    
    # Add section title
    local heading=""
    for ((i=0; i<level; i++)); do
        heading+="#"
    done
    echo "$heading $title" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    
    # Add source reference
    local relative_path="${file#$PROJECT_ROOT/}"
    echo "> **Source:** \`$relative_path\`" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    
    # Add file contents
    cat "$file" >> "$OUTPUT_FILE"
    
    log_success "Added: $title"
}

add_toc_entry() {
    local level="$1"
    local title="$2"
    local anchor="$3"
    
    local indent=""
    for ((i=1; i<level; i++)); do
        indent+="  "
    done
    
    echo "${indent}- [$title](#$anchor)" >> "$TOC_FILE"
}

generate_anchor() {
    local title="$1"
    # Convert to lowercase, replace spaces with hyphens, remove special chars
    echo "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 -]//g' | tr ' ' '-'
}

# Start generation
log_info "Generating consolidated documentation..."
log_info "Output file: $OUTPUT_FILE"
echo ""

# Create temporary TOC file
TOC_FILE=$(mktemp)

# Initialize output file with header
cat > "$OUTPUT_FILE" << 'EOF'
# Emergent Product Hierarchy: Complete Documentation

**Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")  
**Change ID:** `add-emergent-product-hierarchy`  
**Status:** Phase 1 Complete - Value Propositions

---

## About This Document

This consolidated document contains all value proposition documentation, change proposals, and supporting materials for the Emergent Product Hierarchy initiative. It combines multiple source files into a single reference document suitable for:

- Stakeholder review and approval
- Handoff to implementation teams
- Input to AI agents for analysis or iteration
- Archival and versioning

The source files are maintained separately in the `openspec/` directory and can be regenerated using `scripts/consolidate-value-props.sh`.

---

EOF

# Add date
sed -i '' "s/\$(date -u +\"%Y-%m-%d %H:%M:%S UTC\")/$(date -u +"%Y-%m-%d %H:%M:%S UTC")/" "$OUTPUT_FILE"

log_success "Created header"

# Generate TOC entries as we add sections
{
    echo "## Table of Contents"
    echo ""
} >> "$OUTPUT_FILE"

# Save current position for TOC insertion
TOC_LINE=$(wc -l < "$OUTPUT_FILE")

# Add Executive Summary
log_info "Adding executive summary..."
add_section "Executive Summary" "$CHANGE_DIR/COMPLETION_STATUS.md" 1
add_toc_entry 1 "Executive Summary" "executive-summary"

# Add Change Proposal Documents
log_info "Adding change proposal documents..."
{
    echo ""
    echo "---"
    echo ""
    echo "# Part 1: Change Proposal"
    echo ""
} >> "$OUTPUT_FILE"
add_toc_entry 1 "Part 1: Change Proposal" "part-1-change-proposal"

add_section "Proposal: Why and What Changes" "$CHANGE_DIR/proposal.md" 2
add_toc_entry 2 "Proposal: Why and What Changes" "proposal-why-and-what-changes"

add_section "Design: How It Works" "$CHANGE_DIR/design.md" 2
add_toc_entry 2 "Design: How It Works" "design-how-it-works"

add_section "Implementation Tasks" "$CHANGE_DIR/tasks.md" 2
add_toc_entry 2 "Implementation Tasks" "implementation-tasks"

# Add Spec Deltas
log_info "Adding spec deltas..."
{
    echo ""
    echo "---"
    echo ""
    echo "# Part 2: Specification Deltas"
    echo ""
} >> "$OUTPUT_FILE"
add_toc_entry 1 "Part 2: Specification Deltas" "part-2-specification-deltas"

if [[ -f "$CHANGE_DIR/specs/landing-page/spec.md" ]]; then
    add_section "Landing Page Specification" "$CHANGE_DIR/specs/landing-page/spec.md" 2
    add_toc_entry 2 "Landing Page Specification" "landing-page-specification"
fi

if [[ -f "$CHANGE_DIR/specs/product-configuration/spec.md" ]]; then
    add_section "Product Configuration Specification" "$CHANGE_DIR/specs/product-configuration/spec.md" 2
    add_toc_entry 2 "Product Configuration Specification" "product-configuration-specification"
fi

if [[ -f "$CHANGE_DIR/specs/template-packs/spec.md" ]]; then
    add_section "Template Packs Specification" "$CHANGE_DIR/specs/template-packs/spec.md" 2
    add_toc_entry 2 "Template Packs Specification" "template-packs-specification"
fi

# Add Value Propositions
log_info "Adding value propositions..."
{
    echo ""
    echo "---"
    echo ""
    echo "# Part 3: Value Propositions"
    echo ""
} >> "$OUTPUT_FILE"
add_toc_entry 1 "Part 3: Value Propositions" "part-3-value-propositions"

add_section "Emergent Core Value Proposition" "$PRODUCTS_DIR/core/value-proposition.md" 2
add_toc_entry 2 "Emergent Core Value Proposition" "emergent-core-value-proposition"

add_section "Emergent Personal Assistant Value Proposition" "$PRODUCTS_DIR/personal-assistant/value-proposition.md" 2
add_toc_entry 2 "Emergent Personal Assistant Value Proposition" "emergent-personal-assistant-value-proposition"

add_section "Emergent Product Framework Value Proposition" "$PRODUCTS_DIR/product-framework/value-proposition.md" 2
add_toc_entry 2 "Emergent Product Framework Value Proposition" "emergent-product-framework-value-proposition"

# Add Supporting Documentation
log_info "Adding supporting documentation..."
{
    echo ""
    echo "---"
    echo ""
    echo "# Part 4: Supporting Documentation"
    echo ""
} >> "$OUTPUT_FILE"
add_toc_entry 1 "Part 4: Supporting Documentation" "part-4-supporting-documentation"

add_section "Remaining Phase 1 Tasks" "$CHANGE_DIR/PHASE_1_REMAINING.md" 2
add_toc_entry 2 "Remaining Phase 1 Tasks" "remaining-phase-1-tasks"

# Add appendices
{
    echo ""
    echo "---"
    echo ""
    echo "# Appendices"
    echo ""
} >> "$OUTPUT_FILE"
add_toc_entry 1 "Appendices" "appendices"

# Appendix A: File Structure
{
    echo "## Appendix A: Source File Structure"
    echo ""
    echo "> **Note:** This shows the directory structure of source files that comprise this consolidated document."
    echo ""
    echo '```'
    echo "openspec/"
    echo "├── changes/"
    echo "│   └── add-emergent-product-hierarchy/"
    echo "│       ├── proposal.md"
    echo "│       ├── design.md"
    echo "│       ├── tasks.md"
    echo "│       ├── COMPLETION_STATUS.md"
    echo "│       ├── PHASE_1_REMAINING.md"
    echo "│       └── specs/"
    echo "│           ├── landing-page/"
    echo "│           │   └── spec.md"
    echo "│           ├── product-configuration/"
    echo "│           │   └── spec.md"
    echo "│           └── template-packs/"
    echo "│               └── spec.md"
    echo "└── specs/"
    echo "    └── products/"
    echo "        ├── core/"
    echo "        │   └── value-proposition.md"
    echo "        ├── personal-assistant/"
    echo "        │   └── value-proposition.md"
    echo "        └── product-framework/"
    echo "            └── value-proposition.md"
    echo '```'
} >> "$OUTPUT_FILE"
add_toc_entry 2 "Appendix A: Source File Structure" "appendix-a-source-file-structure"

# Appendix B: Statistics
value_prop_count=$(find "$PRODUCTS_DIR" -name "value-proposition.md" 2>/dev/null | wc -l | tr -d ' ')
spec_count=$(find "$CHANGE_DIR/specs" -name "spec.md" 2>/dev/null | wc -l | tr -d ' ')
total_files=$((value_prop_count + spec_count + 5)) # +5 for other docs

core_words=0
pa_words=0
pf_words=0
if [[ -f "$PRODUCTS_DIR/core/value-proposition.md" ]]; then
    core_words=$(wc -w < "$PRODUCTS_DIR/core/value-proposition.md" | tr -d ' ')
fi
if [[ -f "$PRODUCTS_DIR/personal-assistant/value-proposition.md" ]]; then
    pa_words=$(wc -w < "$PRODUCTS_DIR/personal-assistant/value-proposition.md" | tr -d ' ')
fi
if [[ -f "$PRODUCTS_DIR/product-framework/value-proposition.md" ]]; then
    pf_words=$(wc -w < "$PRODUCTS_DIR/product-framework/value-proposition.md" | tr -d ' ')
fi

doc_total_words=$(wc -w < "$OUTPUT_FILE" | tr -d ' ')
total_pages=$((doc_total_words / 500))

{
    echo ""
    echo "## Appendix B: Documentation Statistics"
    echo ""
    
    echo "### File Counts"
    echo ""
    echo "- Total source files: $total_files"
    echo "- Value proposition documents: $value_prop_count"
    echo "- Specification deltas: $spec_count"
    echo "- Supporting documents: 5"
    echo ""
    
    echo "### Word Counts"
    echo ""
    if [[ $core_words -gt 0 ]]; then
        echo "- Emergent Core value proposition: ~$core_words words"
    fi
    if [[ $pa_words -gt 0 ]]; then
        echo "- Personal Assistant value proposition: ~$pa_words words"
    fi
    if [[ $pf_words -gt 0 ]]; then
        echo "- Product Framework value proposition: ~$pf_words words"
    fi
    echo "- **Total consolidated document: ~$doc_total_words words**"
    echo ""
    
    echo "### Page Estimates"
    echo ""
    echo "> Assuming ~500 words per page"
    echo ""
    echo "- Estimated printed pages: ~$total_pages pages"
} >> "$OUTPUT_FILE"
add_toc_entry 2 "Appendix B: Documentation Statistics" "appendix-b-documentation-statistics"

# Appendix C: Generation Info
{
    echo ""
    echo "## Appendix C: Generation Information"
    echo ""
    echo "- **Generated by:** \`scripts/consolidate-value-props.sh\`"
    echo "- **Generated at:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo "- **Git commit:** $(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "N/A")"
    echo "- **Git branch:** $(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo "N/A")"
    echo ""
    echo "### Regeneration"
    echo ""
    echo "To regenerate this document from source files:"
    echo ""
    echo '```bash'
    echo "cd $PROJECT_ROOT"
    echo "./scripts/consolidate-value-props.sh [output-file]"
    echo '```'
    echo ""
    echo "Default output location: \`openspec/changes/add-emergent-product-hierarchy/CONSOLIDATED.md\`"
} >> "$OUTPUT_FILE"
add_toc_entry 2 "Appendix C: Generation Information" "appendix-c-generation-information"

# Insert TOC into document
# Copy TOC file without the last blank line
cat "$TOC_FILE" > "$TOC_FILE.tmp"

# Use awk to insert TOC after the TOC header
awk -v toc="$TOC_FILE.tmp" -v line="$TOC_LINE" '
    NR==line { 
        while ((getline < toc) > 0) print
        close(toc)
    }
    { print }
' "$OUTPUT_FILE" > "$OUTPUT_FILE.tmp"

mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"
rm -f "$TOC_FILE" "$TOC_FILE.tmp"

log_success "Inserted table of contents"

# Add footer
{
    echo ""
    echo "---"
    echo ""
    echo "**End of Consolidated Documentation**"
    echo ""
    echo "Generated by \`scripts/consolidate-value-props.sh\` on $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
} >> "$OUTPUT_FILE"

# Final statistics
echo ""
log_success "Consolidation complete!"
echo ""
log_info "Output file: $OUTPUT_FILE"

# Calculate statistics
TOTAL_LINES=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')
TOTAL_WORDS=$(wc -w < "$OUTPUT_FILE" | tr -d ' ')
TOTAL_CHARS=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')

echo ""
echo -e "${GREEN}Statistics:${NC}"
echo "  Lines:      $TOTAL_LINES"
echo "  Words:      $TOTAL_WORDS"
echo "  Characters: $TOTAL_CHARS"
echo "  File size:  $FILE_SIZE"
echo ""

# Provide next steps
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Review the consolidated document: $OUTPUT_FILE"
echo "  2. Share with stakeholders for review"
echo "  3. Provide to AI agents for analysis or iteration"
echo "  4. Use for presentations or handoff documentation"
echo ""

exit 0
