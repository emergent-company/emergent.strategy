#!/usr/bin/env bash
#
# check-version-alignment.sh - EPF Version Alignment Checker
# Part of Enhanced Health Check System - Phase 2
#
# Purpose: Detect when artifacts lag behind schema evolution
# Output: Version gap analysis with migration recommendations
#
# Usage:
#   ./scripts/check-version-alignment.sh <instance_dir>
#   ./scripts/check-version-alignment.sh _instances/twentyfirst

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMAS_DIR="$EPF_ROOT/schemas"

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Summary counters
declare -i total_artifacts=0
declare -i artifacts_with_versions=0
declare -i current_artifacts=0
declare -i stale_artifacts=0
declare -i outdated_artifacts=0

# Extract version from schema JSON file
extract_schema_version() {
  local schema_file="$1"
  if [[ ! -f "$schema_file" ]]; then
    echo "unknown"
    return
  fi
  
  # Extract version field from JSON (handle both jq and grep fallback)
  if command -v jq &> /dev/null; then
    jq -r '.version // "unknown"' "$schema_file" 2>/dev/null || echo "unknown"
  else
    grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$schema_file" | head -1 | sed 's/.*"\([^"]*\)".*/\1/' || echo "unknown"
  fi
}

# Extract version from artifact YAML (from header comment or meta block)
extract_artifact_version() {
  local artifact_file="$1"
  if [[ ! -f "$artifact_file" ]]; then
    echo "unknown"
    return
  fi
  
  # Try header comment first: # EPF v1.9.6
  local header_version=$(grep -m1 "^# EPF v[0-9]" "$artifact_file" | sed 's/.*EPF v\([0-9.]*\).*/\1/' || echo "")
  if [[ -n "$header_version" ]]; then
    echo "$header_version"
    return
  fi
  
  # Try meta block: epf_version: "1.9.6"
  if command -v yq &> /dev/null; then
    local meta_version=$(yq eval '.meta.epf_version // .epf_version // "unknown"' "$artifact_file" 2>/dev/null)
    if [[ "$meta_version" != "unknown" && "$meta_version" != "null" ]]; then
      echo "$meta_version"
      return
    fi
  fi
  
  echo "unknown"
}

# Compare semantic versions (returns 0 if v1 < v2, 1 if v1 >= v2)
version_less_than() {
  local v1="$1"
  local v2="$2"
  
  # Handle unknown versions
  if [[ "$v1" == "unknown" || "$v2" == "unknown" ]]; then
    return 1
  fi
  
  # Simple lexical comparison works for semantic versions
  if [[ "$v1" == "$v2" ]]; then
    return 1  # Equal, not less than
  fi
  
  # Split versions and compare
  IFS='.' read -ra V1 <<< "$v1"
  IFS='.' read -ra V2 <<< "$v2"
  
  for i in 0 1 2; do
    local num1=${V1[$i]:-0}
    local num2=${V2[$i]:-0}
    
    if (( num1 < num2 )); then
      return 0  # v1 < v2
    elif (( num1 > num2 )); then
      return 1  # v1 > v2
    fi
  done
  
  return 1  # Equal
}

# Calculate version gap severity
calculate_gap_severity() {
  local artifact_version="$1"
  local schema_version="$2"
  
  if [[ "$artifact_version" == "unknown" || "$schema_version" == "unknown" ]]; then
    echo "UNKNOWN"
    return
  fi
  
  if [[ "$artifact_version" == "$schema_version" ]]; then
    echo "CURRENT"
    return
  fi
  
  # Parse versions
  IFS='.' read -ra V1 <<< "$artifact_version"
  IFS='.' read -ra V2 <<< "$schema_version"
  
  local major1=${V1[0]:-0}
  local minor1=${V1[1]:-0}
  local major2=${V2[0]:-0}
  local minor2=${V2[1]:-0}
  
  # Major version difference
  if (( major2 > major1 )); then
    echo "OUTDATED"
    return
  fi
  
  # Minor version difference
  local minor_diff=$((minor2 - minor1))
  if (( minor_diff >= 3 )); then
    echo "STALE"
  elif (( minor_diff > 0 )); then
    echo "BEHIND"
  else
    echo "CURRENT"
  fi
}

# Get schema file for artifact
get_schema_for_artifact() {
  local artifact_file="$1"
  local basename=$(basename "$artifact_file")
  
  case "$basename" in
    00_north_star.yaml)
      echo "$SCHEMAS_DIR/north_star_schema.json"
      ;;
    01_insight_analyses.yaml)
      echo "$SCHEMAS_DIR/insight_opportunity_schema.json"
      ;;
    02_strategy_foundations.yaml)
      echo "$SCHEMAS_DIR/calibration_memo_schema.json"
      ;;
    03_insight_opportunity.yaml)
      echo "$SCHEMAS_DIR/insight_opportunity_schema.json"
      ;;
    04_strategy_formula.yaml)
      echo "$SCHEMAS_DIR/strategy_formula_schema.json"
      ;;
    05_roadmap_recipe.yaml)
      echo "$SCHEMAS_DIR/roadmap_recipe_schema.json"
      ;;
    fd-*.yaml)
      echo "$SCHEMAS_DIR/feature_definition_schema.json"
      ;;
    *.value_model.yaml)
      echo "$SCHEMAS_DIR/value_model_schema.json"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Analyze single artifact
analyze_artifact() {
  local artifact_file="$1"
  local instance_name="$2"
  
  ((total_artifacts++))
  
  local basename=$(basename "$artifact_file")
  local schema_file=$(get_schema_for_artifact "$artifact_file")
  
  if [[ -z "$schema_file" || ! -f "$schema_file" ]]; then
    return
  fi
  
  local artifact_version=$(extract_artifact_version "$artifact_file")
  local schema_version=$(extract_schema_version "$schema_file")
  local severity=$(calculate_gap_severity "$artifact_version" "$schema_version")
  
  # Update counters
  case "$severity" in
    CURRENT)
      ((artifacts_with_versions++))
      ((current_artifacts++))
      return  # Don't report current artifacts
      ;;
    BEHIND)
      ((artifacts_with_versions++))
      ((current_artifacts++))  # Count as current (minor gap acceptable)
      return  # Don't report minor gaps
      ;;
    STALE)
      ((artifacts_with_versions++))
      ((stale_artifacts++))
      ;;
    OUTDATED)
      ((artifacts_with_versions++))
      ((outdated_artifacts++))
      ;;
    UNKNOWN)
      return  # Don't report or count unknown versions
      ;;
  esac
  
  # Report version gap
  echo -e "\n${BOLD}Artifact:${NC} $basename"
  echo -e "  ${GRAY}Path:${NC} $artifact_file"
  echo -e "  ${GRAY}Artifact version:${NC} $artifact_version"
  echo -e "  ${GRAY}Schema version:${NC} $schema_version"
  
  if [[ "$severity" == "OUTDATED" ]]; then
    echo -e "  ${RED}${BOLD}Status: ⚠️  OUTDATED${NC} (major version behind)"
    echo -e "  ${YELLOW}Action: MIGRATE (breaking changes may exist)${NC}"
  elif [[ "$severity" == "STALE" ]]; then
    echo -e "  ${YELLOW}${BOLD}Status: ⚠️  STALE${NC} (3+ minor versions behind)"
    echo -e "  ${YELLOW}Action: ENRICH (new fields available)${NC}"
  fi
  
  # Provide specific recommendations for known artifacts
  case "$basename" in
    05_roadmap_recipe.yaml)
      if version_less_than "$artifact_version" "2.0.0" && ! version_less_than "$schema_version" "2.0.0"; then
        echo -e "\n  ${BLUE}High-Value Fields Added:${NC}"
        echo -e "    ${GRAY}• TRL fields (trl_start, trl_target, trl_progression)${NC}"
        echo -e "      ${GRAY}Purpose: Track innovation maturity and learning progression${NC}"
        echo -e "      ${GRAY}Value: Strategic clarity on innovation vs execution${NC}"
      fi
      ;;
    fd-*.yaml)
      if version_less_than "$artifact_version" "2.0.0" && ! version_less_than "$schema_version" "2.0.0"; then
        echo -e "\n  ${BLUE}Breaking Change:${NC}"
        echo -e "    ${GRAY}• 'contexts' renamed to 'personas' (v2.0.0)${NC}"
        echo -e "      ${GRAY}Action: Rename field in artifact${NC}"
      fi
      ;;
  esac
  
  echo -e "  ${GRAY}Estimated effort: 2-6 hours (enrichment)${NC}"
}

# Main analysis function
analyze_instance() {
  local instance_dir="$1"
  
  if [[ ! -d "$instance_dir" ]]; then
    echo -e "${RED}Error: Instance directory not found: $instance_dir${NC}"
    exit 1
  fi
  
  local instance_name=$(basename "$instance_dir")
  
  echo -e "${BOLD}${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${BLUE}║     EPF Version Alignment Check - $instance_name${NC}"
  echo -e "${BOLD}${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
  
  echo -e "\n${BOLD}━━━ Scanning Artifacts ━━━${NC}"
  
  # Analyze READY phase
  if [[ -d "$instance_dir/READY" ]]; then
    for artifact in "$instance_dir/READY"/*.yaml; do
      [[ -f "$artifact" ]] && analyze_artifact "$artifact" "$instance_name"
    done
  fi
  
  # Analyze FIRE phase
  if [[ -d "$instance_dir/FIRE" ]]; then
    # Value models
    if [[ -d "$instance_dir/FIRE/value_models" ]]; then
      for artifact in "$instance_dir/FIRE/value_models"/*.yaml; do
        [[ -f "$artifact" ]] && analyze_artifact "$artifact" "$instance_name"
      done
    fi
    
    # Feature definitions
    if [[ -d "$instance_dir/FIRE/feature_definitions" ]]; then
      for artifact in "$instance_dir/FIRE/feature_definitions"/*.yaml; do
        [[ -f "$artifact" ]] && analyze_artifact "$artifact" "$instance_name"
      done
    fi
  fi
  
  # Summary
  echo -e "\n${BOLD}━━━ Summary ━━━${NC}"
  echo -e "Total artifacts analyzed: $total_artifacts"
  echo -e "Artifacts with version info: $artifacts_with_versions"
  echo -e "${GREEN}✓ Current:${NC} $current_artifacts artifacts"
  
  if (( stale_artifacts > 0 )); then
    echo -e "${YELLOW}⚠ Stale:${NC} $stale_artifacts artifacts (3+ versions behind)"
  fi
  
  if (( outdated_artifacts > 0 )); then
    echo -e "${RED}⚠ Outdated:${NC} $outdated_artifacts artifacts (major version behind)"
  fi
  
  # Overall assessment
  echo -e "\n${BOLD}━━━ Overall Assessment ━━━${NC}"
  
  if (( artifacts_with_versions == 0 )); then
    echo -e "${GRAY}No version information found in artifacts.${NC}"
    echo -e "Add version headers (# EPF v1.13.0) to track alignment."
    return
  fi
  
  local alignment_percentage=$(( (current_artifacts * 100) / artifacts_with_versions ))
  
  if (( alignment_percentage >= 90 )); then
    echo -e "${GREEN}${BOLD}Status: ✅ EXCELLENT${NC} ($alignment_percentage% current)"
    echo -e "All artifacts are well-maintained and up-to-date."
  elif (( alignment_percentage >= 70 )); then
    echo -e "${YELLOW}${BOLD}Status: ⚠️  GOOD${NC} ($alignment_percentage% current)"
    echo -e "Most artifacts current, some enrichment opportunities exist."
  elif (( alignment_percentage >= 50 )); then
    echo -e "${YELLOW}${BOLD}Status: ⚠️  MODERATE${NC} ($alignment_percentage% current)"
    echo -e "Recommendation: Review and enrich stale artifacts."
  else
    echo -e "${RED}${BOLD}Status: ⚠️  POOR${NC} ($alignment_percentage% current)"
    echo -e "Recommendation: Significant migration work needed."
  fi
  
  if (( stale_artifacts + outdated_artifacts > 0 )); then
    echo -e "\n${BOLD}Next Steps:${NC}"
    echo -e "  1. Review artifacts marked STALE or OUTDATED above"
    echo -e "  2. Add high-value fields (TRL for innovation tracking)"
    echo -e "  3. Update artifact version headers after enrichment"
    echo -e "  4. Re-run this check to verify improvements"
  fi
}

# Entry point
main() {
  if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <instance_dir>"
    echo "Example: $0 _instances/twentyfirst"
    exit 1
  fi
  
  analyze_instance "$1"
}

main "$@"
