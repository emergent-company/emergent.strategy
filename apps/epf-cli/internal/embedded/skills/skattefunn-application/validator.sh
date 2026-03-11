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

# NOTE: We do NOT use 'set -e' because a validation script should collect
# ALL errors across all layers, not exit on the first problem.
# Each validation layer explicitly increments error counters and the final
# exit code is determined by the total error count in main().

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
    
    # Check required sections (8 main sections + EPF Traceability)
    local required_sections=(
        "## Section 1: Project Owner and Roles"
        "## Section 2: About the Project"
        "## Section 3: Background and Company Activities"
        "## Section 4: Primary Objective and Innovation"
        "## Section 5: R&D Content"
        "## Section 6: Project Summary"
        "## Section 7: Work Packages"
        "## Section 8: Total Budget and Tax Deduction"
        "## EPF Traceability"
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
    
    # Note: Total budget is extracted and validated in Layer 3 from Section 8.1
    # No separate metadata field "Total Budget:" is required
    
    # Check for organization number format (9 digits)
    if ! grep -q "Org. No.: [0-9]\{3\} [0-9]\{3\} [0-9]\{3\}" "$file"; then
        log_warning "Organization number format may be incorrect (expected: XXX XXX XXX)"
    else
        log_success "Organization number format valid"
    fi
    
    # Check for Work Package subsections (1-8 required per SkatteFUNN rules)
    local wp_count=$(grep -c "^### Work Package [0-9]:" "$file" || echo 0)
    if [[ $wp_count -lt 1 ]]; then
        log_error "No work packages found (minimum 1 required)"
        ((SCHEMA_ERRORS++))
    elif [[ $wp_count -gt 8 ]]; then
        log_error "Too many work packages found ($wp_count). Maximum 8 allowed per SkatteFUNN rules"
        ((SCHEMA_ERRORS++))
    else
        log_success "Found $wp_count work packages"
    fi
    
    # Check for Section 8 budget summary tables
    if ! grep -q "### 8.1 Budget Summary by Year and Cost Code" "$file"; then
        log_error "Missing Section 8.1 (Budget Summary by Year and Cost Code)"
        ((SCHEMA_ERRORS++))
    else
        log_success "Found Section 8.1 budget summary"
    fi
    
    if ! grep -q "### 8.2 Budget Allocation by Work Package" "$file"; then
        log_error "Missing Section 8.2 (Budget Allocation by Work Package)"
        ((SCHEMA_ERRORS++))
    else
        log_success "Found Section 8.2 WP budget allocation"
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
        "\\[Not entered\\]"
        "\\[TODO"
        "PLACEHOLDER"
        "\\[TBD"
        "\\[FILL"
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
    
    # Check TRL ranges (should be TRL 2-7, no TRL 1 or TRL 8-9)
    if grep -qiE "TRL[[:space:]]+1([[:space:]]|$)" "$file"; then
        log_error "Found TRL 1 (basic research - not eligible for SkatteFUNN)"
        ((SEMANTIC_ERRORS++))
    fi
    
    if grep -qiE "TRL[[:space:]]+[89]([[:space:]]|$)" "$file"; then
        log_error "Found TRL 8 or TRL 9 (production/operations - not eligible for SkatteFUNN)"
        ((SEMANTIC_ERRORS++))
    fi
    
    if grep -qiE "TRL [2-7]" "$file"; then
        log_success "TRL ranges within eligible window (TRL 2-7)"
    else
        log_warning "No explicit TRL ranges found (should specify TRL 2-7)"
    fi
    
    # Check for technical uncertainty language
    if grep -qi "unpredictable\|uncertain\|cannot be determined analytically\|systematic investigation\|technical uncertainty" "$file"; then
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
    
    # Validate work package structure
    local wp_count=$(grep -c "^### Work Package [0-9]:" "$file" || echo 0)
    
    if [[ $wp_count -gt 0 ]]; then
        log_info "Checking work package structure for $wp_count packages..."
        
        for ((i=1; i<=wp_count; i++)); do
            local wp_header="### Work Package $i:"
            
            # Check for required WP subsections (increased context window to 50 lines)
            if ! grep -A 50 "$wp_header" "$file" | grep -q "^#### R&D Challenges"; then
                log_error "Work Package $i missing 'R&D Challenges' section"
                ((SEMANTIC_ERRORS++))
            fi
            
            if ! grep -A 50 "$wp_header" "$file" | grep -q "^#### Method and Approach"; then
                log_error "Work Package $i missing 'Method and Approach' section"
                ((SEMANTIC_ERRORS++))
            fi
            
            if ! grep -A 50 "$wp_header" "$file" | grep -q "^#### Activities"; then
                log_error "Work Package $i missing 'Activities' section"
                ((SEMANTIC_ERRORS++))
            fi
            
            # Check activity count (2-8 required per WP) - activities are numbered lists under #### Activities
            # Extract only the Activities section (between #### Activities and next ####) for this WP
            # First get the WP section, then extract Activities subsection
            local wp_section=$(sed -n "/^$wp_header/,/^### Work Package [0-9]/p" "$file")
            local activity_count=$(echo "$wp_section" | sed -n "/^#### Activities/,/^####/p" | grep -c "^[0-9]\+\. \*\*" || echo 0)
            
            if [[ $activity_count -lt 2 ]]; then
                log_error "Work Package $i has only $activity_count activities (minimum 2 required)"
                ((SEMANTIC_ERRORS++))
            elif [[ $activity_count -gt 8 ]]; then
                log_error "Work Package $i has $activity_count activities (maximum 8 allowed)"
                ((SEMANTIC_ERRORS++))
            else
                log_success "Work Package $i has $activity_count activities (valid range 2-8)"
            fi
        done
    fi
    
    # Character limit validation
    log_info "Validating character limits..."
    
    local file="$APPLICATION_PATH"
    local char_errors=0
    
    # Extract and check title fields (100 chars max)
    local title_en=$(grep -A 1 "Title (English):" "$file" | grep "^\*\*" | sed 's/\*\*//g' | sed 's/Title (English): //g' | head -n 1)
    local title_no=$(grep -A 1 "Title (Norwegian):" "$file" | grep "^\*\*" | sed 's/\*\*//g' | sed 's/Title (Norwegian): //g' | head -n 1)
    
    if [[ ${#title_en} -gt 100 ]]; then
        log_error "English title exceeds 100 characters (${#title_en} chars): \"${title_en:0:50}...\""
        ((char_errors++))
    fi
    
    if [[ ${#title_no} -gt 100 ]]; then
        log_error "Norwegian title exceeds 100 characters (${#title_no} chars): \"${title_no:0:50}...\""
        ((char_errors++))
    fi
    
    # Extract and check short name (60 chars max)
    local short_name=$(grep -A 1 "Short Name:" "$file" | grep "^\*\*" | sed 's/\*\*//g' | sed 's/Short Name: //g' | head -n 1)
    
    if [[ ${#short_name} -gt 60 ]]; then
        log_error "Short name exceeds 60 characters (${#short_name} chars): \"$short_name\""
        ((char_errors++))
    fi
    
    # Check WP activity descriptions (500 chars max)
    # Activity descriptions are in format: *[Max 500 characters: XXX/500]*
    # Detect: 501-999 (50[1-9], 5[1-9][0-9], [6-9][0-9][0-9]) OR 1000+ ([0-9]{4,})
    local activity_violations=$(grep -n "\[Max 500 characters: \(50[1-9]\|5[1-9][0-9]\|[6-9][0-9][0-9]\|[0-9]\{4,\}\)" "$file" | wc -l | tr -d ' ')
    
    if [[ $activity_violations -gt 0 ]]; then
        log_error "Found $activity_violations activity descriptions exceeding 500 characters"
        # Show first 3 violations as examples
        grep -n "\[Max 500 characters: \(50[1-9]\|5[1-9][0-9]\|[6-9][0-9][0-9]\|[0-9]\{4,\}\)" "$file" | head -n 3 | while IFS=: read -r line_num text; do
            local char_count=$(echo "$text" | grep -o "\(50[1-9]\|5[1-9][0-9]\|[6-9][0-9][0-9]\|[0-9]\{4,\}\)/500" | cut -d'/' -f1)
            log_error "  Line $line_num: $char_count/500 characters (exceeds limit by $((char_count - 500)))"
        done
        if [[ $activity_violations -gt 3 ]]; then
            log_error "  ... and $((activity_violations - 3)) more violations"
        fi
        ((char_errors += activity_violations))
    fi
    
    # Check 1000-char fields (Primary Objective)
    # Detect: 1001-9999 (100[1-9], 10[1-9][0-9], 1[1-9][0-9][0-9], [2-9][0-9]{3}) OR 10000+ ([0-9]{5,})
    local obj_violations=$(grep -n "\[Max 1000 characters: \(100[1-9]\|10[1-9][0-9]\|1[1-9][0-9][0-9]\|[2-9][0-9]\{3\}\|[0-9]\{5,\}\)" "$file" | wc -l | tr -d ' ')
    
    if [[ $obj_violations -gt 0 ]]; then
        log_error "Found $obj_violations fields exceeding 1000 characters"
        grep -n "\[Max 1000 characters: \(100[1-9]\|10[1-9][0-9]\|1[1-9][0-9][0-9]\|[2-9][0-9]\{3\}\|[0-9]\{5,\}\)" "$file" | while IFS=: read -r line_num text; do
            local char_count=$(echo "$text" | grep -o "\(100[1-9]\|10[1-9][0-9]\|1[1-9][0-9][0-9]\|[2-9][0-9]\{3\}\|[0-9]\{5,\}\)/1000" | cut -d'/' -f1)
            log_error "  Line $line_num: $char_count/1000 characters (exceeds limit by $((char_count - 1000)))"
        done
        ((char_errors += obj_violations))
    fi
    
    # Check 2000-char fields (Background, Market Differentiation, R&D Content)
    # Detect: 2001-9999 (200[1-9], 20[1-9][0-9], 2[1-9][0-9][0-9], [3-9][0-9]{3}) OR 10000+ ([0-9]{5,})
    local long_violations=$(grep -n "\[Max 2000 characters: \(200[1-9]\|20[1-9][0-9]\|2[1-9][0-9][0-9]\|[3-9][0-9]\{3\}\|[0-9]\{5,\}\)" "$file" | wc -l | tr -d ' ')
    
    if [[ $long_violations -gt 0 ]]; then
        log_error "Found $long_violations fields exceeding 2000 characters"
        grep -n "\[Max 2000 characters: \(200[1-9]\|20[1-9][0-9]\|2[1-9][0-9][0-9]\|[3-9][0-9]\{3\}\|[0-9]\{5,\}\)" "$file" | while IFS=: read -r line_num text; do
            local char_count=$(echo "$text" | grep -o "\(200[1-9]\|20[1-9][0-9]\|2[1-9][0-9][0-9]\|[3-9][0-9]\{3\}\|[0-9]\{5,\}\)/2000" | cut -d'/' -f1)
            log_error "  Line $line_num: $char_count/2000 characters (exceeds limit by $((char_count - 2000)))"
        done
        ((char_errors += long_violations))
    fi
    
    if [[ $char_errors -eq 0 ]]; then
        log_success "All character limits validated (titles ≤100, short name ≤60, activities ≤500, objectives ≤1000, long fields ≤2000)"
    else
        log_error "Total character limit violations: $char_errors"
        log_info "Fix with: bash docs/EPF/outputs/skattefunn-application/trim-violations.sh \"$file\""
        ((SEMANTIC_ERRORS += char_errors))
    fi
}

# ============================================================================
# Validation Layer 3: Budget Validation
# ============================================================================

validate_budget() {
    log_section "Layer 3: Budget Validation"
    
    local file="$APPLICATION_PATH"
    
    # Extract total budget from Section 8.1 (last bold value in Total row)
    # Section 8.1 has format: | **Total** | **2,640,000** | **176,000** | **113,000** | **2,929,000** |
    # We want the LAST value (5th column = total per year)
    # Use sed to extract ONLY Section 8.1 (between ### 8.1 and ### 8.2) to avoid matching WP budget tables
    local section_8_1=$(sed -n '/^### 8\.1/,/^### 8\.2/p' "$file")
    local total_budget=$(echo "$section_8_1" | grep "| \*\*Total\*\*" | grep -oE "\*\*[0-9,]+\*\*" | tail -1 | grep -oE "[0-9,]+" | tr -d ',')
    
    if [[ -z "$total_budget" ]]; then
        log_error "Could not extract total budget from Section 8.1"
        ((BUDGET_ERRORS++))
        return
    fi
    
    log_info "Total Budget: $total_budget NOK"
    
    # Check yearly budgets don't exceed 25M NOK (extract from Year Total column)
    local yearly_budgets=$(grep -E "^\| [0-9]{4}" "$file" | grep -oE "\*\*[0-9,]+\*\*" | grep -oE "[0-9,]+" | tr -d ',')
    
    local max_year_budget=0
    local year_count=0
    while IFS= read -r year_budget; do
        if [[ -n "$year_budget" ]] && [[ $year_budget -gt 0 ]]; then
            if [[ $year_budget -gt $max_year_budget ]]; then
                max_year_budget=$year_budget
            fi
            ((year_count++))
        fi
    done <<< "$yearly_budgets"
    
    if [[ $max_year_budget -gt $MAX_BUDGET_YEAR ]]; then
        log_error "Yearly budget exceeds maximum ($max_year_budget > $MAX_BUDGET_YEAR NOK)"
        ((BUDGET_ERRORS++))
    elif [[ $max_year_budget -gt 0 ]]; then
        log_success "All yearly budgets within limit (max: $max_year_budget NOK)"
    fi
    
    # Check cost code totals from Section 8.1 (Total row has all bold values)
    # Row format: | **Total** | **2,971,500** | **175,000** | **175,000** | **178,500** | **3,500,000** |
    # Extract ONLY from Section 8.1 (between ### 8.1 and ### 8.2)
    local project_total_row=$(echo "$section_8_1" | grep "| \*\*Total\*\*")
    local cost_values=$(echo "$project_total_row" | grep -oE "\*\*[0-9,]+\*\*" | grep -oE "[0-9,]+" | tr -d ',')
    
    # Count how many cost code columns we have (should be 4 or 5 values: Personnel, Equipment, Other, [Overhead], Total)
    local value_count=$(echo "$cost_values" | wc -l | tr -d ' ')
    
    # Extract values by position
    local personnel_total=$(echo "$cost_values" | sed -n '1p')
    local equipment_total=$(echo "$cost_values" | sed -n '2p')
    local other_costs_total=$(echo "$cost_values" | sed -n '3p')
    local overhead_total=0
    local extracted_total=0
    
    if [[ "$value_count" -eq 5 ]]; then
        # Modern format with explicit Overhead column: Personnel, Equipment, Other, Overhead, Total
        overhead_total=$(echo "$cost_values" | sed -n '4p')
        extracted_total=$(echo "$cost_values" | sed -n '5p')
    elif [[ "$value_count" -eq 4 ]]; then
        # Legacy format without Overhead column: Personnel, Equipment, Other, Total
        extracted_total=$(echo "$cost_values" | sed -n '4p')
    fi
    
    if [[ -n "$personnel_total" ]] && [[ -n "$equipment_total" ]] && [[ -n "$other_costs_total" ]]; then
        if [[ "$overhead_total" -gt 0 ]]; then
            log_info "Cost codes: Personnel $personnel_total NOK, Equipment $equipment_total NOK, Other $other_costs_total NOK, Overhead $overhead_total NOK"
        else
            log_info "Cost codes: Personnel $personnel_total NOK, Equipment $equipment_total NOK, Other $other_costs_total NOK"
        fi
        
        # Calculate percentages
        local personnel_pct=$((100 * personnel_total / total_budget))
        local equipment_pct=$((100 * equipment_total / total_budget))
        local other_pct=$((100 * other_costs_total / total_budget))
        
        log_info "Cost ratios: Personnel $personnel_pct%, Equipment $equipment_pct%, Other $other_pct%"
        
        # Check if percentages are within typical ranges for software R&D
        if [[ $personnel_pct -lt 85 ]] || [[ $personnel_pct -gt 95 ]]; then
            log_warning "Personnel cost ($personnel_pct%) outside typical 85-95% range for software R&D"
        else
            log_success "Personnel cost within typical range (85-95%)"
        fi
        
        if [[ $equipment_pct -lt 3 ]] || [[ $equipment_pct -gt 10 ]]; then
            log_warning "Equipment cost ($equipment_pct%) outside typical 3-10% range for software R&D"
        else
            log_success "Equipment cost within typical range (3-10%)"
        fi
        
        if [[ $other_pct -lt 2 ]] || [[ $other_pct -gt 8 ]]; then
            log_warning "Other costs ($other_pct%) outside typical 2-8% range"
        else
            log_success "Other costs within typical range (2-8%)"
        fi
        
        # Check if cost codes sum to total (within tolerance)
        local cost_sum=$((personnel_total + equipment_total + other_costs_total + overhead_total))
        
        local cost_diff=$((total_budget - cost_sum))
        if [[ $cost_diff -lt 0 ]]; then
            cost_diff=$((-cost_diff))
        fi
        
        if [[ $cost_diff -le $BUDGET_TOLERANCE ]]; then
            log_success "Cost codes sum to total (diff: $cost_diff NOK, tolerance: $BUDGET_TOLERANCE NOK)"
        else
            log_error "Cost codes don't sum to total (diff: $cost_diff NOK > tolerance: $BUDGET_TOLERANCE NOK)"
            ((BUDGET_ERRORS++))
        fi
    else
        log_warning "Could not extract all cost code totals from Section 8.1"
    fi
    
    # Check WP budgets from Section 8.2 table
    # Row format: | WP1: Outcome Hierarchy UX | 594,300 | 35,000 | 35,000 | 35,700 | **700,000** | 3→6 |
    # We want the bold Total column: **700,000**
    local wp_budgets=$(grep -E "^\| WP[0-9]:" "$file" | grep -oE "\*\*[0-9,]+\*\*" | grep -oE "[0-9,]+" | tr -d ',')
    
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
        log_warning "Could not extract Work Package budgets from Section 8.2 for reconciliation"
    fi
    
    # Validate work package budget structure
    local wp_section_count=$(grep -c "^### Work Package [0-9]:" "$file" 2>/dev/null || echo "0")
    wp_section_count=$(echo "$wp_section_count" | head -1 | tr -d '\n')
    
    if [[ "$wp_section_count" -gt 0 ]]; then
        log_info "Validating budget sections for $wp_section_count work packages..."
        
        for ((i=1; i<=wp_section_count; i++)); do
            local wp_header="### Work Package $i:"
            
            # Extract just this work package's content (up to next WP or end of Section 7)
            local wp_content=$(sed -n "/^### Work Package $i:/,/^### Work Package [0-9]/p" "$file" | sed '$d' 2>/dev/null || sed -n "/^### Work Package $i:/,/^## Section 8:/p" "$file" | sed '$d' 2>/dev/null)
            
            # Check for Budget subsection within this WP only
            if echo "$wp_content" | grep -q "^#### Budget"; then
                # Check for cost code breakdown within this WP's content
                local has_personnel=$(echo "$wp_content" | grep -A 10 "^#### Budget" | grep -c "Personnel:" 2>/dev/null || echo "0")
                has_personnel=$(echo "$has_personnel" | head -1 | tr -d '\n')
                local has_equipment=$(echo "$wp_content" | grep -A 10 "^#### Budget" | grep -c "Equipment:" 2>/dev/null || echo "0")
                has_equipment=$(echo "$has_equipment" | head -1 | tr -d '\n')
                local has_overhead=$(echo "$wp_content" | grep -A 10 "^#### Budget" | grep -c "Overhead:" 2>/dev/null || echo "0")
                has_overhead=$(echo "$has_overhead" | head -1 | tr -d '\n')
                
                if [[ "$has_personnel" -gt 0 ]] && [[ "$has_equipment" -gt 0 ]] && [[ "$has_overhead" -gt 0 ]]; then
                    log_success "Work Package $i has complete budget breakdown (Personnel/Equipment/Overhead)"
                else
                    log_warning "Work Package $i missing some cost code categories"
                fi
            else
                log_error "Work Package $i missing Budget section"
                ((BUDGET_ERRORS++))
            fi
        done
    fi
    
    # ========================================================================
    # Budget Temporal Consistency Validation (CRITICAL)
    # ========================================================================
    
    log_info ""
    log_info "Validating budget temporal consistency..."
    log_info "(Checking that budget years match work package durations)"
    log_info ""
    
    # For each work package, validate budget years are within WP duration
    local temporal_errors=0
    local temporal_warnings=0
    
    for ((i=1; i<=wp_section_count; i++)); do
        local wp_header="### Work Package $i:"
        
        # Extract WP duration (escape ** for grep)
        local wp_duration=$(grep -A 5 "$wp_header" "$file" | grep "^\*\*Duration:\*\*" | head -1)
        
        if [[ -z "$wp_duration" ]]; then
            log_warning "Could not extract duration for Work Package $i"
            continue
        fi
        
        # Parse start and end years from duration
        # Expected format: "**Duration:** August 2025 to July 2026 (12 months)"
        local start_year=$(echo "$wp_duration" | grep -oE '20[0-9]{2}' | head -1)
        local end_year=$(echo "$wp_duration" | grep -oE '20[0-9]{2}' | tail -1)
        
        if [[ -z "$start_year" ]] || [[ -z "$end_year" ]]; then
            log_warning "Could not parse years from WP$i duration: $wp_duration"
            continue
        fi
        
        # Extract budget years from WP budget table
        # Look for lines like "| 2025 | 534,100 | 152,600 | 76,300 | 763,000 |"
        # Strategy: Extract from WP header to next WP (or end), then find Budget section, then only table rows
        local wp_content=$(awk "/^### Work Package $i:/{flag=1; next} /^### Work Package [0-9]+:/{flag=0} flag" "$file")
        local budget_section=$(echo "$wp_content" | sed -n '/^#### Budget/,/^---$/p')
        local budget_years=$(echo "$budget_section" | grep -E "^\| [0-9]{4}" | grep -oE "^\| [0-9]{4}" | grep -oE "[0-9]{4}" || echo "")
        
        if [[ -z "$budget_years" ]]; then
            log_warning "Could not extract budget years from WP$i budget table"
            continue
        fi
        
        # Validate each budget year is within [start_year, end_year]
        local invalid_years=""
        local budget_year_count=0
        while IFS= read -r year; do
            if [[ -n "$year" ]]; then
                ((budget_year_count++))
                if [[ $year -lt $start_year ]] || [[ $year -gt $end_year ]]; then
                    if [[ -n "$invalid_years" ]]; then
                        invalid_years="$invalid_years, $year"
                    else
                        invalid_years="$year"
                    fi
                fi
            fi
        done <<< "$budget_years"
        
        if [[ -n "$invalid_years" ]]; then
            log_error "Work Package $i has budget entries in year(s) [$invalid_years] OUTSIDE its duration (years $start_year-$end_year)"
            log_error "  Duration: $wp_duration"
            log_error "  Valid budget years: $start_year through $end_year"
            log_error "  Found budget years: $(echo "$budget_years" | tr '\n' ', ' | sed 's/,$//')"
            log_error "  FIX REQUIRED: Remove budget entries for year(s) $invalid_years"
            log_error "  Budget must be reallocated proportionally to valid years ($start_year-$end_year)"
            ((temporal_errors++))
            ((BUDGET_ERRORS++))
        else
            log_success "Work Package $i budget years ($budget_year_count years) within duration ($start_year-$end_year)"
        fi
        
        # Validate proportional allocation (warning only)
        # Check if budget split roughly matches month distribution
        if [[ $budget_year_count -eq 2 ]] && [[ $start_year -ne $end_year ]]; then
            # Extract month names from duration
            local start_month=$(echo "$wp_duration" | grep -oE '(January|February|March|April|May|June|July|August|September|October|November|December)' | head -1)
            local end_month=$(echo "$wp_duration" | grep -oE '(January|February|March|April|May|June|July|August|September|October|November|December)' | tail -1)
            
            # Calculate expected month distribution (simplified)
            # If start in Aug and end in Jul: 5 months in first year, 7 in second
            # If start in Aug and end in Jan: 5 months in first year, 1 in second
            
            if [[ -n "$start_month" ]] && [[ -n "$end_month" ]]; then
                # Extract budget amounts for each year
                local year1_budget=$(echo "$budget_section" | grep "^| $start_year" | grep -oE "\| [0-9,]+ \|" | tail -1 | grep -oE "[0-9,]+" | tr -d ',')
                local year2_budget=$(echo "$budget_section" | grep "^| $end_year" | grep -oE "\| [0-9,]+ \|" | tail -1 | grep -oE "[0-9,]+" | tr -d ',')
                
                if [[ -n "$year1_budget" ]] && [[ -n "$year2_budget" ]] && [[ $year1_budget -gt 0 ]] && [[ $year2_budget -gt 0 ]]; then
                    # Calculate ratio
                    local ratio=$((year1_budget * 100 / year2_budget))
                    
                    # Warn if too close to 50/50 (even split) when months are unequal
                    if [[ $ratio -ge 90 ]] && [[ $ratio -le 110 ]]; then
                        log_warning "Work Package $i has nearly even budget split ($year1_budget vs $year2_budget NOK)"
                        log_warning "  Consider: Is budget proportional to active months in each year?"
                        log_warning "  Example: 5 months in $start_year, 1 month in $end_year → 5:1 ratio expected"
                        ((temporal_warnings++))
                    else
                        log_info "Work Package $i budget ratio: $year1_budget:$year2_budget NOK (appears proportional)"
                    fi
                fi
            fi
        fi
    done
    
    # Temporal validation summary
    if [[ $temporal_errors -gt 0 ]]; then
        log_error ""
        log_error "BUDGET TEMPORAL CONSISTENCY ERRORS: $temporal_errors"
        log_error "Budget years MUST fall within work package duration boundaries"
        log_error "Example fix for WP ending July 2026 with 2027 budget:"
        log_error "  1. Remove 2027 budget row from WP budget table"
        log_error "  2. Redistribute 2027 amount proportionally to 2025/2026"
        log_error "  3. If WP has 12 months (5 in 2025, 7 in 2026):"
        log_error "     - 2025: total × (5/12)"
        log_error "     - 2026: total × (7/12)"
        log_error "  4. Update Section 8.1 and 8.3 yearly totals to match"
        log_error ""
    fi
    
    if [[ $temporal_warnings -gt 0 ]]; then
        log_warning ""
        log_warning "Budget proportionality warnings: $temporal_warnings"
        log_warning "Review recommended: Ensure budgets proportional to active months"
        log_warning ""
    fi
    
    if [[ $temporal_errors -eq 0 ]] && [[ $temporal_warnings -eq 0 ]]; then
        log_success ""
        log_success "Budget temporal consistency: PASSED"
        log_success "All work package budgets within duration boundaries"
        log_success ""
    fi
}

# ============================================================================
# Validation Layer 4: Traceability
# ============================================================================

validate_traceability() {
    log_section "Layer 4: Traceability"
    
    local file="$APPLICATION_PATH"
    
    # Check for EPF traceability section (now Section 9)
    if ! grep -q "## EPF Traceability" "$file"; then
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
        
        # Count WP -> KR mappings (using extended regex with -E)
        local mapping_count=$(grep -cE "WP[0-9] Activity [0-9.]+ → kr-p-[0-9]{3}" "$file" 2>/dev/null || echo "0")
        mapping_count=$(echo "$mapping_count" | head -1 | tr -d '\n')
        if [[ "$mapping_count" -gt 0 ]]; then
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
    echo -e "${BLUE}║      SkatteFUNN Application Validator v1.0.1         ║${NC}"
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
