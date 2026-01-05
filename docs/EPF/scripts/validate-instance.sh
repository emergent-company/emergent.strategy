#!/bin/bash
# EPF Instance Validation Script
# Version: 1.11.0
# 
# This script validates that an EPF instance follows the framework structure
# and conventions. Run this script from the EPF root directory or pass the
# path as an argument.
#
# Usage:
#   ./scripts/validate-instance.sh [instance-path]
#   ./scripts/validate-instance.sh _instances/my-product
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation errors found
#
# Changelog:
#   v1.11.0 - Integrated enhanced health check (Tiers 2-3: coverage + alignment)
#   v1.10.2 - Added product_portfolio.yaml validation for multi-product orgs
#   v1.9.7 - Fixed feature definition validation to accept YAML format per schema

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
PASSED=0

# Helper functions
log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
    ((ERRORS++)) || true
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1"
    ((WARNINGS++)) || true
}

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++)) || true
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Determine the EPF root and instance path
if [ -n "$1" ]; then
    INSTANCE_PATH="$1"
else
    # Try to find instance path from current directory
    if [ -d "_instances" ]; then
        EPF_ROOT="."
        # Find first instance
        INSTANCE_PATH=$(find _instances -mindepth 1 -maxdepth 1 -type d | head -1)
    elif [ -d "docs/EPF/_instances" ]; then
        EPF_ROOT="docs/EPF"
        INSTANCE_PATH=$(find docs/EPF/_instances -mindepth 1 -maxdepth 1 -type d | head -1)
    else
        echo "Usage: $0 <instance-path>"
        echo "Example: $0 _instances/my-product"
        exit 1
    fi
fi

if [ ! -d "$INSTANCE_PATH" ]; then
    log_error "Instance path does not exist: $INSTANCE_PATH"
    exit 1
fi

INSTANCE_NAME=$(basename "$INSTANCE_PATH")

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         EPF Instance Validation Script v1.10.2                   ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
log_info "Validating instance: $INSTANCE_NAME"
log_info "Instance path: $INSTANCE_PATH"

# =============================================================================
# Section 1: Phase-Based Directory Structure
# =============================================================================
log_section "1. Phase-Based Directory Structure"

# Check for phase directories (required)
PHASE_DIRS=("READY" "FIRE")
OPTIONAL_PHASE_DIRS=("AIM")

for dir in "${PHASE_DIRS[@]}"; do
    if [ -d "$INSTANCE_PATH/$dir" ]; then
        log_pass "Found phase directory: $dir/"
    else
        log_error "Missing required phase directory: $dir/"
        log_info "  Instances MUST use phase-based structure. See _instances/README.md"
    fi
done

for dir in "${OPTIONAL_PHASE_DIRS[@]}"; do
    if [ -d "$INSTANCE_PATH/$dir" ]; then
        log_pass "Found optional phase directory: $dir/"
    else
        log_warning "Optional phase directory not found: $dir/ (create when entering AIM phase)"
    fi
done

# Detect legacy flat structure (files in root instead of READY/)
LEGACY_FILES=("00_north_star.yaml" "01_insight_analyses.yaml" "04_strategy_formula.yaml" "05_roadmap_recipe.yaml")
FLAT_STRUCTURE_DETECTED=false

for file in "${LEGACY_FILES[@]}"; do
    if [ -f "$INSTANCE_PATH/$file" ]; then
        FLAT_STRUCTURE_DETECTED=true
        break
    fi
done

if [ "$FLAT_STRUCTURE_DETECTED" = true ]; then
    log_error "LEGACY FLAT STRUCTURE DETECTED"
    log_info "  Files found in instance root instead of READY/ directory"
    log_info "  Run migration: see docs/EPF/_instances/README.md 'Migrating from Flat Structure'"
fi

# =============================================================================
# Section 2: Required READY Phase Files
# =============================================================================
log_section "2. Required READY Phase Files"

# Determine READY path (phase-based or flat for backwards compatibility)
if [ -d "$INSTANCE_PATH/READY" ]; then
    READY_PATH="$INSTANCE_PATH/READY"
else
    READY_PATH="$INSTANCE_PATH"
fi

READY_FILES=(
    "00_north_star.yaml"
    "01_insight_analyses.yaml"
    "02_strategy_foundations.yaml"
    "03_insight_opportunity.yaml"
    "04_strategy_formula.yaml"
)

for file in "${READY_FILES[@]}"; do
    if [ -f "$READY_PATH/$file" ]; then
        log_pass "Found: $file"
    else
        log_error "Missing required file: $file"
    fi
done

# Special handling for roadmap (could be 04 or 05 depending on version)
if [ -f "$READY_PATH/04_roadmap_recipe.yaml" ] || [ -f "$READY_PATH/05_roadmap_recipe.yaml" ]; then
    log_pass "Found: roadmap_recipe.yaml (04 or 05 numbering)"
else
    log_error "Missing required file: roadmap_recipe.yaml"
fi

# =============================================================================
# Section 3: Required FIRE Phase Directories
# =============================================================================
log_section "3. Required FIRE Phase Directories"

# Determine FIRE path (phase-based or flat for backwards compatibility)
if [ -d "$INSTANCE_PATH/FIRE" ]; then
    FIRE_PATH="$INSTANCE_PATH/FIRE"
else
    FIRE_PATH="$INSTANCE_PATH"
fi

REQUIRED_FIRE_DIRS=(
    "feature_definitions"
    "value_models"
)

OPTIONAL_FIRE_DIRS=(
    "workflows"
)

for dir in "${REQUIRED_FIRE_DIRS[@]}"; do
    if [ -d "$FIRE_PATH/$dir" ]; then
        log_pass "Found directory: $dir/"
    else
        log_error "Missing required directory: $dir/"
    fi
done

for dir in "${OPTIONAL_FIRE_DIRS[@]}"; do
    if [ -d "$FIRE_PATH/$dir" ]; then
        log_pass "Found optional directory: $dir/"
    else
        log_warning "Optional directory not found: $dir/"
    fi
done

# Check for mappings.yaml in FIRE
if [ -f "$FIRE_PATH/mappings.yaml" ]; then
    log_pass "Found: FIRE/mappings.yaml"
else
    log_warning "Optional file not found: FIRE/mappings.yaml"
fi

# =============================================================================
# Section 4: Feature Definition Format Validation
# =============================================================================
log_section "4. Feature Definition Format"

FD_DIR="$FIRE_PATH/feature_definitions"
if [ -d "$FD_DIR" ]; then
    # Check for YAML files (the correct format per EPF schema)
    YAML_COUNT=$(find "$FD_DIR" -maxdepth 1 \( -name "*.yaml" -o -name "*.yml" \) ! -name "_*" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$YAML_COUNT" -gt 0 ]; then
        log_pass "Found $YAML_COUNT YAML feature definition(s)"
        
        # Validate naming convention (fd-XXX_slug.yaml or slug.yaml)
        for yaml_file in "$FD_DIR"/*.yaml "$FD_DIR"/*.yml; do
            [ -f "$yaml_file" ] || continue
            filename=$(basename "$yaml_file")
            
            # Skip supplementary/helper files
            [[ "$filename" == _* ]] && continue
            
            if [[ "$filename" =~ ^fd-[0-9]+_[a-z0-9_-]+\.yaml$ ]] || [[ "$filename" =~ ^[a-z0-9]+(-[a-z0-9]+)*\.yaml$ ]]; then
                log_pass "Correct naming: $filename"
            else
                log_warning "Non-standard naming: $filename (expected: fd-XXX_slug.yaml or slug.yaml)"
            fi
        done
        
        # Validate required fields in each feature definition (per schema)
        for yaml_file in "$FD_DIR"/*.yaml "$FD_DIR"/*.yml; do
            [ -f "$yaml_file" ] || continue
            filename=$(basename "$yaml_file")
            [[ "$filename" == _* ]] && continue
            
            # Check for required fields: id, name, slug, status, strategic_context, definition
            if grep -q "^id:" "$yaml_file" && \
               grep -q "^name:" "$yaml_file" && \
               grep -q "^slug:" "$yaml_file" && \
               grep -q "^status:" "$yaml_file" && \
               grep -q "^strategic_context:" "$yaml_file" && \
               grep -q "^definition:" "$yaml_file"; then
                log_pass "Required fields present in: $filename"
            else
                log_error "Missing required fields in: $filename (needs: id, name, slug, status, strategic_context, definition)"
            fi
            
            # Validate status is one of the allowed values
            STATUS=$(grep "^status:" "$yaml_file" | head -1 | awk '{print $2}' | tr -d '"' | tr -d "'" || true)
            if [[ "$STATUS" =~ ^(draft|ready|in-progress|delivered)$ ]]; then
                : # Valid status, no message needed
            else
                log_error "Invalid status '$STATUS' in $filename (must be: draft, ready, in-progress, or delivered)"
            fi
        done
    else
        log_warning "No feature definitions found in $FD_DIR"
    fi
    
    # Legacy check: warn if Markdown files exist (deprecated format)
    MD_COUNT=$(find "$FD_DIR" -maxdepth 1 -name "*.md" ! -name "README.md" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$MD_COUNT" -gt 0 ]; then
        log_warning "Found $MD_COUNT Markdown file(s) - consider migrating to YAML format per EPF v1.9.6+ schema"
    fi
else
    log_error "feature_definitions directory not found"
fi

# =============================================================================
# Section 5: Value Models Validation
# =============================================================================
log_section "5. Value Models"

VM_DIR="$FIRE_PATH/value_models"
if [ -d "$VM_DIR" ]; then
    VM_COUNT=$(find "$VM_DIR" -maxdepth 1 -name "*.yaml" -o -name "*.yml" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$VM_COUNT" -gt 0 ]; then
        log_pass "Found $VM_COUNT value model file(s)"
    else
        log_warning "No value model files found in $VM_DIR"
    fi
else
    log_error "value_models directory not found"
fi

# =============================================================================
# Section 5b: Product Portfolio (Optional for Multi-Product Orgs)
# =============================================================================
log_section "5b. Product Portfolio"

PORTFOLIO_FILE="$INSTANCE_PATH/product_portfolio.yaml"
if [ -f "$PORTFOLIO_FILE" ]; then
    log_pass "Found: product_portfolio.yaml (multi-product organization)"
    
    # Validate required top-level structure
    if grep -q "^portfolio:" "$PORTFOLIO_FILE"; then
        log_pass "Portfolio has required 'portfolio:' root key"
        
        # Check for required portfolio fields
        if grep -q "id:" "$PORTFOLIO_FILE" && \
           grep -q "name:" "$PORTFOLIO_FILE" && \
           grep -q "product_lines:" "$PORTFOLIO_FILE"; then
            log_pass "Portfolio has required fields (id, name, product_lines)"
        else
            log_error "Portfolio missing required fields (id, name, or product_lines)"
        fi
        
        # Check product line references in value_models
        if [ -d "$VM_DIR" ]; then
            PL_COUNT=$(grep -c "id: \"pl-" "$PORTFOLIO_FILE" 2>/dev/null || echo "0")
            if [ "$PL_COUNT" -gt 0 ]; then
                log_info "Portfolio defines $PL_COUNT product line(s)"
            fi
        fi
    else
        log_error "product_portfolio.yaml missing required 'portfolio:' root key"
    fi
else
    log_info "No product_portfolio.yaml found (single-product organization - OK)"
fi

# =============================================================================
# Section 6: Meta and Documentation Files
# =============================================================================
log_section "6. Meta and Documentation"

META_FILES=(
    "_meta.yaml"
)

DOC_FILES=(
    "README.md"
)

for file in "${META_FILES[@]}"; do
    if [ -f "$INSTANCE_PATH/$file" ]; then
        log_pass "Found: $file"
        
        # Check EPF version in _meta.yaml
        if [ "$file" = "_meta.yaml" ]; then
            if grep -q "epf_version:" "$INSTANCE_PATH/$file"; then
                VERSION=$(grep "epf_version:" "$INSTANCE_PATH/$file" | head -1 | awk '{print $2}' | tr -d '"')
                log_info "EPF version in _meta.yaml: $VERSION"
            else
                log_warning "_meta.yaml missing epf_version field"
            fi
        fi
    else
        log_warning "Optional file not found: $file"
    fi
done

for file in "${DOC_FILES[@]}"; do
    if [ -f "$INSTANCE_PATH/$file" ]; then
        log_pass "Found: $file"
    else
        log_warning "Documentation file not found: $file"
    fi
done

# =============================================================================
# Section 7: Cross-Reference Validation
# =============================================================================
log_section "7. Cross-Reference Validation"

# Check that roadmap references exist in feature definitions
ROADMAP_FILE=""
if [ -f "$READY_PATH/04_roadmap_recipe.yaml" ]; then
    ROADMAP_FILE="$READY_PATH/04_roadmap_recipe.yaml"
elif [ -f "$READY_PATH/05_roadmap_recipe.yaml" ]; then
    ROADMAP_FILE="$READY_PATH/05_roadmap_recipe.yaml"
fi

if [ -n "$ROADMAP_FILE" ] && [ -d "$FD_DIR" ]; then
    # Extract KR IDs from roadmap
    KR_IDS=$(grep -oE 'kr-[a-z0-9-]+' "$ROADMAP_FILE" 2>/dev/null | sort -u || true)
    if [ -n "$KR_IDS" ]; then
        log_info "Found KR references in roadmap"
    fi
    
    # Check if feature definitions reference the roadmap (check both YAML and MD files)
    FD_REFS=0
    if ls "$FD_DIR"/*.yaml "$FD_DIR"/*.yml 2>/dev/null | head -1 > /dev/null; then
        FD_REFS=$(grep -l "roadmap\|kr-\|asm-" "$FD_DIR"/*.yaml "$FD_DIR"/*.yml 2>/dev/null | wc -l | tr -d ' ')
    fi
    if [ "$FD_REFS" -eq 0 ] && ls "$FD_DIR"/*.md 2>/dev/null | head -1 > /dev/null; then
        FD_REFS=$(grep -l "roadmap_recipe\|Work Package" "$FD_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
    fi
    
    if [ "$FD_REFS" -gt 0 ]; then
        log_pass "Feature definitions reference roadmap/assumptions"
    else
        log_warning "No feature definitions reference the roadmap"
    fi
else
    log_warning "Could not perform cross-reference validation"
fi

# =============================================================================
# Section 8: Framework vs Instance Separation
# =============================================================================
log_section "8. Framework vs Instance Separation"

# Check that instance doesn't contain framework files
FRAMEWORK_MARKERS=(
    "schemas"
    "wizards"
    "phases/READY"
    "phases/FIRE"
    "phases/AIM"
)

for marker in "${FRAMEWORK_MARKERS[@]}"; do
    if [ -d "$INSTANCE_PATH/$marker" ]; then
        log_error "Instance contains framework directory: $marker (should be in framework, not instance)"
    fi
done
log_pass "Instance does not contain framework directories"

# =============================================================================
# Section 9: Enhanced Health Check (Tiers 2-3)
# =============================================================================
log_section "9. Enhanced Health Check"

# Tier 2: Field Coverage Analysis
if [ -f "$SCRIPT_DIR/analyze-field-coverage.sh" ]; then
    echo -e "${BLUE}Running Tier 2: Field Coverage Analysis...${NC}"
    COVERAGE_OUTPUT=$("$SCRIPT_DIR/analyze-field-coverage.sh" "$INSTANCE_PATH" 2>/dev/null || true)
    
    if [ -n "$COVERAGE_OUTPUT" ]; then
        # Extract overall grade and critical gaps count
        OVERALL_GRADE=$(echo "$COVERAGE_OUTPUT" | grep "Overall Grade:" | awk '{print $NF}' || echo "Unknown")
        CRITICAL_GAPS=$(echo "$COVERAGE_OUTPUT" | grep "CRITICAL gaps:" | awk '{print $(NF-2)}' || echo "0")
        HIGH_GAPS=$(echo "$COVERAGE_OUTPUT" | grep "HIGH gaps:" | awk '{print $(NF-2)}' || echo "0")
        
        echo -e "  Field Coverage Grade: ${BOLD}$OVERALL_GRADE${NC}"
        
        if [ "$CRITICAL_GAPS" != "0" ]; then
            log_warning "Field Coverage: $CRITICAL_GAPS CRITICAL field gap(s) found"
            echo -e "    ${GRAY}Run: ./scripts/analyze-field-coverage.sh $INSTANCE_PATH${NC}"
        elif [ "$HIGH_GAPS" != "0" ]; then
            log_warning "Field Coverage: $HIGH_GAPS HIGH priority field gap(s) found"
        else
            log_pass "Field coverage analysis complete"
        fi
    else
        echo -e "  ${GRAY}Coverage analysis skipped${NC}"
    fi
else
    echo -e "  ${GRAY}Tier 2 checker not available${NC}"
fi

# Tier 3: Version Alignment Check
if [ -f "$SCRIPT_DIR/check-version-alignment.sh" ]; then
    echo -e "${BLUE}Running Tier 3: Version Alignment Check...${NC}"
    ALIGNMENT_OUTPUT=$("$SCRIPT_DIR/check-version-alignment.sh" "$INSTANCE_PATH" 2>/dev/null || true)
    
    if [ -n "$ALIGNMENT_OUTPUT" ]; then
        # Extract metrics
        STALE_COUNT=$(echo "$ALIGNMENT_OUTPUT" | grep "⚠ Stale:" | awk '{print $3}' || echo "0")
        OUTDATED_COUNT=$(echo "$ALIGNMENT_OUTPUT" | grep "⚠ Outdated:" | awk '{print $3}' || echo "0")
        
        if [ "$OUTDATED_COUNT" != "0" ]; then
            log_warning "Version Alignment: $OUTDATED_COUNT artifact(s) OUTDATED (major version behind)"
            echo -e "    ${GRAY}Run: ./scripts/check-version-alignment.sh $INSTANCE_PATH${NC}"
        elif [ "$STALE_COUNT" != "0" ]; then
            log_warning "Version Alignment: $STALE_COUNT artifact(s) STALE (3+ versions behind)"
            echo -e "    ${GRAY}Consider enrichment: ./scripts/batch-migrate.sh $INSTANCE_PATH${NC}"
        else
            log_pass "Version alignment check complete"
        fi
    else
        echo -e "  ${GRAY}Alignment check skipped${NC}"
    fi
else
    echo -e "  ${GRAY}Tier 3 checker not available${NC}"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                   EPF INSTANCE HEALTH REPORT                     ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Instance: ${BLUE}$INSTANCE_NAME${NC}"
echo ""
echo -e "${BOLD}Tier 1: Compliance (Required Fields)${NC}"
echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "  ${RED}Errors:${NC}   $ERRORS"

if [ -n "${OVERALL_GRADE:-}" ] && [ "$OVERALL_GRADE" != "Unknown" ]; then
    echo ""
    echo -e "${BOLD}Tier 2: Coverage (Optional Fields)${NC}"
    echo -e "  Overall Grade: $OVERALL_GRADE"
    if [ "${CRITICAL_GAPS:-0}" != "0" ]; then
        echo -e "  ${RED}Critical gaps: $CRITICAL_GAPS${NC}"
    fi
    if [ "${HIGH_GAPS:-0}" != "0" ]; then
        echo -e "  ${YELLOW}High-priority gaps: $HIGH_GAPS${NC}"
    fi
fi

if [ -n "${STALE_COUNT:-}" ] || [ -n "${OUTDATED_COUNT:-}" ]; then
    echo ""
    echo -e "${BOLD}Tier 3: Version Alignment${NC}"
    if [ "${OUTDATED_COUNT:-0}" != "0" ]; then
        echo -e "  ${RED}Outdated artifacts: $OUTDATED_COUNT${NC}"
    fi
    if [ "${STALE_COUNT:-0}" != "0" ]; then
        echo -e "  ${YELLOW}Stale artifacts: $STALE_COUNT${NC}"
    fi
    if [ "${OUTDATED_COUNT:-0}" == "0" ] && [ "${STALE_COUNT:-0}" == "0" ]; then
        echo -e "  ${GREEN}All artifacts current${NC}"
    fi
fi

echo ""

if [ "$ERRORS" -gt 0 ]; then
    echo -e "${RED}━━━ VALIDATION FAILED ━━━${NC}"
    echo ""
    echo "Please fix the errors above before proceeding."
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Fix schema validation errors"
    echo "  2. Ensure all required files are present"
    echo "  3. Run validation again: ./scripts/validate-instance.sh $INSTANCE_PATH"
    exit 1
else
    if [ "$WARNINGS" -gt 0 ] || [ "${CRITICAL_GAPS:-0}" != "0" ] || [ "${STALE_COUNT:-0}" != "0" ] || [ "${OUTDATED_COUNT:-0}" != "0" ]; then
        echo -e "${YELLOW}━━━ VALIDATION PASSED WITH RECOMMENDATIONS ━━━${NC}"
        echo ""
        echo -e "${BOLD}Recommendations:${NC}"
        if [ "${CRITICAL_GAPS:-0}" != "0" ] || [ "${HIGH_GAPS:-0}" != "0" ]; then
            echo "  • Review field coverage gaps: ./scripts/analyze-field-coverage.sh $INSTANCE_PATH"
        fi
        if [ "${STALE_COUNT:-0}" != "0" ] || [ "${OUTDATED_COUNT:-0}" != "0" ]; then
            echo "  • Enrich stale artifacts: ./scripts/batch-migrate.sh $INSTANCE_PATH"
        fi
        echo "  • See detailed alignment: ./scripts/check-version-alignment.sh $INSTANCE_PATH"
    else
        echo -e "${GREEN}━━━ EXCELLENT HEALTH ━━━${NC}"
        echo ""
        echo "Instance is compliant with all required fields and well-maintained."
    fi
    echo ""
    exit 0
fi
