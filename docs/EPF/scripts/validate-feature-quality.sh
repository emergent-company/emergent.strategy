#!/usr/bin/env bash

#
# EPF Feature Definition Quality Validator
# 
# Validates EPF feature definitions against Schema v2.0 quality constraints.
# Goes beyond basic schema validation to check:
#   - Persona count and narrative richness
#   - Scenario structure and placement
#   - Context required fields
#   - Dependency richness
#
# Usage:
#   ./validate-feature-quality.sh <directory>
#   ./validate-feature-quality.sh <single-file.yaml>
#
# Exit Codes:
#   0 - All quality checks passed
#   1 - Quality violations found
#   2 - Missing dependencies (yq)
#

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
total_files=0
passed_files=0
failed_files=0
total_checks=0
failed_checks=0

# Check for required dependencies
check_dependencies() {
    local missing=0
    
    if ! command -v yq &> /dev/null; then
        echo -e "${RED}✗ Error: 'yq' is not installed${NC}"
        echo "  Install: brew install yq"
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        exit 2
    fi
}

# Logging functions
log_section() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"
}

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((failed_checks++))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Quality check functions

check_persona_count() {
    local file="$1"
    local count=$(yq eval '.definition.personas | length' "$file")
    
    ((total_checks++))
    if [ "$count" -eq 4 ]; then
        log_pass "Persona count: Exactly 4 personas (required by schema v2.0)"
    else
        log_error "Persona count: Found $count personas, expected exactly 4"
        log_info "   Schema v2.0 requires exactly 4 distinct personas"
        log_info "   Each persona should represent a different role/perspective"
        return 1
    fi
}

check_narrative_richness() {
    local file="$1"
    local has_errors=0
    
    # Get all personas
    local persona_count=$(yq eval '.definition.personas | length' "$file")
    
    for ((i=0; i<persona_count; i++)); do
        local persona_name=$(yq eval ".definition.personas[$i].name" "$file")
        
        # Check each narrative field
        for field in "current_situation" "transformation_moment" "emotional_resolution"; do
            ((total_checks++))
            local narrative=$(yq eval ".definition.personas[$i].$field" "$file" | tr -d '\n' | wc -c | tr -d ' ')
            
            if [ "$narrative" -ge 200 ]; then
                log_pass "Narrative richness: $persona_name.$field has $narrative chars (≥200)"
            else
                log_error "Narrative richness: $persona_name.$field has only $narrative chars (need ≥200)"
                log_info "   Add more specific details: metrics, team size, workflows, time costs"
                log_info "   Schema v2.0 requires 200+ character narratives for quality"
                has_errors=1
            fi
        done
    done
    
    [ $has_errors -eq 0 ]
}

check_scenario_placement() {
    local file="$1"
    
    ((total_checks++))
    
    # Check if scenarios exist at top level
    local top_level_scenarios=$(yq eval '.definition.scenarios | length' "$file" 2>/dev/null || echo "0")
    
    # Check if scenarios are wrongly nested in contexts
    local nested_scenarios=0
    local context_count=$(yq eval '.definition.contexts | length' "$file" 2>/dev/null || echo "0")
    for ((i=0; i<context_count; i++)); do
        local has_scenarios=$(yq eval ".definition.contexts[$i].scenarios" "$file" 2>/dev/null)
        if [ "$has_scenarios" != "null" ]; then
            nested_scenarios=1
            break
        fi
    done
    
    if [ "$top_level_scenarios" -gt 0 ] && [ "$nested_scenarios" -eq 0 ]; then
        log_pass "Scenario placement: Top-level structure (correct)"
    else
        if [ "$nested_scenarios" -eq 1 ]; then
            log_error "Scenario placement: Scenarios nested in contexts (wrong)"
            log_info "   Scenarios must be top-level: definition.scenarios (not contexts[X].scenarios)"
            log_info "   Link scenarios to contexts using 'context' field in each scenario"
        else
            log_error "Scenario placement: No scenarios found at definition.scenarios"
            log_info "   Add top-level scenarios array: definition.scenarios"
        fi
        return 1
    fi
}

check_scenario_completeness() {
    local file="$1"
    local has_errors=0
    
    local scenario_count=$(yq eval '.definition.scenarios | length' "$file" 2>/dev/null || echo "0")
    
    # Required fields per schema v2.0
    local required_fields=("id" "name" "actor" "context" "trigger" "action" "outcome" "acceptance_criteria")
    
    for ((i=0; i<scenario_count; i++)); do
        local scenario_id=$(yq eval ".definition.scenarios[$i].id" "$file")
        
        for field in "${required_fields[@]}"; do
            ((total_checks++))
            local value=$(yq eval ".definition.scenarios[$i].$field" "$file")
            
            if [ "$value" != "null" ] && [ -n "$value" ]; then
                log_pass "Scenario $scenario_id: Has required field '$field'"
            else
                log_error "Scenario $scenario_id: Missing required field '$field'"
                log_info "   Schema v2.0 requires all 8 fields: ${required_fields[*]}"
                has_errors=1
            fi
        done
    done
    
    [ $has_errors -eq 0 ]
}

check_context_required_fields() {
    local file="$1"
    local has_errors=0
    
    local context_count=$(yq eval '.definition.contexts | length' "$file" 2>/dev/null || echo "0")
    
    for ((i=0; i<context_count; i++)); do
        local context_id=$(yq eval ".definition.contexts[$i].id" "$file")
        
        # Check key_interactions
        ((total_checks++))
        local interactions_count=$(yq eval ".definition.contexts[$i].key_interactions | length" "$file" 2>/dev/null || echo "0")
        if [ "$interactions_count" -ge 1 ]; then
            log_pass "Context $context_id: Has key_interactions array ($interactions_count items)"
        else
            log_error "Context $context_id: Missing or empty key_interactions array"
            log_info "   Schema v2.0 requires key_interactions: what users DO (min 1 item)"
            has_errors=1
        fi
        
        # Check data_displayed
        ((total_checks++))
        local data_count=$(yq eval ".definition.contexts[$i].data_displayed | length" "$file" 2>/dev/null || echo "0")
        if [ "$data_count" -ge 1 ]; then
            log_pass "Context $context_id: Has data_displayed array ($data_count items)"
        else
            log_error "Context $context_id: Missing or empty data_displayed array"
            log_info "   Schema v2.0 requires data_displayed: what users SEE (min 1 item)"
            has_errors=1
        fi
    done
    
    [ $has_errors -eq 0 ]
}

check_dependency_richness() {
    local file="$1"
    local has_errors=0
    
    # Check 'requires' dependencies
    local requires_count=$(yq eval '.definition.dependencies.requires | length' "$file" 2>/dev/null || echo "0")
    for ((i=0; i<requires_count; i++)); do
        local dep_id=$(yq eval ".definition.dependencies.requires[$i].id" "$file")
        
        # Check if it's an object (not string)
        ((total_checks++))
        local dep_type=$(yq eval ".definition.dependencies.requires[$i] | type" "$file")
        if [ "$dep_type" = "!!map" ]; then
            log_pass "Dependency $dep_id: Rich object structure (not string)"
        else
            log_error "Dependency $dep_id: Simple string (should be object with id/name/reason)"
            log_info "   Schema v2.0 requires rich dependencies: {id, name, reason}"
            has_errors=1
            continue
        fi
        
        # Check reason length
        ((total_checks++))
        local reason=$(yq eval ".definition.dependencies.requires[$i].reason" "$file" | tr -d '\n' | wc -c | tr -d ' ')
        if [ "$reason" -ge 30 ]; then
            log_pass "Dependency $dep_id: Reason has $reason chars (≥30)"
        else
            log_error "Dependency $dep_id: Reason has only $reason chars (need ≥30)"
            log_info "   Explain WHY: technical coupling, UX dependencies, data flow requirements"
            has_errors=1
        fi
    done
    
    # Check 'enables' dependencies
    local enables_count=$(yq eval '.definition.dependencies.enables | length' "$file" 2>/dev/null || echo "0")
    for ((i=0; i<enables_count; i++)); do
        local dep_id=$(yq eval ".definition.dependencies.enables[$i].id" "$file")
        
        # Check if it's an object (not string)
        ((total_checks++))
        local dep_type=$(yq eval ".definition.dependencies.enables[$i] | type" "$file")
        if [ "$dep_type" = "!!map" ]; then
            log_pass "Dependency $dep_id (enables): Rich object structure (not string)"
        else
            log_error "Dependency $dep_id (enables): Simple string (should be object with id/name/reason)"
            log_info "   Schema v2.0 requires rich dependencies: {id, name, reason}"
            has_errors=1
            continue
        fi
        
        # Check reason length
        ((total_checks++))
        local reason=$(yq eval ".definition.dependencies.enables[$i].reason" "$file" | tr -d '\n' | wc -c | tr -d ' ')
        if [ "$reason" -ge 30 ]; then
            log_pass "Dependency $dep_id (enables): Reason has $reason chars (≥30)"
        else
            log_error "Dependency $dep_id (enables): Reason has only $reason chars (need ≥30)"
            log_info "   Explain WHY: what downstream features this unlocks"
            has_errors=1
        fi
    done
    
    [ $has_errors -eq 0 ]
}

# Main validation function for a single file
validate_file() {
    local file="$1"
    local filename=$(basename "$file")
    
    log_section "Validating: $filename"
    
    ((total_files++))
    local file_passed=1
    
    # Run all quality checks
    check_persona_count "$file" || file_passed=0
    check_narrative_richness "$file" || file_passed=0
    check_scenario_placement "$file" || file_passed=0
    check_scenario_completeness "$file" || file_passed=0
    check_context_required_fields "$file" || file_passed=0
    check_dependency_richness "$file" || file_passed=0
    
    # Check for optional feature_maturity (informational, not a validation gate)
    check_feature_maturity_info "$file"
    
    if [ $file_passed -eq 1 ]; then
        echo -e "\n${GREEN}✓ $filename passed all quality checks${NC}\n"
        ((passed_files++))
    else
        echo -e "\n${RED}✗ $filename has quality violations${NC}\n"
        ((failed_files++))
    fi
}

# Check for feature_maturity section (informational, not validation)
check_feature_maturity_info() {
    local file="$1"
    
    local has_maturity=$(yq eval '.feature_maturity' "$file" 2>/dev/null)
    
    if [ "$has_maturity" != "null" ] && [ -n "$has_maturity" ]; then
        local overall_stage=$(yq eval '.feature_maturity.overall_stage' "$file" 2>/dev/null || echo "unknown")
        local cap_count=$(yq eval '.feature_maturity.capability_maturity | length' "$file" 2>/dev/null || echo "0")
        local last_kr=$(yq eval '.feature_maturity.last_advanced_by_kr' "$file" 2>/dev/null || echo "null")
        local last_date=$(yq eval '.feature_maturity.last_assessment_date' "$file" 2>/dev/null || echo "unknown")
        
        log_info "Feature Maturity (optional): Present"
        log_info "   Overall stage: $overall_stage"
        log_info "   Capabilities tracked: $cap_count"
        if [ "$last_kr" != "null" ] && [ -n "$last_kr" ]; then
            log_info "   Last advanced by KR: $last_kr"
        fi
        log_info "   Last assessment: $last_date"
    else
        log_info "Feature Maturity (optional): Not present"
        log_info "   Consider adding feature_maturity for capability-level tracking (EPF v2.8.0+)"
    fi
}

# Main script
main() {
    check_dependencies
    
    if [ $# -eq 0 ]; then
        echo "Usage: $0 <directory-or-file>"
        echo ""
        echo "Validate EPF feature definitions against Schema v2.0 quality constraints."
        echo ""
        echo "Examples:"
        echo "  $0 /path/to/feature_definitions/"
        echo "  $0 /path/to/feature_definitions/fd-001.yaml"
        exit 1
    fi
    
    local target="$1"
    
    log_section "EPF Feature Definition Quality Validator (Schema v2.0)"
    
    if [ -f "$target" ]; then
        # Single file
        validate_file "$target"
    elif [ -d "$target" ]; then
        # Directory - find all YAML files
        local yaml_files=($(find "$target" -maxdepth 1 -name "*.yaml" -o -name "*.yml" | sort))
        
        if [ ${#yaml_files[@]} -eq 0 ]; then
            echo -e "${YELLOW}No YAML files found in $target${NC}"
            exit 0
        fi
        
        for file in "${yaml_files[@]}"; do
            validate_file "$file"
        done
    else
        echo -e "${RED}Error: $target is neither a file nor a directory${NC}"
        exit 1
    fi
    
    # Summary
    log_section "Validation Summary"
    echo "Files checked: $total_files"
    echo "Quality checks performed: $total_checks"
    echo ""
    
    if [ $failed_files -eq 0 ]; then
        echo -e "${GREEN}✓ All files passed quality validation${NC}"
        echo -e "${GREEN}✓ $passed_files files compliant with Schema v2.0${NC}"
        exit 0
    else
        echo -e "${RED}✗ Quality violations found${NC}"
        echo -e "${GREEN}  Passed: $passed_files files${NC}"
        echo -e "${RED}  Failed: $failed_files files${NC}"
        echo -e "${RED}  Failed checks: $failed_checks${NC}"
        echo ""
        echo "Fix violations following Schema v2.0 constraints:"
        echo "  - Exactly 4 personas with 200+ char narratives (3 fields each)"
        echo "  - Scenarios at top level with all 8 required fields"
        echo "  - Contexts with key_interactions and data_displayed arrays"
        echo "  - Rich dependency objects with 30+ char reason explanations"
        exit 1
    fi
}

main "$@"
