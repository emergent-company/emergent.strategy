#!/bin/bash
# EPF Roadmap Reference Validator
# Version: 2.0.0
# 
# This script validates that all roadmap assumption references in feature definitions
# actually exist in the roadmap recipe file.
#
# Validates:
#   - strategic_context.assumptions_tested[] IDs exist in roadmap
#   - Format: asm-{track_prefix}-{number} (e.g., asm-p-001)
#
# Usage:
#   ./scripts/validate-roadmap-references.sh [features-dir] [roadmap-file]
#   ./scripts/validate-roadmap-references.sh definitions/product/ templates/READY/05_roadmap_recipe.yaml
#
# Exit codes:
#   0 - All roadmap references valid
#   1 - Invalid references found
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
FEATURES_CHECKED=0

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
        echo -e "${RED}ERROR: yq is not installed${NC}" >&2
        echo "Install with: brew install yq (macOS) or see https://github.com/mikefarah/yq" >&2
        exit 2
    fi
}

# Build map of valid assumption IDs from roadmap
build_assumption_map() {
    local roadmap_file="$1"
    local temp_file="/tmp/epf_assumptions_$$.txt"
    
    > "$temp_file"
    
    if [[ ! -f "$roadmap_file" ]]; then
        log_warning "Roadmap file not found: $roadmap_file"
        echo "$temp_file"
        return
    fi
    
    # Extract assumptions from all tracks
    local tracks=("product" "strategy" "org_ops" "commercial")
    local count=0
    
    for track in "${tracks[@]}"; do
        local asm_count=$(yq eval ".roadmap.tracks.$track.riskiest_assumptions | length" "$roadmap_file" 2>/dev/null || echo "0")
        
        if [[ "$asm_count" != "null" && "$asm_count" != "0" ]]; then
            for ((i=0; i<asm_count; i++)); do
                local asm_id=$(yq eval ".roadmap.tracks.$track.riskiest_assumptions[$i].id" "$roadmap_file" 2>/dev/null || echo "")
                local asm_desc=$(yq eval ".roadmap.tracks.$track.riskiest_assumptions[$i].description" "$roadmap_file" 2>/dev/null || echo "")
                local asm_type=$(yq eval ".roadmap.tracks.$track.riskiest_assumptions[$i].type" "$roadmap_file" 2>/dev/null || echo "")
                
                if [[ -n "$asm_id" && "$asm_id" != "null" ]]; then
                    # Store: assumption_id:track:description:type
                    echo "$asm_id:$track:$asm_desc:$asm_type" >> "$temp_file"
                    ((count++))
                fi
            done
        fi
    done
    
    log_info "Found $count assumption(s) in roadmap"
    echo "$temp_file"
}

# Check if an assumption exists
assumption_exists() {
    local asm_id="$1"
    local temp_file="$2"
    
    grep -q "^$asm_id:" "$temp_file" 2>/dev/null
}

# Get assumption info
get_assumption_info() {
    local asm_id="$1"
    local temp_file="$2"
    
    grep "^$asm_id:" "$temp_file" 2>/dev/null | head -1
}

# Validate roadmap references in a single feature
validate_feature_references() {
    local feature_file="$1"
    local temp_file="$2"
    local feature_id=$(yq eval '.id' "$feature_file" 2>/dev/null || echo "unknown")
    local file_errors=0
    
    echo "" >&2
    echo -e "${BLUE}Checking: $feature_file${NC} (ID: $feature_id)" >&2
    
    # Get assumptions_tested array
    local asm_count=$(yq eval '.strategic_context.assumptions_tested | length' "$feature_file" 2>/dev/null || echo "0")
    
    if [[ "$asm_count" == "null" || "$asm_count" == "0" ]]; then
        log_info "  No assumptions tested (optional field)"
        ((FEATURES_CHECKED++))
        return 0
    fi
    
    # Check each assumption reference
    for ((i=0; i<asm_count; i++)); do
        local asm_id=$(yq eval ".strategic_context.assumptions_tested[$i]" "$feature_file" 2>/dev/null)
        
        if [[ -z "$asm_id" || "$asm_id" == "null" ]]; then
            continue
        fi
        
        # Validate format: asm-{p|s|o|c}-{number}
        if [[ ! "$asm_id" =~ ^asm-(p|s|o|c)-[0-9]+$ ]]; then
            log_error "  Invalid assumption ID format: $asm_id"
            log_info "     Expected format: asm-{track}-{number} where track is p(roduct), s(trategy), o(rg_ops), or c(ommercial)"
            ((file_errors++))
            ((CHECKED++))
            continue
        fi
        
        # Check if assumption exists in roadmap
        if assumption_exists "$asm_id" "$temp_file"; then
            local asm_info=$(get_assumption_info "$asm_id" "$temp_file")
            IFS=':' read -r _ track desc type <<< "$asm_info"
            
            # Truncate description for display
            local short_desc=$(echo "$desc" | cut -c1-60)
            if [[ ${#desc} -gt 60 ]]; then
                short_desc="${short_desc}..."
            fi
            
            log_pass "  ✓ $asm_id → $track track ($type: $short_desc)"
            ((CHECKED++))
        else
            log_error "  ✗ $asm_id (NOT FOUND in roadmap)"
            log_info "     Feature references non-existent assumption ID"
            log_info "     Check: Does this assumption exist in roadmap.tracks.{track}.riskiest_assumptions[]?"
            ((file_errors++))
            ((CHECKED++))
        fi
    done
    
    ((FEATURES_CHECKED++))
    return $file_errors
}

# Main validation logic
main() {
    local features_dir="${1:-features}"
    local roadmap_file="${2:-templates/READY/05_roadmap_recipe.yaml}"
    
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}  EPF Roadmap Reference Validator v2.0.0${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}Features: $features_dir${NC}" >&2
    echo -e "${BLUE}Roadmap: $roadmap_file${NC}" >&2
    echo "" >&2
    
    # Validate inputs
    if [[ ! -d "$features_dir" ]]; then
        echo -e "${RED}ERROR: Features directory not found: $features_dir${NC}" >&2
        echo "Usage: $0 [features-dir] [roadmap-file]" >&2
        exit 2
    fi
    
    check_dependencies
    
    # Build assumption map from roadmap
    local temp_file=$(build_assumption_map "$roadmap_file")
    local total_assumptions=$(grep -c ^ "$temp_file" 2>/dev/null || echo 0)
    
    if [[ "$total_assumptions" == "0" ]]; then
        log_warning "No assumptions found in roadmap - validation will only check format"
        log_info "This is expected for template roadmaps or early-stage instances"
    fi
    
    echo "" >&2
    
    # Validate each feature file
    local feature_count=0
    while IFS= read -r -d '' feature_file; do
        ((feature_count++))
        validate_feature_references "$feature_file" "$temp_file" || true
    done < <(find "$features_dir" -name "fd-*.yaml" -print0 2>/dev/null)
    
    # Cleanup temp file
    rm -f "$temp_file"
    
    # Summary
    echo "" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}  Validation Summary${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "Features checked: $FEATURES_CHECKED" >&2
    echo -e "Assumption references validated: $CHECKED" >&2
    echo -e "${GREEN}Valid references: $(($CHECKED - $ERRORS))${NC}" >&2
    
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}Warnings: $WARNINGS${NC}" >&2
    fi
    
    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}Invalid references: $ERRORS${NC}" >&2
        echo "" >&2
        echo -e "${RED}✗ Roadmap reference validation FAILED${NC}" >&2
        echo "" >&2
        echo -e "${YELLOW}Troubleshooting:${NC}" >&2
        echo "1. Check that roadmap file exists and has riskiest_assumptions defined" >&2
        echo "2. Verify assumption ID format: asm-{track_prefix}-{number}" >&2
        echo "3. Track prefixes: p (product), s (strategy), o (org_ops), c (commercial)" >&2
        echo "4. Assumptions must be defined in: roadmap.tracks.{track}.riskiest_assumptions[]" >&2
        exit 1
    else
        echo -e "${GREEN}✓ All roadmap references valid!${NC}" >&2
        
        if [[ $WARNINGS -gt 0 ]]; then
            echo "" >&2
            echo -e "${YELLOW}Note: $WARNINGS warning(s) - review output above${NC}" >&2
        fi
        
        exit 0
    fi
}

# Run main function
main "$@"
