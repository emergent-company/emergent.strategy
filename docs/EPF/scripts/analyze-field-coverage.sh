#!/usr/bin/env bash
# EPF Field Coverage Analyzer
# Version: 1.0.0
# Purpose: Calculate field coverage percentage for EPF YAML artifacts
#          and generate recommendations based on field importance taxonomy.
#
# Usage:
#   ./scripts/analyze-field-coverage.sh _instances/twentyfirst
#   ./scripts/analyze-field-coverage.sh _instances/twentyfirst/READY/05_roadmap_recipe.yaml
#
# Output:
#   - Coverage percentage per artifact
#   - Missing fields categorized by importance (CRITICAL/HIGH/MEDIUM/LOW)
#   - ROI estimates for adding missing fields
#   - Migration recommendations with effort estimates

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_DIR="${SCRIPT_DIR}/../schemas"
TAXONOMY_FILE="${SCHEMA_DIR}/field-importance-taxonomy.json"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Global tracking variables for summary
declare -a CRITICAL_GAPS=()
declare -a HIGH_GAPS=()
declare -a MEDIUM_GAPS=()
declare -a LOW_GAPS=()
TOTAL_ARTIFACTS=0
ARTIFACTS_WITH_CRITICAL_GAPS=0
ARTIFACTS_WITH_HIGH_GAPS=0
ARTIFACTS_WITH_ISSUES=0

# Check dependencies
check_dependencies() {
  local missing_deps=()
  
  command -v yq >/dev/null 2>&1 || missing_deps+=("yq")
  command -v jq >/dev/null 2>&1 || missing_deps+=("jq")
  
  if [ ${#missing_deps[@]} -gt 0 ]; then
    echo "Error: Missing required dependencies: ${missing_deps[*]}"
    echo "Install with: npm install -g yq jq"
    exit 1
  fi
}

# Infer schema file from artifact type
infer_schema_from_artifact() {
  local artifact_file="$1"
  local filename
  filename=$(basename "$artifact_file")
  
  case "$filename" in
    00_north_star*.yaml)
      echo "${SCHEMA_DIR}/north_star_schema.json"
      ;;
    01_insight*.yaml)
      echo "${SCHEMA_DIR}/insight_analyses_schema.json"
      ;;
    02_strategy*.yaml)
      echo "${SCHEMA_DIR}/strategy_foundations_schema.json"
      ;;
    03_*insight*.yaml)
      echo "${SCHEMA_DIR}/insight_opportunity_schema.json"
      ;;
    04_strategy*.yaml)
      echo "${SCHEMA_DIR}/strategy_formula_schema.json"
      ;;
    05_roadmap*.yaml|04_roadmap*.yaml)
      echo "${SCHEMA_DIR}/roadmap_recipe_schema.json"
      ;;
    fd-*.yaml)
      echo "${SCHEMA_DIR}/feature_definition_schema.json"
      ;;
    *.value_model.yaml)
      echo "${SCHEMA_DIR}/value_model_schema.json"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Extract schema basename for taxonomy lookup
get_schema_name() {
  local schema_file="$1"
  basename "$schema_file"
}

# Count total possible fields in a schema for a specific path
count_schema_fields() {
  local schema_file="$1"
  local path="$2" # e.g., "key_results" for roadmap
  
  # For roadmap key_results, count fields in the items.properties
  if [[ "$path" == "key_results" ]]; then
    jq -r '.definitions.track.properties.okrs.items.properties.key_results.items.properties | keys | length' "$schema_file" 2>/dev/null || echo "0"
  else
    # Generic path counting (can be extended)
    echo "0"
  fi
}

# Count present fields in artifact
count_present_fields() {
  local artifact_file="$1"
  local path="$2" # e.g., "key_results"
  
  if [[ "$path" == "key_results" ]]; then
    # Count unique keys across all key results
    yq eval '.roadmap.tracks[].okrs[].key_results[] | keys' "$artifact_file" 2>/dev/null | \
      grep "^- " | sed 's/^- //' | sort -u | wc -l | tr -d ' '
  else
    echo "0"
  fi
}

# Get missing fields by importance
get_missing_fields_by_importance() {
  local artifact_file="$1"
  local schema_name="$2"
  local importance="$3" # critical, high, medium, low
  local path="${4:-key_results}"
  
  # Load taxonomy for this schema and importance level
  local fields
  fields=$(jq -r ".[\"${schema_name}\"][\"${path}\"][\"${importance}\"].fields[]?" "$TAXONOMY_FILE" 2>/dev/null || echo "")
  
  if [ -z "$fields" ]; then
    return
  fi
  
  # Check which fields are missing
  local missing=()
  while IFS= read -r field; do
    # Check if field exists anywhere in artifact's key results
    local yq_output
    yq_output=$(yq eval ".roadmap.tracks[].okrs[].key_results[] | select(has(\"$field\"))" "$artifact_file" 2>/dev/null)
    if ! echo "$yq_output" | grep -q "$field"; then
      missing+=("$field")
    fi
  done <<< "$fields"
  
  # Return comma-separated list
  if [ ${#missing[@]} -gt 0 ]; then
    printf '%s\n' "${missing[@]}"
  fi
}

# Get taxonomy metadata for importance level
get_taxonomy_metadata() {
  local schema_name="$1"
  local importance="$2"
  local path="${3:-key_results}"
  local field="$4" # reason, value, effort_hours
  
  jq -r ".[\"${schema_name}\"][\"${path}\"][\"${importance}\"][\"${field}\"]" "$TAXONOMY_FILE" 2>/dev/null || echo "N/A"
}

# Analyze single artifact
analyze_artifact() {
  local artifact_file="$1"
  local schema_file
  schema_file=$(infer_schema_from_artifact "$artifact_file")
  
  if [ -z "$schema_file" ] || [ ! -f "$schema_file" ]; then
    echo -e "${YELLOW}⚠️  Skipping $(basename "$artifact_file") - no matching schema${NC}"
    return
  fi
  
  local schema_name
  schema_name=$(get_schema_name "$schema_file")
  
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}Coverage Analysis: $(basename "$artifact_file")${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  # For roadmap, analyze key_results specifically
  if [[ "$schema_name" == "roadmap_recipe_schema.json" ]]; then
    analyze_roadmap_coverage "$artifact_file" "$schema_file" "$schema_name"
  elif [[ "$schema_name" == "feature_definition_schema.json" ]]; then
    analyze_feature_definition_coverage "$artifact_file" "$schema_file" "$schema_name"
  else
    analyze_generic_coverage "$artifact_file" "$schema_file" "$schema_name"
  fi
}

# Specialized analysis for roadmap recipes (key_results)
analyze_roadmap_coverage() {
  local artifact_file="$1"
  local schema_file="$2"
  local schema_name="$3"
  
  echo "Schema: ${schema_name}"
  
  # Get version info
  local artifact_version
  artifact_version=$(yq eval '.roadmap.template_version' "$artifact_file" 2>/dev/null || echo "N/A")
  echo "Artifact internal version: v${artifact_version}"
  
  # Count total and present fields per Key Result
  local total_fields
  local present_fields
  total_fields=$(count_schema_fields "$schema_file" "key_results")
  present_fields=$(count_present_fields "$artifact_file" "key_results")
  
  if [ "$total_fields" -eq 0 ]; then
    echo -e "${YELLOW}Could not determine field count${NC}"
    return
  fi
  
  local coverage_pct=$((present_fields * 100 / total_fields))
  
  echo ""
  echo -e "${BOLD}Overall Coverage:${NC} ${coverage_pct}% (${present_fields}/${total_fields} fields per Key Result)"
  
  # Analyze missing fields by importance
  echo ""
  echo -e "${BOLD}Field Categories:${NC}"
  
  # CRITICAL fields
  local missing_critical
  missing_critical=$(get_missing_fields_by_importance "$artifact_file" "$schema_name" "critical" "key_results")
  local critical_count
  critical_count=$(echo "$missing_critical" | grep -c "^" || echo "0")
  
  if [ -n "$missing_critical" ] && [ "$critical_count" -gt 0 ]; then
    echo ""
    echo -e "  ${RED}${BOLD}CRITICAL${NC} (Learning & Innovation Maturity): ${RED}0/${critical_count} fields (0%) ⚠️${NC}"
    echo "    Missing:"
    echo "$missing_critical" | while read -r field; do
      echo "      - $field"
    done
    
    local reason
    local value
    local effort
    reason=$(get_taxonomy_metadata "$schema_name" "critical" "key_results" "reason")
    value=$(get_taxonomy_metadata "$schema_name" "critical" "key_results" "value")
    effort=$(get_taxonomy_metadata "$schema_name" "critical" "key_results" "effort_hours")
    
    echo "    Reason: $reason"
    echo "    Value: $value"
    echo "    Effort: $effort"
    
    # Track for summary
    CRITICAL_GAPS+=("$(basename "$artifact_file"): Missing TRL fields (innovation maturity tracking)")
    ((ARTIFACTS_WITH_CRITICAL_GAPS++))
  else
    echo ""
    echo -e "  ${GREEN}CRITICAL:${NC} ✅ All critical fields present"
  fi
  
  # HIGH fields
  local missing_high
  missing_high=$(get_missing_fields_by_importance "$artifact_file" "$schema_name" "high" "key_results")
  local high_count
  high_count=$(echo "$missing_high" | grep -c "^" || echo "0")
  
  if [ -n "$missing_high" ] && [ "$high_count" -gt 0 ]; then
    echo ""
    echo -e "  ${YELLOW}${BOLD}HIGH${NC} (Hypothesis Testing): ${YELLOW}0/${high_count} fields (0%) ⚠️${NC}"
    echo "    Missing:"
    echo "$missing_high" | while read -r field; do
      echo "      - $field"
    done
    
    local reason
    local value
    local effort
    reason=$(get_taxonomy_metadata "$schema_name" "high" "key_results" "reason")
    value=$(get_taxonomy_metadata "$schema_name" "high" "key_results" "value")
    effort=$(get_taxonomy_metadata "$schema_name" "high" "key_results" "effort_hours")
    
    echo "    Reason: $reason"
    echo "    Value: $value"
    echo "    Effort: $effort"
    
    # Track for summary
    HIGH_GAPS+=("$(basename "$artifact_file"): Missing hypothesis testing fields (learning focus)")
    ((ARTIFACTS_WITH_HIGH_GAPS++))
  else
    echo ""
    echo -e "  ${GREEN}HIGH:${NC} ✅ All high-priority fields present"
  fi
  
  # MEDIUM fields
  local missing_medium
  missing_medium=$(get_missing_fields_by_importance "$artifact_file" "$schema_name" "medium" "key_results")
  local medium_count
  medium_count=$(echo "$missing_medium" | grep -c "^" || echo "0")
  
  if [ -n "$missing_medium" ] && [ "$medium_count" -gt 0 ]; then
    echo ""
    echo -e "  ${BLUE}MEDIUM${NC} (Hypothesis Testing): 0/${medium_count} fields (0%)"
    echo "    Missing:"
    echo "$missing_medium" | while read -r field; do
      echo "      - $field"
    done
    
    local reason
    local value
    reason=$(get_taxonomy_metadata "$schema_name" "medium" "key_results" "reason")
    value=$(get_taxonomy_metadata "$schema_name" "medium" "key_results" "value")
    
    echo "    Reason: $reason"
    echo "    Value: $value"
  fi
  
  # Generate recommendation
  echo ""
  echo -e "${BOLD}Recommendation:${NC}"
  if [ "$coverage_pct" -lt 50 ]; then
    echo -e "  ${RED}⚠️  LOW COVERAGE - Strongly recommend enrichment${NC}"
    if [ -n "$missing_critical" ] && [ "$critical_count" -gt 0 ]; then
      echo -e "  ${RED}PRIORITY: Add TRL fields to track innovation maturity and learning progression${NC}"
    fi
  elif [ "$coverage_pct" -lt 75 ]; then
    echo -e "  ${YELLOW}⚠️  MODERATE COVERAGE - Consider enrichment${NC}"
    if [ -n "$missing_critical" ] && [ "$critical_count" -gt 0 ]; then
      echo -e "  ${YELLOW}PRIORITY: Add TRL fields for innovation maturity tracking${NC}"
    fi
  else
    echo -e "  ${GREEN}✅ GOOD COVERAGE${NC}"
  fi
  
  # Migration guidance
  if [ -n "$missing_critical" ] || [ -n "$missing_high" ]; then
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Review taxonomy: cat ${TAXONOMY_FILE}"
    echo "  2. Run migration wizard: ./scripts/migrate-artifact.sh --artifact $(basename "$artifact_file") --wizard guided"
    echo "  3. Focus on TRL fields for innovation work (not all work qualifies)"
  fi
}

# Analyze feature definition coverage (personas narrative quality)
analyze_feature_definition_coverage() {
  local artifact_file="$1"
  local schema_file="$2"
  local schema_name="$3"
  
  echo "Schema: ${schema_name}"
  
  # Check for personas field (v2.0 schema) - check both root and definition.personas
  local persona_count
  local personas_at_root
  local personas_at_definition
  personas_at_root=$(yq eval '.personas | length' "$artifact_file" 2>/dev/null || echo "0")
  personas_at_definition=$(yq eval '.definition.personas | length' "$artifact_file" 2>/dev/null || echo "0")
  # Use whichever location has personas
  persona_count=$((personas_at_root > personas_at_definition ? personas_at_root : personas_at_definition))
  
  # Check for contexts field under implementation (older structure)
  local context_count
  context_count=$(yq eval '.implementation.contexts | length' "$artifact_file" 2>/dev/null || echo "0")
  
  echo ""
  
  if [ "$persona_count" -gt 0 ]; then
    # Has personas - check v2.0 requirements
    echo -e "${BOLD}Persona Analysis (v2.0 Schema):${NC}"
    echo "  Persona count: ${persona_count} (schema requires exactly 4)"
    
    if [ "$persona_count" -ne 4 ]; then
      echo -e "  ${RED}⚠️  Schema violation: Feature definitions must have exactly 4 personas${NC}"
    fi
    
    # Analyze persona narrative depth (each should have 200+ chars)
    local personas_with_deep_narratives=0
    local min_narrative_length=200
    
    # Determine which path to use for personas
    local persona_path
    if [ "$personas_at_definition" -gt 0 ]; then
      persona_path=".definition.personas"
    else
      persona_path=".personas"
    fi
    
    for i in $(seq 0 $((persona_count - 1))); do
      local current_sit
      local transform
      local emotional
      
      current_sit=$(yq eval "${persona_path}[${i}].current_situation // \"\"" "$artifact_file" 2>/dev/null)
      transform=$(yq eval "${persona_path}[${i}].transformation_moment // \"\"" "$artifact_file" 2>/dev/null)
      emotional=$(yq eval "${persona_path}[${i}].emotional_resolution // \"\"" "$artifact_file" 2>/dev/null)
      
      local current_len=${#current_sit}
      local transform_len=${#transform}
      local emotional_len=${#emotional}
      
      if [ "$current_len" -ge "$min_narrative_length" ] && \
         [ "$transform_len" -ge "$min_narrative_length" ] && \
         [ "$emotional_len" -ge "$min_narrative_length" ]; then
        ((personas_with_deep_narratives++))
      fi
    done
    
    local narrative_coverage_pct=0
    if [ "$persona_count" -gt 0 ]; then
      narrative_coverage_pct=$((personas_with_deep_narratives * 100 / persona_count))
    fi
    
    echo ""
    echo -e "${BOLD}Narrative Depth:${NC} ${narrative_coverage_pct}% (${personas_with_deep_narratives}/${persona_count} personas with 200+ char narratives)"
    
    if [ "$narrative_coverage_pct" -lt 100 ]; then
      echo ""
      echo -e "  ${YELLOW}${BOLD}HIGH${NC} (Persona Enrichment):"
      echo "    Missing deep narratives (200+ chars each for current_situation, transformation_moment, emotional_resolution)"
      echo "    Reason: EPF v2.0 requirement for empathy-driven design"
      echo "    Value: Better product-market fit, clearer UX personalization"
      echo "    Effort: 2-3 hours per feature"
      
      # Track for summary
      HIGH_GAPS+=("$(basename "$artifact_file"): Shallow persona narratives (<200 chars)")
      ((ARTIFACTS_WITH_HIGH_GAPS++))
    else
      echo ""
      echo -e "  ${GREEN}✅ All personas have deep narratives${NC}"
    fi
    
    # Overall recommendation
    echo ""
    echo -e "${BOLD}Recommendation:${NC}"
    if [ "$persona_count" -ne 4 ]; then
      echo -e "  ${RED}⚠️  CRITICAL: Adjust persona count to exactly 4 (schema requirement)${NC}"
    elif [ "$narrative_coverage_pct" -lt 75 ]; then
      echo -e "  ${YELLOW}⚠️  ENRICH: Add deep persona narratives (200+ chars per field)${NC}"
      echo ""
      echo -e "${BOLD}Next Steps:${NC}"
      echo "  1. Run: ./docs/EPF/wizards/feature_enrichment.wizard.md"
      echo "  2. Focus on current_situation, transformation_moment, emotional_resolution"
    else
      echo -e "  ${GREEN}✅ GOOD: Personas meet v2.0 requirements${NC}"
    fi
    
  elif [ "$context_count" -gt 0 ]; then
    # Has contexts - older structure (pre-v2.0)
    echo -e "${BOLD}Structure Analysis:${NC}"
    echo "  Using 'contexts' field (older structure)"
    echo "  Context count: ${context_count}"
    echo ""
    echo -e "  ${YELLOW}${BOLD}CRITICAL${NC} (Schema Upgrade Needed):"
    echo "    Feature uses 'contexts' but v2.0 schema requires 'personas'"
    echo "    Contexts are UI/interaction contexts, not user personas with narratives"
    echo "    Reason: EPF v2.0 requires exactly 4 persona profiles with deep narratives"
    echo "    Value: Empathy-driven design, better product-market fit"
    echo "    Effort: 3-4 hours per feature (requires user research)"
    echo ""
    echo -e "${BOLD}Recommendation:${NC}"
    echo -e "  ${RED}⚠️  UPGRADE: Migrate from 'contexts' to 'personas' structure${NC}"
    echo "  This feature needs schema v2.0 upgrade to add persona narratives"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Keep existing 'contexts' (they become UI contexts in v2.0)"
    echo "  2. Add 'personas' section with 4 user profiles"
    echo "  3. Run: ./docs/EPF/wizards/feature_v2_upgrade.wizard.md"
    
    # Track as critical gap since it's a schema version issue
    CRITICAL_GAPS+=("$(basename "$artifact_file"): Missing v2.0 personas structure")
    ((ARTIFACTS_WITH_CRITICAL_GAPS++))
    
  else
    # No personas or contexts
    echo -e "  ${RED}⚠️  No personas or contexts found${NC}"
    echo -e "  ${RED}CRITICAL: Feature definition missing required persona section${NC}"
    
    CRITICAL_GAPS+=("$(basename "$artifact_file"): Missing persona/context section entirely")
    ((ARTIFACTS_WITH_CRITICAL_GAPS++))
  fi
}

# Generic coverage analysis for simpler artifacts (north star, strategy, etc.)
analyze_generic_coverage() {
  local artifact_file="$1"
  local schema_file="$2"
  local schema_name="$3"
  
  echo "Schema: ${schema_name}"
  
  # Get version info if available
  local artifact_version
  artifact_version=$(yq eval '.meta.epf_version // "N/A"' "$artifact_file" 2>/dev/null)
  if [ "$artifact_version" != "N/A" ]; then
    echo "Artifact EPF version: v${artifact_version}"
  fi
  
  # For most artifacts, just check if epf_version is current
  local current_version="2.3.2"
  
  echo ""
  echo -e "${BOLD}Version Status:${NC}"
  if [ "$artifact_version" == "$current_version" ]; then
    echo -e "  ${GREEN}✅ Up to date (v${current_version})${NC}"
  elif [ "$artifact_version" == "N/A" ]; then
    echo -e "  ${YELLOW}⚠️  No epf_version field in meta${NC}"
    echo ""
    echo -e "  ${BLUE}LOW${NC} (Metadata Update):"
    echo "    Reason: Version tracking (cosmetic only)"
    echo "    Value: Consistency, easier troubleshooting"
    echo "    Effort: 1 minute"
  else
    echo -e "  ${YELLOW}⚠️  Using v${artifact_version}, current is v${current_version}${NC}"
    echo ""
    echo -e "  ${BLUE}LOW${NC} (Version Update):"
    echo "    Reason: Keep metadata current with framework"
    echo "    Value: Consistency"
    echo "    Effort: 1 minute"
  fi
  
  echo ""
  echo -e "${BOLD}Recommendation:${NC}"
  if [ "$artifact_version" != "$current_version" ] && [ "$artifact_version" != "N/A" ]; then
    echo -e "  ${BLUE}UPDATE: Run ./scripts/update-artifact-versions.sh --version ${current_version}${NC}"
  else
    echo -e "  ${GREEN}✅ No action needed${NC}"
  fi
}

# Main execution
main() {
  check_dependencies
  
  if [ $# -eq 0 ]; then
    echo "Usage: $0 <instance_path_or_artifact_file>"
    echo ""
    echo "Examples:"
    echo "  $0 _instances/twentyfirst"
    echo "  $0 _instances/twentyfirst/READY/05_roadmap_recipe.yaml"
    exit 1
  fi
  
  local target="$1"
  
  if [ ! -f "$TAXONOMY_FILE" ]; then
    echo -e "${RED}Error: Taxonomy file not found: ${TAXONOMY_FILE}${NC}"
    echo "Ensure field-importance-taxonomy.json exists in schemas/"
    exit 1
  fi
  
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}         EPF Field Coverage Analyzer v1.0.0                   ${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  
  if [ -f "$target" ]; then
    # Single artifact
    analyze_artifact "$target"
  elif [ -d "$target" ]; then
    # Directory - analyze all YAML files
    local yaml_files
    yaml_files=$(find "$target" -name "*.yaml" -type f 2>/dev/null)
    
    if [ -z "$yaml_files" ]; then
      echo -e "${YELLOW}No YAML files found in ${target}${NC}"
      exit 1
    fi
    
    local total_analyzed=0
    while IFS= read -r yaml_file; do
      ((TOTAL_ARTIFACTS++))
      analyze_artifact "$yaml_file"
      ((total_analyzed++))
    done <<< "$yaml_files"
    
    # Generate comprehensive summary
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}                    INSTANCE HEALTH SUMMARY                    ${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BOLD}Artifacts Analyzed:${NC} ${total_analyzed}"
    echo ""
    
    # Priority 1: CRITICAL Gaps (Learning & Innovation Maturity)
    if [ ${#CRITICAL_GAPS[@]} -gt 0 ]; then
      echo -e "${RED}${BOLD}🚨 PRIORITY 1: CRITICAL LEARNING OPPORTUNITIES${NC}"
      echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
      echo ""
      echo -e "${BOLD}Issue:${NC} Missing TRL fields for innovation maturity tracking"
      echo -e "${BOLD}Impact:${NC} Cannot track learning progression or identify technical risks early"
      echo -e "${BOLD}EPF Focus:${NC} Strategic WHY/HOW (learning journey), not execution WHAT"
      echo -e "${BOLD}Affected:${NC} ${#CRITICAL_GAPS[@]} artifact(s)"
      echo ""
      for gap in "${CRITICAL_GAPS[@]}"; do
        echo "  • $gap"
      done
      echo ""
      echo -e "${BOLD}Recommended Action:${NC}"
      echo "  1. Identify Key Results involving genuine innovation (technical uncertainty)"
      echo "  2. Add TRL fields to track maturity: trl_start, trl_target, trl_progression, technical_hypothesis"
      echo "  3. Focus on learning journey (TRL 1-3: concept, TRL 4-6: validation, TRL 7-9: deployment)"
      echo "  4. Estimated effort: 2-3 hours"
      echo "  5. Value: Track innovation maturity, identify knowledge gaps, guide learning strategy"
      echo ""
      echo -e "${BOLD}Note:${NC} TRL fields are about LEARNING (strategic WHY/HOW), not budgets/funding (execution WHAT)"
      echo ""
    fi
    
    # Priority 2: HIGH Value Gaps
    if [ ${#HIGH_GAPS[@]} -gt 0 ]; then
      echo -e "${YELLOW}${BOLD}⚠️  PRIORITY 2: HIGH VALUE ENHANCEMENTS${NC}"
      echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
      echo ""
      echo -e "${BOLD}Opportunities:${NC}"
      for gap in "${HIGH_GAPS[@]}"; do
        echo "  • $gap"
      done
      echo ""
      echo -e "${BOLD}Value:${NC}"
      echo "  • Hypothesis-driven development (learning-focused vs output-focused)"
      echo "  • Evidence-based pivots (reduces sunk cost fallacy)"
      echo "  • Deeper customer empathy for product-market fit"
      echo ""
      echo -e "${BOLD}Estimated Effort:${NC} 2-3 hours per artifact"
      echo ""
    fi
    
    # Overall Health Score
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}                    OVERALL HEALTH SCORE                       ${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    local health_score=100
    local grade="A"
    local grade_color="${GREEN}"
    
    # Deduct points for gaps
    if [ ${#CRITICAL_GAPS[@]} -gt 0 ]; then
      health_score=$((health_score - 30))
      grade="C"
      grade_color="${YELLOW}"
    fi
    
    if [ ${#HIGH_GAPS[@]} -gt 0 ]; then
      health_score=$((health_score - 15))
      if [ "$grade" == "A" ]; then
        grade="B"
        grade_color="${GREEN}"
      fi
    fi
    
    echo -e "${BOLD}Health Score:${NC} ${grade_color}${health_score}/100 (Grade: ${grade})${NC}"
    echo ""
    
    if [ "$health_score" -ge 90 ]; then
      echo -e "${GREEN}✅ EXCELLENT${NC} - Instance is well-maintained with comprehensive coverage"
      echo "   All critical fields present, optional enrichments at maintainer's discretion."
    elif [ "$health_score" -ge 75 ]; then
      echo -e "${GREEN}✅ GOOD${NC} - Instance is functional with some optimization opportunities"
      echo "   Consider adding high-value optional fields for enhanced capabilities."
    elif [ "$health_score" -ge 60 ]; then
      echo -e "${YELLOW}⚠️  MODERATE${NC} - Instance has significant gaps worth addressing"
      echo "   Recommended: Focus on HIGH priority gaps first for best ROI."
    else
      echo -e "${RED}🚨 NEEDS ATTENTION${NC} - Instance missing critical high-value fields"
      echo "   URGENT: Address CRITICAL gaps to unlock major funding opportunities."
    fi
    
    echo ""
    echo -e "${BOLD}Next Steps (Prioritized by Strategic Value):${NC}"
    if [ ${#CRITICAL_GAPS[@]} -gt 0 ]; then
      echo "  1. Add TRL fields to roadmap for innovation maturity tracking (2-3h)"
    fi
    if [ ${#HIGH_GAPS[@]} -gt 0 ]; then
      echo "  2. Add hypothesis testing fields for learning-focused development (2-3h per artifact)"
      echo "  3. Enrich personas with deep narratives (3-4h per feature)"
    fi
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  else
    echo -e "${RED}Error: ${target} is neither a file nor directory${NC}"
    exit 1
  fi
}

main "$@"
