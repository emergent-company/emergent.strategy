#!/bin/bash
# EPF Schema Validation Script
# Version: 2.4.4
#
# This script validates that EPF YAML artifacts conform to their JSON schemas.
# It uses yq for YAML-to-JSON conversion and ajv-cli for schema validation.
#
# Prerequisites:
#   npm install -g ajv-cli
#   brew install yq (or apt-get install yq)
#
# Usage:
#   ./scripts/validate-schemas.sh [instance-path]
#   ./scripts/validate-schemas.sh _instances/my-product
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation errors found
#   2 - Missing dependencies
#
# Changelog:
#   v2.4.4 - Fixed phase-based structure support (READY/, FIRE/, AIM/ directories)
#   v1.11.0 - Enhanced strategy_formula_schema.json with rich structured objects
#   v1.10.1 - Added product portfolio schema validation
#   v1.9.7 - Added feature definition schema validation

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
PASSED=0

# Temp directory for JSON conversions
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

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

# Check dependencies
check_dependencies() {
    log_section "Checking Dependencies"
    
    local missing=0
    
    if ! command -v yq &> /dev/null; then
        log_error "yq is not installed. Install with: brew install yq (macOS) or apt install yq (Linux)"
        missing=1
    else
        log_pass "yq is installed: $(yq --version 2>&1 | head -1)"
    fi
    
    if ! command -v ajv &> /dev/null; then
        log_error "ajv-cli is not installed. Install with: npm install -g ajv-cli"
        missing=1
    else
        log_pass "ajv-cli is installed"
    fi
    
    if [ "$missing" -eq 1 ]; then
        echo ""
        echo "Please install missing dependencies and try again."
        exit 2
    fi
}

# Convert YAML to JSON
yaml_to_json() {
    local yaml_file="$1"
    local json_file="$2"
    yq -o=json eval '.' "$yaml_file" > "$json_file"
}

# Validate a single file against a schema
validate_file() {
    local yaml_file="$1"
    local schema_file="$2"
    local filename=$(basename "$yaml_file")
    
    if [ ! -f "$yaml_file" ]; then
        log_warning "File not found: $yaml_file"
        return
    fi
    
    if [ ! -f "$schema_file" ]; then
        log_warning "Schema not found: $schema_file"
        return
    fi
    
    # Convert YAML to JSON
    local json_file="$TEMP_DIR/$(basename "$yaml_file" .yaml).json"
    if ! yaml_to_json "$yaml_file" "$json_file" 2>/dev/null; then
        log_error "Failed to parse YAML: $filename"
        return
    fi
    
    # Validate against schema
    if ajv validate -s "$schema_file" -d "$json_file" --strict=false 2>/dev/null; then
        log_pass "$filename validates against $(basename "$schema_file")"
    else
        log_error "$filename FAILS validation against $(basename "$schema_file")"
        # Show detailed errors
        echo -e "${RED}  Validation errors:${NC}"
        ajv validate -s "$schema_file" -d "$json_file" --strict=false 2>&1 | head -20 | sed 's/^/    /'
    fi
}

# Find EPF root (where schemas directory is)
find_epf_root() {
    local current="$1"
    
    # Check if current directory has schemas
    if [ -d "$current/schemas" ]; then
        echo "$current"
        return
    fi
    
    # Check common locations
    for path in "." "docs/EPF" "../" "../../" "../docs/EPF"; do
        if [ -d "$path/schemas" ]; then
            echo "$path"
            return
        fi
    done
    
    echo ""
}

# Main validation logic
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║         EPF Schema Validation Script v2.4.4                     ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    check_dependencies
    
    # Determine paths
    local INSTANCE_PATH="$1"
    local EPF_ROOT=""
    
    if [ -n "$INSTANCE_PATH" ]; then
        # Instance path provided
        if [ ! -d "$INSTANCE_PATH" ]; then
            log_error "Instance path does not exist: $INSTANCE_PATH"
            exit 1
        fi
        EPF_ROOT=$(find_epf_root "$INSTANCE_PATH")
    else
        # Auto-detect
        if [ -d "_instances" ]; then
            EPF_ROOT="."
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
    
    if [ -z "$EPF_ROOT" ]; then
        log_error "Could not find EPF root (schemas directory). Make sure you're in an EPF repository."
        exit 1
    fi
    
    local SCHEMA_DIR="$EPF_ROOT/schemas"
    local INSTANCE_NAME=$(basename "$INSTANCE_PATH")
    
    log_info "EPF Root: $EPF_ROOT"
    log_info "Schema Directory: $SCHEMA_DIR"
    log_info "Instance: $INSTANCE_NAME"
    log_info "Instance Path: $INSTANCE_PATH"
    
    # ==========================================================================
    # Validate READY Phase Artifacts
    # ==========================================================================
    log_section "READY Phase Artifacts"
    
    # Support both phase-based structure (READY/) and legacy flat structure
    local READY_DIR="$INSTANCE_PATH/READY"
    if [ ! -d "$READY_DIR" ]; then
        READY_DIR="$INSTANCE_PATH"
    fi
    
    # 00_north_star.yaml -> north_star_schema.json
    if [ -f "$READY_DIR/00_north_star.yaml" ]; then
        validate_file "$READY_DIR/00_north_star.yaml" "$SCHEMA_DIR/north_star_schema.json"
    else
        log_warning "No 00_north_star.yaml found in READY/"
    fi
    
    # 01_insight_analyses.yaml -> insight_analyses_schema.json
    if [ -f "$READY_DIR/01_insight_analyses.yaml" ]; then
        validate_file "$READY_DIR/01_insight_analyses.yaml" "$SCHEMA_DIR/insight_analyses_schema.json"
    else
        log_info "No 01_insight_analyses.yaml found (optional)"
    fi
    
    # 02_strategy_foundations.yaml -> strategy_foundations_schema.json
    if [ -f "$READY_DIR/02_strategy_foundations.yaml" ]; then
        validate_file "$READY_DIR/02_strategy_foundations.yaml" "$SCHEMA_DIR/strategy_foundations_schema.json"
    else
        log_info "No 02_strategy_foundations.yaml found (optional)"
    fi
    
    # 03_insight_opportunity.yaml -> insight_opportunity_schema.json
    if [ -f "$READY_DIR/03_insight_opportunity.yaml" ]; then
        validate_file "$READY_DIR/03_insight_opportunity.yaml" "$SCHEMA_DIR/insight_opportunity_schema.json"
    else
        log_info "No 03_insight_opportunity.yaml found (optional)"
    fi
    
    # 04_strategy_formula.yaml -> strategy_formula_schema.json
    if [ -f "$READY_DIR/04_strategy_formula.yaml" ]; then
        validate_file "$READY_DIR/04_strategy_formula.yaml" "$SCHEMA_DIR/strategy_formula_schema.json"
    else
        log_info "No 04_strategy_formula.yaml found (optional)"
    fi
    
    # 05_roadmap_recipe.yaml -> roadmap_recipe_schema.json
    if [ -f "$READY_DIR/05_roadmap_recipe.yaml" ]; then
        validate_file "$READY_DIR/05_roadmap_recipe.yaml" "$SCHEMA_DIR/roadmap_recipe_schema.json"
    elif [ -f "$READY_DIR/04_roadmap_recipe.yaml" ]; then
        validate_file "$READY_DIR/04_roadmap_recipe.yaml" "$SCHEMA_DIR/roadmap_recipe_schema.json"
    else
        log_info "No roadmap_recipe.yaml found (optional)"
    fi
    
    # ==========================================================================
    # Validate FIRE Phase Artifacts
    # ==========================================================================
    
    # Support both phase-based structure (FIRE/) and legacy flat structure
    local FIRE_DIR="$INSTANCE_PATH/FIRE"
    if [ ! -d "$FIRE_DIR" ]; then
        FIRE_DIR="$INSTANCE_PATH"
    fi
    
    log_section "FIRE Phase Artifacts (Value Models)"
    
    # Value models
    if [ -d "$FIRE_DIR/value_models" ]; then
        for vm_file in "$FIRE_DIR/value_models"/*.yaml; do
            [ -f "$vm_file" ] || continue
            validate_file "$vm_file" "$SCHEMA_DIR/value_model_schema.json"
        done
    else
        log_warning "No value_models directory found in FIRE/"
    fi
    
    log_section "FIRE Phase Artifacts (Workflows)"
    
    # Workflows
    if [ -d "$FIRE_DIR/workflows" ]; then
        for wf_file in "$FIRE_DIR/workflows"/*.yaml; do
            [ -f "$wf_file" ] || continue
            validate_file "$wf_file" "$SCHEMA_DIR/workflow_schema.json"
        done
    else
        log_info "No workflows directory found (optional)"
    fi
    
    log_section "FIRE Phase Artifacts (Mappings)"
    
    # Mappings
    if [ -f "$FIRE_DIR/mappings.yaml" ]; then
        validate_file "$FIRE_DIR/mappings.yaml" "$SCHEMA_DIR/mappings_schema.json"
    else
        log_info "No mappings.yaml found (optional)"
    fi
    
    log_section "FIRE Phase Artifacts (Feature Definitions)"
    
    # Feature Definitions
    if [ -d "$FIRE_DIR/feature_definitions" ]; then
        local fd_count=0
        for fd_file in "$FIRE_DIR/feature_definitions"/*.yaml "$FIRE_DIR/feature_definitions"/*.yml; do
            [ -f "$fd_file" ] || continue
            filename=$(basename "$fd_file")
            # Skip underscore-prefixed files (helper/config files)
            [[ "$filename" == _* ]] && continue
            validate_file "$fd_file" "$SCHEMA_DIR/feature_definition_schema.json"
            ((fd_count++)) || true
        done
        if [ "$fd_count" -eq 0 ]; then
            log_info "No feature definition YAML files found (expected if early in FIRE phase)"
        fi
    else
        log_info "No feature_definitions directory found (expected if early in FIRE phase)"
    fi
    
    log_section "FIRE Phase Artifacts (Product Portfolio)"
    
    # Product Portfolio (v1.10.1+)
    if [ -f "$FIRE_DIR/product_portfolio.yaml" ]; then
        validate_file "$FIRE_DIR/product_portfolio.yaml" "$SCHEMA_DIR/product_portfolio_schema.json"
    else
        log_info "No product_portfolio.yaml found (optional for single-product orgs)"
    fi
    
    # ==========================================================================
    # Validate AIM Phase Artifacts
    # ==========================================================================
    
    # Support both phase-based structure (AIM/) and legacy flat structure
    local AIM_DIR="$INSTANCE_PATH/AIM"
    if [ ! -d "$AIM_DIR" ]; then
        AIM_DIR="$INSTANCE_PATH"
    fi
    
    log_section "AIM Phase Artifacts"
    
    # Check for assessment reports in AIM directory
    if [ -f "$AIM_DIR/assessment_report.yaml" ]; then
        validate_file "$AIM_DIR/assessment_report.yaml" "$SCHEMA_DIR/assessment_report_schema.json"
    else
        log_info "No assessment_report.yaml found in AIM/ (expected if not yet completed a cycle)"
    fi
    
    if [ -f "$AIM_DIR/calibration_memo.yaml" ]; then
        validate_file "$AIM_DIR/calibration_memo.yaml" "$SCHEMA_DIR/calibration_memo_schema.json"
    else
        log_info "No calibration_memo.yaml found in AIM/ (expected if not yet completed a cycle)"
    fi
    
    # Check for assessment reports in cycles (archived)
    if [ -d "$INSTANCE_PATH/cycles" ]; then
        for cycle_dir in "$INSTANCE_PATH/cycles"/*; do
            [ -d "$cycle_dir" ] || continue
            
            # Look for assessment files
            if [ -f "$cycle_dir/assessment_report.yaml" ]; then
                validate_file "$cycle_dir/assessment_report.yaml" "$SCHEMA_DIR/assessment_report_schema.json"
            fi
            
            if [ -f "$cycle_dir/calibration_memo.yaml" ]; then
                validate_file "$cycle_dir/calibration_memo.yaml" "$SCHEMA_DIR/calibration_memo_schema.json"
            fi
        done
    else
        log_info "No cycles directory found (no archived cycle assessments)"
    fi
    
    # ==========================================================================
    # Summary
    # ==========================================================================
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                    SCHEMA VALIDATION SUMMARY                     ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "Instance: ${BLUE}$INSTANCE_NAME${NC}"
    echo ""
    echo -e "${GREEN}Passed:${NC}   $PASSED"
    echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
    echo -e "${RED}Errors:${NC}   $ERRORS"
    echo ""
    
    if [ "$ERRORS" -gt 0 ]; then
        echo -e "${RED}━━━ SCHEMA VALIDATION FAILED ━━━${NC}"
        echo ""
        echo "Artifacts do not match their schemas. Please update either:"
        echo "  1. The artifact YAML files to match the current schema"
        echo "  2. The schema JSON files if the format has intentionally changed"
        echo ""
        echo "To fix schema mismatches:"
        echo "  - Review the validation errors above"
        echo "  - Compare artifact structure with schema definition"
        echo "  - Update the artifact or schema accordingly"
        exit 1
    else
        if [ "$WARNINGS" -gt 0 ]; then
            echo -e "${YELLOW}━━━ VALIDATION PASSED WITH WARNINGS ━━━${NC}"
        else
            echo -e "${GREEN}━━━ ALL SCHEMAS VALIDATED ━━━${NC}"
        fi
        echo ""
        exit 0
    fi
}

main "$@"
