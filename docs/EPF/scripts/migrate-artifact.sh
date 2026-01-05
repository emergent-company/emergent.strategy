#!/usr/bin/env bash
#
# migrate-artifact.sh - Interactive EPF Artifact Migration Assistant
# Part of Enhanced Health Check System - Phase 3
#
# Purpose: Guide users through enriching artifacts with new fields
# Supports: Roadmap TRL fields, Feature definition persona upgrades
#
# Usage:
#   ./scripts/migrate-artifact.sh <artifact_file>
#   ./scripts/migrate-artifact.sh _instances/twentyfirst/READY/05_roadmap_recipe.yaml
#   ./scripts/migrate-artifact.sh _instances/twentyfirst/FIRE/feature_definitions/fd-001_group_structures.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPF_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Print section header
print_header() {
  local title="$1"
  echo -e "\n${BOLD}${BLUE}═══ $title ═══${NC}\n"
}

# Print step
print_step() {
  local step="$1"
  local description="$2"
  echo -e "${BOLD}${CYAN}Step $step:${NC} $description"
}

# Print info
print_info() {
  echo -e "${GRAY}$1${NC}"
}

# Print success
print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

# Print warning
print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# Print error
print_error() {
  echo -e "${RED}✗${NC} $1"
}

# Prompt for input
prompt() {
  local question="$1"
  local default="${2:-}"
  local response
  
  if [[ -n "$default" ]]; then
    echo -ne "${CYAN}? ${NC}$question ${GRAY}[$default]${NC}: "
  else
    echo -ne "${CYAN}? ${NC}$question: "
  fi
  
  read -r response
  echo "${response:-$default}"
}

# Prompt yes/no
prompt_yn() {
  local question="$1"
  local default="${2:-n}"
  local response
  
  if [[ "$default" == "y" ]]; then
    echo -ne "${CYAN}? ${NC}$question ${GRAY}[Y/n]${NC}: "
  else
    echo -ne "${CYAN}? ${NC}$question ${GRAY}[y/N]${NC}: "
  fi
  
  read -r response
  response="${response:-$default}"
  
  [[ "$response" =~ ^[Yy] ]]
}

# Detect artifact type
detect_artifact_type() {
  local artifact_file="$1"
  local basename=$(basename "$artifact_file")
  
  case "$basename" in
    05_roadmap_recipe.yaml)
      echo "roadmap"
      ;;
    fd-*.yaml)
      echo "feature_definition"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

# Get wizard path for artifact type
get_wizard_path() {
  local artifact_type="$1"
  
  case "$artifact_type" in
    roadmap)
      echo "$EPF_ROOT/wizards/roadmap_enrichment.wizard.md"
      ;;
    feature_definition)
      echo "$EPF_ROOT/wizards/feature_enrichment.wizard.md"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Create backup
create_backup() {
  local artifact_file="$1"
  local backup_file="${artifact_file}.backup"
  
  if [[ -f "$backup_file" ]]; then
    print_warning "Backup already exists: $backup_file"
    if prompt_yn "Overwrite existing backup?" "n"; then
      cp "$artifact_file" "$backup_file"
      print_success "Backup created: $backup_file"
    fi
  else
    cp "$artifact_file" "$backup_file"
    print_success "Backup created: $backup_file"
  fi
}

# Open wizard in editor
open_wizard() {
  local wizard_path="$1"
  
  print_info "Opening wizard guide..."
  
  if command -v code &> /dev/null; then
    code "$wizard_path"
    print_success "Wizard opened in VS Code"
  elif [[ -n "${EDITOR:-}" ]]; then
    $EDITOR "$wizard_path"
  else
    print_info "Please open manually: $wizard_path"
  fi
}

# Validate artifact
validate_artifact() {
  local artifact_file="$1"
  
  print_info "Running schema validation..."
  
  if "$SCRIPT_DIR/validate-schemas.sh" "$artifact_file" &> /dev/null; then
    print_success "Schema validation: PASS"
    return 0
  else
    print_error "Schema validation: FAIL"
    "$SCRIPT_DIR/validate-schemas.sh" "$artifact_file"
    return 1
  fi
}

# Analyze field coverage
analyze_coverage() {
  local artifact_file="$1"
  
  print_info "Analyzing field coverage..."
  
  if [[ -f "$SCRIPT_DIR/analyze-field-coverage.sh" ]]; then
    "$SCRIPT_DIR/analyze-field-coverage.sh" "$(dirname "$artifact_file")" | tail -20
  else
    print_warning "Coverage analyzer not found"
  fi
}

# Main migration workflow
main() {
  if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <artifact_file>"
    echo ""
    echo "Examples:"
    echo "  $0 _instances/twentyfirst/READY/05_roadmap_recipe.yaml"
    echo "  $0 _instances/twentyfirst/FIRE/feature_definitions/fd-001_group_structures.yaml"
    exit 1
  fi
  
  local artifact_file="$1"
  
  # Validate file exists
  if [[ ! -f "$artifact_file" ]]; then
    print_error "File not found: $artifact_file"
    exit 1
  fi
  
  print_header "EPF Artifact Migration Assistant"
  
  echo -e "${BOLD}Artifact:${NC} $(basename "$artifact_file")"
  echo -e "${GRAY}Path:${NC} $artifact_file"
  
  # Detect artifact type
  local artifact_type=$(detect_artifact_type "$artifact_file")
  
  if [[ "$artifact_type" == "unknown" ]]; then
    print_error "Unknown artifact type: $(basename "$artifact_file")"
    print_info "This tool supports: roadmap recipes (05_roadmap_recipe.yaml) and feature definitions (fd-*.yaml)"
    exit 1
  fi
  
  echo -e "${GRAY}Type:${NC} $artifact_type"
  
  # Get wizard
  local wizard_path=$(get_wizard_path "$artifact_type")
  
  if [[ ! -f "$wizard_path" ]]; then
    print_error "Wizard not found: $wizard_path"
    exit 1
  fi
  
  echo -e "${GRAY}Wizard:${NC} $(basename "$wizard_path")"
  
  # Pre-migration checklist
  print_header "Pre-Migration Checklist"
  
  print_step "1" "Create backup"
  create_backup "$artifact_file"
  
  print_step "2" "Review wizard guide"
  print_info "The wizard contains step-by-step instructions and examples."
  
  if prompt_yn "Open wizard guide now?" "y"; then
    open_wizard "$wizard_path"
  else
    print_info "Wizard location: $wizard_path"
  fi
  
  echo ""
  print_info "Take your time to read the wizard guide."
  print_info "Come back to this script when you're ready to continue."
  echo ""
  
  if ! prompt_yn "Ready to continue?" "n"; then
    print_info "Exiting. Run this script again when ready to continue."
    exit 0
  fi
  
  # Migration guidance
  print_header "Migration Workflow"
  
  case "$artifact_type" in
    roadmap)
      migrate_roadmap_guidance
      ;;
    feature_definition)
      migrate_feature_definition_guidance
      ;;
  esac
  
  # Post-migration validation
  print_header "Post-Migration Validation"
  
  print_step "1" "Validate schema compliance"
  if validate_artifact "$artifact_file"; then
    echo ""
  else
    print_warning "Fix validation errors and run validation again"
    exit 1
  fi
  
  print_step "2" "Analyze field coverage"
  analyze_coverage "$artifact_file"
  
  # Completion
  print_header "Migration Complete"
  
  print_success "Artifact enriched successfully!"
  print_info "Next steps:"
  print_info "  1. Review changes in: $artifact_file"
  print_info "  2. Update version header if needed"
  print_info "  3. Run full instance health check: ./scripts/check-version-alignment.sh"
  print_info ""
  print_info "Backup preserved at: ${artifact_file}.backup"
}

# Roadmap migration guidance
migrate_roadmap_guidance() {
  print_info "You are migrating a roadmap recipe."
  print_info "Focus: Adding TRL fields for innovation maturity tracking"
  echo ""
  
  print_info "Key tasks:"
  print_info "  1. Identify innovation-focused Key Results (vs routine execution)"
  print_info "  2. Add TRL fields: trl_start, trl_target, trl_progression"
  print_info "  3. Add hypothesis fields: technical_hypothesis, experiment_design, success_criteria, uncertainty_addressed"
  print_info "  4. Examples available for all 4 tracks (Product, Strategy, Org&Ops, Commercial)"
  echo ""
  
  print_warning "Remember: Not all KRs need TRL fields - only innovation work (resolving uncertainty)"
  echo ""
  
  if ! prompt_yn "Have you added TRL fields to your innovation-focused KRs?" "n"; then
    print_info "Edit the artifact file and add TRL fields following the wizard guide."
    print_info "Run this script again when done."
    exit 0
  fi
  
  if prompt_yn "Did you add hypothesis validation fields (technical_hypothesis, experiment_design, etc.)?" "n"; then
    print_success "Great! Comprehensive enrichment completed."
  else
    print_warning "Consider adding hypothesis fields for better learning tracking."
  fi
}

# Feature definition migration guidance
migrate_feature_definition_guidance() {
  print_info "You are migrating a feature definition."
  print_info "Focus: Upgrading from v1.x (contexts) to v2.0 (personas)"
  echo ""
  
  print_info "Key tasks:"
  print_info "  1. Rename 'contexts' → 'personas' (BREAKING CHANGE)"
  print_info "  2. Add persona names (e.g., 'Busy Board Member Bjørn')"
  print_info "  3. Expand current_situation with specific details"
  print_info "  4. Define transformation_moment (the 'aha moment')"
  print_info "  5. Describe emotional_resolution (the emotional payoff)"
  print_info "  6. Add demographics (role, experience, company stage)"
  print_info "  7. Add psychographics (values, motivations, pain points, behaviors, goals)"
  echo ""
  
  print_warning "This is a breaking change - 'contexts' field is no longer valid in v2.0"
  echo ""
  
  if ! prompt_yn "Have you renamed 'contexts' to 'personas'?" "n"; then
    print_info "Edit the artifact file and rename 'contexts' to 'personas'."
    print_info "Run this script again when done."
    exit 0
  fi
  
  if ! prompt_yn "Have you added persona names?" "n"; then
    print_info "Add memorable persona names (e.g., 'Busy Board Member Bjørn')."
    print_info "Run this script again when done."
    exit 0
  fi
  
  if ! prompt_yn "Have you added transformation_moment and emotional_resolution?" "n"; then
    print_warning "These fields are critical for understanding user needs."
    print_info "Add them following the wizard examples."
  fi
  
  if prompt_yn "Did you add demographics and psychographics?" "n"; then
    print_success "Great! Comprehensive persona enrichment completed."
  else
    print_warning "Consider adding demographics and psychographics for richer personas."
  fi
}

main "$@"
