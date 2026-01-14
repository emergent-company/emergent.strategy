#!/bin/bash
# EPF Track Definition Validation Script
# Version: 1.0.0
#
# This script validates track definition YAML files against their respective JSON schemas.
# It supports all 4 tracks: Product (features), Strategy, OrgOps, and Commercial.
#
# Prerequisites:
#   npm install -g ajv-cli
#   brew install yq (or apt-get install yq)
#
# Usage:
#   ./scripts/validate-track-definitions.sh                     # Validate all definitions
#   ./scripts/validate-track-definitions.sh definitions/org_ops # Validate OrgOps only
#   ./scripts/validate-track-definitions.sh path/to/file.yaml   # Validate single file
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation errors found
#   2 - Missing dependencies or invalid arguments

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
SKIPPED=0

# Temp directory for JSON conversions
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Find EPF root (where schemas directory is)
find_epf_root() {
    local current="$(pwd)"
    
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

EPF_ROOT=$(find_epf_root)
SCHEMA_DIR="$EPF_ROOT/schemas"

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

log_skip() {
    echo -e "${YELLOW}○${NC} $1"
    ((SKIPPED++)) || true
}

log_section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
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
        exit 2
    fi
}

# Convert YAML to JSON
yaml_to_json() {
    local yaml_file="$1"
    local json_file="$2"
    yq -o=json eval '.' "$yaml_file" > "$json_file"
}

# Determine schema for a definition file based on track
get_schema_for_definition() {
    local yaml_file="$1"
    local filename=$(basename "$yaml_file")
    local dir_path=$(dirname "$yaml_file")
    
    # Determine track from file ID prefix
    local id_prefix=$(yq eval '.id' "$yaml_file" 2>/dev/null | cut -c1-2)
    
    case "$id_prefix" in
        "fd")
            echo "$SCHEMA_DIR/feature_definition_schema.json"
            ;;
        "sd")
            echo "$SCHEMA_DIR/strategy_definition_schema.json"
            ;;
        "pd")
            echo "$SCHEMA_DIR/org_ops_definition_schema.json"
            ;;
        "cd")
            echo "$SCHEMA_DIR/commercial_definition_schema.json"
            ;;
        *)
            # Fallback: try to determine from directory path
            if [[ "$dir_path" == *"/product/"* ]] || [[ "$dir_path" == *"/features/"* ]]; then
                echo "$SCHEMA_DIR/feature_definition_schema.json"
            elif [[ "$dir_path" == *"/strategy/"* ]]; then
                echo "$SCHEMA_DIR/strategy_definition_schema.json"
            elif [[ "$dir_path" == *"/org_ops/"* ]]; then
                echo "$SCHEMA_DIR/org_ops_definition_schema.json"
            elif [[ "$dir_path" == *"/commercial/"* ]]; then
                echo "$SCHEMA_DIR/commercial_definition_schema.json"
            else
                echo ""
            fi
            ;;
    esac
}

# Validate a single file against its schema
validate_file() {
    local yaml_file="$1"
    local schema_file="$2"
    local filename=$(basename "$yaml_file")
    
    if [ ! -f "$yaml_file" ]; then
        log_warning "File not found: $yaml_file"
        return 1
    fi
    
    # Auto-detect schema if not provided
    if [ -z "$schema_file" ]; then
        schema_file=$(get_schema_for_definition "$yaml_file")
    fi
    
    if [ -z "$schema_file" ] || [ ! -f "$schema_file" ]; then
        log_skip "$filename - Could not determine schema"
        return 0
    fi
    
    # Convert YAML to JSON
    local json_file="$TEMP_DIR/$(basename "$yaml_file" .yaml).json"
    if ! yaml_to_json "$yaml_file" "$json_file" 2>/dev/null; then
        log_error "Failed to parse YAML: $filename"
        return 1
    fi
    
    # Validate against schema using references
    local schema_name=$(basename "$schema_file")
    if ajv validate -s "$schema_file" -r "$SCHEMA_DIR/track_definition_base_schema.json" -d "$json_file" --strict=false 2>/dev/null; then
        log_pass "$filename validates against $schema_name"
        return 0
    else
        log_error "$filename FAILS validation against $schema_name"
        # Show detailed errors
        echo -e "${RED}  Validation errors:${NC}"
        ajv validate -s "$schema_file" -r "$SCHEMA_DIR/track_definition_base_schema.json" -d "$json_file" --strict=false 2>&1 | head -20 | sed 's/^/    /'
        return 1
    fi
}

# Validate all definitions in a directory
validate_directory() {
    local dir="$1"
    local schema_file="$2"
    
    if [ ! -d "$dir" ]; then
        log_warning "Directory not found: $dir"
        return
    fi
    
    local count=0
    for file in "$dir"/*.yaml "$dir"/*.yml; do
        [ -f "$file" ] || continue
        validate_file "$file" "$schema_file"
        ((count++)) || true
    done
    
    # Recursively validate subdirectories
    for subdir in "$dir"/*/; do
        [ -d "$subdir" ] || continue
        validate_directory "$subdir" "$schema_file"
    done
    
    if [ "$count" -eq 0 ] && [ -z "$(find "$dir" -mindepth 2 -name "*.yaml" -o -name "*.yml" 2>/dev/null)" ]; then
        log_info "No YAML files found in $dir"
    fi
}

# Main validation logic
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║         EPF Track Definition Validator v1.0.0                   ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    check_dependencies
    
    if [ -z "$EPF_ROOT" ]; then
        log_error "Could not find EPF root (schemas directory). Make sure you're in an EPF repository."
        exit 2
    fi
    
    log_info "EPF Root: $EPF_ROOT"
    log_info "Schema Directory: $SCHEMA_DIR"
    
    local TARGET="$1"
    
    if [ -n "$TARGET" ]; then
        # Validate specific target (file or directory)
        if [ -f "$TARGET" ]; then
            log_section "Validating Single File"
            validate_file "$TARGET"
        elif [ -d "$TARGET" ]; then
            log_section "Validating Directory: $TARGET"
            validate_directory "$TARGET"
        else
            log_error "Target not found: $TARGET"
            exit 2
        fi
    else
        # Validate all definitions directories
        local DEFINITIONS_DIR="$EPF_ROOT/definitions"
        
        if [ ! -d "$DEFINITIONS_DIR" ]; then
            log_warning "No definitions directory found at $DEFINITIONS_DIR"
            log_info "Looking for alternative locations..."
            
            # Try features directory (legacy)
            if [ -d "$EPF_ROOT/features" ]; then
                log_section "Product Track (features/)"
                validate_directory "$EPF_ROOT/features" "$SCHEMA_DIR/feature_definition_schema.json"
            fi
            
            exit 0
        fi
        
        # Validate each track
        if [ -d "$DEFINITIONS_DIR/product" ]; then
            log_section "Product Track (definitions/product/)"
            validate_directory "$DEFINITIONS_DIR/product" "$SCHEMA_DIR/feature_definition_schema.json"
        fi
        
        if [ -d "$DEFINITIONS_DIR/strategy" ]; then
            log_section "Strategy Track (definitions/strategy/)"
            validate_directory "$DEFINITIONS_DIR/strategy" "$SCHEMA_DIR/strategy_definition_schema.json"
        fi
        
        if [ -d "$DEFINITIONS_DIR/org_ops" ]; then
            log_section "OrgOps Track (definitions/org_ops/)"
            validate_directory "$DEFINITIONS_DIR/org_ops" "$SCHEMA_DIR/org_ops_definition_schema.json"
        fi
        
        if [ -d "$DEFINITIONS_DIR/commercial" ]; then
            log_section "Commercial Track (definitions/commercial/)"
            validate_directory "$DEFINITIONS_DIR/commercial" "$SCHEMA_DIR/commercial_definition_schema.json"
        fi
    fi
    
    # Summary
    log_section "Summary"
    echo -e "  Passed:   ${GREEN}$PASSED${NC}"
    echo -e "  Warnings: ${YELLOW}$WARNINGS${NC}"
    echo -e "  Errors:   ${RED}$ERRORS${NC}"
    echo -e "  Skipped:  ${YELLOW}$SKIPPED${NC}"
    echo ""
    
    if [ "$ERRORS" -gt 0 ]; then
        echo -e "${RED}━━━ VALIDATION FAILED ━━━${NC}"
        exit 1
    else
        echo -e "${GREEN}━━━ VALIDATION PASSED ━━━${NC}"
        exit 0
    fi
}

main "$@"
