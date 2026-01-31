#!/bin/bash
# =============================================================================
# validate-value-model-structure.sh
# =============================================================================
# Version: 1.0.0
# EPF Framework Script
#
# PURPOSE:
#   Validates value model structural balance according to EPF guidelines.
#   Ensures proper decomposition at each level:
#   - L1 Layers: 3-10 per value model (error if < 2 or > 12)
#   - L2 Components: 3-5 per L1 layer (warn if < 3 or > 8)
#   - L3 Sub-components: 3-5 per L2 component (warn if < 3 or > 10)
#
# WHY THIS MATTERS:
#   Value models with improper structure create problems:
#   - Too few L2s per L1: Layer is too coarse, hard to track progress
#   - Too many L2s per L1: Layer is doing too much, split into multiple layers
#   - Too few L3s per L2: Component is too atomic, merge with sibling
#   - Too many L3s per L2: Component is too broad, decompose further
#
# USAGE:
#   ./validate-value-model-structure.sh [value-models-dir]
#   ./validate-value-model-structure.sh                    # Uses templates/FIRE/value_models
#   ./validate-value-model-structure.sh _instances/lawmatics/FIRE/value_models
#
# EXIT CODES:
#   0 = All structural checks passed
#   1 = Critical structural issues found (errors)
#   2 = Structural warnings found (non-blocking)
#
# DEPENDENCIES:
#   - yq (YAML processor)
#   - bash 4.0+
# =============================================================================

set -euo pipefail

# Version
SCRIPT_VERSION="1.0.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
FILES_CHECKED=0
LAYERS_CHECKED=0
COMPONENTS_CHECKED=0

# Thresholds (based on EPF guidelines)
# L1 Layers per value model
L1_MIN=1        # Minimum (at least one layer needed)
L1_WARN_MIN=3   # Warning threshold
L1_WARN_MAX=10  # Warning threshold  
L1_MAX=12       # Schema maximum

# L2 Components per L1 layer
L2_MIN=1        # Minimum (at least one component)
L2_WARN_MIN=3   # Warning: too few components
L2_WARN_MAX=8   # Warning: too many components
L2_MAX=15       # Schema maximum

# L3 Sub-components per L2 component
L3_MIN=0        # Minimum (can be empty for planned components)
L3_WARN_MIN=3   # Warning: too few subs
L3_WARN_MAX=10  # Warning: too many subs
L3_MAX=100      # Schema maximum

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================
log_error() {
    echo -e "${RED}✗ ERROR: $1${NC}" >&2
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING: $1${NC}" >&2
    ((WARNINGS++))
}

log_pass() {
    echo -e "${GREEN}✓ $1${NC}" >&2
}

log_info() {
    echo -e "${BLUE}ℹ $1${NC}" >&2
}

# =============================================================================
# DEPENDENCY CHECK
# =============================================================================
check_dependencies() {
    if ! command -v yq &> /dev/null; then
        echo -e "${RED}ERROR: yq is required but not installed.${NC}" >&2
        echo "Install with: brew install yq" >&2
        exit 1
    fi
}

# =============================================================================
# VALIDATE SINGLE VALUE MODEL
# =============================================================================
validate_value_model() {
    local vm_file="$1"
    local vm_name=$(basename "$vm_file")
    local file_errors=0
    local file_warnings=0
    
    echo "" >&2
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
    echo -e "${BLUE}Checking: $vm_name${NC}" >&2
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
    
    # Get value model metadata
    local track_name=$(yq eval '.track_name // "unknown"' "$vm_file" 2>/dev/null)
    local status=$(yq eval '.status // "active"' "$vm_file" 2>/dev/null)
    
    log_info "Track: $track_name | Status: $status"
    
    # Skip placeholder/deprecated models
    if [[ "$status" == "placeholder" || "$status" == "deprecated" ]]; then
        log_info "Skipping $status value model (structural validation not applicable)"
        return 0
    fi
    
    # Count L1 layers
    local layer_count=$(yq eval '.layers | length' "$vm_file" 2>/dev/null || echo "0")
    
    if [[ "$layer_count" == "null" || "$layer_count" == "0" ]]; then
        log_warning "$vm_name: No layers defined (empty value model)"
        return 0
    fi
    
    # Validate L1 count
    if [[ "$layer_count" -lt "$L1_MIN" ]]; then
        log_error "$vm_name: Has $layer_count L1 layer(s) - minimum is $L1_MIN"
        ((file_errors++))
    elif [[ "$layer_count" -lt "$L1_WARN_MIN" ]]; then
        log_warning "$vm_name: Has only $layer_count L1 layer(s) - recommend $L1_WARN_MIN-$L1_WARN_MAX"
        ((file_warnings++))
    elif [[ "$layer_count" -gt "$L1_WARN_MAX" ]]; then
        log_warning "$vm_name: Has $layer_count L1 layers - recommend $L1_WARN_MIN-$L1_WARN_MAX (consider consolidating)"
        ((file_warnings++))
    elif [[ "$layer_count" -gt "$L1_MAX" ]]; then
        log_error "$vm_name: Has $layer_count L1 layers - schema maximum is $L1_MAX"
        ((file_errors++))
    else
        log_pass "$vm_name: L1 layer count ($layer_count) is within recommended range"
    fi
    
    # Iterate through each L1 layer
    for ((i=0; i<layer_count; i++)); do
        local layer_id=$(yq eval ".layers[$i].id" "$vm_file" 2>/dev/null || echo "layer-$i")
        local layer_name=$(yq eval ".layers[$i].name" "$vm_file" 2>/dev/null || echo "Unknown Layer")
        
        ((LAYERS_CHECKED++))
        
        # Count L2 components in this layer
        local component_count=$(yq eval ".layers[$i].components | length" "$vm_file" 2>/dev/null || echo "0")
        
        if [[ "$component_count" == "null" ]]; then
            component_count=0
        fi
        
        # Validate L2 count per L1
        if [[ "$component_count" -lt "$L2_MIN" ]]; then
            log_warning "  L1 '$layer_name' ($layer_id): No L2 components defined"
            ((file_warnings++))
        elif [[ "$component_count" -lt "$L2_WARN_MIN" ]]; then
            log_warning "  L1 '$layer_name' ($layer_id): Has only $component_count L2 component(s) - recommend $L2_WARN_MIN-$L2_WARN_MAX"
            ((file_warnings++))
        elif [[ "$component_count" -gt "$L2_WARN_MAX" ]]; then
            log_warning "  L1 '$layer_name' ($layer_id): Has $component_count L2 components - recommend $L2_WARN_MIN-$L2_WARN_MAX (consider splitting layer)"
            ((file_warnings++))
        elif [[ "$component_count" -gt "$L2_MAX" ]]; then
            log_error "  L1 '$layer_name' ($layer_id): Has $component_count L2 components - schema maximum is $L2_MAX"
            ((file_errors++))
        else
            log_pass "  L1 '$layer_name': $component_count L2 components ✓"
        fi
        
        # Iterate through each L2 component
        for ((j=0; j<component_count; j++)); do
            local comp_id=$(yq eval ".layers[$i].components[$j].id" "$vm_file" 2>/dev/null || echo "comp-$j")
            local comp_name=$(yq eval ".layers[$i].components[$j].name" "$vm_file" 2>/dev/null || echo "Unknown Component")
            
            ((COMPONENTS_CHECKED++))
            
            # Count L3 sub-components (support both 'subs' and 'sub_components' keys)
            local sub_count=$(yq eval ".layers[$i].components[$j].subs | length" "$vm_file" 2>/dev/null || echo "0")
            
            if [[ "$sub_count" == "null" || "$sub_count" == "0" ]]; then
                sub_count=$(yq eval ".layers[$i].components[$j].sub_components | length" "$vm_file" 2>/dev/null || echo "0")
            fi
            
            if [[ "$sub_count" == "null" ]]; then
                sub_count=0
            fi
            
            # Validate L3 count per L2
            if [[ "$sub_count" -eq 0 ]]; then
                # Empty is okay for planned components, just note it
                log_info "    L2 '$comp_name' ($comp_id): No L3 subs (planned/placeholder)"
            elif [[ "$sub_count" -lt "$L3_WARN_MIN" ]]; then
                log_warning "    L2 '$comp_name' ($comp_id): Has only $sub_count L3 sub(s) - recommend $L3_WARN_MIN-$L3_WARN_MAX"
                ((file_warnings++))
            elif [[ "$sub_count" -gt "$L3_WARN_MAX" ]]; then
                log_warning "    L2 '$comp_name' ($comp_id): Has $sub_count L3 subs - recommend $L3_WARN_MIN-$L3_WARN_MAX (consider splitting component)"
                ((file_warnings++))
            elif [[ "$sub_count" -gt "$L3_MAX" ]]; then
                log_error "    L2 '$comp_name' ($comp_id): Has $sub_count L3 subs - schema maximum is $L3_MAX"
                ((file_errors++))
            else
                log_pass "    L2 '$comp_name': $sub_count L3 subs ✓"
            fi
        done
    done
    
    ((FILES_CHECKED++))
    
    # Return status
    if [[ $file_errors -gt 0 ]]; then
        return 1
    elif [[ $file_warnings -gt 0 ]]; then
        return 2
    fi
    return 0
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    local vm_dir="${1:-templates/FIRE/value_models}"
    
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}  EPF Value Model Structure Validator v$SCRIPT_VERSION${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}Directory: $vm_dir${NC}" >&2
    echo "" >&2
    echo -e "${BLUE}Structural Guidelines:${NC}" >&2
    echo -e "  L1 Layers per model:     $L1_WARN_MIN-$L1_WARN_MAX (max: $L1_MAX)" >&2
    echo -e "  L2 Components per L1:    $L2_WARN_MIN-$L2_WARN_MAX (max: $L2_MAX)" >&2
    echo -e "  L3 Sub-components per L2: $L3_WARN_MIN-$L3_WARN_MAX (max: $L3_MAX)" >&2
    
    # Validate directory
    if [[ ! -d "$vm_dir" ]]; then
        echo -e "${RED}ERROR: Value models directory not found: $vm_dir${NC}" >&2
        echo "Usage: $0 [value-models-dir]" >&2
        exit 1
    fi
    
    check_dependencies
    
    # Find and validate all value model files
    local vm_count=0
    while IFS= read -r -d '' vm_file; do
        validate_value_model "$vm_file" || true
        ((vm_count++))
    done < <(find "$vm_dir" \( -name "*.value_model.yaml" -o -name "*_value_model.yaml" \) -print0 2>/dev/null)
    
    if [[ $vm_count -eq 0 ]]; then
        log_warning "No value model files found in $vm_dir"
        log_info "Expected files matching: *.value_model.yaml or *_value_model.yaml"
        exit 0
    fi
    
    # Summary
    echo "" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}  Validation Summary${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}" >&2
    echo -e "Value models checked: $FILES_CHECKED" >&2
    echo -e "L1 layers checked: $LAYERS_CHECKED" >&2
    echo -e "L2 components checked: $COMPONENTS_CHECKED" >&2
    echo "" >&2
    
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}Warnings: $WARNINGS${NC}" >&2
    fi
    
    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}Errors: $ERRORS${NC}" >&2
        echo "" >&2
        echo -e "${RED}✗ Value model structure validation FAILED${NC}" >&2
        echo "" >&2
        echo -e "${YELLOW}Troubleshooting:${NC}" >&2
        echo "1. Each L1 layer should have 3-5 L2 components (not 1 or 10+)" >&2
        echo "2. Each L2 component should have 3-5 L3 sub-components" >&2
        echo "3. L3 subs represent VALUE AREAS, not individual features" >&2
        echo "4. If a layer has only 1 component, merge it with a sibling layer" >&2
        echo "5. If a component has 10+ subs, split into multiple components" >&2
        exit 1
    elif [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}⚠ Value model structure validation PASSED with warnings${NC}" >&2
        echo "" >&2
        echo -e "${YELLOW}Recommendations:${NC}" >&2
        echo "- Review warnings above and consider restructuring" >&2
        echo "- Properly balanced models are easier to navigate and track" >&2
        exit 2
    else
        echo -e "${GREEN}✓ All value model structures are well-balanced!${NC}" >&2
        exit 0
    fi
}

# Run main function
main "$@"
