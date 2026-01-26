#!/usr/bin/env bash
# EPF Content Readiness Checker (Tier 4 Validation)
# Version: 1.0.0
# Purpose: Detect template content and assess strategic depth of EPF artifacts
#          Goes beyond schema validation to check content quality
#
# Usage:
#   ./scripts/check-content-readiness.sh _instances/twentyfirst
#   ./scripts/check-content-readiness.sh _instances/twentyfirst/READY/01_insight_analyses.yaml
#   ./scripts/check-content-readiness.sh --ai-assess _instances/twentyfirst/READY/01_insight_analyses.yaml
#
# Output:
#   - Content readiness score (0-100)
#   - Template pattern detection
#   - Optional: AI-assessed strategic depth rating
#   - Enrichment recommendations with wizard links

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# AI assessment flag
AI_ASSESS=false

# Template patterns that indicate placeholder content
# Using format: pattern_name=pattern
#
# IMPORTANT: These patterns are designed to AVOID false positives:
# - Patterns match placeholder MARKERS, not product names (e.g., "Template Pack" is a product)
# - Negation contexts are filtered ("0 TBD markers" describes goals, not placeholders)
# - Past-tense contexts are filtered ("replaced placeholder" is completed work)
# 
# Pattern design principles:
# 1. Use word boundaries where possible (e.g., standalone "TBD" not "TBD" in "TBD markers")
# 2. Match instructional markers ("Change this:") not descriptive mentions
# 3. Match structural placeholders ([FILL IN], {TODO}) not references to them

# Patterns with reduced false positives:
TEMPLATE_PATTERN_EXAMPLE="^[[:space:]]*-?[[:space:]]*Example:|Example:[[:space:]]$|e\.g\.\,$"
TEMPLATE_PATTERN_PLACEHOLDER="\[TBD\]|\{TBD\}|: TBD$|^TBD$|TODO:|FIXME:|PLACEHOLDER:|^\[FILL|^\{FILL|^<FILL"
TEMPLATE_PATTERN_DATES="YYYY-MM-DD|YYYY/MM/DD|20XX-|202X-"
# "test data" only as standalone, not "test dataset" which is legitimate in experiment descriptions
TEMPLATE_PATTERN_GENERIC="lorem ipsum|sample text|^[[:space:]]*test data[[:space:]]*$"
TEMPLATE_PATTERN_EMPTY_EXAMPLES="description: \"Specific example|description: \"Primary example|description: \"Key example"
TEMPLATE_PATTERN_MARKERS="Change this:|Replace this:|Update this:|Insert your|Add your|Fill in your"

# Exclusion patterns (context that makes a match a FALSE POSITIVE)
# These are checked after initial match to filter out false positives
EXCLUSION_PATTERN_NEGATION="0 TBD|zero TBD|no TBD|0 TODO|zero TODO|no TODO|eliminate TBD|eliminating TBD"
EXCLUSION_PATTERN_PAST_TENSE="replaced placeholder|replacing placeholder|removed TBD|completed TODO"
EXCLUSION_PATTERN_PRODUCT_NAMES="Template Pack|Template Packs|template schema"
EXCLUSION_PATTERN_SUCCESS_CRITERIA="success_criteria.*TBD|measurement.*TBD"
# "test data" in context of experiment design or dataset building is legitimate
EXCLUSION_PATTERN_EXPERIMENT_CONTEXT="test dataset|test data.*of|labeled test|training.*test data|validation.*test data"

# List of pattern names for iteration
TEMPLATE_PATTERN_NAMES="example placeholder dates generic empty_examples template_markers"

# Artifact-specific critical content checks (using direct assignment)
CRITICAL_CONTENT_insight_analyses="trends:technology,trends:market,market_definition:tam,competitive_landscape:direct_competitors,strengths,opportunities"
CRITICAL_CONTENT_strategy_foundations="strategy_foundations:product_vision:vision_statement,strategy_foundations:value_proposition:headline,strategy_foundations:strategic_sequencing:phases"
CRITICAL_CONTENT_roadmap_recipe="roadmap:tracks:product:okrs,roadmap:cycle_theme"
CRITICAL_CONTENT_feature_definition="definition:job_to_be_done,definition:solution_approach,definition:personas"

# Check dependencies
check_dependencies() {
  local missing_deps=()
  
  command -v yq >/dev/null 2>&1 || missing_deps+=("yq")
  command -v grep >/dev/null 2>&1 || missing_deps+=("grep")
  
  if [ ${#missing_deps[@]} -gt 0 ]; then
    echo "Error: Missing required dependencies: ${missing_deps[*]}"
    echo "Install with: brew install yq grep"
    exit 1
  fi
}

# Parse command line arguments
parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --ai-assess)
        AI_ASSESS=true
        shift
        ;;
      -h|--help)
        show_help
        exit 0
        ;;
      *)
        TARGET="$1"
        shift
        ;;
    esac
  done
}

show_help() {
  cat << EOF
EPF Content Readiness Checker v1.0.0

PURPOSE:
  Tier 4 validation - Detects template content and assesses strategic depth
  of EPF artifacts beyond schema compliance.

USAGE:
  $0 [OPTIONS] <path>

OPTIONS:
  --ai-assess     Enable AI-powered content quality assessment
  -h, --help      Show this help message

EXAMPLES:
  # Check single artifact
  $0 _instances/twentyfirst/READY/01_insight_analyses.yaml

  # Check entire instance
  $0 _instances/twentyfirst

  # Check with AI assessment
  $0 --ai-assess _instances/twentyfirst/READY/01_insight_analyses.yaml

OUTPUT:
  - Content readiness score (0-100)
  - Template pattern matches
  - Empty/placeholder field detection
  - Optional: AI strategic depth rating
  - Enrichment recommendations

INTEGRATION:
  This tool is called by analyze-field-coverage.sh when --check-content flag is used.
  It can also be run standalone for focused content quality checks.

EOF
}

# Infer artifact type from filename
infer_artifact_type() {
  local file="$1"
  local filename
  filename=$(basename "$file")
  
  case "$filename" in
    00_north_star*.yaml) echo "north_star" ;;
    01_insight*.yaml) echo "insight_analyses" ;;
    02_strategy*.yaml) echo "strategy_foundations" ;;
    03_*insight*.yaml) echo "insight_opportunity" ;;
    04_strategy*.yaml) echo "strategy_formula" ;;
    05_roadmap*.yaml|04_roadmap*.yaml) echo "roadmap_recipe" ;;
    fd-*.yaml) echo "feature_definition" ;;
    *.value_model.yaml) echo "value_model" ;;
    *) echo "unknown" ;;
  esac
}

# Check if a line matches any exclusion pattern (returns 0 if excluded, 1 if valid match)
is_excluded_match() {
  local line="$1"
  
  # Check against all exclusion patterns
  if echo "$line" | grep -Eiq "$EXCLUSION_PATTERN_NEGATION"; then
    return 0  # Excluded (e.g., "0 TBD markers")
  fi
  
  if echo "$line" | grep -Eiq "$EXCLUSION_PATTERN_PAST_TENSE"; then
    return 0  # Excluded (e.g., "replaced placeholder")
  fi
  
  if echo "$line" | grep -Eiq "$EXCLUSION_PATTERN_PRODUCT_NAMES"; then
    return 0  # Excluded (e.g., "Template Packs" product name)
  fi
  
  if echo "$line" | grep -Eiq "$EXCLUSION_PATTERN_SUCCESS_CRITERIA"; then
    return 0  # Excluded (e.g., success criteria measuring TBD reduction)
  fi
  
  if echo "$line" | grep -Eiq "$EXCLUSION_PATTERN_EXPERIMENT_CONTEXT"; then
    return 0  # Excluded (e.g., "test dataset" in experiment design context)
  fi
  
  return 1  # Not excluded - this is a real match
}

# Count template patterns in file with context-aware exclusions
detect_template_patterns() {
  local file="$1"
  local total_matches=0
  local pattern_details=""
  
  for pattern_name in $TEMPLATE_PATTERN_NAMES; do
    # Use case statement to map pattern names to variables (works with set -u)
    local pattern=""
    case "$pattern_name" in
      example) pattern="$TEMPLATE_PATTERN_EXAMPLE" ;;
      placeholder) pattern="$TEMPLATE_PATTERN_PLACEHOLDER" ;;
      dates) pattern="$TEMPLATE_PATTERN_DATES" ;;
      generic) pattern="$TEMPLATE_PATTERN_GENERIC" ;;
      empty_examples) pattern="$TEMPLATE_PATTERN_EMPTY_EXAMPLES" ;;
      template_markers) pattern="$TEMPLATE_PATTERN_MARKERS" ;;
    esac
    
    # Get matching lines with context and filter out excluded matches
    local real_matches=0
    while IFS= read -r line; do
      if [ -n "$line" ] && ! is_excluded_match "$line"; then
        real_matches=$((real_matches + 1))
      fi
    done < <(grep -Ei "$pattern" "$file" 2>/dev/null)
    
    if [ "$real_matches" -gt 0 ]; then
      total_matches=$((total_matches + real_matches))
      if [ -z "$pattern_details" ]; then
        pattern_details="${pattern_name}:${real_matches}"
      else
        pattern_details="$pattern_details ${pattern_name}:${real_matches}"
      fi
    fi
  done
  
  echo "$total_matches|$pattern_details"
}

# Check for empty or placeholder values in critical fields
check_critical_fields() {
  local file="$1"
  local artifact_type="$2"
  local empty_critical=0
  local missing_fields=()
  
  # Get critical fields for this artifact type (using case statement for set -u compatibility)
  local critical_fields=""
  case "$artifact_type" in
    insight_analyses) critical_fields="$CRITICAL_CONTENT_insight_analyses" ;;
    strategy_foundations) critical_fields="$CRITICAL_CONTENT_strategy_foundations" ;;
    roadmap_recipe) critical_fields="$CRITICAL_CONTENT_roadmap_recipe" ;;
    feature_definition) critical_fields="$CRITICAL_CONTENT_feature_definition" ;;
  esac
  
  if [ -z "$critical_fields" ]; then
    echo "0|"
    return 0
  fi
  
  IFS=',' read -ra FIELDS <<< "$critical_fields"
  
  for field_path in "${FIELDS[@]}"; do
    # Convert dot notation to yq path
    local yq_path="${field_path//:/.}"
    local value
    value=$(yq eval ".${yq_path}" "$file" 2>/dev/null || echo "null")
    
    # Check if value is null, empty, or contains template markers
    if [ "$value" = "null" ] || [ -z "$value" ] || echo "$value" | grep -Eq "\[TBD\]|\{TBD\}|: TBD$|^TBD$|TODO:|PLACEHOLDER:|Example: "; then
      empty_critical=$((empty_critical + 1))
      missing_fields+=("$field_path")
    fi
  done
  
  # Return with proper empty handling
  if [ ${#missing_fields[@]} -eq 0 ]; then
    echo "$empty_critical|"
  else
    echo "$empty_critical|${missing_fields[*]}"
  fi
}

# Calculate readiness score
calculate_readiness_score() {
  local template_matches="$1"
  local empty_critical="$2"
  local total_lines="$3"
  
  # Base score starts at 100
  local score=100
  
  # Deduct for template patterns (more severe penalty for many patterns)
  if [ "$template_matches" -gt 0 ]; then
    local template_penalty=$((template_matches * 5))
    # Cap template penalty at 50 points
    [ "$template_penalty" -gt 50 ] && template_penalty=50
    score=$((score - template_penalty))
  fi
  
  # Deduct for empty critical fields (severe penalty)
  if [ "$empty_critical" -gt 0 ]; then
    local critical_penalty=$((empty_critical * 15))
    score=$((score - critical_penalty))
  fi
  
  # Ensure score doesn't go below 0
  [ "$score" -lt 0 ] && score=0
  
  echo "$score"
}

# Generate readiness grade
get_readiness_grade() {
  local score="$1"
  
  if [ "$score" -ge 90 ]; then
    echo "A"
  elif [ "$score" -ge 75 ]; then
    echo "B"
  elif [ "$score" -ge 60 ]; then
    echo "C"
  elif [ "$score" -ge 40 ]; then
    echo "D"
  else
    echo "F"
  fi
}

# Get enrichment wizard recommendation
get_wizard_recommendation() {
  local artifact_type="$1"
  
  case "$artifact_type" in
    insight_analyses)
      echo "docs/EPF/wizards/01_trend_scout.agent_prompt.md"
      echo "docs/EPF/wizards/02_market_mapper.agent_prompt.md"
      echo "docs/EPF/wizards/03_internal_mirror.agent_prompt.md"
      echo "docs/EPF/wizards/04_problem_detective.agent_prompt.md"
      ;;
    strategy_foundations)
      echo "docs/EPF/wizards/synthesizer.agent_prompt.md"
      echo "docs/EPF/wizards/lean_start.agent_prompt.md"
      ;;
    roadmap_recipe)
      echo "docs/EPF/wizards/roadmap_enrichment.wizard.md"
      ;;
    feature_definition)
      echo "docs/EPF/wizards/feature_enrichment.wizard.md"
      ;;
  esac
}

# Analyze single artifact
analyze_artifact() {
  local file="$1"
  local filename
  filename=$(basename "$file")
  
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}Content Readiness Analysis: $filename${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  # Infer artifact type
  local artifact_type
  artifact_type=$(infer_artifact_type "$file")
  
  if [ "$artifact_type" = "unknown" ]; then
    echo -e "⚠️  Unknown artifact type - skipping content analysis"
    return 0
  fi
  
  echo "Artifact Type: $artifact_type"
  echo ""
  
  # Count lines for context
  local total_lines
  total_lines=$(wc -l < "$file" | tr -d ' ')
  
  # Detect template patterns
  local pattern_result
  pattern_result=$(detect_template_patterns "$file")
  local template_matches="${pattern_result%%|*}"
  local pattern_details="${pattern_result#*|}"
  
  # Check critical fields
  local critical_result
  critical_result=$(check_critical_fields "$file" "$artifact_type")
  local empty_critical="${critical_result%%|*}"
  local missing_fields="${critical_result#*|}"
  
  # Calculate score
  local score
  score=$(calculate_readiness_score "$template_matches" "$empty_critical" "$total_lines")
  local grade
  grade=$(get_readiness_grade "$score")
  
  # Display results
  echo -e "${BOLD}Content Readiness Score: $score/100 (Grade: $grade)${NC}"
  echo ""
  
  # Template pattern detection
  if [ "$template_matches" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Template Content Detected: $template_matches matches${NC}"
    echo ""
    echo "Pattern breakdown:"
    IFS=' ' read -ra PATTERNS <<< "$pattern_details"
    for detail in "${PATTERNS[@]}"; do
      local name="${detail%%:*}"
      local count="${detail#*:}"
      echo "  - ${name}: ${count} occurrences"
    done
    echo ""
  else
    echo -e "${GREEN}✅ No template patterns detected${NC}"
    echo ""
  fi
  
  # Critical field check
  if [ "$empty_critical" -gt 0 ]; then
    echo -e "${RED}❌ Empty Critical Fields: $empty_critical${NC}"
    echo ""
    echo "Fields needing content:"
    IFS=' ' read -ra FIELDS <<< "$missing_fields"
    for field in "${FIELDS[@]}"; do
      echo "  - $field"
    done
    echo ""
  else
    echo -e "${GREEN}✅ All critical fields populated${NC}"
    echo ""
  fi
  
  # AI assessment placeholder
  if [ "$AI_ASSESS" = true ]; then
    echo -e "${BLUE}━━━ AI Content Quality Assessment ━━━${NC}"
    echo ""
    echo "🤖 AI-powered strategic depth analysis:"
    echo ""
    echo "To enable AI assessment, please provide an OpenAI API key or use an AI agent"
    echo "with context from this repository to assess:"
    echo ""
    echo "  1. Strategic clarity and specificity"
    echo "  2. Evidence-based reasoning"
    echo "  3. Actionable insights vs generic statements"
    echo "  4. Depth of analysis and research"
    echo ""
    echo "Suggested AI prompt:"
    echo "  'Analyze $file for strategic depth and quality."
    echo "   Rate on scale 1-10 for: specificity, evidence, actionability, depth."
    echo "   Identify any generic/template content that needs enrichment.'"
    echo ""
  fi
  
  # Recommendations
  echo -e "${BOLD}Recommendations:${NC}"
  echo ""
  
  if [ "$score" -lt 60 ]; then
    echo -e "${RED}⚠️  URGENT: Significant template content detected${NC}"
    echo "   This artifact needs enrichment before use in strategic planning."
    echo ""
  elif [ "$score" -lt 75 ]; then
    echo -e "${YELLOW}⚠️  MODERATE: Some template content remains${NC}"
    echo "   Consider enriching for better strategic clarity."
    echo ""
  else
    echo -e "${GREEN}✅ GOOD: Content appears production-ready${NC}"
    echo "   Minor refinements may still add value."
    echo ""
  fi
  
  # Wizard recommendations
  local wizards
  wizards=$(get_wizard_recommendation "$artifact_type")
  
  if [ -n "$wizards" ]; then
    echo "Enrichment wizards for this artifact:"
    while IFS= read -r wizard; do
      echo "  - $wizard"
    done <<< "$wizards"
    echo ""
    echo "Run enrichment:"
    echo "  Ask AI agent: 'Help me enrich this artifact using the appropriate wizard'"
  fi
  
  echo ""
  
  return 0
}

# Main function
main() {
  local TARGET=""
  
  parse_args "$@"
  
  if [ -z "$TARGET" ]; then
    echo "Error: No target specified"
    show_help
    exit 1
  fi
  
  check_dependencies
  
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}         EPF Content Readiness Checker v1.0.0                  ${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  
  if [ "$AI_ASSESS" = true ]; then
    echo "Mode: Pattern Detection + AI Assessment"
  else
    echo "Mode: Pattern Detection Only (use --ai-assess for AI rating)"
  fi
  echo ""
  
  # Check if target is directory or file
  if [ -d "$TARGET" ]; then
    # Analyze all YAML files in directory (portable approach)
    local yaml_count=0
    
    # Find and process files
    while IFS= read -r file; do
      [ -f "$file" ] || continue
      analyze_artifact "$file"
      yaml_count=$((yaml_count + 1))
    done < <(find "$TARGET" -name "*.yaml" -type f 2>/dev/null | grep -E "(00_north|01_insight|02_strategy|03_insight|04_strategy|05_roadmap|fd-)" | sort)
    
    if [ $yaml_count -eq 0 ]; then
      echo "No relevant YAML files found in $TARGET"
      echo "Searched for: north star, insights, strategy, roadmap, and feature definitions"
      exit 1
    fi
  elif [ -f "$TARGET" ]; then
    analyze_artifact "$TARGET"
  else
    echo "Error: $TARGET is not a valid file or directory"
    exit 1
  fi
  
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}                    CONTENT READINESS SUMMARY                   ${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Use --ai-assess flag for AI-powered strategic depth analysis"
  echo ""
}

# Run main
main "$@"
