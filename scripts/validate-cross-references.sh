#!/bin/bash
# EPF Cross-Reference Validation Script
# Version: 1.0.0
# 
# This script validates that all feature definition cross-references are valid:
#   - dependencies.requires[].id references must exist
#   - dependencies.enables[].id references must exist
#   - dependencies.based_on[].id references must exist
#   - All referenced feature IDs must be valid feature definition files
#
# Usage:
#   ./scripts/validate-cross-references.sh [features-dir]
#   ./scripts/validate-cross-references.sh definitions/product/
#
# Exit codes:
#   0 - All cross-references valid
#   1 - Validation errors found
#   2 - Script usage error

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
CHECKED=0

# Helper functions
log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1" >&2
    ((ERRORS++)) || true
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1" >&2
    ((WARNINGS++)) || true
}

log_pass() {
    echo -e "${GREEN}✓${NC} $1" >&2
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1" >&2
}

# Check if yq is installed
check_dependencies() {
    if ! command -v yq &> /dev/null; then
        echo -e "${RED}ERROR: yq is not installed${NC}"
        echo "Install with: brew install yq (macOS) or see https://github.com/mikefarah/yq"
        exit 2
    fi
}

# Build list of all valid feature IDs (simple approach for older bash)
build_feature_id_list() {
    local features_dir="$1"
    local temp_file="/tmp/epf_feature_ids_$$.txt"
    
    # Create temp file with feature_id:filepath mappings (no output during this phase)
    > "$temp_file"
    while IFS= read -r -d '' file; do
        local feature_id=$(yq eval '.id' "$file" 2>/dev/null || echo "")
        if [[ -n "$feature_id" && "$feature_id" != "null" ]]; then
            echo "$feature_id:$file" >> "$temp_file"
        fi
    done < <(find "$features_dir" -name "fd-*.yaml" -print0)
    
    local count=$(wc -l < "$temp_file" | tr -d ' ')
    log_info "Found $count valid feature definitions with mappings in $temp_file"
    
    echo "$temp_file"
}

# Check if a feature ID exists
feature_exists() {
    local feature_id="$1"
    local temp_file="$2"
    grep -q "^$feature_id:" "$temp_file"
}

# Get file path for a feature ID
get_feature_file() {
    local feature_id="$1"
    local temp_file="$2"
    grep "^$feature_id:" "$temp_file" | cut -d: -f2-
}

# Validate cross-references in a single file
validate_file_references() {
    local file="$1"
    local temp_file="$2"
    local feature_id=$(yq eval '.id' "$file")
    local file_errors=0
    
    echo "" >&2
    echo -e "${BLUE}Checking: $file${NC} (ID: $feature_id)" >&2
    
    # Check 'requires' dependencies
    local requires_count=$(yq eval '.definition.dependencies.requires | length' "$file" 2>/dev/null || echo "0")
    if [[ "$requires_count" != "null" && "$requires_count" -gt 0 ]]; then
        for ((i=0; i<requires_count; i++)); do
            local dep_id=$(yq eval ".definition.dependencies.requires[$i].id" "$file")
            if [[ "$dep_id" != "null" && -n "$dep_id" ]]; then
                if feature_exists "$dep_id" "$temp_file"; then
                    local dep_file=$(get_feature_file "$dep_id" "$temp_file")
                    log_pass "  requires: $dep_id → $dep_file"
                else
                    log_error "  requires: $dep_id (MISSING - referenced but not found)"
                    ((file_errors++))
                fi
            fi
        done
    fi
    
    # Check 'enables' dependencies
    local enables_count=$(yq eval '.definition.dependencies.enables | length' "$file" 2>/dev/null || echo "0")
    if [[ "$enables_count" != "null" && "$enables_count" -gt 0 ]]; then
        for ((i=0; i<enables_count; i++)); do
            local dep_id=$(yq eval ".definition.dependencies.enables[$i].id" "$file")
            if [[ "$dep_id" != "null" && -n "$dep_id" ]]; then
                if feature_exists "$dep_id" "$temp_file"; then
                    local dep_file=$(get_feature_file "$dep_id" "$temp_file")
                    log_pass "  enables: $dep_id → $dep_file"
                else
                    log_error "  enables: $dep_id (MISSING - referenced but not found)"
                    ((file_errors++))
                fi
            fi
        done
    fi
    
    # Check 'based_on' dependencies
    local based_on_count=$(yq eval '.definition.dependencies.based_on | length' "$file" 2>/dev/null || echo "0")
    if [[ "$based_on_count" != "null" && "$based_on_count" -gt 0 ]]; then
        for ((i=0; i<based_on_count; i++)); do
            local dep_id=$(yq eval ".definition.dependencies.based_on[$i].id" "$file")
            if [[ "$dep_id" != "null" && -n "$dep_id" ]]; then
                if feature_exists "$dep_id" "$temp_file"; then
                    local dep_file=$(get_feature_file "$dep_id" "$temp_file")
                    log_pass "  based_on: $dep_id → $dep_file"
                else
                    log_error "  based_on: $dep_id (MISSING - referenced but not found)"
                    ((file_errors++))
                fi
            fi
        done
    fi
    
    # Report if no dependencies found
    if [[ "$requires_count" == "0" || "$requires_count" == "null" ]] && \
       [[ "$enables_count" == "0" || "$enables_count" == "null" ]] && \
       [[ "$based_on_count" == "0" || "$based_on_count" == "null" ]]; then
        log_info "  No cross-references to validate"
    fi
    
    ((CHECKED++))
    return $file_errors
}

# Main validation logic
main() {
    local features_dir="${1:-.}"
    
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}  EPF Cross-Reference Validator v1.0.0${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    
    # Validate input
    if [[ ! -d "$features_dir" ]]; then
        echo -e "${RED}ERROR: Directory not found: $features_dir${NC}" >&2
        echo "Usage: $0 [features-dir]" >&2
        exit 2
    fi
    
    check_dependencies
    local temp_file=$(build_feature_id_list "$features_dir")
    
    # Validate each feature file
    while IFS= read -r -d '' file; do
        validate_file_references "$file" "$temp_file" || true  # Continue on errors
    done < <(find "$features_dir" -name "fd-*.yaml" -print0)
    
    # Cleanup temp file
    rm -f "$temp_file"
    
    # Summary
    echo "" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}  Validation Summary${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "Files checked: $CHECKED" >&2
    echo -e "${GREEN}Valid references: $(($CHECKED - $ERRORS))${NC}" >&2
    
    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}Invalid references: $ERRORS${NC}" >&2
        echo "" >&2
        echo -e "${RED}✗ Cross-reference validation FAILED${NC}" >&2
        exit 1
    else
        echo -e "${GREEN}✓ All cross-references valid!${NC}" >&2
        exit 0
    fi
}

# Run main function
main "$@"
