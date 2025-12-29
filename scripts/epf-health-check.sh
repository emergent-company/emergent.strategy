#!/bin/bash
# EPF Health Check Script
# Version: 1.13.0
#
# This script performs comprehensive validation of the EPF framework,
# including version consistency, YAML parsing, schema validation, and
# documentation alignment.
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
        
        # MAINTENANCE.md might not have a version in header, check for framework version reference
        # Account for markdown bold syntax (**...**) around the line
        if grep -qE "(Current Framework Version:?\*?\*?|Framework Version:?) v?$CANONICAL_VERSION" "$maintenance_file"; then
            log_pass "MAINTENANCE.md references correct framework version"
        elif grep -qE "Current Framework Version|Framework Version:" "$maintenance_file"; then
            # Extract actual version mentioned
            local found_version=$(grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' "$maintenance_file" | head -1)
            if [ "$found_version" = "v$CANONICAL_VERSION" ]; then
                log_pass "MAINTENANCE.md references correct framework version ($found_version)"
            else
                log_warning "MAINTENANCE.md 'Current Framework Version' may be outdated (found: $found_version, expected: v$CANONICAL_VERSION)"
            fi
        else
            log_verbose "MAINTENANCE.md doesn't have explicit version reference (OK)"
        fi
    fi
    
    # Check validate-schemas.sh
    if [ -f "$validate_script" ]; then
        local script_version=$(grep -o 'Version: [0-9]\+\.[0-9]\+\.[0-9]\+' "$validate_script" | head -1 | sed 's/Version: //')
        log_verbose "validate-schemas.sh version: $script_version"
        
        if [ -n "$script_version" ] && [ "$script_version" != "$CANONICAL_VERSION" ]; then
            log_warning "validate-schemas.sh version ($script_version) differs from VERSION ($CANONICAL_VERSION)"
            if [ "$FIX_MODE" = true ]; then
                sed -i '' "s/Version: $script_version/Version: $CANONICAL_VERSION/g" "$validate_script"
                sed -i '' "s/v$script_version/v$CANONICAL_VERSION/g" "$validate_script"
                log_info "  → Fixed validate-schemas.sh version"
            fi
        else
            log_pass "validate-schemas.sh version matches"
        fi
    fi
    
    # Check this health check script version
    local health_version=$(grep -o 'Version: [0-9]\+\.[0-9]\+\.[0-9]\+' "$EPF_ROOT/scripts/epf-health-check.sh" 2>/dev/null | head -1 | sed 's/Version: //')
    if [ -n "$health_version" ] && [ "$health_version" != "$CANONICAL_VERSION" ]; then
        log_warning "epf-health-check.sh version ($health_version) differs from VERSION ($CANONICAL_VERSION)"
    fi
    
    # Check integration_specification.yaml
    if [ -f "$EPF_ROOT/integration_specification.yaml" ]; then
        local integration_spec_version=$(grep -E '^# Version:' "$EPF_ROOT/integration_specification.yaml" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        log_verbose "integration_specification.yaml version: $integration_spec_version"
        
        if [ -n "$integration_spec_version" ] && [ "$integration_spec_version" != "$CANONICAL_VERSION" ]; then
            log_warning "integration_specification.yaml version ($integration_spec_version) differs from VERSION ($CANONICAL_VERSION)"
            if [ "$FIX_MODE" = true ]; then
                # Fix all 4 version references in integration_specification.yaml
                sed -i '' "s/^# Version: [0-9]\+\.[0-9]\+\.[0-9]\+/# Version: $CANONICAL_VERSION/" "$EPF_ROOT/integration_specification.yaml"
                sed -i '' "s/^  version: \"[0-9]\+\.[0-9]\+\.[0-9]\+\"/  version: \"$CANONICAL_VERSION\"/" "$EPF_ROOT/integration_specification.yaml"
                sed -i '' "s/^  this_spec_version: \"[0-9]\+\.[0-9]\+\.[0-9]\+\"/  this_spec_version: \"$CANONICAL_VERSION\"/" "$EPF_ROOT/integration_specification.yaml"
                # Note: History version updates are intentionally excluded as they represent past releases
                log_info "  → Fixed integration_specification.yaml version"
            fi
        else
            log_pass "integration_specification.yaml version matches"
        fi
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
    
    # Required documentation files
    local required_docs=("README.md" "MAINTENANCE.md" "TRACK_BASED_ARCHITECTURE.md" "NORTH_STAR.md" "STRATEGY_FOUNDATIONS.md")
    
    for doc in "${required_docs[@]}"; do
        if [ -f "$EPF_ROOT/$doc" ]; then
            log_pass "$doc exists"
        else
            log_error "Required documentation missing: $doc"
        fi
    done
    
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
        echo "     mkdir -p docs/EPF/_instances/<name>/{READY,AIM,ad-hoc-artifacts,context-sheets,cycles}"
        echo "     mkdir -p docs/EPF/_instances/<name>/FIRE/{feature_definitions,value_models,workflows}"
        echo "     touch docs/EPF/_instances/<name>/FIRE/.gitkeep"  
        echo "     touch docs/EPF/_instances/<name>/AIM/.gitkeep"
        echo ""
        echo "  See: docs/EPF/MAINTENANCE.md#instance-structure-migration"
        echo ""
    fi
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║              EPF Health Check Script v1.11.0                     ║"
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
    check_instances "$EPF_ROOT"
    
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
