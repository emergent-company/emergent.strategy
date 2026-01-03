#!/bin/bash
# EPF Investor Memo Package Validator
# Version: 1.0.0
#
# Validates complete investor materials package including:
#   - Comprehensive investor memo
#   - Executive summary
#   - One-page pitch
#   - Investor FAQ
#   - Materials index
#
# Prerequisites:
#   yq - YAML/JSON parser (brew install yq)
#   ajv-cli - JSON schema validator (npm install -g ajv-cli)
#
# Usage:
#   ./validate-investor-memo.sh --manifest path/to/manifest.json
#   ./validate-investor-memo.sh --dir path/to/investor-materials/2025-12-30/
#
# Exit codes:
#   0 - All validations passed
#   1 - Schema validation failed
#   2 - Document completeness validation failed
#   3 - Cross-document consistency validation failed
#   4 - EPF source traceability validation failed
#   5 - Freshness validation failed
#   6 - Format/structure validation failed
#
# @package EPF Outputs Framework
# @version 1.0.0

# NOTE: We do NOT use 'set -e' because a validation script should collect
# ALL errors across all layers, not exit on the first problem.
# Each validation layer explicitly increments error counters and the final
# exit code is determined by the total error count in main().

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

# Validation layer trackers
SCHEMA_ERRORS=0
COMPLETENESS_ERRORS=0
CONSISTENCY_ERRORS=0
TRACEABILITY_ERRORS=0
FRESHNESS_ERRORS=0
FORMAT_ERRORS=0

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
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check dependencies
check_dependencies() {
    local missing=0
    
    if ! command -v yq &> /dev/null; then
        log_error "yq is not installed. Install with: brew install yq (macOS) or apt install yq (Linux)"
        missing=1
    fi
    
    if ! command -v ajv &> /dev/null; then
        log_error "ajv-cli is not installed. Install with: npm install -g ajv-cli"
        missing=1
    fi
    
    if [ "$missing" -eq 1 ]; then
        echo ""
        echo "Please install missing dependencies and try again."
        exit 2
    fi
}

# Parse command line arguments
parse_args() {
    MANIFEST_PATH=""
    BASE_DIR=""
    SCHEMA_PATH=""
    REPO_ROOT=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --manifest)
                MANIFEST_PATH="$2"
                BASE_DIR=$(dirname "$MANIFEST_PATH")
                shift 2
                ;;
            --dir)
                BASE_DIR="$2"
                MANIFEST_PATH="$BASE_DIR/manifest.json"
                shift 2
                ;;
            --schema)
                SCHEMA_PATH="$2"
                shift 2
                ;;
            --repo-root)
                REPO_ROOT="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1"
                echo "Usage: $0 --manifest path/to/manifest.json [--schema path/to/schema.json] [--repo-root /path/to/repo]"
                echo "   or: $0 --dir path/to/investor-materials/2025-12-30/ [--schema path/to/schema.json] [--repo-root /path/to/repo]"
                exit 2
                ;;
        esac
    done
    
    # Validate required arguments
    if [[ -z "$MANIFEST_PATH" ]]; then
        echo "Error: --manifest or --dir is required"
        echo "Usage: $0 --manifest path/to/manifest.json"
        echo "   or: $0 --dir path/to/investor-materials/2025-12-30/"
        exit 2
    fi
    
    if [[ ! -f "$MANIFEST_PATH" ]]; then
        log_error "Manifest file not found: $MANIFEST_PATH"
        exit 2
    fi
    
    # Set defaults
    if [[ -z "$SCHEMA_PATH" ]]; then
        # Try to find schema relative to script location
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        SCHEMA_PATH="$SCRIPT_DIR/../schemas/investor_memo_package.schema.json"
    fi
    
    if [[ ! -f "$SCHEMA_PATH" ]]; then
        log_warning "Schema file not found: $SCHEMA_PATH (skipping schema validation)"
        SCHEMA_PATH=""
    fi
    
    if [[ -z "$REPO_ROOT" ]]; then
        # Try to find repo root (look for .git directory)
        REPO_ROOT="$BASE_DIR"
        while [[ "$REPO_ROOT" != "/" && ! -d "$REPO_ROOT/.git" ]]; do
            REPO_ROOT=$(dirname "$REPO_ROOT")
        done
        if [[ "$REPO_ROOT" == "/" ]]; then
            REPO_ROOT="$BASE_DIR"
        fi
    fi
    
    # Debug: Show resolved paths
    if [[ -n "$DEBUG" ]]; then
        echo "[DEBUG] BASE_DIR: $BASE_DIR" >&2
        echo "[DEBUG] REPO_ROOT: $REPO_ROOT" >&2
        echo "[DEBUG] MANIFEST_PATH: $MANIFEST_PATH" >&2
    fi
}

# ============================================================================
# Validation Layer 1: Schema Validation
# ============================================================================
validate_schema() {
    log_section "1. Schema Validation"
    
    if [[ -z "$SCHEMA_PATH" ]]; then
        log_warning "Schema validation skipped (no schema file)"
        return 0
    fi
    
    if ajv validate -s "$SCHEMA_PATH" -d "$MANIFEST_PATH" --strict=false 2>/dev/null; then
        log_pass "Manifest validates against schema"
    else
        log_error "Manifest FAILS schema validation"
        echo -e "${RED}  Validation errors:${NC}"
        ajv validate -s "$SCHEMA_PATH" -d "$MANIFEST_PATH" --strict=false 2>&1 | head -20 | sed 's/^/    /'
        ((SCHEMA_ERRORS++))
    fi
}

# ============================================================================
# Validation Layer 2: Document Completeness
# ============================================================================
validate_document_completeness() {
    log_section "2. Document Completeness"
    
    local documents=("comprehensive_memo" "executive_summary" "one_page_pitch" "faq" "materials_index")
    
    for doc in "${documents[@]}"; do
        local filename=$(yq eval ".$doc.filename" "$MANIFEST_PATH" 2>/dev/null | tr -d '"')
        
        if [[ "$filename" == "null" || -z "$filename" ]]; then
            log_error "Document '$doc' not defined in manifest"
            ((COMPLETENESS_ERRORS++))
            continue
        fi
        
        local filepath="$BASE_DIR/$filename"
        if [[ ! -f "$filepath" ]]; then
            log_error "Document file not found: $filename"
            ((COMPLETENESS_ERRORS++))
        elif [[ ! -s "$filepath" ]]; then
            log_error "Document file is empty: $filename"
            ((COMPLETENESS_ERRORS++))
        else
            log_pass "Document exists and readable: $filename"
        fi
    done
}

# ============================================================================
# Validation Layer 3: Cross-Document Consistency
# ============================================================================
validate_consistency() {
    log_section "3. Cross-Document Consistency"
    
    # Get document paths
    local comprehensive_memo="$BASE_DIR/$(yq eval '.comprehensive_memo.filename' "$MANIFEST_PATH" | tr -d '"')"
    local executive_summary="$BASE_DIR/$(yq eval '.executive_summary.filename' "$MANIFEST_PATH" | tr -d '"')"
    local one_page_pitch="$BASE_DIR/$(yq eval '.one_page_pitch.filename' "$MANIFEST_PATH" | tr -d '"')"
    local faq="$BASE_DIR/$(yq eval '.faq.filename' "$MANIFEST_PATH" | tr -d '"')"
    
    # Skip if files don't exist
    if [[ ! -f "$comprehensive_memo" ]]; then
        log_warning "Skipping consistency checks (comprehensive memo not found)"
        return 0
    fi
    
    # Check 1: Product name consistency
    log_info "Checking product name consistency..."
    local product_name=$(yq eval '.metadata.product_name' "$MANIFEST_PATH" | tr -d '"')
    
    for doc_path in "$comprehensive_memo" "$executive_summary" "$one_page_pitch"; do
        if [[ -f "$doc_path" ]]; then
            local doc_name=$(basename "$doc_path")
            local mentions=$(grep -c "$product_name" "$doc_path" 2>/dev/null || echo "0")
            if [[ $mentions -ge 3 ]]; then
                log_pass "Product name '$product_name' mentioned $mentions times in $doc_name"
            else
                log_warning "Product name '$product_name' only mentioned $mentions times in $doc_name (expected 3+)"
            fi
        fi
    done
    
    # Check 2: TAM/SAM/SOM consistency
    log_info "Checking market size consistency..."
    if [[ -f "$comprehensive_memo" && -f "$one_page_pitch" ]]; then
        local comp_tam=$(grep -oE 'TAM[:\s]*\$?[0-9.]+[BMK]\+?' "$comprehensive_memo" | head -1 || echo "")
        local pitch_tam=$(grep -oE 'TAM[:\s]*\$?[0-9.]+[BMK]\+?' "$one_page_pitch" | head -1 || echo "")
        
        if [[ -n "$comp_tam" && -n "$pitch_tam" ]]; then
            # Normalize (remove spaces, convert to uppercase)
            comp_tam_norm=$(echo "$comp_tam" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
            pitch_tam_norm=$(echo "$pitch_tam" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
            
            if [[ "$comp_tam_norm" == "$pitch_tam_norm" ]]; then
                log_pass "TAM consistent across documents: $comp_tam"
            else
                log_warning "TAM mismatch: Comprehensive=$comp_tam, Pitch=$pitch_tam"
            fi
        fi
        
        # Check SAM
        local comp_sam=$(grep -oE 'SAM[:\s]*\$?[0-9.]+[BMK]' "$comprehensive_memo" | head -1 || echo "")
        local pitch_sam=$(grep -oE 'SAM[:\s]*\$?[0-9.]+[BMK]' "$one_page_pitch" | head -1 || echo "")
        
        if [[ -n "$comp_sam" && -n "$pitch_sam" ]]; then
            comp_sam_norm=$(echo "$comp_sam" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
            pitch_sam_norm=$(echo "$pitch_sam" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
            
            if [[ "$comp_sam_norm" == "$pitch_sam_norm" ]]; then
                log_pass "SAM consistent across documents: $comp_sam"
            else
                log_warning "SAM mismatch: Comprehensive=$comp_sam, Pitch=$pitch_sam"
            fi
        fi
    fi
    
    # Check 3: Round type mentions
    log_info "Checking round type mentions..."
    local round_type=$(yq eval '.metadata.round_type' "$MANIFEST_PATH" | tr -d '"')
    for doc_path in "$comprehensive_memo" "$executive_summary" "$one_page_pitch"; do
        if [[ -f "$doc_path" ]]; then
            local doc_name=$(basename "$doc_path")
            if grep -qi "$round_type" "$doc_path" 2>/dev/null; then
                log_pass "Round type '$round_type' mentioned in $doc_name"
            else
                log_warning "Round type '$round_type' not found in $doc_name"
            fi
        fi
    done
    
    # Check 4: Date consistency (no future dates > 5 years, no old dates > 2 years)
    log_info "Checking date validity..."
    local now_year=$(date +%Y)
    local max_future_year=$((now_year + 5))
    local min_past_year=$((now_year - 2))
    
    for doc_path in "$comprehensive_memo" "$executive_summary" "$one_page_pitch"; do
        if [[ -f "$doc_path" ]]; then
            local doc_name=$(basename "$doc_path")
            # Extract years (4-digit numbers)
            local years=$(grep -oE '\b(19|20)[0-9]{2}\b' "$doc_path" 2>/dev/null || echo "")
            local has_future=0
            local has_old=0
            
            while IFS= read -r year; do
                if [[ -n "$year" && "$year" -gt "$max_future_year" ]]; then
                    has_future=1
                fi
                if [[ -n "$year" && "$year" -lt "$min_past_year" ]]; then
                    has_old=1
                fi
            done <<< "$years"
            
            if [[ $has_future -eq 1 ]]; then
                log_warning "Document $doc_name contains dates > 5 years in future"
                ((CONSISTENCY_ERRORS++))
            fi
            
            if [[ $has_old -eq 1 ]]; then
                log_warning "Document $doc_name contains dates > 2 years in past"
            fi
        fi
    done
    
    # Check 5: ARR/Financial projections mentions
    log_info "Checking financial projections presence..."
    if [[ -f "$comprehensive_memo" ]]; then
        local arr_mentions=$(grep -ci "ARR\|Annual Recurring Revenue" "$comprehensive_memo" 2>/dev/null || echo "0")
        if [[ $arr_mentions -ge 3 ]]; then
            log_pass "ARR mentioned $arr_mentions times in comprehensive memo (expected 3+)"
        else
            log_warning "ARR only mentioned $arr_mentions times in comprehensive memo (expected 3+)"
        fi
    fi
}

# ============================================================================
# Validation Layer 4: EPF Source Traceability
# ============================================================================
validate_epf_sources() {
    log_section "4. EPF Source Traceability"
    
    # Check north_star
    local north_star=$(yq eval '.metadata.epf_sources.north_star' "$MANIFEST_PATH" | tr -d '"')
    if [[ "$north_star" != "null" && -n "$north_star" ]]; then
        local source_path="$REPO_ROOT/$north_star"
        if [[ -n "$DEBUG" ]]; then
            echo "[DEBUG] Checking north_star: $north_star" >&2
            echo "[DEBUG] Full path: $source_path" >&2
            echo "[DEBUG] File exists: $([ -f "$source_path" ] && echo 'YES' || echo 'NO')" >&2
        fi
        if [[ -f "$source_path" ]]; then
            log_pass "EPF source exists: $north_star"
            check_source_freshness "$source_path" "$north_star"
        else
            log_error "EPF source not found: \"$north_star\""
            ((TRACEABILITY_ERRORS++))
        fi
    fi
    
    # Check strategy_formula
    local strategy_formula=$(yq eval '.metadata.epf_sources.strategy_formula' "$MANIFEST_PATH" | tr -d '"')
    if [[ "$strategy_formula" != "null" && -n "$strategy_formula" ]]; then
        local source_path="$REPO_ROOT/$strategy_formula"
        if [[ -f "$source_path" ]]; then
            log_pass "EPF source exists: $strategy_formula"
            check_source_freshness "$source_path" "$strategy_formula"
        else
            log_error "EPF source not found: $strategy_formula"
            ((TRACEABILITY_ERRORS++))
        fi
    fi
    
    # Check roadmap_recipe
    local roadmap_recipe=$(yq eval '.metadata.epf_sources.roadmap_recipe' "$MANIFEST_PATH" | tr -d '"')
    if [[ "$roadmap_recipe" != "null" && -n "$roadmap_recipe" ]]; then
        local source_path="$REPO_ROOT/$roadmap_recipe"
        if [[ -f "$source_path" ]]; then
            log_pass "EPF source exists: $roadmap_recipe"
            check_source_freshness "$source_path" "$roadmap_recipe"
        else
            log_error "EPF source not found: $roadmap_recipe"
            ((TRACEABILITY_ERRORS++))
        fi
    fi
    
    # Check value_models array
    local vm_count=$(yq eval '.metadata.epf_sources.value_models | length' "$MANIFEST_PATH" 2>/dev/null || echo "0")
    if [[ "$vm_count" != "null" && "$vm_count" -gt 0 ]]; then
        for ((i=0; i<vm_count; i++)); do
            local vm_path=$(yq eval ".metadata.epf_sources.value_models[$i]" "$MANIFEST_PATH" | tr -d '"')
            if [[ "$vm_path" != "null" && -n "$vm_path" ]]; then
                local source_path="$REPO_ROOT/$vm_path"
                if [[ -f "$source_path" ]]; then
                    log_pass "Value model exists: $vm_path"
                    check_source_freshness "$source_path" "$vm_path"
                else
                    log_error "Value model not found: $vm_path"
                    ((TRACEABILITY_ERRORS++))
                fi
            fi
        done
    fi
    
    # Check optional insight_analyses array
    local ia_count=$(yq eval '.metadata.epf_sources.insight_analyses | length' "$MANIFEST_PATH" 2>/dev/null || echo "0")
    if [[ "$ia_count" != "null" && "$ia_count" -gt 0 ]]; then
        for ((i=0; i<ia_count; i++)); do
            local ia_path=$(yq eval ".metadata.epf_sources.insight_analyses[$i]" "$MANIFEST_PATH" | tr -d '"')
            if [[ "$ia_path" != "null" && -n "$ia_path" ]]; then
                local source_path="$REPO_ROOT/$ia_path"
                if [[ -f "$source_path" ]]; then
                    log_pass "Insight analysis exists: $ia_path"
                else
                    log_warning "Insight analysis not found: $ia_path (optional)"
                fi
            fi
        done
    fi
}

# Helper: Check source file freshness
check_source_freshness() {
    local source_path="$1"
    local source_name="$2"
    
    # Get file modification time (days ago)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        local mod_time=$(stat -f %m "$source_path")
    else
        # Linux
        local mod_time=$(stat -c %Y "$source_path")
    fi
    
    local now=$(date +%s)
    local age_days=$(( (now - mod_time) / 86400 ))
    
    if [[ $age_days -gt 30 ]]; then
        log_warning "EPF source is $age_days days old: $source_name (consider updating)"
    fi
}

# ============================================================================
# Validation Layer 5: Freshness Validation
# ============================================================================
validate_freshness() {
    log_section "5. Freshness Validation"
    
    local generated_at=$(yq eval '.metadata.generated_at' "$MANIFEST_PATH" | tr -d '"')
    
    if [[ "$generated_at" == "null" || -z "$generated_at" ]]; then
        log_warning "Package generation timestamp not found in manifest"
        return 0
    fi
    
    # Parse ISO 8601 timestamp
    local generated_epoch
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        generated_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$generated_at" +%s 2>/dev/null || echo "0")
    else
        # Linux
        generated_epoch=$(date -d "$generated_at" +%s 2>/dev/null || echo "0")
    fi
    
    if [[ $generated_epoch -eq 0 ]]; then
        log_warning "Could not parse generation timestamp: $generated_at"
        return 0
    fi
    
    local now_epoch=$(date +%s)
    local age_days=$(( (now_epoch - generated_epoch) / 86400 ))
    
    log_info "Package age: $age_days days"
    
    if [[ $age_days -gt 180 ]]; then
        log_error "Package is $age_days days old (max 180 days / 6 months)"
        ((FRESHNESS_ERRORS++))
    elif [[ $age_days -gt 90 ]]; then
        log_warning "Package is $age_days days old (consider regenerating after 90 days)"
    else
        log_pass "Package freshness acceptable ($age_days days old)"
    fi
    
    # Check document generation time spread
    log_info "Checking document generation time spread..."
    local doc_times=()
    for doc in comprehensive_memo executive_summary one_page_pitch faq materials_index; do
        local doc_time=$(yq eval ".documents.$doc.generated_at" "$MANIFEST_PATH" 2>/dev/null)
        if [[ "$doc_time" != "null" && -n "$doc_time" ]]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                local doc_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$doc_time" +%s 2>/dev/null || echo "0")
            else
                local doc_epoch=$(date -d "$doc_time" +%s 2>/dev/null || echo "0")
            fi
            doc_times+=("$doc_epoch")
        fi
    done
    
    if [[ ${#doc_times[@]} -gt 1 ]]; then
        local min_time=${doc_times[0]}
        local max_time=${doc_times[0]}
        for time in "${doc_times[@]}"; do
            if [[ $time -lt $min_time ]]; then min_time=$time; fi
            if [[ $time -gt $max_time ]]; then max_time=$time; fi
        done
        local spread_hours=$(( (max_time - min_time) / 3600 ))
        
        if [[ $spread_hours -gt 24 ]]; then
            log_warning "Documents generated over $spread_hours hours (> 24 hours apart)"
        else
            log_pass "Documents generated within $spread_hours hours"
        fi
    fi
}

# ============================================================================
# Validation Layer 6: Format/Structure Validation
# ============================================================================
validate_format() {
    log_section "6. Format/Structure Validation"
    
    # Define word count ranges per document (bash 3.x compatible)
    # Format: "doc_name:min_words:max_words"
    local word_count_ranges=(
        "comprehensive_memo:15000:25000"
        "executive_summary:6000:10000"
        "one_page_pitch:2000:4000"
        "faq:10000:20000"
        "materials_index:3000:5000"
    )
    
    # Validate each document
    for range in "${word_count_ranges[@]}"; do
        IFS=':' read -r doc min_words max_words <<< "$range"
        
        local filename=$(yq eval ".$doc.filename" "$MANIFEST_PATH" | tr -d '"')
        local filepath="$BASE_DIR/$filename"
        
        if [[ ! -f "$filepath" ]]; then
            continue  # Already reported in completeness check
        fi
        
        log_info "Validating $filename..."
        
        # Word count validation
        local word_count=$(wc -w < "$filepath" | tr -d ' ')
        
        if [[ $word_count -lt $min_words ]]; then
            log_error "$filename: Word count $word_count below minimum $min_words"
            ((FORMAT_ERRORS++))
        elif [[ $word_count -gt $max_words ]]; then
            log_warning "$filename: Word count $word_count exceeds maximum $max_words (consider condensing)"
        else
            log_pass "$filename: Word count $word_count within range ($min_words-$max_words)"
        fi
        
        # Markdown structure validation
        local h1_count=$(grep -c "^# " "$filepath" 2>/dev/null || echo "0")
        local h2_count=$(grep -c "^## " "$filepath" 2>/dev/null || echo "0")
        
        if [[ $h1_count -ne 1 ]]; then
            log_warning "$filename: Expected 1 H1 heading, found $h1_count"
        fi
        
        if [[ $doc == "comprehensive_memo" && $h2_count -lt 10 ]]; then
            log_warning "$filename: Only $h2_count H2 sections (expected 10+ for comprehensive memo)"
        fi
        
        # Placeholder detection
        local placeholders=$(grep -E -c '\[PLACEHOLDER\]|TODO|TK|XXX' "$filepath" 2>/dev/null || echo "0")
        placeholders=$(echo "$placeholders" | tr -d '\n' | tr -d ' ')  # Clean output
        if [[ $placeholders -gt 0 ]]; then
            log_error "$filename: Contains $placeholders placeholder(s) (search for TODO, TK, XXX, [PLACEHOLDER])"
            ((FORMAT_ERRORS++))
        else
            log_pass "$filename: No placeholders found"
        fi
        
        # Section presence validation (document-specific)
        validate_required_sections "$filepath" "$doc" "$filename"
    done
}

# Helper: Validate required sections per document type
validate_required_sections() {
    local filepath="$1"
    local doc_type="$2"
    local filename="$3"
    
    case $doc_type in
        comprehensive_memo)
            local required_sections=(
                "Executive Summary"
                "Problem Statement"
                "Market Opportunity"
                "Product"
                "Business Model"
                "Roadmap"
                "Team"
                "Investment"
                "Financial"
                "Use of Funds"
            )
            ;;
        executive_summary)
            local required_sections=(
                "Opportunity"
                "Market"
                "Product"
                "Business Model"
                "Team"
                "Financial"
            )
            ;;
        one_page_pitch)
            local required_sections=(
                "Problem"
                "Solution"
                "Market"
                "Competitive"
                "Business Model"
                "Team"
            )
            ;;
        faq)
            local required_sections=(
                "Product"
                "Market"
                "Business Model"
                "Team"
                "Investment"
            )
            ;;
        materials_index)
            local required_sections=(
                "Overview"
                "Document"
            )
            ;;
        *)
            return 0
            ;;
    esac
    
    for section in "${required_sections[@]}"; do
        if grep -qi "$section" "$filepath" 2>/dev/null; then
            : # Section found (silent pass)
        else
            log_warning "$filename: Missing or unclear section: $section"
        fi
    done
}

# ============================================================================
# Main Validation Flow
# ============================================================================
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║       Investor Memo Package Validator v1.0.0                      ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Parse arguments and check dependencies
    parse_args "$@"
    check_dependencies
    
    # Display configuration
    log_info "Manifest: $MANIFEST_PATH"
    local product_name=$(yq eval '.metadata.product_name' "$MANIFEST_PATH" 2>/dev/null || echo "Unknown")
    local round_type=$(yq eval '.metadata.round_type' "$MANIFEST_PATH" 2>/dev/null || echo "Unknown")
    local generated_at=$(yq eval '.metadata.generated_at' "$MANIFEST_PATH" 2>/dev/null || echo "Unknown")
    
    log_info "Product: $product_name"
    log_info "Round: $round_type"
    log_info "Generated: $generated_at"
    echo ""
    log_info "Running validations..."
    
    # Run all validation layers
    validate_schema || true
    validate_document_completeness || true
    validate_consistency || true
    validate_epf_sources || true
    validate_freshness || true
    validate_format || true
    
    # Generate summary
    log_section "Validation Summary"
    
    echo ""
    echo "Results by validation layer:"
    echo -e "  1. Schema validation:         $(format_result $SCHEMA_ERRORS)"
    echo -e "  2. Document completeness:     $(format_result $COMPLETENESS_ERRORS)"
    echo -e "  3. Cross-doc consistency:     $(format_result $CONSISTENCY_ERRORS)"
    echo -e "  4. EPF source traceability:   $(format_result $TRACEABILITY_ERRORS)"
    echo -e "  5. Freshness validation:      $(format_result $FRESHNESS_ERRORS)"
    echo -e "  6. Format/structure:          $(format_result $FORMAT_ERRORS)"
    echo ""
    
    echo "Overall statistics:"
    echo -e "  ${GREEN}Passed checks:  $PASSED${NC}"
    echo -e "  ${RED}Failed checks:  $ERRORS${NC}"
    echo -e "  ${YELLOW}Warnings:       $WARNINGS${NC}"
    echo ""
    
    # Write validation report
    local report_path="$BASE_DIR/validation_report.txt"
    {
        echo "Investor Memo Package Validation Report"
        echo "========================================"
        echo ""
        echo "Manifest: $MANIFEST_PATH"
        echo "Product: $product_name"
        echo "Round: $round_type"
        echo "Generated: $generated_at"
        echo "Validated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo ""
        echo "Results by validation layer:"
        echo "  1. Schema validation:         $(format_result_plain $SCHEMA_ERRORS)"
        echo "  2. Document completeness:     $(format_result_plain $COMPLETENESS_ERRORS)"
        echo "  3. Cross-doc consistency:     $(format_result_plain $CONSISTENCY_ERRORS)"
        echo "  4. EPF source traceability:   $(format_result_plain $TRACEABILITY_ERRORS)"
        echo "  5. Freshness validation:      $(format_result_plain $FRESHNESS_ERRORS)"
        echo "  6. Format/structure:          $(format_result_plain $FORMAT_ERRORS)"
        echo ""
        echo "Overall statistics:"
        echo "  Passed checks:  $PASSED"
        echo "  Failed checks:  $ERRORS"
        echo "  Warnings:       $WARNINGS"
        echo ""
        if [[ $ERRORS -eq 0 ]]; then
            echo "OVERALL: PASSED"
        else
            echo "OVERALL: FAILED"
        fi
    } > "$report_path"
    
    log_info "Validation report written to: $report_path"
    echo ""
    
    # Final result with colored banner
    echo "════════════════════════════════════════════════════════════════════"
    if [[ $ERRORS -eq 0 ]]; then
        if [[ $WARNINGS -gt 0 ]]; then
            echo -e "${GREEN}✅ OVERALL: PASSED${NC} (with $WARNINGS warning(s))"
        else
            echo -e "${GREEN}✅ OVERALL: PASSED${NC}"
        fi
        echo "════════════════════════════════════════════════════════════════════"
        echo ""
        exit 0
    else
        echo -e "${RED}❌ OVERALL: FAILED${NC}"
        echo "════════════════════════════════════════════════════════════════════"
        echo ""
        
        # Determine specific exit code
        if [[ $SCHEMA_ERRORS -gt 0 ]]; then
            exit 1
        elif [[ $COMPLETENESS_ERRORS -gt 0 ]]; then
            exit 2
        elif [[ $CONSISTENCY_ERRORS -gt 0 ]]; then
            exit 3
        elif [[ $TRACEABILITY_ERRORS -gt 0 ]]; then
            exit 4
        elif [[ $FRESHNESS_ERRORS -gt 0 ]]; then
            exit 5
        elif [[ $FORMAT_ERRORS -gt 0 ]]; then
            exit 6
        else
            exit 1
        fi
    fi
}

# Helper: Format validation result with colors
format_result() {
    local errors=$1
    if [[ $errors -eq 0 ]]; then
        echo -e "${GREEN}PASSED${NC}"
    else
        echo -e "${RED}FAILED ($errors error(s))${NC}"
    fi
}

# Helper: Format validation result without colors (for file)
format_result_plain() {
    local errors=$1
    if [[ $errors -eq 0 ]]; then
        echo "PASSED"
    else
        echo "FAILED ($errors error(s))"
    fi
}

# Run main function
main "$@"
