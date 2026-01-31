#!/usr/bin/env bash
#
# generate-migration-plan.sh - EPF Migration Plan Generator
# 
# Analyzes an instance directory and generates a MIGRATION_PLAN.yaml
# documenting what migrations are needed to reach current EPF version.
#
# Usage:
#   ./scripts/generate-migration-plan.sh <instance_dir>
#   ./scripts/generate-migration-plan.sh _instances/twentyfirst
#   ./scripts/generate-migration-plan.sh _instances/twentyfirst --output /tmp/plan.yaml
#
# Output: MIGRATION_PLAN.yaml in the instance directory (or specified location)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$EPF_ROOT/migrations"
REGISTRY_FILE="$MIGRATIONS_DIR/registry.yaml"

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
INSTANCE_DIR=""
OUTPUT_FILE=""
VERBOSE=false

usage() {
    echo "Usage: $0 <instance_dir> [options]"
    echo ""
    echo "Options:"
    echo "  --output, -o <file>   Output file path (default: <instance>/MIGRATION_PLAN.yaml)"
    echo "  --verbose, -v         Show detailed analysis"
    echo "  --help, -h            Show this help"
    echo ""
    echo "Example:"
    echo "  $0 _instances/twentyfirst"
    echo "  $0 _instances/emergent --output /tmp/plan.yaml"
    exit 1
}

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_section() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --output|-o)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            if [[ -z "$INSTANCE_DIR" ]]; then
                INSTANCE_DIR="$1"
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [[ -z "$INSTANCE_DIR" ]]; then
    log_error "Instance directory required"
    usage
fi

# Resolve paths
if [[ ! "$INSTANCE_DIR" = /* ]]; then
    INSTANCE_DIR="$EPF_ROOT/$INSTANCE_DIR"
fi

if [[ ! -d "$INSTANCE_DIR" ]]; then
    log_error "Instance directory not found: $INSTANCE_DIR"
    exit 1
fi

# Set default output
if [[ -z "$OUTPUT_FILE" ]]; then
    OUTPUT_FILE="$INSTANCE_DIR/MIGRATION_PLAN.yaml"
fi

INSTANCE_NAME=$(basename "$INSTANCE_DIR")

# Check for yq
if ! command -v yq &> /dev/null; then
    log_error "yq is required but not installed. Install with: brew install yq"
    exit 1
fi

# Get current EPF version
get_current_epf_version() {
    cat "$EPF_ROOT/VERSION" 2>/dev/null || echo "unknown"
}

# Get schema version from schema JSON file
# This is what artifacts should be compared against - NOT the EPF framework version
get_schema_version() {
    local schema_name="$1"
    local schema_file="$EPF_ROOT/schemas/$schema_name"
    
    if [[ ! -f "$schema_file" ]]; then
        echo "unknown"
        return
    fi
    
    if command -v jq &> /dev/null; then
        jq -r '.version // "unknown"' "$schema_file" 2>/dev/null || echo "unknown"
    else
        grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$schema_file" | head -1 | sed 's/.*"\([^"]*\)".*/\1/' || echo "unknown"
    fi
}

# Get instance EPF version from _meta.yaml
get_instance_version() {
    local meta_file="$INSTANCE_DIR/_meta.yaml"
    if [[ -f "$meta_file" ]]; then
        yq eval '.epf_version // "unknown"' "$meta_file" 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

# Get artifact version from YAML file
get_artifact_version() {
    local artifact_file="$1"
    
    # Try header comment: # EPF v2.3.3
    local header_ver=$(grep -m1 "^# EPF v[0-9]" "$artifact_file" 2>/dev/null | sed 's/.*EPF v\([0-9.]*\).*/\1/' || echo "")
    if [[ -n "$header_ver" ]]; then
        echo "$header_ver"
        return
    fi
    
    # Try meta block
    local meta_ver=$(yq eval '.meta.epf_version // "unknown"' "$artifact_file" 2>/dev/null || echo "unknown")
    if [[ "$meta_ver" != "unknown" && "$meta_ver" != "null" ]]; then
        echo "$meta_ver"
        return
    fi
    
    echo "unknown"
}

# Compare versions (returns: same, ahead, behind, major_behind)
compare_versions() {
    local v1="$1"  # artifact version
    local v2="$2"  # target/schema version
    
    # Handle unknown versions
    if [[ "$v1" == "unknown" || -z "$v1" ]]; then
        echo "unknown"
        return
    fi
    
    if [[ "$v2" == "unknown" || -z "$v2" ]]; then
        # If schema has no version, we can't compare - assume current
        echo "same"
        return
    fi
    
    if [[ "$v1" == "$v2" ]]; then
        echo "same"
        return
    fi
    
    # Split versions
    IFS='.' read -ra V1 <<< "$v1"
    IFS='.' read -ra V2 <<< "$v2"
    
    local major1=${V1[0]:-0}
    local minor1=${V1[1]:-0}
    local patch1=${V1[2]:-0}
    local major2=${V2[0]:-0}
    local minor2=${V2[1]:-0}
    local patch2=${V2[2]:-0}
    
    # Check for major version difference
    if [[ $major1 -lt $major2 ]]; then
        echo "major_behind"
        return
    elif [[ $major1 -gt $major2 ]]; then
        echo "ahead"
        return
    fi
    
    # Same major, check minor
    if [[ $minor1 -lt $minor2 ]]; then
        local diff=$((minor2 - minor1))
        if [[ $diff -ge 3 ]]; then
            echo "stale"
        else
            echo "behind"
        fi
        return
    elif [[ $minor1 -gt $minor2 ]]; then
        echo "ahead"
        return
    fi
    
    # Same major.minor, check patch
    if [[ $patch1 -lt $patch2 ]]; then
        echo "behind"
    else
        echo "ahead"
    fi
}

# Get migration guide for version transition
get_migration_guide() {
    local from_version="$1"
    local to_version="$2"
    
    # Check if major version change
    local from_major="${from_version%%.*}"
    local to_major="${to_version%%.*}"
    
    if [[ "$from_major" != "$to_major" ]]; then
        echo "migrations/guides/v${from_major}.x-to-v${to_major}.0.0.md"
    else
        # Minor version change - format: v2.7.x-to-v2.8.x
        local from_minor="${from_version#*.}"
        from_minor="${from_minor%%.*}"
        local to_minor="${to_version#*.}"
        to_minor="${to_minor%%.*}"
        echo "migrations/guides/v${from_major}.${from_minor}.x-to-v${to_major}.${to_minor}.x.md"
    fi
}

# Analyze artifact and determine migrations needed
analyze_artifact() {
    local artifact_file="$1"
    local artifact_rel="${artifact_file#$INSTANCE_DIR/}"
    local artifact_name=$(basename "$artifact_file")
    local artifact_version=$(get_artifact_version "$artifact_file")
    
    # Determine artifact type and schema FIRST (needed for version comparison)
    local schema=""
    local artifact_type=""
    
    case "$artifact_name" in
        00_north_star*)
            schema="north_star_schema.json"
            artifact_type="north_star"
            ;;
        01_insight*)
            schema="insight_analyses_schema.json"
            artifact_type="insight_analyses"
            ;;
        02_strategy_foundations*)
            schema="strategy_foundations_schema.json"
            artifact_type="strategy_foundations"
            ;;
        03_insight_opportunity*)
            schema="insight_opportunity_schema.json"
            artifact_type="insight_opportunity"
            ;;
        04_strategy_formula*)
            schema="strategy_formula_schema.json"
            artifact_type="strategy_formula"
            ;;
        05_roadmap*)
            schema="roadmap_recipe_schema.json"
            artifact_type="roadmap"
            ;;
        fd-*)
            schema="feature_definition_schema.json"
            artifact_type="feature_definition"
            ;;
        *.value_model.yaml)
            schema="value_model_schema.json"
            artifact_type="value_model"
            ;;
        assessment_report*)
            schema="assessment_report_schema.json"
            artifact_type="assessment_report"
            ;;
        calibration_memo*)
            schema="calibration_memo_schema.json"
            artifact_type="calibration_memo"
            ;;
        *)
            artifact_type="unknown"
            ;;
    esac
    
    # Get schema version for comparison
    # IMPORTANT: We compare artifact version against SCHEMA version, not EPF framework version
    # Schemas have independent versioning - they only bump when the schema itself changes
    local schema_version="unknown"
    if [[ -n "$schema" ]]; then
        schema_version=$(get_schema_version "$schema")
    fi
    
    # Compare artifact version against schema version (NOT framework version)
    local comparison=$(compare_versions "$artifact_version" "$schema_version")
    
    # Determine action needed
    local action=""
    local priority=""
    local effort=""
    local guide=""
    
    case "$comparison" in
        same)
            action="none"
            priority="none"
            effort="0"
            ;;
        behind)
            action="enrich"
            priority="low"
            effort="30min-1hr"
            ;;
        stale)
            action="enrich"
            priority="medium"
            effort="1-2hrs"
            ;;
        major_behind)
            action="migrate"
            priority="high"
            effort="1-3hrs"
            guide=$(get_migration_guide "$artifact_version" "$schema_version")
            ;;
        unknown)
            action="assess"
            priority="medium"
            effort="unknown"
            ;;
        ahead)
            action="none"
            priority="none"
            effort="0"
            ;;
    esac
    
    # Output as YAML fragment
    cat <<EOF
    - file: "$artifact_rel"
      name: "$artifact_name"
      type: "$artifact_type"
      schema: "$schema"
      current_version: "$artifact_version"
      schema_version: "$schema_version"
      status: "$comparison"
      action: "$action"
      priority: "$priority"
      estimated_effort: "$effort"
EOF
    
    if [[ -n "$guide" ]]; then
        echo "      migration_guide: \"$guide\""
    fi
}

# Main execution
log_section "EPF Migration Plan Generator"

CURRENT_EPF=$(get_current_epf_version)
INSTANCE_VERSION=$(get_instance_version)

echo -e "Instance: ${BOLD}$INSTANCE_NAME${NC}"
echo -e "Instance EPF Version: ${CYAN}$INSTANCE_VERSION${NC}"
echo -e "Current EPF Version: ${GREEN}$CURRENT_EPF${NC}"
echo ""

# Start building MIGRATION_PLAN.yaml
log_section "Analyzing Artifacts"

# Collect artifact analysis
declare -a artifact_analyses=()
declare -i total_artifacts=0
declare -i needs_migration=0
declare -i needs_enrichment=0
declare -i current_artifacts=0

# Find and analyze all YAML artifacts
while IFS= read -r -d '' artifact; do
    ((total_artifacts++))
    
    # Skip _meta.yaml and README
    filename=$(basename "$artifact")
    if [[ "$filename" == "_meta.yaml" || "$filename" == "README.md" || "$filename" == "MIGRATION_PLAN.yaml" ]]; then
        continue
    fi
    
    # Analyze artifact
    analysis=$(analyze_artifact "$artifact")
    artifact_analyses+=("$analysis")
    
    # Count by status
    if echo "$analysis" | grep -q 'action: "migrate"'; then
        ((needs_migration++))
    elif echo "$analysis" | grep -q 'action: "enrich"'; then
        ((needs_enrichment++))
    else
        ((current_artifacts++))
    fi
    
    $VERBOSE && echo -e "  Analyzed: $filename"
done < <(find "$INSTANCE_DIR" -name "*.yaml" -type f -print0 2>/dev/null)

# Generate the MIGRATION_PLAN.yaml
log_section "Generating Migration Plan"

cat > "$OUTPUT_FILE" <<EOF
# EPF Migration Plan
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Instance: $INSTANCE_NAME
#
# This plan was auto-generated by generate-migration-plan.sh
# Review and execute migrations according to priority
#
# NOTE: Artifact versions are compared against SCHEMA versions, not framework version.
# Schemas have independent versioning - they only bump when the schema itself changes.
# An artifact at v1.13.0 with a schema at v1.13.0 is CURRENT, even if EPF is v2.9.0.

meta:
  instance: "$INSTANCE_NAME"
  generated_at: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  instance_epf_version: "$INSTANCE_VERSION"
  epf_framework_version: "$CURRENT_EPF"
  generator_version: "1.1.0"
  versioning_note: "Artifacts compared against schema versions, not framework version"

summary:
  total_artifacts: $total_artifacts
  needs_migration: $needs_migration
  needs_enrichment: $needs_enrichment
  current: $current_artifacts
  
  overall_status: "$(
    if [[ $needs_migration -gt 0 ]]; then
      echo "MIGRATION_REQUIRED"
    elif [[ $needs_enrichment -gt 0 ]]; then
      echo "ENRICHMENT_AVAILABLE"
    else
      echo "CURRENT"
    fi
  )"
  
  estimated_total_effort: "$(
    if [[ $needs_migration -gt 0 ]]; then
      echo "$((needs_migration * 2))-$((needs_migration * 3)) hours"
    elif [[ $needs_enrichment -gt 0 ]]; then
      echo "$((needs_enrichment * 1)) hours"
    else
      echo "none"
    fi
  )"

# Migration recommended order:
# 1. HIGH priority (major version behind) - breaking changes
# 2. MEDIUM priority (stale) - significant enrichment available
# 3. LOW priority (behind) - minor enrichment
execution_order:
EOF

# Add high priority first
echo "  high_priority:" >> "$OUTPUT_FILE"
if [[ ${#artifact_analyses[@]} -gt 0 ]]; then
    for analysis in "${artifact_analyses[@]}"; do
        if echo "$analysis" | grep -q 'priority: "high"'; then
            file=$(echo "$analysis" | grep 'file:' | sed 's/.*file: "\([^"]*\)".*/\1/')
            echo "    - \"$file\"" >> "$OUTPUT_FILE"
        fi
    done
fi

# Add medium priority
echo "  medium_priority:" >> "$OUTPUT_FILE"
if [[ ${#artifact_analyses[@]} -gt 0 ]]; then
    for analysis in "${artifact_analyses[@]}"; do
        if echo "$analysis" | grep -q 'priority: "medium"'; then
            file=$(echo "$analysis" | grep 'file:' | sed 's/.*file: "\([^"]*\)".*/\1/')
            echo "    - \"$file\"" >> "$OUTPUT_FILE"
        fi
    done
fi

# Add low priority
echo "  low_priority:" >> "$OUTPUT_FILE"
if [[ ${#artifact_analyses[@]} -gt 0 ]]; then
    for analysis in "${artifact_analyses[@]}"; do
        if echo "$analysis" | grep -q 'priority: "low"'; then
            file=$(echo "$analysis" | grep 'file:' | sed 's/.*file: "\([^"]*\)".*/\1/')
            echo "    - \"$file\"" >> "$OUTPUT_FILE"
        fi
    done
fi

# Add artifact details
echo "" >> "$OUTPUT_FILE"
echo "# Detailed artifact analysis" >> "$OUTPUT_FILE"
echo "artifacts:" >> "$OUTPUT_FILE"

if [[ ${#artifact_analyses[@]} -gt 0 ]]; then
    for analysis in "${artifact_analyses[@]}"; do
        echo "$analysis" >> "$OUTPUT_FILE"
    done
fi

# Add migration instructions for AI agents
cat >> "$OUTPUT_FILE" <<'EOF'

# AI Agent Instructions
# Use these instructions when executing migrations
ai_instructions:
  assess_phase:
    - "Read this MIGRATION_PLAN.yaml completely"
    - "Check migrations/registry.yaml for version-specific changes"
    - "For each artifact with action='migrate', read the migration_guide"
    
  execute_phase:
    description: "Process artifacts one-by-one with validation at each step. FAIL FAST - fix errors before proceeding."
    order: "Process in execution_order (high → medium → low priority)"
    per_artifact_workflow:
      step_1_backup:
        action: "Create backup before any changes"
        command: "cp <file> <file>.backup-$(date +%Y%m%d-%H%M%S)"
        reason: "Enables rollback if migration fails"
        
      step_2_understand:
        action: "Read and understand current artifact"
        read:
          - "Current artifact content"
          - "Target schema: schemas/<schema>.json"
          - "Migration guide if specified in migration_guide field"
          - "registry.yaml for version-specific ai_instructions"
        
      step_3_transform:
        action: "Apply migration transformations"
        rules:
          - "Follow migration guide step-by-step"
          - "Preserve ALL existing content (never delete user data)"
          - "Add new required fields with sensible defaults or [TODO] markers"
          - "Update version comment to target_version"
        
      step_4_validate_schema:
        action: "Validate transformed artifact against schema"
        command: "./scripts/validate-schemas.sh <file>"
        requirement: "MUST pass before proceeding"
        on_failure:
          - "DO NOT proceed to next artifact"
          - "Fix validation errors in current artifact"
          - "Re-run validation until it passes"
          - "If stuck, report specific error to user"
        
      step_5_validate_content:
        action: "Check content quality of migrated artifact"
        command: "./scripts/check-content-readiness.sh <file>"
        requirement: "Should achieve Grade C or better"
        on_failure:
          - "If Grade D or F, review for template patterns"
          - "Replace obvious placeholders (TBD, TODO, Example:)"
          - "Re-run content check"
          - "Report final grade - Grade D acceptable for initial migration"
        
      step_6_report:
        action: "Report artifact migration result"
        report_format:
          - "Artifact: <filename>"
          - "Schema validation: PASS/FAIL"
          - "Content grade: A/B/C/D/F"
          - "Issues fixed: <count>"
          - "Ready for next: YES/NO"
        
    critical_rules:
      - "NEVER skip validation steps"
      - "NEVER proceed if schema validation fails"
      - "FIX errors immediately, not at the end"
      - "Each artifact must pass validation before starting next"
      - "If artifact cannot be fixed, STOP and report to user"
    
  verify_phase:
    description: "MANDATORY - Run these checks after ALL migrations complete"
    steps:
      - step: "Schema Validation"
        command: "./scripts/validate-instance.sh <instance>"
        requirement: "MUST PASS - All artifacts must validate against schemas"
        failure_action: "Fix validation errors before proceeding"
        
      - step: "Version Alignment"
        command: "./scripts/check-version-alignment.sh <instance>"
        requirement: "All artifacts should show CURRENT status"
        failure_action: "Re-migrate artifacts still showing BEHIND/STALE/OUTDATED"
        
      - step: "Content Readiness Assessment"
        command: "./scripts/check-content-readiness.sh <instance>/READY"
        requirement: "Understand post-migration content quality"
        note: |
          Migration ensures structural compliance, but content quality may still
          need attention. This check shows:
          - Template patterns that need real content
          - Placeholder text that should be replaced
          - Strategic depth assessment
          - Recommended enrichment areas
        
      - step: "Field Coverage Analysis"  
        command: "./scripts/analyze-field-coverage.sh <instance>"
        requirement: "Understand what optional enrichment is available"
        note: |
          After basic migration, artifacts may have new optional fields
          that could improve strategic clarity. This shows:
          - Missing CRITICAL fields (should address)
          - Missing HIGH fields (recommended)
          - Missing MEDIUM/LOW fields (nice to have)
        
      - step: "Update Instance Metadata"
        action: "Update _meta.yaml with migration record"
        fields:
          - "epf_version: <new_version>"
          - "last_migrated: <date>"
          - "migration_notes: <summary of changes>"

  post_migration_guidance: |
    After migration completes and passes validation:
    
    1. REQUIRED CHECKS (must pass):
       - Schema validation (validate-instance.sh)
       - Version alignment (all artifacts CURRENT)
    
    2. QUALITY ASSESSMENT (understand status):
       - Content readiness score (aim for Grade B or higher)
       - Field coverage percentage (identify enrichment opportunities)
    
    3. OPTIONAL ENRICHMENT (improve over time):
       - Address template content flagged by content-readiness
       - Add missing HIGH-importance fields
       - Consider MEDIUM fields for strategic clarity
    
    Migration is complete when required checks pass. Content quality
    improvements can be done incrementally based on the assessments.

# Validation Requirements
# These are the minimum requirements for successful migration
validation_requirements:
  mandatory:
    - name: "Schema Compliance"
      script: "validate-instance.sh"
      description: "All YAML files must validate against their JSON schemas"
      exit_code_pass: 0
      
    - name: "Version Alignment"
      script: "check-version-alignment.sh"  
      description: "All migrated artifacts must show CURRENT status"
      acceptable_statuses: ["CURRENT"]
      
  recommended:
    - name: "Content Readiness"
      script: "check-content-readiness.sh"
      description: "Content quality assessment post-migration"
      target_grade: "B"
      minimum_grade: "C"
      note: "Grade D or F indicates significant template content remaining"
      
    - name: "Field Coverage"
      script: "analyze-field-coverage.sh"
      description: "Field completeness analysis"
      target_coverage: "70%"
      critical_fields: "Must all be populated"

# Reference documentation
references:
  migration_guide: "MIGRATIONS.md"
  registry: "migrations/registry.yaml"
  guides_directory: "migrations/guides/"
  validation_scripts:
    - script: "scripts/validate-instance.sh"
      purpose: "Schema compliance and structure validation"
    - script: "scripts/check-version-alignment.sh"
      purpose: "Detect version gaps and migration status"
    - script: "scripts/check-content-readiness.sh"
      purpose: "Content quality and template detection"
    - script: "scripts/analyze-field-coverage.sh"
      purpose: "Field completeness and enrichment guidance"
    - script: "scripts/epf-health-check.sh"
      purpose: "Comprehensive framework and instance health"
EOF

log_section "Summary"

echo -e "Total artifacts analyzed: ${BOLD}$total_artifacts${NC}"
echo -e "  Needs migration (major):  ${RED}$needs_migration${NC}"
echo -e "  Needs enrichment (minor): ${YELLOW}$needs_enrichment${NC}"
echo -e "  Current:                  ${GREEN}$current_artifacts${NC}"
echo ""

if [[ $needs_migration -gt 0 ]]; then
    echo -e "${RED}⚠ MIGRATION REQUIRED${NC}"
    echo -e "  Some artifacts are a major version behind."
    echo -e "  Review migration guides before proceeding."
elif [[ $needs_enrichment -gt 0 ]]; then
    echo -e "${YELLOW}ℹ ENRICHMENT AVAILABLE${NC}"
    echo -e "  New optional fields available for some artifacts."
    echo -e "  Enrichment is optional but recommended."
else
    echo -e "${GREEN}✓ ALL CURRENT${NC}"
    echo -e "  All artifacts are at the current EPF version."
fi

echo ""
log_success "Migration plan generated: $OUTPUT_FILE"

echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo -e "${CYAN}1. Review the plan:${NC}"
echo "   cat $OUTPUT_FILE"
echo ""
echo -e "${CYAN}2. Execute migrations:${NC}"
echo "   Follow ai_instructions in the plan"
echo "   For breaking changes, read: migrations/guides/<guide>.md"
echo ""
echo -e "${CYAN}3. Validate (REQUIRED):${NC}"
echo "   ./scripts/validate-instance.sh $INSTANCE_DIR"
echo "   ./scripts/check-version-alignment.sh $INSTANCE_DIR"
echo ""
echo -e "${CYAN}4. Assess content quality:${NC}"
echo "   ./scripts/check-content-readiness.sh $INSTANCE_DIR/READY"
echo "   ./scripts/analyze-field-coverage.sh $INSTANCE_DIR"
echo ""
echo -e "${GRAY}Note: Migration ensures structural compliance. Content quality${NC}"
echo -e "${GRAY}assessment shows what may still need attention for strategic clarity.${NC}"
