#!/bin/bash
# EPF Schema Migration Helper
# Version: 1.9.6
#
# This script helps identify what needs to be migrated when schemas change.
# It compares schema versions and generates migration guidance.
#
# Usage:
#   ./scripts/schema-migration.sh diff <old-schema> <new-schema>
#   ./scripts/schema-migration.sh check-instance <instance-path>
#   ./scripts/schema-migration.sh list-schemas
#
# Examples:
#   ./scripts/schema-migration.sh list-schemas
#   ./scripts/schema-migration.sh check-instance _instances/twentyfirst

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_section() {
    echo ""
    echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

# Schema to artifact mapping
declare -A SCHEMA_TO_ARTIFACT=(
    ["insight_opportunity_schema.json"]="03_insight_opportunity.yaml"
    ["strategy_formula_schema.json"]="04_strategy_formula.yaml"
    ["roadmap_recipe_schema.json"]="05_roadmap_recipe.yaml|04_roadmap_recipe.yaml"
    ["value_model_schema.json"]="value_models/*.yaml"
    ["workflow_schema.json"]="workflows/*.yaml"
    ["mappings_schema.json"]="mappings.yaml"
    ["assessment_report_schema.json"]="cycles/*/assessment_report.yaml"
    ["calibration_memo_schema.json"]="cycles/*/calibration_memo.yaml"
)

# Find EPF root
find_epf_root() {
    for path in "." "docs/EPF" "../" "../../" "../docs/EPF"; do
        if [ -d "$path/schemas" ]; then
            echo "$path"
            return
        fi
    done
    echo ""
}

# List all schemas
cmd_list_schemas() {
    local EPF_ROOT=$(find_epf_root)
    
    if [ -z "$EPF_ROOT" ]; then
        echo "Could not find EPF schemas directory"
        exit 1
    fi
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                    EPF Schema Reference                          ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    log_section "Schema → Artifact Mapping"
    echo ""
    printf "%-35s → %s\n" "SCHEMA" "ARTIFACT(S)"
    printf "%-35s   %s\n" "$(printf '%.0s─' {1..35})" "$(printf '%.0s─' {1..40})"
    
    for schema in "${!SCHEMA_TO_ARTIFACT[@]}"; do
        printf "%-35s → %s\n" "$schema" "${SCHEMA_TO_ARTIFACT[$schema]}"
    done
    
    log_section "Available Schemas"
    echo ""
    for schema_file in "$EPF_ROOT/schemas"/*.json; do
        [ -f "$schema_file" ] || continue
        local filename=$(basename "$schema_file")
        local title=$(jq -r '.title // "No title"' "$schema_file" 2>/dev/null || echo "Parse error")
        echo -e "  ${GREEN}•${NC} $filename"
        echo -e "    Title: $title"
    done
    
    log_section "Schema Versions"
    echo ""
    echo "Current EPF Version: $(grep -oP 'Version: \K[0-9.]+' "$EPF_ROOT/scripts/validate-schemas.sh" 2>/dev/null || echo "unknown")"
    echo ""
    echo "Schema files should be versioned alongside the EPF framework."
    echo "When making breaking schema changes:"
    echo "  1. Update the schema in schemas/"
    echo "  2. Update all instance artifacts to match"
    echo "  3. Document the change in MAINTENANCE.md"
    echo "  4. Bump EPF version"
}

# Compare two schema versions
cmd_diff() {
    local old_schema="$1"
    local new_schema="$2"
    
    if [ ! -f "$old_schema" ] || [ ! -f "$new_schema" ]; then
        echo "Usage: $0 diff <old-schema.json> <new-schema.json>"
        exit 1
    fi
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                    Schema Diff Analysis                          ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    log_info "Comparing: $(basename "$old_schema") → $(basename "$new_schema")"
    echo ""
    
    # Use jq to extract key differences
    log_section "Property Changes"
    
    # Get all property names from both schemas
    local old_props=$(jq -r '.. | objects | select(has("properties")) | .properties | keys[]' "$old_schema" 2>/dev/null | sort -u)
    local new_props=$(jq -r '.. | objects | select(has("properties")) | .properties | keys[]' "$new_schema" 2>/dev/null | sort -u)
    
    # Find added properties
    echo -e "${GREEN}Added properties:${NC}"
    comm -13 <(echo "$old_props") <(echo "$new_props") | while read prop; do
        echo "  + $prop"
    done
    
    # Find removed properties
    echo ""
    echo -e "${RED}Removed properties:${NC}"
    comm -23 <(echo "$old_props") <(echo "$new_props") | while read prop; do
        echo "  - $prop"
    done
    
    log_section "Required Field Changes"
    
    local old_required=$(jq -r '.. | objects | select(has("required")) | .required[]' "$old_schema" 2>/dev/null | sort -u)
    local new_required=$(jq -r '.. | objects | select(has("required")) | .required[]' "$new_schema" 2>/dev/null | sort -u)
    
    echo -e "${GREEN}New required fields:${NC}"
    comm -13 <(echo "$old_required") <(echo "$new_required") | while read req; do
        echo "  + $req (BREAKING: must add to existing artifacts)"
    done
    
    echo ""
    echo -e "${RED}No longer required:${NC}"
    comm -23 <(echo "$old_required") <(echo "$new_required") | while read req; do
        echo "  - $req (non-breaking)"
    done
    
    log_section "Migration Guidance"
    echo ""
    echo "When migrating artifacts to the new schema:"
    echo "  1. Add any new required fields with appropriate values"
    echo "  2. Remove deprecated fields (or keep for backwards compatibility)"
    echo "  3. Run ./scripts/validate-schemas.sh to verify"
    echo "  4. Update wizard prompts if field names changed"
}

# Check instance for schema compatibility
cmd_check_instance() {
    local INSTANCE_PATH="$1"
    local EPF_ROOT=$(find_epf_root)
    
    if [ -z "$INSTANCE_PATH" ]; then
        echo "Usage: $0 check-instance <instance-path>"
        exit 1
    fi
    
    if [ ! -d "$INSTANCE_PATH" ]; then
        echo "Instance path does not exist: $INSTANCE_PATH"
        exit 1
    fi
    
    if [ -z "$EPF_ROOT" ]; then
        echo "Could not find EPF schemas directory"
        exit 1
    fi
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                Instance Schema Compatibility Check               ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    local INSTANCE_NAME=$(basename "$INSTANCE_PATH")
    log_info "Instance: $INSTANCE_NAME"
    log_info "Checking against schemas in: $EPF_ROOT/schemas/"
    
    log_section "Artifact → Schema Mapping"
    echo ""
    
    for schema in "${!SCHEMA_TO_ARTIFACT[@]}"; do
        local artifact_pattern="${SCHEMA_TO_ARTIFACT[$schema]}"
        local schema_path="$EPF_ROOT/schemas/$schema"
        
        # Handle multiple patterns (separated by |)
        IFS='|' read -ra patterns <<< "$artifact_pattern"
        
        for pattern in "${patterns[@]}"; do
            # Expand glob pattern
            for artifact in $INSTANCE_PATH/$pattern; do
                [ -f "$artifact" ] || continue
                
                local artifact_name=$(echo "$artifact" | sed "s|$INSTANCE_PATH/||")
                printf "  %-40s → %s\n" "$artifact_name" "$schema"
            done
        done
    done
    
    log_section "Quick Validation"
    echo ""
    echo "Run full schema validation with:"
    echo "  ./scripts/validate-schemas.sh $INSTANCE_PATH"
}

# Main
case "${1:-}" in
    list-schemas|list)
        cmd_list_schemas
        ;;
    diff)
        cmd_diff "$2" "$3"
        ;;
    check-instance|check)
        cmd_check_instance "$2"
        ;;
    *)
        echo "EPF Schema Migration Helper"
        echo ""
        echo "Usage:"
        echo "  $0 list-schemas              - List all schemas and their artifact mappings"
        echo "  $0 diff <old> <new>          - Compare two schema versions"
        echo "  $0 check-instance <path>     - Check instance schema compatibility"
        echo ""
        echo "Examples:"
        echo "  $0 list-schemas"
        echo "  $0 check-instance _instances/twentyfirst"
        echo "  $0 diff schemas/v1.9.4/roadmap.json schemas/roadmap_recipe_schema.json"
        ;;
esac
