#!/bin/bash
# =============================================================================
# EPF Value Model Preview Validator
# =============================================================================
# Validates generated HTML preview files for correctness and completeness.
#
# Usage:
#   bash validator.sh <path-to-html-file>
#   bash validator.sh docs/EPF/_instances/emergent/outputs/value-model-previews/product.html
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation errors found
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0

# Helper functions
error() {
    echo -e "${RED}❌ ERROR:${NC} $1"
    ((ERRORS++))
}

warning() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1"
    ((WARNINGS++))
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# =============================================================================
# Validation Functions
# =============================================================================

validate_file_exists() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        error "File not found: $file"
        return 1
    fi
    success "File exists"
    return 0
}

validate_html_structure() {
    local file="$1"
    
    # Check DOCTYPE
    if ! grep -q "<!DOCTYPE html>" "$file"; then
        error "Missing <!DOCTYPE html> declaration"
    else
        success "DOCTYPE declaration present"
    fi
    
    # Check html tag with theme attribute
    if ! grep -q '<html.*data-theme=' "$file"; then
        warning "Missing data-theme attribute on <html> tag"
    else
        success "Theme attribute present"
    fi
    
    # Check required meta tags
    if ! grep -q '<meta charset="UTF-8">' "$file"; then
        error "Missing charset meta tag"
    else
        success "Charset meta tag present"
    fi
    
    if ! grep -q '<meta name="viewport"' "$file"; then
        warning "Missing viewport meta tag (affects mobile)"
    else
        success "Viewport meta tag present"
    fi
    
    if ! grep -q '<meta name="generator"' "$file"; then
        warning "Missing generator meta tag"
    else
        success "Generator meta tag present"
    fi
    
    if ! grep -q '<meta name="generated-at"' "$file"; then
        warning "Missing generated-at meta tag"
    else
        success "Generated-at meta tag present"
    fi
}

validate_content_sections() {
    local file="$1"
    
    # Check for header
    if ! grep -q '<header class="header">' "$file"; then
        error "Missing header section"
    else
        success "Header section present"
    fi
    
    # Check for title
    if ! grep -q '<h1 class="header__title">' "$file"; then
        error "Missing main title (h1)"
    else
        success "Main title present"
    fi
    
    # Check for at least one layer
    if ! grep -q '<section class="layer"' "$file"; then
        warning "No layer sections found (might be portfolio format)"
    else
        layer_count=$(grep -c '<section class="layer"' "$file" || echo "0")
        success "Found $layer_count layer section(s)"
    fi
    
    # Check for footer
    if ! grep -q '<footer class="footer">' "$file"; then
        warning "Missing footer section"
    else
        success "Footer section present"
    fi
}

validate_embedded_styles() {
    local file="$1"
    
    # Check for embedded CSS
    if ! grep -q '<style>' "$file"; then
        error "Missing embedded styles (file won't render correctly)"
    else
        success "Embedded styles present"
    fi
    
    # Check for CSS variables (theme support)
    if ! grep -q ':root {' "$file"; then
        warning "Missing CSS custom properties (:root)"
    else
        success "CSS custom properties present"
    fi
    
    # Check for dark theme support
    if ! grep -q '\[data-theme="dark"\]' "$file"; then
        warning "Missing dark theme styles"
    else
        success "Dark theme styles present"
    fi
}

validate_accessibility() {
    local file="$1"
    
    # Check for lang attribute
    if ! grep -q '<html lang=' "$file"; then
        warning "Missing lang attribute on <html> (accessibility)"
    else
        success "Language attribute present"
    fi
    
    # Check for heading hierarchy
    if grep -q '<h1' "$file" && grep -q '<h2' "$file"; then
        success "Proper heading hierarchy (h1, h2)"
    else
        warning "Check heading hierarchy"
    fi
}

validate_no_external_deps() {
    local file="$1"
    
    # Check for external stylesheets
    if grep -q '<link.*rel="stylesheet".*href="http' "$file"; then
        error "External stylesheet found (file should be self-contained)"
    else
        success "No external stylesheets"
    fi
    
    # Check for external scripts
    if grep -q '<script.*src="http' "$file"; then
        error "External script found (file should be self-contained)"
    else
        success "No external scripts"
    fi
    
    # Check for external images (warning only)
    if grep -q 'src="http' "$file"; then
        warning "External resources found (may not work offline)"
    else
        success "No external resources"
    fi
}

validate_placeholders_replaced() {
    local file="$1"
    
    # Check for unreplaced Handlebars-style placeholders
    if grep -q '{{[A-Z_]*}}' "$file"; then
        error "Found unreplaced placeholders ({{...}})"
        grep -o '{{[A-Z_]*}}' "$file" | sort -u | while read placeholder; do
            echo "       - $placeholder"
        done
    else
        success "All placeholders replaced"
    fi
    
    # Check for template logic that wasn't processed
    if grep -q '{{#if' "$file" || grep -q '{{#each' "$file"; then
        error "Found unprocessed template logic ({{#if}}, {{#each}})"
    else
        success "No unprocessed template logic"
    fi
}

validate_data_integrity() {
    local file="$1"
    
    # Check track name is valid
    local track_name=$(grep -oP '(?<=header__track-badge">)[^<]+' "$file" | head -1 || echo "")
    if [[ -z "$track_name" ]]; then
        warning "Could not extract track name"
    elif [[ "$track_name" =~ ^(Product|Strategy|OrgOps|Commercial)$ ]]; then
        success "Valid track name: $track_name"
    else
        warning "Non-standard track name: $track_name"
    fi
    
    # Check version format
    if grep -q 'v[0-9]\+\.[0-9]\+\.[0-9]\+' "$file"; then
        success "Version number present in semver format"
    else
        warning "Version number not found or not in semver format"
    fi
    
    # Check generated date present
    if grep -q 'Generated:' "$file"; then
        success "Generation date present"
    else
        warning "Generation date not found"
    fi
}

validate_file_size() {
    local file="$1"
    local size=$(wc -c < "$file")
    
    # Minimum size check (basic HTML + styles should be at least 10KB)
    if [[ $size -lt 10000 ]]; then
        warning "File seems small ($size bytes) - may be missing content"
    else
        success "File size reasonable ($size bytes)"
    fi
    
    # Maximum size check (single model shouldn't exceed 500KB)
    if [[ $size -gt 500000 ]]; then
        warning "File is large ($size bytes) - may affect loading performance"
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    echo ""
    echo "=========================================="
    echo "  EPF Value Model Preview Validator"
    echo "=========================================="
    echo ""
    
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <path-to-html-file>"
        echo ""
        echo "Example:"
        echo "  $0 docs/EPF/_instances/emergent/outputs/value-model-previews/product.html"
        exit 1
    fi
    
    local file="$1"
    
    info "Validating: $file"
    echo ""
    
    # Run all validations
    echo "📁 File Validation"
    echo "-------------------"
    validate_file_exists "$file" || exit 1
    validate_file_size "$file"
    echo ""
    
    echo "📄 HTML Structure"
    echo "-------------------"
    validate_html_structure "$file"
    echo ""
    
    echo "📝 Content Sections"
    echo "-------------------"
    validate_content_sections "$file"
    echo ""
    
    echo "🎨 Embedded Styles"
    echo "-------------------"
    validate_embedded_styles "$file"
    echo ""
    
    echo "♿ Accessibility"
    echo "-------------------"
    validate_accessibility "$file"
    echo ""
    
    echo "📦 Self-Contained Check"
    echo "-------------------"
    validate_no_external_deps "$file"
    echo ""
    
    echo "🔧 Template Processing"
    echo "-------------------"
    validate_placeholders_replaced "$file"
    echo ""
    
    echo "📊 Data Integrity"
    echo "-------------------"
    validate_data_integrity "$file"
    echo ""
    
    # Summary
    echo "=========================================="
    echo "  Validation Summary"
    echo "=========================================="
    echo ""
    
    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}❌ FAILED${NC}: $ERRORS error(s), $WARNINGS warning(s)"
        echo ""
        echo "Fix the errors above before using this preview."
        exit 1
    elif [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}⚠️  PASSED WITH WARNINGS${NC}: $WARNINGS warning(s)"
        echo ""
        echo "Preview is usable but consider addressing warnings."
        exit 0
    else
        echo -e "${GREEN}✅ PASSED${NC}: All validations successful!"
        echo ""
        echo "Preview is ready to use."
        exit 0
    fi
}

main "$@"
