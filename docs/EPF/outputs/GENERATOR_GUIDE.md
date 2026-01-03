# EPF Output Generator - Development Guide

**Version:** 1.0.0  
**Last Updated:** 2026-01-03  
**Purpose:** Canonical guide for creating new EPF output generators  
**Reference Implementation:** skattefunn-application

---

## Overview

This guide provides the **standardized architecture** for building new EPF output generators. All recommendations are based on analysis of existing generators (context-sheet, investor-memo, skattefunn-application), with skattefunn serving as the most mature reference implementation.

**What is an Output Generator?**
- Transforms EPF strategic data into external-facing artifacts
- Follows schema-first design with validation
- Self-contained in a single directory
- Reusable across all EPF instances

---

## Quick Start: Creating a New Generator

### 1. Copy the Template Structure

```bash
# Use skattefunn as starting point
cp -r docs/EPF/outputs/skattefunn-application docs/EPF/outputs/{new-generator-name}
cd docs/EPF/outputs/{new-generator-name}
```

### 2. Customize Core Files

```bash
# Update schema for your domain inputs
vim schema.json

# Rewrite generation logic for your transformation
vim wizard.instructions.md

# Adapt validation rules for your output
vim validator.sh

# Customize quick reference
vim README.md

# Update or remove template (if output has fixed structure)
vim template.md  # or rm template.md if not needed
```

### 3. Register Generator

Update `docs/EPF/outputs/README.md`:
- Add to directory structure table
- Update generator status table
- Add usage example

### 4. Test the Generator

```bash
# Generate a test output
# (follow wizard instructions)

# Validate the output
bash validator.sh path/to/output.md

# Iterate until validator passes
```

---

## Mandatory Generator Architecture

Every generator **MUST** include these four components:

```
{generator-name}/
├── schema.json                 # Input parameter validation
├── wizard.instructions.md      # Generation logic
├── validator.sh                # Output validation
└── README.md                   # Quick reference guide
```

### Component Purposes

| Component | Purpose | Typical Size |
|-----------|---------|--------------|
| `schema.json` | Validates user inputs BEFORE generation | 300-500 lines |
| `wizard.instructions.md` | Transforms EPF data into output artifact | 500-4000 lines |
| `validator.sh` | Validates generated output quality | 500-900 lines |
| `README.md` | Quick start and reference for users | 100-200 lines |

---

## Optional Components

Add these when appropriate for your domain:

```
{generator-name}/
├── template.md                 # If output has fixed structure
├── {domain}-util.sh            # Domain-specific utilities
└── examples/                   # Sample inputs/outputs
    ├── input-example.json
    └── output-example.md
```

### When to Include a Template

**✅ INCLUDE `template.md` when:**
- Output has **fixed structure** (e.g., government form with 8 sections)
- Output follows **external specification** (e.g., API schema, compliance standard)
- Structure is **reusable across instances** (same for all products)
- Uses **variable substitution** (`{{placeholders}}`)

**❌ SKIP `template.md` when:**
- Output structure **varies by product** (e.g., different business models need different sections)
- Output is **purely synthesized** (AI generates from EPF without template)
- Structure is **fully documented in wizard** (redundant to have separate template)

**Example:** skattefunn has template.md (Norwegian R&D form with fixed 8-section structure), while investor-memo doesn't (structure varies by company stage/model).

---

## File Naming Conventions

Since each generator lives in its own folder, use **simple, consistent names**:

| File Type | Correct Name | ❌ Avoid |
|-----------|--------------|---------|
| Schema | `schema.json` | `{generator}_schema.json` |
| Wizard | `wizard.instructions.md` | `{generator}_generator.wizard.md` |
| Template | `template.md` | `{generator}_template.md` |
| Validator | `validator.sh` | `validate-{generator}.sh` |
| README | `README.md` | `QUICK_REFERENCE.md` |

**Rationale:** Folder provides namespacing; simple names are consistent and predictable.

---

## Component 1: schema.json

### Purpose

Define and validate **INPUT PARAMETERS** that users must provide before generation.

**Important:** Schema validates inputs, NOT outputs. Template or wizard defines output structure.

### Canonical Structure

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://emergent.build/schemas/outputs/{generator-name}.schema.json",
  "title": "{Human-Readable Generator Name}",
  "description": "{Purpose and use case in one sentence}",
  "version": "1.0.0",
  "type": "object",
  
  "definitions": {
    "metadata": {
      "type": "object",
      "description": "Generation metadata tracking source and freshness",
      "required": ["generated_at", "generator", "epf_version", "epf_sources"],
      "properties": {
        "generated_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp of generation"
        },
        "generator": {
          "type": "string",
          "description": "Name of the wizard that generated this output",
          "pattern": "^[a-z_-]+\\.wizard\\.md$"
        },
        "generator_version": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+\\.\\d+$",
          "description": "Semantic version of the generator"
        },
        "epf_version": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+\\.\\d+$",
          "description": "EPF framework version used"
        },
        "epf_sources": {
          "type": "object",
          "description": "EPF source files used for generation",
          "properties": {
            "north_star": { "type": "string" },
            "strategy_formula": { "type": "string" },
            "roadmap_recipe": { "type": "string" },
            "value_models": { 
              "type": "array",
              "items": { "type": "string" }
            }
          }
        }
      }
    }
  },
  
  "required": ["{domain-specific-required-fields}"],
  "properties": {
    "organization": {
      "type": "object",
      "description": "Organization information",
      "required": ["name"],
      "properties": {
        "name": { "type": "string", "minLength": 1 }
      }
    }
    // Add domain-specific input parameters
  }
}
```

### Key Principles

1. **Validate inputs, not outputs** - Schema checks user-provided data before generation
2. **Include metadata definition** - Track EPF sources and versions
3. **Use semantic versioning** - Schema can evolve independently of wizard
4. **Add domain constraints** - Enum values, regex patterns, min/max lengths
5. **Provide examples** - Help users understand expected format

### Schema Validation Checklist

- [ ] `$schema` and `$id` fields present
- [ ] `version` field with semantic version
- [ ] `metadata` definition included
- [ ] `required` array lists mandatory fields
- [ ] Domain-specific constraints defined (enums, patterns, lengths)
- [ ] All properties have `description` fields
- [ ] Examples provided for complex fields

---

## Component 2: wizard.instructions.md

### Purpose

Define **GENERATION LOGIC** - how to transform EPF data into the output artifact.

### Canonical Structure

```markdown
# {Generator Name} - Wizard Instructions

**Version:** 1.0.0  
**Schema Version:** 1.0.0  
**Purpose:** {One-line purpose}  
**Output Format:** {Markdown/JSON/PDF/etc.}  
**Target Audience:** {Who will consume this output}

---

## ⚠️ CRITICAL: Generation Process Overview

This wizard MUST be executed sequentially. Each phase depends on the previous one.

### Phase 0: Pre-flight Validation
### Phase 1: EPF Data Extraction
### Phase 2: {Interactive Selection/Domain Processing}
### Phase 3: Transformation
### Phase 4: Document Assembly
### Phase 5: Validation

**⚠️ STOP AFTER PHASE {X} IF USER INPUT REQUIRED**

---

## Phase 0: Pre-flight Validation

### Step 0.1: Verify EPF Sources

Check that required EPF files exist and are up-to-date:

```yaml
Required:
- docs/EPF/_instances/{product}/00_north_star.yaml
- docs/EPF/_instances/{product}/04_strategy_formula.yaml
- docs/EPF/_instances/{product}/05_roadmap_recipe.yaml
- docs/EPF/_instances/{product}/value_models/{product}.value_model.yaml

Optional:
- docs/EPF/_instances/{product}/insight_analyses/*.md
```

**Age Check:** Warn if files are > 90 days old, error if > 180 days old.

### Step 0.2: Collect External Information

⚠️ **EPF DOES NOT CONTAIN:**
- {List information that must come from user}
- {e.g., organization details, timeline, budget}

**Interactive prompt template:**
```python
print("=" * 80)
print("📋 {GENERATOR NAME} SETUP - {Information Type}")
print("=" * 80)
print()
print("I need information about {topic}.")
print("This information is required for {purpose}.")
print()

# Collect user inputs
{field_name} = input("{Prompt}: ").strip()
if not {field_name}:
    print("❌ {Field} is required")
    exit(1)

# Validation
# Store collected data
```

### Step 0.3: {Domain-Specific Prerequisites}

{Any domain-specific setup or validation}

**Validation Checkpoint:**
- [ ] All EPF sources exist
- [ ] External information collected
- [ ] {Domain prerequisites met}

---

## Phase 1: EPF Data Extraction

### Step 1.1: Extract from North Star

```yaml
# Path: docs/EPF/_instances/{product}/00_north_star.yaml

Extract:
  purpose: north_star.purpose.statement
  vision: north_star.vision.statement
  mission: north_star.mission.statement
  values: north_star.values[]
  personas: north_star.personas[]
  jtbd: north_star.jobs_to_be_done[]
```

### Step 1.2: Extract from Strategy Formula

```yaml
# Path: docs/EPF/_instances/{product}/04_strategy_formula.yaml

Extract:
  positioning: strategy.positioning.*
  market_analysis: strategy.market_analysis.*
  competitive_moat: strategy.competitive_moat.*
  business_model: strategy.business_model.*
```

### Step 1.3: Extract from Roadmap Recipe

```yaml
# Path: docs/EPF/_instances/{product}/05_roadmap_recipe.yaml

Extract:
  milestones: milestones[]
  key_results: milestones[].key_results[]
  assumptions: milestones[].key_results[].assumptions[]
  metrics: milestones[].key_results[].metrics[]
```

### Step 1.4: Extract from Value Models

```yaml
# Path: docs/EPF/_instances/{product}/value_models/*.yaml

Extract:
  product_mission: high_level_model.product_mission
  capabilities: layers[].components[].subs[]
  pricing: pricing_tiers[]
  features: {active capabilities with descriptions}
```

**Validation Checkpoint:**
- [ ] All required data extracted
- [ ] No missing required fields
- [ ] Data types match expected format

---

## Phase 2: {Interactive Selection / Domain Processing}

⚠️ **If output requires user selection (e.g., which features to include):**

### Step 2.1: Present Options to User

```markdown
**{Selection Context}**

Present this table to the user:

| # | Item | Details | Eligibility | Include? |
|---|------|---------|-------------|----------|
| 1 | ... | ... | ✅ | [ ] |
| 2 | ... | ... | ❌ Reason | [ ] |
```

### Step 2.2: Validate Selection

```
Minimum: {X items}
Maximum: {Y items}
Constraints: {Any business rules}
```

**⚠️ STOP: Get user confirmation before proceeding to Phase 3**

---

## Phase 3: Language Transformation

### Step 3.1: Apply Domain-Specific Terminology

Transform EPF language to {domain} language:

| EPF Term | {Domain} Term | Transformation Rule |
|----------|---------------|---------------------|
| "Key Result" | "{Domain equivalent}" | {How to convert} |
| "Assumption to test" | "{Domain equivalent}" | {How to convert} |
| "Milestone" | "{Domain equivalent}" | {How to convert} |
| "TRL progression" | "{Domain equivalent}" | {How to convert} |

**Example transformation:**
```
EPF: "Assumption to test: Users can create workflows in < 5 minutes"
↓
{Domain}: "Technical uncertainty: Workflow creation time optimization"
```

### Step 3.2: Apply Formatting Rules

{Domain-specific formatting requirements}
- Character limits: {list limits}
- Required sections: {list sections}
- Compliance standards: {list standards}

**Validation Checkpoint:**
- [ ] All EPF terms transformed
- [ ] Formatting rules applied
- [ ] No EPF jargon remains in output

---

## Phase 4: Document Assembly

### Step 4.1: Generate Output Structure

{Describe output structure or reference template}

```markdown
# Output Document Title

## Section 1: {Name}
{Content from extraction/transformation}

## Section 2: {Name}
{Content from extraction/transformation}

...
```

### Step 4.2: Populate Sections

{Section-by-section population logic}

**For each section:**
1. Locate transformed data from Phase 3
2. Apply section-specific formatting
3. Insert into output structure
4. Verify completeness

### Step 4.3: Add Metadata Header

```yaml
---
metadata:
  generated_at: "{ISO 8601 timestamp}"
  epf_version: "{from docs/EPF/VERSION}"
  generator: "{generator-name}.wizard.md"
  generator_version: "{from schema.json → version}"
  epf_sources:
    north_star: "docs/EPF/_instances/{product}/00_north_star.yaml"
    strategy_formula: "docs/EPF/_instances/{product}/04_strategy_formula.yaml"
    roadmap_recipe: "docs/EPF/_instances/{product}/05_roadmap_recipe.yaml"
    value_models:
      - "docs/EPF/_instances/{product}/value_models/{model}.yaml"
---
```

**Validation Checkpoint:**
- [ ] All sections complete
- [ ] Metadata accurate
- [ ] Output matches expected structure
- [ ] No placeholders remain

---

## Phase 5: Validation

### Step 5.1: Run Validator

```bash
bash docs/EPF/outputs/{generator-name}/validator.sh {output-file}
```

### Step 5.2: Fix Errors

Review validator output and fix:
- **Errors** (must fix): {Common error types}
- **Warnings** (review): {Common warning types}

### Step 5.3: Iterate Until Valid

Re-run validator after each fix until exit code is 0.

**Final Checklist:**
- [ ] Validator passes (exit code 0)
- [ ] All placeholders replaced
- [ ] {Domain-specific quality checks}
- [ ] Output ready for delivery

---

## Output Structure

{Detailed description or reference to template.md}

---

## Quality Criteria

Before considering output complete:

### 1. Completeness
- [ ] All required sections present
- [ ] No placeholders or TODOs
- [ ] All data fields populated
- [ ] Metadata complete and accurate

### 2. Accuracy
- [ ] EPF data correctly extracted
- [ ] Transformations applied correctly
- [ ] Calculations accurate (if applicable)
- [ ] References valid

### 3. Traceability
- [ ] EPF sources referenced in metadata
- [ ] Version information complete
- [ ] Generation timestamp accurate
- [ ] Roadmap KR references valid (if applicable)

### 4. {Domain}-Specific Quality
- [ ] {Domain requirement 1}
- [ ] {Domain requirement 2}
- [ ] Compliance standards met
- [ ] Format requirements satisfied

---

## Troubleshooting

### Error: "Missing required EPF file"
**Cause:** EPF instance incomplete or file path incorrect  
**Solution:** Verify instance structure, check file paths, ensure files exist

### Error: "{Domain-specific error}"
**Cause:** {Explanation}  
**Solution:** {How to fix}

### Warning: "EPF sources are stale (> 90 days old)"
**Cause:** EPF instance hasn't been updated recently  
**Solution:** Review and update EPF files, or document why stale data is acceptable

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | {date} | Initial release |
```

### Wizard Development Checklist

- [ ] All 6 phases documented (0-5)
- [ ] Stop points marked with ⚠️ for user input
- [ ] EPF extraction paths specified with YAML notation
- [ ] Transformation dictionary included (EPF → domain)
- [ ] Validation checkpoints between phases
- [ ] Quality criteria defined
- [ ] Troubleshooting section with common errors
- [ ] Examples of transformations provided

### Key Patterns from skattefunn

1. **Phase 0.0: External Input Collection** - When EPF doesn't have required data
2. **Phase 0.5: Interactive Selection** - When user must choose subset of data
3. **Transformation Dictionaries** - Explicit EPF → domain term mapping
4. **Validation Checkpoints** - Stop and verify before continuing to next phase
5. **Domain Compliance Mapping** - Align with external standards (e.g., Frascati R&D categories)

---

## Component 3: validator.sh

### Purpose

Validate **OUTPUT QUALITY** after generation - structure, semantics, traceability, domain compliance.

### Canonical Template

```bash
#!/bin/bash
#
# {Generator Name} Validator
# 
# Validates EPF-generated {outputs} against:
# 1. Schema/Structure - Required sections and format
# 2. Semantic Rules - Content quality and completeness
# 3. Traceability - EPF source references
# 4. {Domain}-Specific - Domain requirements
# 
# Usage:
#   bash validator.sh <path-to-output.md>
#   bash validator.sh --file path/to/output.md
# 
# Environment Variables:
#   VALIDATION_STRICT               Treat warnings as errors (default: false)
#   VALIDATION_{DOMAIN}_PARAM       Domain-specific parameters
# 
# Exit Codes:
#   0 - Valid
#   1 - Invalid (errors found)
#   2 - File not found / missing dependencies
#   3 - Warnings only (strict mode off)

# NOTE: We do NOT use 'set -e' - validators should collect ALL errors
# across all layers, not exit on the first problem.

# ============================================================================
# Configuration
# ============================================================================

STRICT_MODE=${VALIDATION_STRICT:-false}
# Add domain-specific configuration variables

# ============================================================================
# Colors
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

# ============================================================================
# Counters
# ============================================================================

ERRORS=0
WARNINGS=0
PASSED=0

# Layer-specific counters
SCHEMA_ERRORS=0
SEMANTIC_ERRORS=0
TRACEABILITY_ERRORS=0
DOMAIN_ERRORS=0

# ============================================================================
# Helper Functions
# ============================================================================

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1"
    ((WARNINGS++))
}

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================================================
# Argument Parsing
# ============================================================================

OUTPUT_FILE=""

parse_args() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: validator.sh <path-to-output.md>"
        echo "   or: validator.sh --file <path-to-output.md>"
        echo ""
        echo "Environment Variables:"
        echo "  VALIDATION_STRICT=true    Treat warnings as errors"
        echo ""
        exit 2
    fi
    
    if [[ "$1" == "--file" ]]; then
        OUTPUT_FILE="$2"
    else
        OUTPUT_FILE="$1"
    fi
}

check_file_exists() {
    if [[ ! -f "$OUTPUT_FILE" ]]; then
        log_error "File not found: $OUTPUT_FILE"
        exit 2
    fi
    
    log_info "Validating: $OUTPUT_FILE"
}

check_dependencies() {
    # Add any required external tools
    # Example:
    # if ! command -v yq &> /dev/null; then
    #     log_error "yq is not installed. Install with: brew install yq"
    #     exit 2
    # fi
    :
}

# ============================================================================
# Validation Layers
# ============================================================================

validate_schema() {
    log_section "Layer 1: Schema/Structure Validation"
    
    local layer_errors=0
    
    # Check required sections exist
    # Example:
    # if ! grep -q "^## Section 1:" "$OUTPUT_FILE"; then
    #     log_error "Missing required section: Section 1"
    #     ((layer_errors++))
    #     ((SCHEMA_ERRORS++))
    # else
    #     log_pass "Section 1 present"
    # fi
    
    if [[ $layer_errors -eq 0 ]]; then
        log_pass "Schema validation passed"
    else
        log_error "Schema validation failed with $layer_errors error(s)"
    fi
}

validate_semantics() {
    log_section "Layer 2: Semantic Validation"
    
    local layer_errors=0
    
    # Check for placeholders
    if grep -qE '\{\{[^}]+\}\}|XXX|TODO|TBD|\[PLACEHOLDER\]' "$OUTPUT_FILE"; then
        log_error "Found placeholder text that should be replaced"
        ((layer_errors++))
        ((SEMANTIC_ERRORS++))
        
        # Show which placeholders
        grep -nE '\{\{[^}]+\}\}|XXX|TODO|TBD|\[PLACEHOLDER\]' "$OUTPUT_FILE" | head -5 | while read -r line; do
            echo "    $line"
        done
    else
        log_pass "No placeholders found"
    fi
    
    # Add more semantic checks
    
    if [[ $layer_errors -eq 0 ]]; then
        log_pass "Semantic validation passed"
    else
        log_error "Semantic validation failed with $layer_errors error(s)"
    fi
}

validate_traceability() {
    log_section "Layer 3: Traceability Validation"
    
    local layer_errors=0
    
    # Check metadata section exists
    if ! grep -q "^metadata:" "$OUTPUT_FILE"; then
        log_error "Missing metadata section"
        ((layer_errors++))
        ((TRACEABILITY_ERRORS++))
    else
        log_pass "Metadata section present"
        
        # Check required metadata fields
        # Add specific checks based on your needs
    fi
    
    if [[ $layer_errors -eq 0 ]]; then
        log_pass "Traceability validation passed"
    else
        log_error "Traceability validation failed with $layer_errors error(s)"
    fi
}

validate_domain_specific() {
    log_section "Layer 4: {Domain}-Specific Validation"
    
    local layer_errors=0
    
    # Add domain-specific validation rules
    # Examples:
    # - Budget calculations
    # - Compliance standards
    # - Format requirements
    # - Business rules
    
    if [[ $layer_errors -eq 0 ]]; then
        log_pass "Domain-specific validation passed"
    else
        log_error "Domain validation failed with $layer_errors error(s)"
    fi
}

# ============================================================================
# Summary & Exit
# ============================================================================

print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}VALIDATION SUMMARY${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}❌ FAILED:${NC} $ERRORS error(s) found"
    else
        echo -e "${GREEN}✅ PASSED:${NC} All validations successful"
    fi
    
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}⚠️  WARNINGS:${NC} $WARNINGS warning(s)"
    fi
    
    echo ""
    echo "Layer Breakdown:"
    echo "  Schema/Structure:   $SCHEMA_ERRORS errors"
    echo "  Semantics:          $SEMANTIC_ERRORS errors"
    echo "  Traceability:       $TRACEABILITY_ERRORS errors"
    echo "  {Domain}-Specific:  $DOMAIN_ERRORS errors"
    echo ""
    
    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}Fix all errors before proceeding.${NC}"
    elif [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}Review warnings and decide if acceptable.${NC}"
    else
        echo -e "${GREEN}Output is valid and ready for use.${NC}"
    fi
}

exit_with_code() {
    if [[ $ERRORS -gt 0 ]]; then
        exit 1
    elif [[ $WARNINGS -gt 0 ]] && [[ "$STRICT_MODE" == "true" ]]; then
        log_error "Strict mode enabled: treating warnings as errors"
        exit 1
    elif [[ $WARNINGS -gt 0 ]]; then
        exit 3
    else
        exit 0
    fi
}

# ============================================================================
# Main
# ============================================================================

main() {
    parse_args "$@"
    check_dependencies
    check_file_exists
    
    validate_schema
    validate_semantics
    validate_traceability
    validate_domain_specific
    
    print_summary
    exit_with_code
}

main "$@"
```

### Validator Development Checklist

- [ ] **No `set -e`** - Collect all errors, don't exit on first failure
- [ ] Color constants defined (RED, GREEN, YELLOW, BLUE, NC)
- [ ] Error/warning/pass counters with layer-specific tracking
- [ ] Helper functions (log_error, log_warning, log_pass, log_section)
- [ ] Argument parsing (positional or --file flag)
- [ ] File existence check
- [ ] 4+ validation layers implemented
- [ ] Summary report with layer breakdown
- [ ] Exit code strategy (0=valid, 1=errors, 2=missing file, 3=warnings)
- [ ] VALIDATION_STRICT environment variable support
- [ ] Domain-specific configuration variables

### Standard Validation Layers

**All validators should implement:**

1. **Schema/Structure** - Required sections, format compliance, character limits
2. **Semantics** - No placeholders, content quality, completeness
3. **Traceability** - EPF source references, metadata, version tracking
4. **Domain-Specific** - External standards, calculations, business rules

**Optional additional layers:**
5. **Cross-Document Consistency** (if multi-document package)
6. **Freshness** (if time-sensitive data)

### Key Principles

1. **Collect ALL errors** - Don't use `set -e`, run all layers even if early ones fail
2. **Layer-specific counters** - Track errors by validation layer for debugging
3. **Configurable strictness** - Support VALIDATION_STRICT mode
4. **Clear exit codes** - 0/1/2/3 with documented meanings
5. **Detailed summary** - Show layer breakdown at end

---

## Component 4: README.md

### Purpose

Provide **QUICK REFERENCE** without requiring users to read full wizard (which can be 3,832 lines).

### Canonical Template

```markdown
# {Generator Name}

{One-paragraph description of what this generator does and who it's for}

---

## Quick Start

### 1. Generate {Output Type}

{Simplest way to invoke generator}

```bash
# Option 1: Ask AI assistant (RECOMMENDED)
"Generate {output} for {product} using EPF output generator"

# Option 2: Manual generation (if applicable)
{Command or procedure}
```

### 2. Validate {Output Type}

```bash
bash docs/EPF/outputs/{generator-name}/validator.sh \
  docs/EPF/_instances/{product}/outputs/{output-file}
```

### 3. Fix Issues

The validator will identify:
- **Errors** (must fix): {Error categories}
- **Warnings** (review): {Warning categories}

### 4. {Deliver/Submit/Use} {Output Type}

{What to do with validated output}

---

## Generator Components

| File | Purpose | Size |
|------|---------|------|
| `schema.json` | Input parameter validation | {X} KB |
| `wizard.instructions.md` | Generation logic | {X} KB |
| `validator.sh` | Output validation | {X} KB |
| `template.md` | Output structure (optional) | {X} KB |
| `README.md` | This file | {X} KB |

---

## Validation Layers

The validator performs {N} layers of checks:

### Layer 1: Schema/Structure
{Brief description of what this layer checks}

### Layer 2: Semantics
{Brief description of what this layer checks}

### Layer 3: Traceability
{Brief description of what this layer checks}

### Layer 4: {Domain}-Specific
{Brief description of what this layer checks}

---

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| `0` | Valid, ready for use | Proceed with output |
| `1` | Invalid (errors found) | Fix errors and re-validate |
| `2` | File not found / dependencies missing | Check file path / install dependencies |
| `3` | Warnings only (strict mode off) | Review warnings, decide if acceptable |

---

## Configuration

### Environment Variables

```bash
# Treat warnings as errors (strict mode)
VALIDATION_STRICT=true bash validator.sh {output}

# {Domain-specific variable 1}
VALIDATION_{PARAM}={value} bash validator.sh {output}
```

### {Other Configuration Points}

{If generator supports customization, explain how}

---

## Prerequisites

### Required EPF Files

- `00_north_star.yaml` - {What data is used}
- `04_strategy_formula.yaml` - {What data is used}
- `05_roadmap_recipe.yaml` - {What data is used}
- `value_models/*.yaml` - {What data is used}

### External Dependencies (if applicable)

- {Dependency 1} - Install with: `{command}`
- {Dependency 2} - Install with: `{command}`

---

## Troubleshooting

### Error: "{Common Error 1}"
**Cause:** {Why this happens}  
**Solution:** {How to fix}

### Error: "{Common Error 2}"
**Cause:** {Why this happens}  
**Solution:** {How to fix}

---

## See Also

- **Main Outputs Documentation:** [`docs/EPF/outputs/README.md`](../README.md)
- **Generator Guide:** [`docs/EPF/outputs/GENERATOR_GUIDE.md`](../GENERATOR_GUIDE.md)
- **Validation Guide:** [`docs/EPF/outputs/VALIDATION_README.md`](../VALIDATION_README.md)
- **Full Wizard Instructions:** [`wizard.instructions.md`](./wizard.instructions.md)

---

## Version History

| Generator Version | Changes | Date |
|-------------------|---------|------|
| 1.0.0 | Initial release | {date} |
```

### README Development Checklist

- [ ] One-paragraph overview at top
- [ ] Quick Start section (4 steps: generate, validate, fix, deliver)
- [ ] Generator components table with file sizes
- [ ] Validation layers explained (brief descriptions)
- [ ] Exit codes documented
- [ ] Environment variables listed
- [ ] Prerequisites (EPF files + external dependencies)
- [ ] Troubleshooting (3-5 common errors)
- [ ] See Also links to related documentation

### Key Principles

1. **Quick reference** - Don't duplicate full wizard, provide essentials
2. **Actionable** - User can generate and validate in < 5 minutes
3. **Troubleshooting** - Cover 80% of common errors
4. **Links** - Point to detailed docs for deep dives

---

## Optional Component: template.md

### When to Include

✅ **Include when:**
- Output has fixed structure (e.g., 8-section government form)
- External specification dictates format
- Variable substitution model (`{{placeholders}}`)
- Structure reusable across all products

❌ **Skip when:**
- Output structure varies by product/domain
- Purely AI-synthesized content
- Structure fully documented in wizard

### Template Structure

```markdown
# {Output Type} Template

**Version:** {template_version}  
**Schema Version:** {schema_version}  
**Last Updated:** {date}

---

## Template Variables

Variables use `{{double_brace}}` syntax and are replaced during generation.

### Required Variables

| Variable | Source | Example |
|----------|--------|---------|
| `{{product_name}}` | north_star.yaml | "Emergent" |
| `{{organization}}` | User input | "Eyedea AS" |

### Optional Variables

| Variable | Source | Default |
|----------|--------|---------|
| `{{tagline}}` | strategy_formula.yaml | "" |

---

## Output Structure

{Fixed structure with placeholders}

### Section 1: {Section Name}

**Purpose:** {Why this section exists}

{{variable_1}}

*{Guidance for content generation}*
*[Character limit: {N} characters if applicable]*

### Section 2: {Section Name}

{{variable_2}}

{Continue for all sections}

---

## Formatting Rules

1. **{Rule 1}**
2. **{Rule 2}**

---

## Compliance Notes (If External Standard)

This template aligns with:
- {Standard name} - {Section reference}
- {Specification} - {Version}

**Critical requirements:**
- {Requirement 1}
- {Requirement 2}
```

---

## Best Practices from skattefunn

### 1. Interactive User Input Collection (Phase 0.0)

**Pattern:** When EPF doesn't contain required data, prompt user early in process.

**Example:** Organization details, timeline, budget

```python
print("=" * 80)
print("📋 {GENERATOR} SETUP - {Information Type}")
print("=" * 80)
print()
print("EPF does not contain {type} information.")
print("I need to collect this from you.")
print()

field = input("Prompt: ").strip()
if not field:
    print("❌ Field is required")
    exit(1)

# Store and continue
```

**Why:** Fail fast if required data is missing; don't run full extraction then discover you need user input.

### 2. Interactive Filtering (Phase 0.5)

**Pattern:** When output requires subset of EPF data, let user select interactively.

**Example:** Choosing which Key Results to include in application

```markdown
| # | Phase | KR ID | KR Title | Eligible | Include? |
|---|-------|-------|----------|----------|----------|
| 1 | P1 | kr-p1-001 | Feature X | ✅ | [ ] |
| 2 | P1 | kr-p1-002 | Feature Y | ❌ Reason | [ ] |

**User selects minimum {N} items**

⚠️ **STOP: Get user confirmation before proceeding**
```

**Why:** Not all EPF data should go into every output; user knows business context.

### 3. Explicit Transformation Dictionaries

**Pattern:** Define exact mapping from EPF terminology to domain terminology.

**Example:**

| EPF Term | SkatteFUNN Term | Rule |
|----------|-----------------|------|
| "Key Result" | "R&D Activity" | Direct 1:1 |
| "Assumption to test" | "Technical Uncertainty" | Rephrase as question |
| "TRL 3→4" | "Applied Research" | Frascati category |

**Why:** Prevents inconsistent language; makes transformations auditable.

### 4. Validation Checkpoints Between Phases

**Pattern:** Stop and verify before moving to next phase.

```markdown
**⚠️ Validation Checkpoint**

Before continuing to Phase {N+1}, verify:
- [ ] {Requirement 1}
- [ ] {Requirement 2}
- [ ] {Requirement 3}

If any checks fail, stop and fix before proceeding.
```

**Why:** Catch errors early; don't waste time on Phase 3 if Phase 2 data is invalid.

### 5. Domain Compliance Mapping

**Pattern:** Map EPF data to external standards/regulations.

**Example:** Frascati R&D categories (for skattefunn)

```markdown
### Frascati R&D Categories

| TRL Range | Category | Eligibility |
|-----------|----------|-------------|
| 1-2 | Basic Research | ❌ Not eligible |
| 3-4 | Applied Research | ✅ Eligible |
| 5-7 | Experimental Development | ✅ Eligible |
| 8-9 | Market Launch | ❌ Not eligible |
```

**Why:** External outputs often must comply with regulations; make compliance explicit.

---

## Common Pitfalls & Solutions

### Pitfall 1: Schema Defines Output Structure

**Wrong:** Schema tries to validate the generated output's structure

**Right:** Schema validates input parameters; template or wizard defines output structure

**Example:**
```json
// ❌ Wrong - Validating output
{
  "required": ["section_1", "section_2", "section_3"],
  "properties": {
    "section_1": { "type": "string", "minLength": 500 }
  }
}

// ✅ Right - Validating inputs
{
  "required": ["organization", "timeline", "budget"],
  "properties": {
    "organization": { 
      "type": "object",
      "required": ["name", "org_number"]
    }
  }
}
```

### Pitfall 2: Using `set -e` in Validator

**Wrong:** Validator exits on first error

**Right:** Validator collects all errors and reports at end

**Why:** Users need to see ALL problems, not just the first one, to fix efficiently.

### Pitfall 3: Missing README

**Wrong:** Only wizard.instructions.md (3,832 lines) for reference

**Right:** README.md with quick start, validation layers, exit codes, troubleshooting

**Why:** Most users need quick reference, not full 3,832-line wizard.

### Pitfall 4: No Interactive Selection

**Wrong:** Generator automatically includes all EPF data

**Right:** User selects which data to include (Phase 0.5 pattern)

**Why:** Not all EPF data belongs in every output; user knows business context.

### Pitfall 5: Implicit Transformations

**Wrong:** Wizard says "transform EPF terms to domain terms" without examples

**Right:** Explicit transformation dictionary showing exact mappings

**Why:** Prevents inconsistent terminology and makes transformations auditable.

---

## Generator Lifecycle

### 1. Create Generator

```bash
# Start from skattefunn template
cp -r docs/EPF/outputs/skattefunn-application docs/EPF/outputs/{new-name}
cd docs/EPF/outputs/{new-name}

# Customize all files
# - schema.json
# - wizard.instructions.md
# - validator.sh
# - README.md
# - template.md (if needed)
```

### 2. Test Generator

```bash
# Generate test output following wizard
# (manual or with AI assistant)

# Validate output
bash validator.sh test-output.md

# Iterate until validator passes
```

### 3. Register Generator

Update `docs/EPF/outputs/README.md`:
- Add to directory structure
- Update generator status table
- Add usage example

### 4. Version Management

**Generator has independent version** from EPF framework:

```json
// schema.json
{
  "version": "1.0.0"  // Generator version
}
```

**Bump generator version when:**
- Schema changes (inputs change)
- Wizard logic changes (transformation rules change)
- Template changes (output structure changes)
- Validator changes (validation rules change)

**Version metadata in output:**
```yaml
metadata:
  generator_version: "1.2.0"
  schema_version: "1.1.0"
  template_version: "1.0.0"
  epf_version: "2.1.0"
```

### 5. Maintenance

**Regular tasks:**
- Test with latest EPF instances
- Update for new EPF artifact types
- Improve validator based on common errors
- Enhance wizard with user feedback
- Update examples and troubleshooting

**Breaking changes:**
- Bump MAJOR version when schema changes break existing usage
- Document migration path for users
- Consider maintaining old version temporarily

---

## Testing Checklist

Before considering generator production-ready:

### Functionality
- [ ] Generate output from minimal EPF instance
- [ ] Generate output from full EPF instance
- [ ] Validator passes on valid output
- [ ] Validator catches all error types
- [ ] Interactive selection works (if applicable)
- [ ] External input collection works (if applicable)

### Quality
- [ ] No placeholders remain in generated output
- [ ] All EPF terms properly transformed
- [ ] Metadata complete and accurate
- [ ] Output matches template structure (if applicable)
- [ ] Character limits respected
- [ ] Domain compliance verified

### Documentation
- [ ] README provides quick start
- [ ] Wizard has all 6 phases documented
- [ ] Transformation dictionary complete
- [ ] Validation layers explained
- [ ] Exit codes documented
- [ ] Troubleshooting covers common errors

### Integration
- [ ] Registered in outputs/README.md
- [ ] Works with AI assistant invocation
- [ ] Can be copied as template for new generators
- [ ] Follows all architectural standards
- [ ] No canonical purity violations

---

## Conclusion

Use **skattefunn-application** as your template. It demonstrates all best practices:

✅ Comprehensive README  
✅ Interactive user input (Phase 0.0)  
✅ Selective filtering (Phase 0.5)  
✅ Fixed template with placeholders  
✅ Explicit transformation dictionaries  
✅ Validation checkpoints between phases  
✅ Domain compliance mapping  
✅ All-errors validator (no `set -e`)  
✅ Complete documentation

**To create new generator:**

```bash
cp -r outputs/skattefunn-application outputs/{new-name}
# Customize for your domain
# Test thoroughly
# Register in outputs/README.md
```

Follow this guide and you'll build consistent, maintainable output generators that fit seamlessly into the EPF framework.
