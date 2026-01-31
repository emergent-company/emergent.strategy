#!/bin/bash
# EPF Health Check Script
# Version: 1.14.0
#
# This script performs comprehensive validation of the EPF framework,
# including version consistency, YAML parsing, schema validation,
# documentation alignment, and reality baseline context checks.
#
# Usage:
#   ./scripts/epf-health-check.sh [--fix] [--verbose]
#
# Options:
#   --fix      Attempt to auto-fix minor issues (like version mismatches)
#   --verbose  Show detailed output for all checks
#
# Exit codes:
#   0 - All checks passed
#   1 - Critical errors found (must fix before committing)
#   2 - Warnings found (should fix, but not blocking)
#   3 - Missing dependencies
#
# Run this script BEFORE committing any major EPF changes!

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Counters
CRITICAL_ERRORS=0
ERRORS=0
WARNINGS=0
PASSED=0

# Options
FIX_MODE=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --fix)
            FIX_MODE=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Helper functions
log_critical() {
    echo -e "${RED}✗ CRITICAL:${NC} $1"
    ((CRITICAL_ERRORS++)) || true
}

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

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${CYAN}  →${NC} $1"
    fi
}

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Find EPF root
find_epf_root() {
    local current=$(pwd)
    
    # Check if we're in EPF root
    if [ -f "$current/VERSION" ] && [ -d "$current/schemas" ]; then
        echo "$current"
        return
    fi
    
    # Check common paths
    for path in "." "docs/EPF" "../" "../../"; do
        if [ -f "$path/VERSION" ] && [ -d "$path/schemas" ]; then
            echo "$path"
            return
        fi
    done
    
    echo ""
}

# =============================================================================
# VERSION CONSISTENCY CHECKS
# =============================================================================
check_version_consistency() {
    log_section "Version Consistency Check"
    
    local EPF_ROOT="$1"
    local version_file="$EPF_ROOT/VERSION"
    local readme_file="$EPF_ROOT/README.md"
    local maintenance_file="$EPF_ROOT/MAINTENANCE.md"
    local validate_script="$EPF_ROOT/scripts/validate-schemas.sh"
    
    # Get canonical version from VERSION file
    if [ ! -f "$version_file" ]; then
        log_critical "VERSION file not found at $version_file"
        return
    fi
    
    local CANONICAL_VERSION=$(cat "$version_file" | tr -d '\n\r' | xargs)
    log_info "Canonical version (from VERSION): ${CYAN}$CANONICAL_VERSION${NC}"
    
    # Check README.md header
    if [ -f "$readme_file" ]; then
        local readme_version=$(grep -o 'v[0-9]\+\.[0-9]\+\.[0-9]\+' "$readme_file" | head -1 | sed 's/^v//')
        log_verbose "README.md header version: $readme_version"
        
        if [ "$readme_version" = "$CANONICAL_VERSION" ]; then
            log_pass "README.md version matches ($readme_version)"
        else
            log_error "README.md header says v$readme_version but VERSION file says $CANONICAL_VERSION"
            if [ "$FIX_MODE" = true ]; then
                sed -i '' "s/v$readme_version/v$CANONICAL_VERSION/g" "$readme_file"
                log_info "  → Fixed README.md version"
            fi
        fi
        
        # Check if "What's New" section exists for current version
        local major_minor=$(echo "$CANONICAL_VERSION" | sed 's/\.[0-9]*$//')
        if grep -q "What's New in v$major_minor" "$readme_file"; then
            log_pass "README.md has 'What's New in v$major_minor.x' section"
        else
            log_warning "README.md missing 'What's New in v$major_minor.x' section"
        fi
    else
        log_error "README.md not found"
    fi
    
    # Check MAINTENANCE.md
    if [ -f "$maintenance_file" ]; then
        local maint_version=$(grep -o 'v[0-9]\+\.[0-9]\+\.[0-9]\+' "$maintenance_file" | head -1 | sed 's/^v//')
        log_verbose "MAINTENANCE.md version reference: $maint_version"
        
        # MAINTENANCE.md **MUST** have a "Current Framework Version" marker (CRITICAL for AI agents)
        if grep -qE "Current Framework Version.*v$CANONICAL_VERSION" "$maintenance_file"; then
            log_pass "MAINTENANCE.md references correct framework version (v$CANONICAL_VERSION)"
        elif grep -qE "Current Framework Version" "$maintenance_file"; then
            # Extract actual version mentioned
            local found_version=$(grep -E "Current Framework Version" "$maintenance_file" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1)
            log_critical "MAINTENANCE.md 'Current Framework Version' is outdated (found: $found_version, expected: v$CANONICAL_VERSION) - framework version inconsistency!"
            if [ "$FIX_MODE" = true ]; then
                sed -i '' "s/Current Framework Version:\*\* v[0-9]\+\.[0-9]\+\.[0-9]\+/Current Framework Version:** v$CANONICAL_VERSION/" "$maintenance_file"
                log_info "  → Fixed MAINTENANCE.md version"
            else
                log_info "  → Run with --fix to auto-correct, or use: ./scripts/bump-framework-version.sh \"$CANONICAL_VERSION\" \"Version alignment fix\""
            fi
        else
            log_critical "MAINTENANCE.md missing 'Current Framework Version' marker - this is required for AI agent orientation!"
        fi
    else
        log_error "MAINTENANCE.md not found"
    fi
    
    # NOTE: Scripts have independent versioning - they are NOT required to match VERSION file.
    # Script versions should only be bumped when the script itself changes, not on every framework release.
    # This provides semantic accuracy: script version reflects actual script changes.
    # 
    # Artifact version alignment (YAML files in _instances/) is checked separately via
    # check_artifact_version_alignment() which calls check-version-alignment.sh (Tier 3).
    
    # Check integration_specification.yaml (CRITICAL - required for framework version consistency)
    if [ -f "$EPF_ROOT/integration_specification.yaml" ]; then
        local integration_spec_version=$(grep -E '^# Version:' "$EPF_ROOT/integration_specification.yaml" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        log_verbose "integration_specification.yaml version: $integration_spec_version"
        
        if [ -n "$integration_spec_version" ] && [ "$integration_spec_version" != "$CANONICAL_VERSION" ]; then
            log_critical "integration_specification.yaml version ($integration_spec_version) differs from VERSION ($CANONICAL_VERSION) - framework version inconsistency!"
            if [ "$FIX_MODE" = true ]; then
                # Fix all version references in integration_specification.yaml
                sed -i '' "s/^# Version: [0-9]\+\.[0-9]\+\.[0-9]\+ (EPF v[0-9]\+\.[0-9]\+\.[0-9]\+)/# Version: $CANONICAL_VERSION (EPF v$CANONICAL_VERSION)/" "$EPF_ROOT/integration_specification.yaml"
                sed -i '' "s/^  version: \"[0-9]\+\.[0-9]\+\.[0-9]\+\"/  version: \"$CANONICAL_VERSION\"/" "$EPF_ROOT/integration_specification.yaml"
                sed -i '' "s/^  epf_version: \"[0-9]\+\.[0-9]\+\.[0-9]\+\"/  epf_version: \"$CANONICAL_VERSION\"/" "$EPF_ROOT/integration_specification.yaml"
                # Note: History version updates are intentionally excluded as they represent past releases
                log_info "  → Fixed integration_specification.yaml version"
            else
                log_info "  → Run with --fix to auto-correct, or use: ./scripts/bump-framework-version.sh \"$CANONICAL_VERSION\" \"Version alignment fix\""
            fi
        else
            log_pass "integration_specification.yaml version matches"
        fi
    else
        log_warning "integration_specification.yaml not found (optional but recommended)"
    fi
    
    # Note: We intentionally do NOT check version references in documentation files
    # because docs often contain historical version references (changelogs, examples)
    # which would produce false positives. The critical checks above are sufficient.
}

# =============================================================================
# YAML PARSING CHECKS
# =============================================================================
check_yaml_parsing() {
    log_section "YAML Parsing Validation"
    
    local EPF_ROOT="$1"
    
    # Check if python3 with yaml is available
    if ! python3 -c "import yaml" 2>/dev/null; then
        log_warning "Python3 yaml module not available. Install with: pip3 install pyyaml"
        return
    fi
    
    # Validate all YAML files in phases/
    for yaml_file in "$EPF_ROOT"/phases/*/*.yaml "$EPF_ROOT"/phases/*/*/*.yaml; do
        [ -f "$yaml_file" ] || continue
        local rel_path=${yaml_file#$EPF_ROOT/}
        
        if python3 -c "import yaml; yaml.safe_load(open('$yaml_file'))" 2>/dev/null; then
            log_pass "$rel_path parses correctly"
        else
            log_critical "$rel_path has YAML syntax errors!"
            python3 -c "import yaml; yaml.safe_load(open('$yaml_file'))" 2>&1 | head -5 | sed 's/^/    /'
        fi
    done
    
    # Check instance YAML files
    for instance_dir in "$EPF_ROOT"/_instances/*/; do
        [ -d "$instance_dir" ] || continue
        local instance_name=$(basename "$instance_dir")
        
        for yaml_file in "$instance_dir"/*.yaml "$instance_dir"/*/*.yaml; do
            [ -f "$yaml_file" ] || continue
            local rel_path=${yaml_file#$EPF_ROOT/}
            
            if python3 -c "import yaml; yaml.safe_load(open('$yaml_file'))" 2>/dev/null; then
                log_verbose "$rel_path parses correctly"
            else
                log_error "$rel_path has YAML syntax errors"
                python3 -c "import yaml; yaml.safe_load(open('$yaml_file'))" 2>&1 | head -3 | sed 's/^/    /'
            fi
        done
    done
}

# =============================================================================
# JSON SCHEMA VALIDATION
# =============================================================================
check_json_schemas() {
    log_section "JSON Schema Validation"
    
    local EPF_ROOT="$1"
    
    # Check if python3 with json is available
    for schema_file in "$EPF_ROOT"/schemas/*.json; do
        [ -f "$schema_file" ] || continue
        local filename=$(basename "$schema_file")
        
        if python3 -c "import json; json.load(open('$schema_file'))" 2>/dev/null; then
            log_pass "$filename is valid JSON"
        else
            log_error "$filename has JSON syntax errors"
            python3 -c "import json; json.load(open('$schema_file'))" 2>&1 | head -3 | sed 's/^/    /'
        fi
    done
}

# =============================================================================
# DOCUMENTATION COMPLETENESS
# =============================================================================
check_documentation() {
    log_section "Documentation Completeness"
    
    local EPF_ROOT="$1"
    
    # Required documentation files - check both root and docs/guides/ locations
    if [ -f "$EPF_ROOT/README.md" ]; then
        log_pass "README.md exists"
    else
        log_error "Required documentation missing: README.md"
    fi
    
    if [ -f "$EPF_ROOT/MAINTENANCE.md" ]; then
        log_pass "MAINTENANCE.md exists"
    else
        log_error "Required documentation missing: MAINTENANCE.md"
    fi
    
    # Track-based architecture guide
    if [ -f "$EPF_ROOT/TRACK_BASED_ARCHITECTURE.md" ] || [ -f "$EPF_ROOT/docs/guides/TRACK_BASED_ARCHITECTURE.md" ]; then
        log_pass "Track-based architecture documentation exists"
    else
        log_error "Required documentation missing: TRACK_BASED_ARCHITECTURE.md (or docs/guides/TRACK_BASED_ARCHITECTURE.md)"
    fi
    
    # North Star guide
    if [ -f "$EPF_ROOT/NORTH_STAR.md" ] || [ -f "$EPF_ROOT/docs/guides/NORTH_STAR_GUIDE.md" ]; then
        log_pass "North Star documentation exists"
    else
        log_error "Required documentation missing: NORTH_STAR.md (or docs/guides/NORTH_STAR_GUIDE.md)"
    fi
    
    # Strategy Foundations guide
    if [ -f "$EPF_ROOT/STRATEGY_FOUNDATIONS.md" ] || [ -f "$EPF_ROOT/docs/guides/STRATEGY_FOUNDATIONS_GUIDE.md" ]; then
        log_pass "Strategy Foundations documentation exists"
    else
        log_error "Required documentation missing: STRATEGY_FOUNDATIONS.md (or docs/guides/STRATEGY_FOUNDATIONS_GUIDE.md)"
    fi
    
    # Check for orphan schemas (schemas without documentation references)
    for schema_file in "$EPF_ROOT"/schemas/*.json; do
        [ -f "$schema_file" ] || continue
        local schema_name=$(basename "$schema_file" .json)
        
        # Check if schema is referenced in README or MAINTENANCE
        if grep -q "$schema_name" "$EPF_ROOT/README.md" "$EPF_ROOT/MAINTENANCE.md" 2>/dev/null; then
            log_verbose "$schema_name is documented"
        else
            log_warning "Schema $schema_name not referenced in main documentation"
        fi
    done
}

# =============================================================================
# FILE STRUCTURE VALIDATION
# =============================================================================
check_file_structure() {
    log_section "File Structure Validation"
    
    local EPF_ROOT="$1"
    
    # Required directories
    local required_dirs=("schemas" "phases/READY" "phases/FIRE" "phases/AIM" "scripts" "wizards" "_instances")
    
    for dir in "${required_dirs[@]}"; do
        if [ -d "$EPF_ROOT/$dir" ]; then
            log_pass "Directory exists: $dir"
        else
            log_warning "Expected directory missing: $dir"
        fi
    done
    
    # Check VERSION file format
    local version_content=$(cat "$EPF_ROOT/VERSION" 2>/dev/null)
    if [[ "$version_content" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_pass "VERSION file format is correct (semver)"
    else
        log_error "VERSION file should contain only semver (e.g., 1.10.1), found: '$version_content'"
    fi
}

# =============================================================================
# FIRE PHASE CONTENT VALIDATION
# =============================================================================
check_fire_phase_content() {
    log_section "FIRE Phase Content Validation"
    
    local EPF_ROOT="$1"
    
    # Check canonical templates first
    log_info "Validating canonical FIRE templates..."
    
    if [ -d "$EPF_ROOT/templates/FIRE/value_models" ]; then
        local template_errors=0
        for vm_template in "$EPF_ROOT"/templates/FIRE/value_models/*.yaml; do
            [ -f "$vm_template" ] || continue
            local template_name=$(basename "$vm_template")
            
            # Check if template is valid YAML
            if python3 -c "import yaml; yaml.safe_load(open('$vm_template'))" 2>/dev/null; then
                # Check if template validates against schema
                if command -v yq &> /dev/null && command -v ajv &> /dev/null; then
                    local temp_json="/tmp/epf_health_vm_$$.json"
                    yq -o=json eval '.' "$vm_template" > "$temp_json" 2>/dev/null
                    
                    # Check if this is a placeholder template
                    local status=$(yq eval '.status' "$vm_template" 2>/dev/null)
                    local layers_count=$(yq eval '.layers | length' "$vm_template" 2>/dev/null)
                    
                    if ajv validate -s "$EPF_ROOT/schemas/value_model_schema.json" -d "$temp_json" --strict=false 2>/dev/null; then
                        log_pass "  Template $template_name validates"
                    elif [ "$status" = "placeholder" ] || [ "$layers_count" = "0" ] || [ "$layers_count" = "null" ]; then
                        log_warning "  Template $template_name is a placeholder (expected to be customized)"
                    else
                        log_error "  Template $template_name FAILS schema validation"
                        template_errors=$((template_errors + 1))
                    fi
                    rm -f "$temp_json"
                else
                    log_verbose "  $template_name YAML is valid (schema validation skipped - yq/ajv not available)"
                fi
            else
                log_error "  Template $template_name has YAML syntax errors"
                template_errors=$((template_errors + 1))
            fi
        done
        
        if [ $template_errors -gt 0 ]; then
            log_warning "  $template_errors canonical template(s) have issues"
        fi
    else
        log_warning "  No canonical value model templates found at templates/FIRE/value_models/"
    fi
    
    # Check instances' FIRE content with quality analysis
    log_info "Validating instance FIRE content quality..."
    
    local instances_with_fire=0
    local instances_with_value_models=0
    local instances_with_features=0
    
    for instance_dir in "$EPF_ROOT"/_instances/*/; do
        [ -d "$instance_dir" ] || continue
        local instance_name=$(basename "$instance_dir")
        
        if [ ! -d "$instance_dir/FIRE" ]; then
            continue
        fi
        
        instances_with_fire=$((instances_with_fire + 1))
        log_verbose "  Checking $instance_name..."
        
        # Check value models
        if [ -d "$instance_dir/FIRE/value_models" ]; then
            local vm_count=0
            local vm_valid=0
            local vm_invalid=0
            local total_components=0
            local total_active_components=0
            local product_vm_exists=false
            local product_is_placeholder=false
            
            for vm_file in "$instance_dir"/FIRE/value_models/*.yaml; do
                [ -f "$vm_file" ] || continue
                vm_count=$((vm_count + 1))
                local vm_name=$(basename "$vm_file")
                
                # Check if this is the product value model
                if [[ "$vm_name" == "product.value_model.yaml" ]]; then
                    product_vm_exists=true
                fi
                
                # Basic YAML validity
                if ! python3 -c "import yaml; yaml.safe_load(open('$vm_file'))" 2>/dev/null; then
                    log_error "    $instance_name: $vm_name has YAML syntax errors"
                    vm_invalid=$((vm_invalid + 1))
                    continue
                fi
                
                # Content quality checks using yq
                if command -v yq &> /dev/null; then
                    local status=$(yq eval '.status' "$vm_file" 2>/dev/null)
                    local layers_count=$(yq eval '.layers | length' "$vm_file" 2>/dev/null)
                    
                    # Check if product model is still placeholder
                    if [[ "$vm_name" == "product.value_model.yaml" ]]; then
                        if [ "$status" = "placeholder" ] || [ "$layers_count" = "0" ] || [ "$layers_count" = "null" ]; then
                            product_is_placeholder=true
                        fi
                    fi
                    
                    # Count total and active sub-components across all layers
                    if [ "$layers_count" != "0" ] && [ "$layers_count" != "null" ]; then
                        for ((i=0; i<$layers_count; i++)); do
                            local components_count=$(yq eval ".layers[$i].components | length" "$vm_file" 2>/dev/null)
                            if [ "$components_count" != "0" ] && [ "$components_count" != "null" ]; then
                                for ((j=0; j<$components_count; j++)); do
                                    local subcomponents=$(yq eval ".layers[$i].components[$j].sub_components // []" "$vm_file" 2>/dev/null)
                                    local subcomp_count=$(yq eval ".layers[$i].components[$j].sub_components | length" "$vm_file" 2>/dev/null)
                                    if [ "$subcomp_count" != "0" ] && [ "$subcomp_count" != "null" ]; then
                                        total_components=$((total_components + subcomp_count))
                                        # Count active ones
                                        local active_count=$(yq eval "[.layers[$i].components[$j].sub_components[] | select(.active == true)] | length" "$vm_file" 2>/dev/null)
                                        if [ "$active_count" != "null" ] && [ "$active_count" != "" ]; then
                                            total_active_components=$((total_active_components + active_count))
                                        fi
                                    fi
                                done
                            fi
                        done
                    fi
                fi
                
                # Schema validation if tools available
                if command -v yq &> /dev/null && command -v ajv &> /dev/null; then
                    local temp_json="/tmp/epf_health_vm_inst_$$.json"
                    yq -o=json eval '.' "$vm_file" > "$temp_json" 2>/dev/null
                    
                    if ajv validate -s "$EPF_ROOT/schemas/value_model_schema.json" -d "$temp_json" --strict=false 2>/dev/null; then
                        vm_valid=$((vm_valid + 1))
                        log_verbose "    $vm_name validates"
                    else
                        vm_invalid=$((vm_invalid + 1))
                        log_warning "    $instance_name: $vm_name fails schema validation"
                    fi
                    rm -f "$temp_json"
                else
                    vm_valid=$((vm_valid + 1))
                fi
            done
            
            if [ $vm_count -gt 0 ]; then
                instances_with_value_models=$((instances_with_value_models + 1))
                
                # Report validation status
                if [ $vm_invalid -eq 0 ]; then
                    log_pass "    $instance_name: $vm_count value model(s) - all valid"
                else
                    log_warning "    $instance_name: $vm_valid valid, $vm_invalid invalid out of $vm_count value models"
                fi
                
                # Content quality checks
                if [ "$product_vm_exists" = true ] && [ "$product_is_placeholder" = true ]; then
                    log_warning "    $instance_name: Product value model is still placeholder/empty - needs real product data"
                fi
                
                # Report on active components
                if [ $total_components -gt 0 ]; then
                    if [ $total_active_components -eq 0 ]; then
                        log_info "    $instance_name: 0 active sub-components out of $total_components (no builds planned yet)"
                    else
                        local percent=$((total_active_components * 100 / total_components))
                        log_info "    $instance_name: $total_active_components/$total_components sub-components active (${percent}%)"
                    fi
                fi
            else
                log_info "    $instance_name: No value models yet"
            fi
        fi
        
        # Check feature definitions and coverage
        if [ -d "$instance_dir/FIRE/feature_definitions" ]; then
            local fd_count=0
            local covered_components_list=""
            
            for fd_file in "$instance_dir"/FIRE/feature_definitions/*.yaml "$instance_dir"/FIRE/feature_definitions/*.yml; do
                [ -f "$fd_file" ] || continue
                local fd_name=$(basename "$fd_file")
                
                # Skip underscore-prefixed files
                [[ "$fd_name" == _* ]] && continue
                
                fd_count=$((fd_count + 1))
                
                # Extract contributes_to IDs if yq is available
                if command -v yq &> /dev/null; then
                    local contributes_to=$(yq eval '.contributes_to[]?' "$fd_file" 2>/dev/null)
                    if [ -n "$contributes_to" ]; then
                        covered_components_list="$covered_components_list"$'\n'"$contributes_to"
                    fi
                fi
            done
            
            if [ $fd_count -gt 0 ]; then
                instances_with_features=$((instances_with_features + 1))
                log_pass "    $instance_name: $fd_count feature definition(s)"
                
                # Calculate coverage if we have component data
                if [ $total_components -gt 0 ] && [ -n "$covered_components_list" ]; then
                    # Count unique component IDs
                    local covered_components=$(echo "$covered_components_list" | sort -u | grep -v '^$' | wc -l | tr -d ' ')
                    local coverage_percent=$((covered_components * 100 / total_components))
                    
                    if [ $coverage_percent -lt 30 ]; then
                        log_warning "    $instance_name: Feature coverage is low - $covered_components/$total_components components (${coverage_percent}%) have feature definitions"
                    else
                        log_info "    $instance_name: Feature coverage - $covered_components/$total_components components (${coverage_percent}%) have definitions"
                    fi
                elif [ $total_components -gt 0 ]; then
                    log_info "    $instance_name: Feature coverage assessment requires contributes_to mappings"
                fi
            else
                # No features but we have value models with components
                if [ $total_components -gt 0 ] && [ $total_active_components -gt 0 ]; then
                    log_warning "    $instance_name: No feature definitions yet - cannot build active components without documentation"
                fi
            fi
        elif [ $total_components -gt 0 ] && [ $total_active_components -gt 0 ]; then
            # No feature_definitions directory at all
            log_warning "    $instance_name: No feature definitions - active components lack implementation documentation"
        fi
        
        # Check mappings.yaml if it exists
        if [ -f "$instance_dir/FIRE/mappings.yaml" ]; then
            if python3 -c "import yaml; yaml.safe_load(open('$instance_dir/FIRE/mappings.yaml'))" 2>/dev/null; then
                log_pass "    $instance_name: mappings.yaml is valid"
            else
                log_error "    $instance_name: mappings.yaml has YAML syntax errors"
            fi
        fi
    done
    
    # Summary
    echo ""
    log_info "FIRE Phase Summary:"
    log_info "  Instances with FIRE structure: $instances_with_fire"
    log_info "  Instances with value models: $instances_with_value_models"
    log_info "  Instances with feature definitions: $instances_with_features"
    
    if [ $instances_with_fire -eq 0 ]; then
        log_warning "  No instances have FIRE phase content yet"
    fi
}

# =============================================================================
# INSTANCE VALIDATION
# =============================================================================
check_instances() {
    log_section "Instance Validation"
    
    local EPF_ROOT="$1"
    local instances_need_migration=0
    
    for instance_dir in "$EPF_ROOT"/_instances/*/; do
        [ -d "$instance_dir" ] || continue
        local instance_name=$(basename "$instance_dir")
        
        log_info "Checking instance: $instance_name"
        
        # Check for _meta.yaml
        if [ -f "$instance_dir/_meta.yaml" ]; then
            log_pass "  _meta.yaml exists"
            
            # Check epf_version in _meta.yaml
            local instance_epf_version=$(grep 'epf_version' "$instance_dir/_meta.yaml" 2>/dev/null | head -1 | sed 's/.*: *"\?\([^"]*\)"\?.*/\1/')
            if [ -n "$instance_epf_version" ]; then
                log_verbose "  Instance uses EPF version: $instance_epf_version"
            fi
        else
            log_warning "  Missing _meta.yaml"
        fi
        
        # Check for required folder structure (READY, FIRE, AIM, ad-hoc-artifacts)
        local missing_folders=()
        
        [ ! -d "$instance_dir/READY" ] && missing_folders+=("READY")
        [ ! -d "$instance_dir/FIRE" ] && missing_folders+=("FIRE")
        [ ! -d "$instance_dir/AIM" ] && missing_folders+=("AIM")
        [ ! -d "$instance_dir/ad-hoc-artifacts" ] && missing_folders+=("ad-hoc-artifacts")
        
        if [ ${#missing_folders[@]} -gt 0 ]; then
            log_warning "  Missing folders: ${missing_folders[*]}"
            instances_need_migration=$((instances_need_migration + 1))
        else
            log_pass "  All required folders present (READY, FIRE, AIM, ad-hoc-artifacts)"
        fi
        
        # Check FIRE subfolders if FIRE exists
        if [ -d "$instance_dir/FIRE" ]; then
            local missing_fire_folders=()
            [ ! -d "$instance_dir/FIRE/feature_definitions" ] && missing_fire_folders+=("feature_definitions")
            [ ! -d "$instance_dir/FIRE/value_models" ] && missing_fire_folders+=("value_models")
            [ ! -d "$instance_dir/FIRE/workflows" ] && missing_fire_folders+=("workflows")
            
            if [ ${#missing_fire_folders[@]} -gt 0 ]; then
                log_warning "  Missing FIRE subfolders: ${missing_fire_folders[*]}"
            fi
        fi

        # Check Reality Baseline context - READY artifacts should not exist in a vacuum
        # See: docs/protocols/reality_baseline_protocol.md
        local has_ready_artifacts=false
        local has_living_reality_assessment=false
        
        # Check if any READY artifacts exist
        if [ -d "$instance_dir/READY" ]; then
            local ready_artifact_count=$(find "$instance_dir/READY" -name "*.yaml" -type f 2>/dev/null | wc -l | tr -d ' ')
            if [ "$ready_artifact_count" -gt 0 ]; then
                has_ready_artifacts=true
            fi
        fi
        
        # Check for Living Reality Assessment
        if [ -f "$instance_dir/AIM/living_reality_assessment.yaml" ]; then
            has_living_reality_assessment=true
            log_pass "  Living Reality Assessment exists (context continuity)"
        fi
        
        # Warn if READY artifacts exist without baseline context
        if [ "$has_ready_artifacts" = true ] && [ "$has_living_reality_assessment" = false ]; then
            log_warning "  Has READY artifacts but no Living Reality Assessment"
            log_info "    → Consider creating AIM/living_reality_assessment.yaml for context continuity"
            log_info "    → Artifacts without context may lose strategic grounding over time"
            log_verbose "    Template: templates/AIM/living_reality_assessment.yaml"
        fi
    done
    
    # Provide migration guidance if needed
    if [ $instances_need_migration -gt 0 ]; then
        echo ""
        log_info "━━━ INSTANCE MIGRATION NEEDED ━━━"
        echo ""
        echo "  $instances_need_migration instance(s) missing complete folder structure."
        echo ""
        echo "  To migrate an existing instance to the complete structure:"
        echo "  1. Review current instance content and back up if needed"
        echo "  2. Run: ./docs/EPF/scripts/create-instance-structure.sh --update <instance-name>"
        echo "  3. Or manually create missing folders:"
        echo "     mkdir -p docs/EPF/_instances/<name>/{READY,AIM,ad-hoc-artifacts,cycles,outputs}"
        echo "     mkdir -p docs/EPF/_instances/<name>/FIRE/{feature_definitions,value_models,workflows}"
        echo "     touch docs/EPF/_instances/<name>/FIRE/.gitkeep"  
        echo "     touch docs/EPF/_instances/<name>/AIM/.gitkeep"
        echo ""
        echo "  See: docs/EPF/MAINTENANCE.md#instance-structure-migration"
        echo ""
    fi
}

# =============================================================================
# CONTENT QUALITY CHECK
# =============================================================================
check_content_quality() {
    log_section "Content Quality Assessment"
    
    local EPF_ROOT="$1"
    local content_script="$EPF_ROOT/scripts/check-content-readiness.sh"
    
    # Check if content readiness script exists
    if [ ! -f "$content_script" ]; then
        log_warning "Content readiness script not found - skipping quality assessment"
        return 0
    fi
    
    log_info "Analyzing READY phase content quality for instances..."
    echo ""
    
    # Track overall content quality
    local total_artifacts=0
    local high_quality=0  # A grade
    local medium_quality=0  # B-C grade
    local low_quality=0   # D-F grade
    
    for instance_dir in "$EPF_ROOT"/_instances/*/; do
        [ -d "$instance_dir" ] || continue
        local instance_name=$(basename "$instance_dir")
        
        if [ ! -d "$instance_dir/READY" ]; then
            continue
        fi
        
        log_info "Instance: $instance_name"
        
        # Find and analyze READY phase artifacts
        local artifact_count=0
        local instance_avg_score=0
        
        for artifact in "$instance_dir"/READY/*.yaml; do
            [ -f "$artifact" ] || continue
            
            local artifact_name=$(basename "$artifact")
            
            # Run content readiness check and capture score
            local output
            output=$(bash "$content_script" "$artifact" 2>&1)
            local score=$(echo "$output" | grep "Content Readiness Score:" | sed 's/.*Score: \([0-9]*\).*/\1/')
            local grade=$(echo "$output" | grep "Content Readiness Score:" | sed 's/.*Grade: \([A-F]\)).*/\1/')
            
            if [ -n "$score" ]; then
                artifact_count=$((artifact_count + 1))
                total_artifacts=$((total_artifacts + 1))
                instance_avg_score=$((instance_avg_score + score))
                
                # Categorize by grade
                case "$grade" in
                    A|B) high_quality=$((high_quality + 1)) ;;
                    C) medium_quality=$((medium_quality + 1)) ;;
                    D|F) low_quality=$((low_quality + 1)) ;;
                esac
                
                # Display score with color coding
                # NOTE: Content quality is informational only (warning, not error)
                # Instance content quality should not block framework syncs/bumps
                if [ "$score" -ge 75 ]; then
                    log_pass "  $artifact_name: $score/100 (Grade: $grade)"
                elif [ "$score" -ge 60 ]; then
                    log_warning "  $artifact_name: $score/100 (Grade: $grade)"
                else
                    # Use warning (not error) - content quality doesn't block framework ops
                    log_warning "  $artifact_name: $score/100 (Grade: $grade) - needs enrichment"
                fi
            fi
        done
        
        # Calculate and display instance average
        if [ $artifact_count -gt 0 ]; then
            local avg=$((instance_avg_score / artifact_count))
            log_info "  Instance average: $avg/100 across $artifact_count artifacts"
        else
            log_info "  No READY artifacts found"
        fi
        
        echo ""
    done
    
    # Summary statistics
    if [ $total_artifacts -gt 0 ]; then
        echo ""
        log_info "Content Quality Summary:"
        log_info "  Total artifacts analyzed: $total_artifacts"
        log_info "  High quality (A-B): $high_quality ($(( high_quality * 100 / total_artifacts ))%)"
        log_info "  Medium quality (C): $medium_quality ($(( medium_quality * 100 / total_artifacts ))%)"
        log_info "  Low quality (D-F): $low_quality ($(( low_quality * 100 / total_artifacts ))%)"
        
        if [ $low_quality -gt 0 ]; then
            echo ""
            log_warning "  $low_quality artifact(s) need enrichment before strategic use"
            log_info "  Run: bash scripts/check-content-readiness.sh <artifact-file> for detailed analysis"
        fi
    else
        log_info "  No artifacts found to analyze"
    fi
}

# =============================================================================
# CANONICAL TRACK CONSISTENCY CHECK
# =============================================================================
check_canonical_track_consistency() {
    log_section "Canonical Track Consistency"
    
    local EPF_ROOT="$1"
    
    # Check that documentation correctly distinguishes canonical vs non-canonical tracks
    # Strategy, OrgOps, Commercial = CANONICAL
    # Product = NON-CANONICAL (examples only)
    
    # Check definitions/README.md for correct language
    local def_readme="$EPF_ROOT/definitions/README.md"
    if [ -f "$def_readme" ]; then
        # Check for incorrect "all 4 tracks canonical" language
        if grep -qi "canonical.*all.*four\|canonical.*all.*4\|all.*tracks.*canonical" "$def_readme" 2>/dev/null; then
            log_warning "definitions/README.md may incorrectly suggest all 4 tracks are canonical"
        fi
        
        # Check for correct Product track disclaimer
        if grep -qi "product.*examples\|product.*not.*canonical\|product.*non-canonical" "$def_readme" 2>/dev/null; then
            log_pass "definitions/README.md correctly notes Product track is not canonical"
        else
            log_warning "definitions/README.md should clarify Product track contains examples only"
        fi
    fi
    
    # Check value model templates for Product placeholder note
    local product_vm="$EPF_ROOT/templates/FIRE/value_models/product.value_model.yaml"
    if [ -f "$product_vm" ]; then
        if grep -qi "placeholder\|customize\|product-specific" "$product_vm" 2>/dev/null; then
            log_pass "product.value_model.yaml indicates it's a placeholder/template"
        else
            log_warning "product.value_model.yaml should indicate it's a placeholder to customize"
        fi
    fi
    
    # Check that canonical tracks have definitions
    local canonical_tracks=("strategy" "org_ops" "commercial")
    for track in "${canonical_tracks[@]}"; do
        local track_dir="$EPF_ROOT/definitions/$track"
        if [ -d "$track_dir" ]; then
            local def_count=$(find "$track_dir" -name "*.yaml" 2>/dev/null | wc -l | tr -d ' ')
            if [ "$def_count" -gt 0 ]; then
                log_pass "Canonical track '$track' has $def_count definition(s)"
            else
                log_warning "Canonical track '$track' exists but has no definitions"
            fi
        else
            log_warning "Canonical track directory missing: definitions/$track"
        fi
    done
    
    # Check that Product track is clearly marked as examples
    local product_dir="$EPF_ROOT/definitions/product"
    if [ -d "$product_dir" ]; then
        local product_readme="$product_dir/README.md"
        if [ -f "$product_readme" ]; then
            if grep -qi "examples\|not.*canonical\|unique features" "$product_readme" 2>/dev/null; then
                log_pass "definitions/product/README.md correctly describes Product as examples"
            else
                log_warning "definitions/product/README.md should clarify these are examples, not canonical"
            fi
        fi
        
        # Check template exists in _template/
        if [ -d "$product_dir/_template" ]; then
            log_pass "Product track has _template/ directory for starting template"
        else
            log_warning "Product track missing _template/ directory"
        fi
    fi
    
    # Check Commercial vs OrgOps boundary
    # Commercial = investor ACQUISITION (fundraising, pitch decks, term sheets, closing deals)
    # OrgOps = investor RELATIONS (governance, reporting, ongoing communication after close)
    # 
    # This check validates that track: field matches the file location
    
    local commercial_dir="$EPF_ROOT/definitions/commercial"
    if [ -d "$commercial_dir" ]; then
        local misplaced=0
        for f in $(find "$commercial_dir" -name "*.yaml" 2>/dev/null); do
            if [ -f "$f" ]; then
                local fname=$(basename "$f")
                # Check if track field says something other than commercial
                local track=$(grep -m1 "^track:" "$f" 2>/dev/null | awk '{print $2}' | tr -d '"')
                if [ -n "$track" ] && [ "$track" != "commercial" ]; then
                    log_warning "Commercial definition '$fname' has track: $track (expected: commercial)"
                    ((misplaced++))
                fi
            fi
        done
        
        if [ "$misplaced" -eq 0 ]; then
            log_pass "Commercial definitions have correct track field"
        fi
    fi
    
    local orgops_dir="$EPF_ROOT/definitions/org_ops"
    if [ -d "$orgops_dir" ]; then
        local misplaced=0
        for f in $(find "$orgops_dir" -name "*.yaml" 2>/dev/null); do
            if [ -f "$f" ]; then
                local fname=$(basename "$f")
                # Check if track field says something other than org_ops
                local track=$(grep -m1 "^track:" "$f" 2>/dev/null | awk '{print $2}' | tr -d '"')
                if [ -n "$track" ] && [ "$track" != "org_ops" ]; then
                    log_warning "OrgOps definition '$fname' has track: $track (expected: org_ops)"
                    ((misplaced++))
                fi
            fi
        done
        
        if [ "$misplaced" -eq 0 ]; then
            log_pass "OrgOps definitions have correct track field"
        fi
    fi
}

# =============================================================================
# ARTIFACT VERSION ALIGNMENT (Tier 3)
# =============================================================================
# Checks that instance artifacts are up-to-date with their schema versions.
# Uses check-version-alignment.sh for the actual comparison.
# This replaces the old script version checks which were false positives
# (scripts have independent versioning, artifacts need schema alignment).
# =============================================================================
check_artifact_version_alignment() {
    log_section "Artifact Version Alignment (Tier 3)"
    
    local EPF_ROOT="$1"
    local version_check_script="$EPF_ROOT/scripts/check-version-alignment.sh"
    
    if [ ! -f "$version_check_script" ]; then
        log_warning "check-version-alignment.sh not found - skipping Tier 3 checks"
        log_info "  This script compares artifact internal versions against schema versions"
        return
    fi
    
    # Check each instance for version alignment
    local instances_dir="$EPF_ROOT/_instances"
    if [ ! -d "$instances_dir" ]; then
        log_info "No _instances directory found (canonical EPF repo - no instances expected)"
        return
    fi
    
    local total_stale=0
    local total_outdated=0
    local total_current=0
    local instances_checked=0
    
    for instance_dir in "$instances_dir"/*/; do
        [ -d "$instance_dir" ] || continue
        
        local instance_name=$(basename "$instance_dir")
        [ "$instance_name" = "README.md" ] && continue
        
        log_info "Checking instance: $instance_name"
        
        # Run version alignment check
        local output
        output=$("$version_check_script" "$instance_dir" 2>/dev/null || true)
        
        if [ -n "$output" ]; then
            # Count STALE and OUTDATED artifacts
            # Note: grep -c exits with 1 when no matches, so we capture output first
            local stale_count
            local outdated_count
            local current_count
            stale_count=$(echo "$output" | grep -c "STALE") || stale_count=0
            outdated_count=$(echo "$output" | grep -c "OUTDATED") || outdated_count=0
            current_count=$(echo "$output" | grep -c "CURRENT") || current_count=0
            
            total_stale=$((total_stale + stale_count))
            total_outdated=$((total_outdated + outdated_count))
            total_current=$((total_current + current_count))
            ((instances_checked++))
            
            if [ "$outdated_count" -gt 0 ]; then
                log_warning "  $outdated_count artifact(s) OUTDATED (major version behind - breaking changes)"
            fi
            
            if [ "$stale_count" -gt 0 ]; then
                log_warning "  $stale_count artifact(s) STALE (3+ minor versions behind)"
            fi
            
            if [ "$current_count" -gt 0 ] && [ "$outdated_count" -eq 0 ] && [ "$stale_count" -eq 0 ]; then
                log_pass "  All $current_count artifact(s) are CURRENT"
            fi
        fi
    done
    
    # Summary
    if [ $instances_checked -gt 0 ]; then
        echo ""
        log_info "Artifact Version Alignment Summary:"
        log_info "  Instances checked: $instances_checked"
        log_info "  CURRENT artifacts: $total_current"
        
        if [ $total_stale -gt 0 ]; then
            log_warning "  STALE artifacts: $total_stale (consider enrichment)"
        fi
        
        if [ $total_outdated -gt 0 ]; then
            log_warning "  OUTDATED artifacts: $total_outdated (migration recommended)"
            log_info "  Run: ./scripts/check-version-alignment.sh _instances/<name> for details"
            log_info "  Run: ./scripts/migrate-artifact.sh <artifact> to migrate"
        fi
    else
        log_info "No instances to check for version alignment"
    fi
}

# =============================================================================
# VALUE MODEL STRUCTURE VALIDATION
# =============================================================================
# Checks that value models follow EPF structural guidelines:
# - L1 layers: 3-10 per value model
# - L2 components: 3-5 per L1 layer  
# - L3 sub-components: 3-5 per L2 component
# This prevents models that are too flat (1 L2 per L1) or too deep (20 L3s per L2)
# =============================================================================
check_value_model_structure() {
    log_section "Value Model Structure Validation"
    
    local EPF_ROOT="$1"
    local structure_script="$EPF_ROOT/scripts/validate-value-model-structure.sh"
    
    if [ ! -f "$structure_script" ]; then
        log_warning "validate-value-model-structure.sh not found - skipping structural validation"
        return
    fi
    
    if [ ! -x "$structure_script" ]; then
        log_warning "validate-value-model-structure.sh is not executable - skipping"
        return
    fi
    
    # Check canonical templates
    local template_dir="$EPF_ROOT/templates/FIRE/value_models"
    if [ -d "$template_dir" ]; then
        log_info "Checking canonical value model templates..."
        local output
        output=$("$structure_script" "$template_dir" 2>&1) || true
        local exit_code=$?
        
        # Count warnings and errors from output
        local struct_warnings=$(echo "$output" | grep -c "WARNING" 2>/dev/null) || struct_warnings=0
        local struct_errors=$(echo "$output" | grep -c "ERROR" 2>/dev/null) || struct_errors=0
        
        if [ "$exit_code" -eq 0 ]; then
            log_pass "Canonical templates: Structure is well-balanced"
        elif [ "$exit_code" -eq 2 ]; then
            log_warning "Canonical templates: $struct_warnings structural warning(s)"
            WARNINGS=$((WARNINGS + struct_warnings))
        else
            log_error "Canonical templates: $struct_errors structural error(s)"
            ERRORS=$((ERRORS + struct_errors))
        fi
    fi
    
    # Check instance value models
    for instance_dir in "$EPF_ROOT"/_instances/*/; do
        [ -d "$instance_dir" ] || continue
        local instance_name=$(basename "$instance_dir")
        
        local vm_dir="$instance_dir/FIRE/value_models"
        if [ -d "$vm_dir" ]; then
            local vm_count=$(find "$vm_dir" \( -name "*.value_model.yaml" -o -name "*_value_model.yaml" \) 2>/dev/null | wc -l | tr -d ' ')
            
            if [ "$vm_count" -gt 0 ]; then
                log_info "Checking $instance_name value models..."
                local output
                output=$("$structure_script" "$vm_dir" 2>&1) || true
                local exit_code=$?
                
                local struct_warnings=$(echo "$output" | grep -c "WARNING" 2>/dev/null) || struct_warnings=0
                local struct_errors=$(echo "$output" | grep -c "ERROR" 2>/dev/null) || struct_errors=0
                
                if [ "$exit_code" -eq 0 ]; then
                    log_pass "  $instance_name: Structure is well-balanced"
                elif [ "$exit_code" -eq 2 ]; then
                    log_warning "  $instance_name: $struct_warnings structural warning(s)"
                    # Show specific warnings in verbose mode
                    if [ "$VERBOSE" = true ]; then
                        echo "$output" | grep "WARNING" | head -5 | sed 's/^/    /'
                    fi
                    WARNINGS=$((WARNINGS + struct_warnings))
                else
                    log_error "  $instance_name: $struct_errors structural error(s)"
                    echo "$output" | grep "ERROR" | head -5 | sed 's/^/    /'
                    ERRORS=$((ERRORS + struct_errors))
                fi
            fi
        fi
    done
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║              EPF Health Check Script v1.14.0                     ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    if [ "$FIX_MODE" = true ]; then
        log_info "Running in FIX mode - will attempt to auto-fix issues"
    fi
    
    if [ "$VERBOSE" = true ]; then
        log_info "Running in VERBOSE mode"
    fi
    
    # Find EPF root
    local EPF_ROOT=$(find_epf_root)
    
    if [ -z "$EPF_ROOT" ]; then
        log_critical "Could not find EPF root (VERSION file and schemas directory)"
        echo "Make sure you're running from an EPF repository or docs/EPF directory"
        exit 3
    fi
    
    log_info "EPF Root: $EPF_ROOT"
    
    # Run all checks
    check_version_consistency "$EPF_ROOT"
    check_yaml_parsing "$EPF_ROOT"
    check_json_schemas "$EPF_ROOT"
    check_documentation "$EPF_ROOT"
    check_file_structure "$EPF_ROOT"
    check_fire_phase_content "$EPF_ROOT"
    check_instances "$EPF_ROOT"
    check_content_quality "$EPF_ROOT"
    check_canonical_track_consistency "$EPF_ROOT"
    check_artifact_version_alignment "$EPF_ROOT"
    check_value_model_structure "$EPF_ROOT"
    
    # ==========================================================================
    # Summary
    # ==========================================================================
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                      HEALTH CHECK SUMMARY                        ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "${GREEN}Passed:${NC}          $PASSED"
    echo -e "${YELLOW}Warnings:${NC}        $WARNINGS"
    echo -e "${RED}Errors:${NC}          $ERRORS"
    echo -e "${RED}Critical:${NC}        $CRITICAL_ERRORS"
    echo ""
    
    if [ "$CRITICAL_ERRORS" -gt 0 ]; then
        echo -e "${RED}━━━ CRITICAL ISSUES FOUND - DO NOT COMMIT ━━━${NC}"
        echo ""
        echo "Critical issues must be fixed before committing."
        echo "Run with --fix to attempt auto-repair, or fix manually."
        exit 1
    elif [ "$ERRORS" -gt 0 ]; then
        echo -e "${RED}━━━ ERRORS FOUND - SHOULD FIX BEFORE COMMIT ━━━${NC}"
        echo ""
        echo "These issues should be fixed before committing."
        echo "Run with --fix to attempt auto-repair."
        exit 1
    elif [ "$WARNINGS" -gt 0 ]; then
        echo -e "${YELLOW}━━━ HEALTH CHECK PASSED WITH WARNINGS ━━━${NC}"
        echo ""
        echo "Consider addressing warnings for better consistency."
        exit 2
    else
        echo -e "${GREEN}━━━ ALL HEALTH CHECKS PASSED ━━━${NC}"
        echo ""
        echo "EPF is consistent and ready for updates."
        exit 0
    fi
}

main "$@"
