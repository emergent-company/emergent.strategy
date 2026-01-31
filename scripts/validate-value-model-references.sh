#!/bin/bash
# EPF Value Model Reference Validator
# Version: 2.0.0
# 
# This script validates that all value model paths referenced in feature definitions
# actually exist in the corresponding value model files.
#
# Validates:
#   - strategic_context.contributes_to[] paths exist in value models
#   - Format: {Pillar}.{L2}.{L3} where Pillar matches value model track_name
#
# Usage:
#   ./scripts/validate-value-model-references.sh [features-dir] [value-models-dir]
#   ./scripts/validate-value-model-references.sh definitions/product/ templates/FIRE/value_models/
#
# Exit codes:
#   0 - All value model references valid
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

# Build map of valid value model paths
# Format: Pillar:L2:L3 (e.g., Product:Decide:Analysis)
build_value_model_paths() {
    local vm_dir="$1"
    local temp_file="/tmp/epf_vm_paths_$$.txt"
    
    > "$temp_file"
    
    # Find all value model files
    local count=0
    while IFS= read -r -d '' vm_file; do
        local pillar=$(yq eval '.track_name' "$vm_file" 2>/dev/null || echo "")
        
        if [[ -z "$pillar" || "$pillar" == "null" ]]; then
            log_warning "Value model $vm_file has no track_name"
            continue
        fi
        
        # Extract all L2.L3 paths from this value model
        # Structure: layers[].components[].subs[] (v2.7.4+) or layers[].components[].sub_components[] (legacy)
        local layer_count=$(yq eval '.layers | length' "$vm_file" 2>/dev/null || echo "0")
        
        for ((i=0; i<layer_count; i++)); do
            local component_count=$(yq eval ".layers[$i].components | length" "$vm_file" 2>/dev/null || echo "0")
            
            for ((j=0; j<component_count; j++)); do
                local l2_id=$(yq eval ".layers[$i].components[$j].id" "$vm_file" 2>/dev/null || echo "")
                local l2_name=$(yq eval ".layers[$i].components[$j].name" "$vm_file" 2>/dev/null || echo "")
                
                if [[ -z "$l2_id" || "$l2_id" == "null" ]]; then
                    continue
                fi
                
                # Try 'subs' (v2.7.4+) first, fall back to 'sub_components' (legacy)
                local subcomp_count=$(yq eval ".layers[$i].components[$j].subs | length" "$vm_file" 2>/dev/null || echo "0")
                local subs_key="subs"
                if [[ "$subcomp_count" == "0" || "$subcomp_count" == "null" ]]; then
                    subcomp_count=$(yq eval ".layers[$i].components[$j].sub_components | length" "$vm_file" 2>/dev/null || echo "0")
                    subs_key="sub_components"
                fi
                
                for ((k=0; k<subcomp_count; k++)); do
                    local l3_id=$(yq eval ".layers[$i].components[$j].${subs_key}[$k].id" "$vm_file" 2>/dev/null || echo "")
                    local l3_name=$(yq eval ".layers[$i].components[$j].${subs_key}[$k].name" "$vm_file" 2>/dev/null || echo "")
                    
                    if [[ -n "$l3_id" && "$l3_id" != "null" ]]; then
                        # Store path: Pillar:L2:L3:vm_file:L2Name:L3Name
                        echo "$pillar:$l2_id:$l3_id:$vm_file:$l2_name:$l3_name" >> "$temp_file"
                        ((count++))
                    fi
                done
            done
        done
    done < <(find "$vm_dir" \( -name "*.value_model.yaml" -o -name "*_value_model.yaml" \) -print0 2>/dev/null)
    
    log_info "Built value model path map: $count paths from $(grep -c $ "$temp_file" 2>/dev/null || echo 0) value model(s)"
    echo "$temp_file"
}

# Convert PascalCase to kebab-case (e.g., LegalStaff -> legal-staff, DocumentManager -> document-manager)
# Handles acronyms like AI, SDK correctly (AIAssistant -> ai-assistant, not a-i-assistant)
pascal_to_kebab() {
    local input="$1"
    # First, handle transitions from uppercase to lowercase (e.g., "AI" followed by "A" in "AIAssistant")
    # Then insert hyphen before remaining uppercase letters, then lowercase everything
    echo "$input" | sed -E 's/([A-Z]+)([A-Z][a-z])/\1-\2/g' | sed -E 's/([a-z])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]'
}

# Check if a value model path exists
path_exists() {
    local pillar="$1"
    local l2="$2"
    local l3="$3"
    local temp_file="$4"
    
    # Convert PascalCase path components to kebab-case for matching value model IDs
    local l2_kebab=$(pascal_to_kebab "$l2")
    local l3_kebab=$(pascal_to_kebab "$l3")
    
    # Try match with kebab-case conversion: Pillar:l2-kebab:l3-kebab
    grep -q "^$pillar:$l2_kebab:$l3_kebab:" "$temp_file" 2>/dev/null
}

# Get value model file and names for a path
get_path_info() {
    local pillar="$1"
    local l2="$2"
    local l3="$3"
    local temp_file="$4"
    
    # Convert PascalCase to kebab-case for lookup
    local l2_kebab=$(pascal_to_kebab "$l2")
    local l3_kebab=$(pascal_to_kebab "$l3")
    grep "^$pillar:$l2_kebab:$l3_kebab:" "$temp_file" 2>/dev/null | head -1
}

# Validate value model references in a single feature
validate_feature_references() {
    local feature_file="$1"
    local temp_file="$2"
    local feature_id=$(yq eval '.id' "$feature_file" 2>/dev/null || echo "unknown")
    local file_errors=0
    
    echo "" >&2
    echo -e "${BLUE}Checking: $feature_file${NC} (ID: $feature_id)" >&2
    
    # Get contributes_to paths
    local path_count=$(yq eval '.strategic_context.contributes_to | length' "$feature_file" 2>/dev/null || echo "0")
    
    if [[ "$path_count" == "null" || "$path_count" == "0" ]]; then
        log_warning "  No contributes_to paths defined (features should contribute to value model)"
        ((FEATURES_CHECKED++))
        return 0
    fi
    
    # Check each path
    for ((i=0; i<path_count; i++)); do
        local path=$(yq eval ".strategic_context.contributes_to[$i]" "$feature_file" 2>/dev/null)
        
        if [[ -z "$path" || "$path" == "null" ]]; then
            continue
        fi
        
        # Parse path: Pillar.L2.L3
        IFS='.' read -r pillar l2 l3 <<< "$path"
        
        # Validate format
        if [[ -z "$pillar" || -z "$l2" || -z "$l3" ]]; then
            log_error "  Invalid path format: $path (expected: Pillar.L2.L3)"
            ((file_errors++))
            continue
        fi
        
        # Check if path exists in value model
        if path_exists "$pillar" "$l2" "$l3" "$temp_file"; then
            local path_info=$(get_path_info "$pillar" "$l2" "$l3" "$temp_file")
            IFS=':' read -r _ _ _ vm_file l2_name l3_name <<< "$path_info"
            log_pass "  ✓ $path → $vm_file ($l2_name > $l3_name)"
            ((CHECKED++))
        else
            log_error "  ✗ $path (NOT FOUND in value models)"
            log_info "     Feature references non-existent value model path"
            log_info "     Check: Does $pillar value model have L2 component '$l2' with L3 sub-component '$l3'?"
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
    local vm_dir="${2:-templates/FIRE/value_models}"
    
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}  EPF Value Model Reference Validator v2.0.0${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}Features: $features_dir${NC}" >&2
    echo -e "${BLUE}Value Models: $vm_dir${NC}" >&2
    echo "" >&2
    
    # Validate inputs
    if [[ ! -d "$features_dir" ]]; then
        echo -e "${RED}ERROR: Features directory not found: $features_dir${NC}" >&2
        echo "Usage: $0 [features-dir] [value-models-dir]" >&2
        exit 2
    fi
    
    if [[ ! -d "$vm_dir" ]]; then
        echo -e "${RED}ERROR: Value models directory not found: $vm_dir${NC}" >&2
        echo "Usage: $0 [features-dir] [value-models-dir]" >&2
        exit 2
    fi
    
    check_dependencies
    
    # Build value model path map
    local temp_file=$(build_value_model_paths "$vm_dir")
    local total_paths=$(grep -c ^ "$temp_file" 2>/dev/null || echo 0)
    
    if [[ "$total_paths" == "0" ]]; then
        log_warning "No value model paths found - are value models populated?"
        log_info "Value model templates have empty layers[] by default"
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
    echo -e "Paths validated: $CHECKED" >&2
    echo -e "${GREEN}Valid paths: $(($CHECKED - $ERRORS))${NC}" >&2
    
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}Warnings: $WARNINGS${NC}" >&2
    fi
    
    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}Invalid paths: $ERRORS${NC}" >&2
        echo "" >&2
        echo -e "${RED}✗ Value model reference validation FAILED${NC}" >&2
        echo "" >&2
        echo -e "${YELLOW}Troubleshooting:${NC}" >&2
        echo "1. Check that value model files exist and are populated" >&2
        echo "2. Verify L2 component IDs match feature contributes_to paths" >&2
        echo "3. Verify L3 sub-component IDs exist within those components" >&2
        echo "4. Value model path format: Pillar.ComponentID.SubComponentID" >&2
        exit 1
    else
        echo -e "${GREEN}✓ All value model references valid!${NC}" >&2
        
        if [[ $WARNINGS -gt 0 ]]; then
            echo "" >&2
            echo -e "${YELLOW}Note: $WARNINGS warning(s) - review output above${NC}" >&2
        fi
        
        exit 0
    fi
}

# Run main function
main "$@"
