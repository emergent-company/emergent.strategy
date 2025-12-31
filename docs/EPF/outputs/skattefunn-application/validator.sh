#!/bin/bash
#
# SkatteFUNN Application Validator (Shell Script)
# 
# Validates EPF-generated SkatteFUNN applications against:
# 1. Schema validation (required sections, structure)
# 2. Semantic rules (placeholders, budget math, TRL ranges)
# 3. Traceability (roadmap KR references)
# 4. Frascati compliance indicators
# 
# Usage:
#   bash validator.sh <path-to-skattefunn-application.md>
#   bash validator.sh --file path/to/skattefunn-application.md
# 
# Environment Variables:
#   VALIDATION_STRICT               Treat warnings as errors (default: false)
#   VALIDATION_MAX_BUDGET_YEAR      Max budget per year in NOK (default: 25000000)
#   VALIDATION_BUDGET_TOLERANCE     Budget sum tolerance in NOK (default: 1000)
# 
# Exit Codes:
#   0 - Valid
#   1 - Invalid (errors found)
#   2 - File not found
#   3 - Warnings only (strict mode off)

set -e

# ============================================================================
# Configuration
# ============================================================================

STRICT_MODE=${VALIDATION_STRICT:-false}
MAX_BUDGET_YEAR=${VALIDATION_MAX_BUDGET_YEAR:-25000000}
BUDGET_TOLERANCE=${VALIDATION_BUDGET_TOLERANCE:-1000}

# ============================================================================
# Colors
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Counters
# ============================================================================

ERRORS=0
WARNINGS=0
SCHEMA_ERRORS=0
SEMANTIC_ERRORS=0
TRACEABILITY_ERRORS=0
BUDGET_ERRORS=0

# ============================================================================
# Logging Functions
# ============================================================================

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1"
    ((WARNINGS++))
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================================================
# Argument Parsing
# ============================================================================

APPLICATION_PATH=""

parse_args() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: validator.sh <path-to-skattefunn-application.md>"
        echo "   or: validator.sh --file <path-to-skattefunn-application.md>"
        echo ""
        echo "Environment Variables:"
        echo "  VALIDATION_STRICT               Treat warnings as errors (default: false)"
        echo "  VALIDATION_MAX_BUDGET_YEAR      Max budget per year in NOK (default: 25000000)"
        echo "  VALIDATION_BUDGET_TOLERANCE     Budget sum tolerance in NOK (default: 1000)"
        echo ""
        echo "Exit Codes:"
        echo "  0 - Valid"
        echo "  1 - Invalid (errors found)"
        echo "  2 - File not found"
        echo "  3 - Warnings only (strict mode off)"
        exit 1
    fi

    if [[ "$1" == "--file" ]]; then
        APPLICATION_PATH="$2"
    else
        APPLICATION_PATH="$1"
    fi

    if [[ -z "$APPLICATION_PATH" ]]; then
        log_error "No file path provided"
        exit 1
    fi

    if [[ ! -f "$APPLICATION_PATH" ]]; then
        log_error "File not found: $APPLICATION_PATH"
        exit 2
    fi
}

# ============================================================================
# Validation Layer 1: Schema Structure
# ============================================================================

validate_schema() {
    log_section "Layer 1: Schema Structure"
    
    local file="$APPLICATION_PATH"
    
    # Check required sections (6 main sections)
    local required_sections=(
        "## 1. Project Owner"
        "## 2. Roles in the Project"
        "## 3. Project Details"
        "## 4. Timeline and Work Packages"
        "## 5. Budget and Tax Deduction"
        "## 6. EPF Traceability"
    )
    
    for section in "${required_sections[@]}"; do
        if ! grep -q "^${section}" "$file"; then
            log_error "Missing required section: $section"
            ((SCHEMA_ERRORS++))
        else
            log_success "Found section: $section"
        fi
    done
    
    # Check for metadata header
    if ! grep -q "^# SkatteFUNN" "$file"; then
        log_error "Missing main title (should start with '# SkatteFUNN')"
        ((SCHEMA_ERRORS++))
    else
        log_success "Found main title"
    fi
    
    # Check for application date
    if ! grep -q "Application Date:" "$file"; then
        log_error "Missing Application Date field"
        ((SCHEMA_ERRORS++))
    else
        log_success "Found Application Date"
    fi
    
    # Check for project period
    if ! grep -q "Project Period:" "$file"; then
        log_error "Missing Project Period field"
        ((SCHEMA_ERRORS++))
    else
        log_success "Found Project Period"
    fi
    
    # Check for total budget
    if ! grep -q "Total Budget:" "$file"; then
        log_error "Missing Total Budget field"
        ((SCHEMA_ERRORS++))
    else
        log_success "Found Total Budget"
    fi
    
    # Check for organization number format (9 digits)
    if ! grep -q "Org. No.: [0-9]\{3\} [0-9]\{3\} [0-9]\{3\}" "$file"; then
        log_warning "Organization number format may be incorrect (expected: XXX XXX XXX)"
    else
        log_success "Organization number format valid"
    fi
    
    # Check for Frascati criteria section
    if ! grep -q "Frascati Criteria" "$file"; then
        log_error "Missing Frascati Criteria Compliance section"
        ((SCHEMA_ERRORS++))
    else
        log_success "Found Frascati Criteria section"
    fi
}

# ============================================================================
# Validation Layer 2: Semantic Rules
# ============================================================================

validate_semantic() {
    log_section "Layer 2: Semantic Rules"
    
    local file="$APPLICATION_PATH"
    
    # Check for placeholder text
    local placeholders=(
        "XXX"
        "[Not entered]"
        "[TODO"
        "PLACEHOLDER"
        "[TBD"
        "[FILL"
    )
    
    local found_placeholders=false
    for placeholder in "${placeholders[@]}"; do
        if grep -q "$placeholder" "$file"; then
            log_error "Found placeholder text: $placeholder"
            ((SEMANTIC_ERRORS++))
            found_placeholders=true
            # Show context
            grep -n "$placeholder" "$file" | head -3 | while read -r line; do
                log_info "  Line: $line"
            done
        fi
    done
    
    if ! $found_placeholders; then
        log_success "No placeholder text found"
    fi
    
    # Check for required R&D activity fields
    local required_rd_fields=(
        "Technical Hypothesis:"
        "Experiment Design:"
        "Success Criteria:"
        "Uncertainty Addressed:"
        "TRL Progression:"
        "Duration:"
        "Allocated Budget:"
    )
    
    local missing_fields=false
    for field in "${required_rd_fields[@]}"; do
        if ! grep -q "\\*\\*${field}\\*\\*" "$file"; then
            log_warning "R&D field '$field' may be missing (expected in activities)"
            missing_fields=true
        fi
    done
    
    if ! $missing_fields; then
        log_success "All required R&D activity fields present"
    fi
    
    # Check TRL ranges (should be TRL 2-7, no TRL 1 or TRL 8-9)
    if grep -qi "TRL 1[^0-9]" "$file"; then
        log_error "Found TRL 1 (basic research - not eligible for SkatteFUNN)"
        ((SEMANTIC_ERRORS++))
    fi
    
    if grep -qiE "TRL [89]" "$file"; then
        log_error "Found TRL 8 or TRL 9 (production/operations - not eligible for SkatteFUNN)"
        ((SEMANTIC_ERRORS++))
    fi
    
    if grep -qiE "TRL [2-7]" "$file"; then
        log_success "TRL ranges within eligible window (TRL 2-7)"
    else
        log_warning "No explicit TRL ranges found (should specify TRL 2-7)"
    fi
    
    # Check for Frascati criteria markers
    local frascati_criteria=(
        "Novel"
        "Creative"
        "Uncertain"
        "Systematic"
        "Transferable"
    )
    
    local frascati_count=0
    for criterion in "${frascati_criteria[@]}"; do
        if grep -q "✓.*${criterion}" "$file" || grep -q "${criterion}:" "$file"; then
            ((frascati_count++))
        fi
    done
    
    if [[ $frascati_count -eq 5 ]]; then
        log_success "All 5 Frascati criteria addressed (Novel, Creative, Uncertain, Systematic, Transferable)"
    else
        log_error "Missing Frascati criteria (found $frascati_count/5)"
        ((SEMANTIC_ERRORS++))
    fi
    
    # Check for technical uncertainty language
    if grep -qi "unpredictable\|uncertain\|cannot be determined analytically" "$file"; then
        log_success "Technical uncertainty language present"
    else
        log_warning "Missing technical uncertainty language (required for SkatteFUNN)"
    fi
    
    # Check for state-of-the-art comparison
    if grep -qi "state-of-the-art\|state of the art\|existing solutions\|current approaches" "$file"; then
        log_success "State-of-the-art comparison present"
    else
        log_warning "Missing state-of-the-art comparison (recommended for strong application)"
    fi
}

# ============================================================================
# Validation Layer 3: Budget Validation
# ============================================================================

validate_budget() {
    log_section "Layer 3: Budget Validation"
    
    local file="$APPLICATION_PATH"
    
    # Extract total budget
    local total_budget=$(grep "Total Budget:" "$file" | head -1 | grep -oE "[0-9,]+" | tr -d ',' | head -1)
    
    if [[ -z "$total_budget" ]]; then
        log_error "Could not extract total budget amount"
        ((BUDGET_ERRORS++))
        return
    fi
    
    log_info "Total Budget: $total_budget NOK"
    
    # Check yearly budgets don't exceed 25M NOK
    local yearly_budgets=$(grep -A 10 "### 5.1 Total Budget Overview" "$file" | grep "| [0-9]\{4\}" | grep -oE "\| [0-9,]+ \|" | grep -oE "[0-9,]+" | tr -d ',')
    
    local max_year_budget=0
    local year_count=0
    while IFS= read -r year_budget; do
        if [[ $year_budget -gt $max_year_budget ]]; then
            max_year_budget=$year_budget
        fi
        ((year_count++))
    done <<< "$yearly_budgets"
    
    if [[ $max_year_budget -gt $MAX_BUDGET_YEAR ]]; then
        log_error "Yearly budget exceeds maximum ($max_year_budget > $MAX_BUDGET_YEAR NOK)"
        ((BUDGET_ERRORS++))
    elif [[ $max_year_budget -gt 0 ]]; then
        log_success "All yearly budgets within limit (max: $max_year_budget NOK)"
    fi
    
    # Check cost category percentages (70/20/10 typical for software R&D)
    local personnel_pct=$(grep "Personnel" "$file" | grep -oE "[0-9]+%" | head -1 | tr -d '%')
    local equipment_pct=$(grep "Equipment" "$file" | grep -oE "[0-9]+%" | head -1 | tr -d '%')
    local overhead_pct=$(grep "Overhead" "$file" | grep -oE "[0-9]+%" | head -1 | tr -d '%')
    
    if [[ -n "$personnel_pct" ]] && [[ -n "$equipment_pct" ]] && [[ -n "$overhead_pct" ]]; then
        log_info "Cost categories: Personnel $personnel_pct%, Equipment $equipment_pct%, Overhead $overhead_pct%"
        
        # Check if percentages are within typical ranges
        if [[ $personnel_pct -lt 65 ]] || [[ $personnel_pct -gt 75 ]]; then
            log_warning "Personnel cost ($personnel_pct%) outside typical 65-75% range for software R&D"
        else
            log_success "Personnel cost within typical range (65-75%)"
        fi
        
        if [[ $equipment_pct -lt 15 ]] || [[ $equipment_pct -gt 25 ]]; then
            log_warning "Equipment cost ($equipment_pct%) outside typical 15-25% range for software R&D"
        else
            log_success "Equipment cost within typical range (15-25%)"
        fi
        
        if [[ $overhead_pct -lt 10 ]] || [[ $overhead_pct -gt 15 ]]; then
            log_warning "Overhead cost ($overhead_pct%) outside typical 10-15% range"
        else
            log_success "Overhead cost within typical range (10-15%)"
        fi
        
        # Check if percentages sum to 100%
        local total_pct=$((personnel_pct + equipment_pct + overhead_pct))
        if [[ $total_pct -ne 100 ]]; then
            log_error "Cost category percentages don't sum to 100% (got $total_pct%)"
            ((BUDGET_ERRORS++))
        else
            log_success "Cost category percentages sum to 100%"
        fi
    else
        log_warning "Could not extract cost category percentages"
    fi
    
    # Check WP budgets sum to total (within tolerance)
    local wp_budgets=$(grep -A 20 "### 5.2 Budget Allocation by Work Package" "$file" | grep "^| WP[0-9]" | grep -oE "[0-9,]+" | head -n 20 | grep -E "^[0-9,]{7,}$" | tr -d ',')
    
    local wp_sum=0
    local wp_count=0
    while IFS= read -r wp_budget; do
        if [[ -n "$wp_budget" ]] && [[ $wp_budget -gt 10000 ]]; then
            wp_sum=$((wp_sum + wp_budget))
            ((wp_count++))
        fi
    done <<< "$wp_budgets"
    
    if [[ $wp_count -gt 0 ]]; then
        log_info "Work Package count: $wp_count, Sum: $wp_sum NOK"
        
        local budget_diff=$((total_budget - wp_sum))
        if [[ $budget_diff -lt 0 ]]; then
            budget_diff=$((-budget_diff))
        fi
        
        if [[ $budget_diff -le $BUDGET_TOLERANCE ]]; then
            log_success "Work Package budgets sum to total (diff: $budget_diff NOK, tolerance: $BUDGET_TOLERANCE NOK)"
        else
            log_error "Work Package budgets don't match total (diff: $budget_diff NOK > tolerance: $BUDGET_TOLERANCE NOK)"
            ((BUDGET_ERRORS++))
        fi
    else
        log_warning "Could not extract Work Package budgets for reconciliation"
    fi
}

# ============================================================================
# Validation Layer 4: Traceability
# ============================================================================

validate_traceability() {
    log_section "Layer 4: Traceability"
    
    local file="$APPLICATION_PATH"
    
    # Check for EPF traceability section
    if ! grep -q "## 6. EPF Traceability" "$file"; then
        log_error "Missing EPF Traceability section"
        ((TRACEABILITY_ERRORS++))
        return
    fi
    
    # Check for roadmap KR references (kr-p-XXX pattern)
    local kr_references=$(grep -oE "kr-p-[0-9]{3}" "$file" | sort -u)
    local kr_count=$(echo "$kr_references" | grep -c "kr-p" || echo 0)
    
    if [[ $kr_count -eq 0 ]]; then
        log_error "No roadmap KR references found (expected kr-p-XXX format)"
        ((TRACEABILITY_ERRORS++))
    elif [[ $kr_count -lt 5 ]]; then
        log_warning "Low number of R&D activities ($kr_count < 5 recommended)"
    else
        log_success "Found $kr_count roadmap KR references"
        log_info "KRs referenced: $(echo $kr_references | tr '\n' ' ')"
    fi
    
    # Check for direct traceability mapping
    if grep -q "Direct Traceability:" "$file"; then
        log_success "Found Direct Traceability mapping section"
        
        # Count WP -> KR mappings
        local mapping_count=$(grep -cE "WP[0-9] Activity [0-9\.]+ → kr-p-[0-9]{3}" "$file" || echo 0)
        if [[ $mapping_count -gt 0 ]]; then
            log_success "Found $mapping_count work package to KR mappings"
        else
            log_warning "No explicit WP → KR mappings found (recommended for traceability)"
        fi
    else
        log_warning "Missing Direct Traceability mapping section"
    fi
    
    # Check for EPF source references
    local epf_sources=(
        "north_star.yaml"
        "strategy_formula.yaml"
        "roadmap_recipe.yaml"
    )
    
    local found_sources=0
    for source in "${epf_sources[@]}"; do
        if grep -q "$source" "$file"; then
            ((found_sources++))
        fi
    done
    
    if [[ $found_sources -eq 3 ]]; then
        log_success "All required EPF sources referenced (north_star, strategy_formula, roadmap)"
    elif [[ $found_sources -gt 0 ]]; then
        log_warning "Only $found_sources/3 EPF sources referenced"
    else
        log_error "No EPF source references found"
        ((TRACEABILITY_ERRORS++))
    fi
}

# ============================================================================
# Main Validation Orchestrator
# ============================================================================

main() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║      SkatteFUNN Application Validator v1.0.0         ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    log_info "Validating: $APPLICATION_PATH"
    
    # Run all validation layers
    validate_schema
    validate_semantic
    validate_budget
    validate_traceability
    
    # ========================================================================
    # Summary
    # ========================================================================
    
    echo ""
    log_section "Validation Summary"
    
    echo ""
    echo "Errors by Layer:"
    echo "  Schema:        $SCHEMA_ERRORS"
    echo "  Semantic:      $SEMANTIC_ERRORS"
    echo "  Budget:        $BUDGET_ERRORS"
    echo "  Traceability:  $TRACEABILITY_ERRORS"
    echo ""
    echo "Total Errors:    $ERRORS"
    echo "Total Warnings:  $WARNINGS"
    echo ""
    
    # ========================================================================
    # Exit Code Decision
    # ========================================================================
    
    if [[ $ERRORS -gt 0 ]]; then
        echo ""
        echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║                  VALIDATION FAILED                    ║${NC}"
        echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}"
        echo ""
        log_error "Application has $ERRORS error(s) and must be fixed before submission"
        exit 1
    fi
    
    if [[ $WARNINGS -gt 0 ]]; then
        if [[ "$STRICT_MODE" == "true" ]]; then
            echo ""
            echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
            echo -e "${RED}║    VALIDATION FAILED (STRICT MODE - WARNINGS)        ║${NC}"
            echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}"
            echo ""
            log_error "Strict mode enabled - treating warnings as errors"
            exit 1
        else
            echo ""
            echo -e "${YELLOW}╔═══════════════════════════════════════════════════════╗${NC}"
            echo -e "${YELLOW}║         VALIDATION PASSED WITH WARNINGS              ║${NC}"
            echo -e "${YELLOW}╚═══════════════════════════════════════════════════════╝${NC}"
            echo ""
            log_warning "Application has $WARNINGS warning(s) - review recommended before submission"
            exit 3
        fi
    fi
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            VALIDATION PASSED - ALL CLEAR!             ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    log_success "Application ready for submission"
    exit 0
}

# ============================================================================
# Entry Point
# ============================================================================

parse_args "$@"
main
