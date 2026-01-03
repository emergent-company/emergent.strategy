# EPF Output Generators - Structural Analysis & Unification Recommendations

**Date:** 2026-01-03  
**Purpose:** Analyze existing generators to establish unified template for future generators  
**Reference Generators:** context-sheet, investor-memo, skattefunn-application  
**Strongest Example:** skattefunn-application (most comprehensive and production-ready)

---

## Executive Summary

The three existing generators show an **evolving architecture** with skattefunn-application representing the most mature implementation. Key findings:

1. **File structure is converging** - All generators now use self-contained folders
2. **Component maturity varies** - skattefunn has unique components (template.md, trim-violations.sh, comprehensive README)
3. **Validation sophistication increases** - From basic (context-sheet: 533 lines) to advanced (skattefunn: 875 lines)
4. **Wizard complexity scales with domain** - From simple (context-sheet: 554 lines) to complex (skattefunn: 3,832 lines)
5. **Documentation quality improves** - skattefunn has comprehensive README (187 lines) vs others (none)

**Recommendation:** Use skattefunn-application as the **canonical template** for future generators, with minor adaptations based on output complexity.

---

## Component-by-Component Analysis

### 1. Directory Structure

#### Current State

| Component | context-sheet | investor-memo | skattefunn | Standard? |
|-----------|--------------|---------------|------------|-----------|
| `schema.json` | ✅ (408 lines) | ✅ (527 lines) | ✅ (460 lines) | ✅ YES |
| `wizard.instructions.md` | ✅ (554 lines) | ✅ (1,341 lines) | ✅ (3,832 lines) | ✅ YES |
| `validator.sh` | ✅ (533 lines) | ✅ (824 lines) | ✅ (875 lines) | ✅ YES |
| `template.md` | ❌ | ❌ | ✅ (331 lines) | ⚠️ OPTIONAL |
| `README.md` | ❌ | ❌ | ✅ (187 lines) | ⚠️ RECOMMENDED |
| `trim-violations.sh` | ❌ | ❌ | ✅ (259 lines) | ⚠️ DOMAIN-SPECIFIC |

#### Recommendations

**MANDATORY for all generators:**
```
{generator-name}/
├── schema.json                 # Input validation
├── wizard.instructions.md      # Generation logic
├── validator.sh                # Output validation
└── README.md                   # Quick start & overview (NEW - from skattefunn)
```

**OPTIONAL (add when appropriate):**
```
{generator-name}/
├── template.md                 # If output has fixed structure
├── {domain}-specific.sh        # Domain-specific utilities (like trim-violations.sh)
└── examples/                   # Sample inputs/outputs for testing
```

**REMOVED (violates directory naming conventions):**
- No QUICK_REFERENCE.md (use README.md instead)
- No TEST_RUN_REPORT.md (belongs in .epf-work/ or tests/)
- No IMPLEMENTATION_SUMMARY.md (belongs in .epf-work/)

---

### 2. Schema Structure (schema.json)

#### Similarities

All three schemas share:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "{Generator Name}",
  "description": "{Purpose}",
  "version": "{semver}",
  "type": "object",
  "required": [...],
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "generated_at": { "type": "string", "format": "date-time" },
        "epf_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
        "generator": { "type": "string" },
        "generator_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" }
      }
    }
  }
}
```

#### Differences

| Aspect | context-sheet | investor-memo | skattefunn | Best Practice |
|--------|--------------|---------------|------------|---------------|
| **$id field** | ✅ Uses emergent.build domain | ✅ Uses emergent.sh domain | ❌ Missing | ✅ INCLUDE (with canonical domain) |
| **Metadata location** | Top-level definitions | Top-level required | Not in schema (input params only) | ✅ Top-level (context/investor) |
| **Source tracking** | `source_files[]` array | `epf_sources{}` object | `epf_sources{}` object | ✅ `epf_sources{}` (more structured) |
| **Version tracking** | generator_version optional | Package version included | Schema version in top-level | ✅ Both schema + generator versions |
| **Domain constraints** | Generic EPF | Investment-specific enums | Norwegian R&D specific | ⚠️ Domain-appropriate |

#### Canonical Schema Template

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://emergent.build/schemas/outputs/{generator-name}.schema.json",
  "title": "{Human-Readable Generator Name}",
  "description": "{Purpose and use case}",
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
  
  "required": ["{domain-specific-fields}"],
  "properties": {
    // Domain-specific input parameters
  }
}
```

**Key Decision:** Schema represents **INPUT parameters** (skattefunn) OR **OUTPUT structure** (context-sheet, investor-memo)?

- **skattefunn:** Schema defines inputs (organization, timeline, budget) - wizard generates output
- **context-sheet/investor-memo:** Schema defines output structure - wizard validates against it

**Recommendation:** **Input-focused schemas** (skattefunn approach) are more practical:
- Easier to validate user inputs before generation
- Output structure can vary based on domain requirements
- Clearer separation: schema = input validation, template = output structure
- Allows domain-specific output formats without schema changes

---

### 3. Validator Scripts (validator.sh)

#### Architecture Evolution

**Generation 1 (context-sheet):**
```bash
# Simple validation layers
- Metadata validation (HTML comment block)
- Semantic rules (content quality)
- Freshness checks (source age)
- Markdown formatting
```

**Generation 2 (investor-memo):**
```bash
# Multi-document package validation
- Schema validation (using ajv-cli)
- Document completeness (all 5 docs present)
- Cross-document consistency
- EPF traceability
- Freshness
- Format/structure
```

**Generation 3 (skattefunn):**
```bash
# Domain-specific validation
- Schema structure (8 required sections)
- Semantic rules (placeholders, TRL ranges, technical language)
- Budget mathematics (reconciliation across dimensions)
- Traceability (roadmap KR references)
- Frascati R&D compliance indicators
```

#### Common Patterns (All Three)

1. **Shebang + Description Block**
   ```bash
   #!/bin/bash
   #
   # {Generator Name} Validator
   # 
   # Validates EPF-generated {outputs} against:
   # 1. {Layer 1 description}
   # 2. {Layer 2 description}
   # ...
   ```

2. **Configuration Section**
   ```bash
   # ============================================================================
   # Configuration
   # ============================================================================
   
   MAX_AGE=${VALIDATION_MAX_AGE:-90}
   STRICT_MODE=${VALIDATION_STRICT:-false}
   ```

3. **Color Constants**
   ```bash
   RED='\033[0;31m'
   GREEN='\033[0;32m'
   YELLOW='\033[0;33m'
   BLUE='\033[0;34m'
   NC='\033[0m'
   ```

4. **Error/Warning Counters**
   ```bash
   ERRORS=0
   WARNINGS=0
   PASSED=0
   
   # Layer-specific counters
   SCHEMA_ERRORS=0
   SEMANTIC_ERRORS=0
   # ...
   ```

5. **Helper Functions**
   ```bash
   log_error() { echo -e "${RED}✗ ERROR:${NC} $1"; ((ERRORS++)); }
   log_warning() { echo -e "${YELLOW}⚠ WARNING:${NC} $1"; ((WARNINGS++)); }
   log_pass() { echo -e "${GREEN}✓${NC} $1"; ((PASSED++)); }
   log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
   log_section() { echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━${NC}"; }
   ```

6. **Validation Layers Structure**
   ```bash
   validate_layer_1() {
     log_section "Layer 1: {Name}"
     # Validation checks
   }
   
   validate_layer_2() {
     log_section "Layer 2: {Name}"
     # Validation checks
   }
   ```

7. **Main Execution Flow**
   ```bash
   main() {
     parse_args "$@"
     check_file_exists
     
     validate_layer_1
     validate_layer_2
     validate_layer_3
     
     print_summary
     exit_with_code
   }
   
   main "$@"
   ```

8. **Exit Code Strategy**
   ```bash
   # 0 - Valid
   # 1 - Invalid (errors)
   # 2 - File not found / missing dependencies
   # 3 - Warnings only (strict mode off)
   ```

#### Key Differences

| Aspect | context-sheet | investor-memo | skattefunn | Best Practice |
|--------|--------------|---------------|------------|---------------|
| **set -e** | ✅ Uses strict mode | ✅ Uses strict mode | ❌ Explicitly avoids | ❌ **Avoid `set -e`** (collect all errors) |
| **Dependencies** | None (pure bash) | yq + ajv-cli | None (pure bash) | ⚠️ Pure bash preferred, but domain tools acceptable |
| **Metadata parsing** | HTML comments | JSON with yq | Markdown headers | ⚠️ Domain-appropriate |
| **Layer granularity** | 4 layers | 6 layers | 4 layers (but complex) | ⚠️ 4-6 layers typical |
| **Summary report** | Basic counts | Detailed layer breakdown | Detailed + recommendations | ✅ Detailed breakdown |
| **Strict mode** | Boolean env var | Boolean env var | Boolean env var | ✅ Configurable strictness |

#### Canonical Validator Template

```bash
#!/bin/bash
#
# {Generator Name} Validator
# 
# Validates EPF-generated {outputs} against:
# 1. Schema/Structure - Required sections and format
# 2. Semantic Rules - Content quality and completeness
# 3. Traceability - EPF source references
# 4. Domain-Specific - {Domain} requirements
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

# ============================================================================
# Configuration
# ============================================================================

STRICT_MODE=${VALIDATION_STRICT:-false}
# Domain-specific configuration

# ============================================================================
# Colors
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
    ((SCHEMA_ERRORS++))  # Or appropriate layer counter
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
}

# ============================================================================
# Validation Layers
# ============================================================================

validate_schema() {
    log_section "Layer 1: Schema/Structure Validation"
    
    # Check required sections
    # Check format compliance
    # Check character limits (if applicable)
}

validate_semantics() {
    log_section "Layer 2: Semantic Validation"
    
    # Check for placeholders
    # Check content quality
    # Check completeness
}

validate_traceability() {
    log_section "Layer 3: Traceability Validation"
    
    # Check EPF source references
    # Verify roadmap KR links
    # Validate freshness
}

validate_domain_specific() {
    log_section "Layer 4: {Domain}-Specific Validation"
    
    # Domain-specific checks
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

---

### 4. Wizard Instructions (wizard.instructions.md)

#### Common Structure Elements

All three wizards follow similar patterns:

```markdown
# {Generator Name}

**Purpose:** {One-line description}
**Output:** {Format and location}
**Schema:** schema.json
**Validation:** validator.sh

---

## Overview

{2-3 paragraphs explaining what this generator does, why it exists, and when to use it}

---

## Prerequisites

### Required EPF Sources

1. **North Star** (`00_north_star.yaml`)
   - {What data is needed}

2. **Strategy Formula** (`04_strategy_formula.yaml`)
   - {What data is needed}

3. **Roadmap Recipe** (`05_roadmap_recipe.yaml`)
   - {What data is needed}

4. **Value Models** (`value_models/*.yaml`)
   - {What data is needed}

### Validation Checklist

Before generating:
- [ ] All required EPF files exist
- [ ] Files are up-to-date (< 30-90 days old)
- [ ] {Domain-specific prerequisites}

---

## Generation Steps

### Phase 0: {Preparation/Validation}

{Pre-flight checks}

### Phase 1: {Data Extraction}

{How to read and extract from EPF files}

### Phase 2: {Transformation}

{How to transform EPF language to output language}

### Phase 3: {Assembly}

{How to structure the final output}

### Phase 4: {Validation}

{How to validate before delivery}

---

## Output Structure

{Template or structure description}

---

## Quality Checklist

Before delivery:
- [ ] {Quality check 1}
- [ ] {Quality check 2}
- [ ] Validator passes: `bash validator.sh output.md`

---

## Troubleshooting

{Common issues and solutions}
```

#### Key Differences by Complexity

**Simple (context-sheet: 554 lines)**
- Straightforward extraction from 4 EPF files
- Minimal transformation (mostly copy-paste with formatting)
- Single output document
- Quick validation

**Medium (investor-memo: 1,341 lines)**
- Complex extraction from 5+ EPF files
- Significant transformation (EPF → investor language)
- Multiple output documents (5 total)
- Cross-document consistency validation

**Complex (skattefunn: 3,832 lines)**
- Multi-phase process with user interaction (Phase 0.0, 0.5)
- Complex domain mapping (EPF → Norwegian R&D compliance)
- Extensive transformation rules (Frascati R&D categories, TRL mapping)
- Budget calculations and reconciliation
- Work package structuring
- Interactive KR selection with filtering

#### Unique Patterns in skattefunn (Should Be Standardized)

1. **User Input Collection (Phase 0.0)**
   ```markdown
   ### Phase 0.0: Project Information Collection (MANDATORY)
   
   ⚠️ **EPF DOES NOT CONTAIN THIS INFORMATION**
   
   These are implementation details that exist outside EPF:
   - Organization details (name, org number, contacts)
   - Project timeline (start/end dates)
   - Total budget (financial planning)
   ```
   
   **Lesson:** Recognize when EPF doesn't contain required information and prompt user early.

2. **Interactive Filtering (Phase 0.5)**
   ```markdown
   ### Phase 0.5: Interactive Key Result Selection (MANDATORY)
   
   **Present User with Table:**
   | # | Phase | KR ID | KR Title | TRL | Include? |
   |---|-------|-------|----------|-----|----------|
   | 1 | P1 | kr-p1-001 | ... | 3→4 | [ ] |
   | 2 | P1 | kr-p1-002 | ... | 2→3 | [ ] |
   
   **User selects which KRs to include (minimum 5 R&D activities)**
   
   ⚠️ **STOP AFTER THIS PHASE AND GET USER CONFIRMATION**
   ```
   
   **Lesson:** When output requires selectivity, provide interactive selection interface.

3. **Domain Language Transformation Rules**
   ```markdown
   ### Transformation Rules: EPF → SkatteFUNN Language
   
   | EPF Term | SkatteFUNN Term |
   |----------|-----------------|
   | "Key Result" | "R&D Activity" |
   | "Assumption to test" | "Technical Uncertainty" |
   | "Milestone" | "Work Package" |
   | TRL progression (3→4) | "Systematic development" |
   ```
   
   **Lesson:** Explicit transformation dictionaries prevent inconsistent language.

4. **Validation Checkpoints Between Phases**
   ```markdown
   **⚠️ STOP: Validate Before Proceeding to Phase 2**
   
   Before continuing, verify:
   - [ ] At least 5 distinct R&D activities selected
   - [ ] All TRL ranges are 2-7 (not 1 or 8-9)
   - [ ] Total budget ≤ 25M NOK/year
   - [ ] Timeline is 1-48 months
   ```
   
   **Lesson:** Break complex generations into validated phases, don't run end-to-end blindly.

5. **Compliance Mapping (Frascati Manual)**
   ```markdown
   ### Frascati R&D Categories
   
   Each R&D activity must map to one of:
   1. **Basic Research** - TRL 1-2 (not eligible for SkatteFUNN)
   2. **Applied Research** - TRL 3-4 (eligible)
   3. **Experimental Development** - TRL 5-7 (eligible)
   
   **Mapping Logic:**
   - TRL 3→4: Applied Research
   - TRL 4→5: Experimental Development
   - TRL 5→6: Experimental Development
   - TRL 6→7: Experimental Development
   ```
   
   **Lesson:** When output must comply with external standards, include explicit mapping logic.

#### Canonical Wizard Template

```markdown
# {Generator Name} - Wizard Instructions

**Version:** 1.0.0  
**Schema Version:** 1.0.0  
**Purpose:** {One-line purpose}  
**Output Format:** {Markdown/JSON/etc.}  
**Target Audience:** {Who will consume this output}

---

## ⚠️ CRITICAL: Generation Process Overview

This wizard MUST be executed sequentially. Each phase depends on the previous one.

### Phase 0: Pre-flight Validation
### Phase 1: EPF Data Extraction
### Phase 2: {Domain-Specific Processing}
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

### Step 0.2: Collect External Information (If Required)

⚠️ **EPF DOES NOT CONTAIN:**
- {List information that must come from user}

**Interactive prompt:**
```
{User input collection script/instructions}
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

## Phase 2: {Interactive Selection / Filtering} (If Applicable)

⚠️ **If output requires user selection (e.g., which features to include):**

### Step 2.1: Present Options to User

```markdown
**{Selection Context}**

{Table or list of options}

| # | Item | Details | Include? |
|---|------|---------|----------|
| 1 | ... | ... | [ ] |
| 2 | ... | ... | [ ] |
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

| EPF Term | {Domain} Term | Example |
|----------|---------------|---------|
| "Key Result" | "{Domain equivalent}" | ... |
| "Assumption" | "{Domain equivalent}" | ... |
| "Milestone" | "{Domain equivalent}" | ... |

### Step 3.2: Apply Formatting Rules

{Domain-specific formatting requirements}

**Validation Checkpoint:**
- [ ] All EPF terms transformed
- [ ] Formatting rules applied
- [ ] No EPF jargon remains

---

## Phase 4: Document Assembly

### Step 4.1: Generate Output Structure

{Template or structure description}

### Step 4.2: Populate Sections

{Section-by-section population logic}

### Step 4.3: Add Metadata

```yaml
metadata:
  generated_at: "{ISO 8601 timestamp}"
  epf_version: "{from VERSION file}"
  generator: "{generator-name}.wizard.md"
  generator_version: "{version}"
  epf_sources:
    north_star: "docs/EPF/_instances/{product}/00_north_star.yaml"
    strategy_formula: "..."
    roadmap_recipe: "..."
    value_models: [...]
```

**Validation Checkpoint:**
- [ ] All sections complete
- [ ] Metadata accurate
- [ ] Output matches expected structure

---

## Phase 5: Validation

### Step 5.1: Run Validator

```bash
bash docs/EPF/outputs/{generator-name}/validator.sh {output-file}
```

### Step 5.2: Fix Errors

{Common errors and how to fix them}

### Step 5.3: Review Warnings

{Common warnings and when to ignore vs. fix}

**Final Checklist:**
- [ ] Validator passes (exit code 0)
- [ ] All placeholders replaced
- [ ] {Domain-specific quality checks}
- [ ] Output ready for delivery

---

## Output Structure

{Detailed template or example structure}

---

## Quality Criteria

Before considering output complete:

1. **Completeness**
   - [ ] All required sections present
   - [ ] No placeholders or TODOs
   - [ ] All data fields populated

2. **Accuracy**
   - [ ] EPF data correctly extracted
   - [ ] Transformations applied correctly
   - [ ] Calculations accurate (if applicable)

3. **Traceability**
   - [ ] EPF sources referenced
   - [ ] Version information complete
   - [ ] Generation timestamp accurate

4. **{Domain}-Specific Quality**
   - [ ] {Domain requirement 1}
   - [ ] {Domain requirement 2}

---

## Troubleshooting

### Error: "Missing required EPF file"
**Cause:** ...  
**Solution:** ...

### Error: "{Domain-specific error}"
**Cause:** ...  
**Solution:** ...

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | {date} | Initial release |
```

---

### 5. README.md (skattefunn only, but should be standard)

#### Current skattefunn README Structure

```markdown
# {Generator Name}

{One-paragraph overview}

## Quick Start

### 1. Generate {Output}
{Command or instructions}

### 2. Validate {Output}
{Validation command}

### 3. Fix Issues
{Issue categories}

### 4. Deliver/Submit {Output}
{Delivery instructions}

## Files

{Table of generator files and their purposes}

## Validation Layers

{Description of each validation layer}

## Exit Codes

{Exit code reference}

## Environment Variables

{Configuration options}
```

**Why This Should Be Standard:**
- Provides quick reference without reading full wizard (3,832 lines)
- Explains validation layers (users need to understand what's being checked)
- Documents exit codes (critical for CI/CD integration)
- Shows environment variables (power users can customize)

#### Canonical README Template

```markdown
# {Generator Name}

{One-paragraph description of what this generator does and who it's for}

---

## Quick Start

### 1. Generate {Output Type}

{Simplest way to invoke generator}

```bash
# Option 1: Ask AI assistant
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
| `template.md` | Output structure (if applicable) | {X} KB |
| `README.md` | This file | {X} KB |

---

## Validation Layers

The validator performs {N} layers of checks:

### Layer 1: {Name}
{What this layer checks}

### Layer 2: {Name}
{What this layer checks}

{Continue for all layers}

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

# {Domain-specific variable 2}
VALIDATION_{PARAM}={value} bash validator.sh {output}
```

### Customization Points

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

- **Main Outputs Documentation:** `docs/EPF/outputs/README.md`
- **Validation Guide:** `docs/EPF/outputs/VALIDATION_README.md`
- **Generator Wizard:** `docs/EPF/outputs/{generator-name}/wizard.instructions.md`

---

## Version History

| Generator Version | Changes | Date |
|-------------------|---------|------|
| 1.0.0 | Initial release | {date} |
```

---

### 6. Template Files (template.md)

#### When to Include a Template

**INCLUDE template.md when:**
- Output has a **fixed structure** (e.g., skattefunn has 8 mandatory sections)
- Output follows an **external specification** (e.g., government form, API spec)
- Output uses **variable substitution** ({{placeholders}})
- Structure is **reusable across instances** (same for all products)

**SKIP template.md when:**
- Output structure **varies by product** (e.g., investor memo sections depend on business model)
- Output is **purely generated** (no fixed template, AI synthesizes from EPF)
- Structure is **fully documented in wizard** (redundant to have separate template)

#### skattefunn Template Pattern (Good Example)

```markdown
# {Output Name} Template v{version}

{Description of template purpose and variables}

**Variables are denoted with {{variable_name}} and will be replaced during generation.**
**{External compliance notes}**

---

{Fixed structure with placeholders}

## Section 1: {Section Name}

{{placeholder_1}}
*[Character limit: {N} characters]*

{{placeholder_2}}
*[Character limit: {N} characters]*

...
```

**Key Elements:**
1. **Version number** in title (template can evolve independently)
2. **Variable syntax explanation** (how to identify placeholders)
3. **Character limits** (domain-specific constraints)
4. **Section structure** (exactly matching required output)
5. **Inline documentation** (what each section should contain)

#### Canonical Template Format (If Used)

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
*[Character limit: {N} if applicable]*

### Section 2: {Section Name}

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

## Unified Generator Architecture

Based on analysis, here's the recommended standard architecture:

### Mandatory Components

```
{generator-name}/
├── schema.json                 # Input validation (JSON Schema)
├── wizard.instructions.md      # Generation logic (Markdown)
├── validator.sh                # Output validation (Bash)
└── README.md                   # Quick reference (Markdown)
```

**Size Guidelines:**
- schema.json: 300-500 lines (depends on domain complexity)
- wizard.instructions.md: 500-4000 lines (scales with domain complexity)
- validator.sh: 500-900 lines (depends on validation rigor)
- README.md: 100-200 lines (concise reference)

### Optional Components

```
{generator-name}/
├── template.md                 # If output has fixed structure
├── {domain}-util.sh            # Domain-specific utilities
└── examples/                   # Sample inputs/outputs
    ├── input-example.json
    └── output-example.md
```

### File Naming Conventions

| File Type | Name | NOT |
|-----------|------|-----|
| Schema | `schema.json` | `{generator}_schema.json` |
| Wizard | `wizard.instructions.md` | `{generator}_generator.wizard.md` |
| Template | `template.md` | `{generator}_template.md` |
| Validator | `validator.sh` | `validate-{generator}.sh` |
| README | `README.md` | `QUICK_REFERENCE.md` |

**Rationale:** Folder structure provides namespacing, so filenames can be generic and consistent.

---

## Recommendations for New Generators

### 1. Use skattefunn as Primary Template

**Copy structure from:**
```bash
cp -r docs/EPF/outputs/skattefunn-application docs/EPF/outputs/new-generator
```

**Then adapt:**
- Rename files (keep structure)
- Update schema for new domain
- Rewrite wizard phases for new transformation logic
- Adapt validator for new validation rules
- Customize README for new use case

### 2. Follow Phase-Based Wizard Pattern

```markdown
Phase 0: Pre-flight & External Input Collection
Phase 1: EPF Data Extraction
Phase 2: Interactive Selection (if needed)
Phase 3: Domain Transformation
Phase 4: Document Assembly
Phase 5: Validation
```

**Stop points:** Add ⚠️ warnings when user input or confirmation required.

### 3. Implement Layered Validation

**Standard 4-layer pattern:**
1. **Schema/Structure** - Required sections, format compliance
2. **Semantics** - Content quality, placeholders, completeness
3. **Traceability** - EPF source references, version tracking
4. **Domain-Specific** - External standard compliance, calculations

**Additional layers for complex domains:**
5. **Cross-Document Consistency** (if multiple outputs)
6. **Freshness** (if time-sensitive data)

### 4. Include Domain Transformation Dictionary

Always include explicit mapping table:

```markdown
### Transformation Rules: EPF → {Domain}

| EPF Term | {Domain} Term | Notes |
|----------|---------------|-------|
| "Key Result" | "{domain equivalent}" | {transformation rule} |
| "Assumption" | "{domain equivalent}" | {transformation rule} |
| "Milestone" | "{domain equivalent}" | {transformation rule} |
```

### 5. Document All Configuration Options

In README.md and validator.sh, always document:
- Environment variables with defaults
- Exit codes and meanings
- Command-line arguments
- Strict mode behavior

### 6. Add Validation Checkpoints

Between major phases in wizard, add:

```markdown
**⚠️ Validation Checkpoint**

Before continuing, verify:
- [ ] {Check 1}
- [ ] {Check 2}
- [ ] {Check 3}

If any checks fail, stop and fix before proceeding.
```

### 7. Include Examples and Troubleshooting

**In README.md:**
- Quick start example (copy-paste ready)
- Common errors with solutions
- Expected output structure sample

**In wizard.instructions.md:**
- Example transformations
- Before/after samples
- Edge case handling

### 8. Version Everything

Track versions for:
- Generator itself (wizard version)
- Schema version (may evolve independently)
- Template version (if used)
- EPF version (compatibility)

**Version metadata in output:**
```yaml
metadata:
  generator_version: "1.0.0"
  schema_version: "1.0.0"
  template_version: "1.0.0"  # if applicable
  epf_version: "2.1.0"
```

---

## Differences Summary

### Evolution Pattern

**Generation 1 (context-sheet):**
- Simplest structure
- Basic validation
- No template (free-form output)
- No README

**Generation 2 (investor-memo):**
- Multi-document package
- Cross-document validation
- External dependencies (yq, ajv)
- No README

**Generation 3 (skattefunn):**
- Interactive phases with user input
- Domain compliance mapping
- Fixed template structure
- Comprehensive README
- Domain-specific utilities

**Recommendation:** **Gen 3 architecture** is the standard, adapt complexity as needed.

### Key Architectural Decisions

| Decision | context-sheet | investor-memo | skattefunn | Recommendation |
|----------|--------------|---------------|------------|----------------|
| **Schema purpose** | Output structure | Output structure | Input parameters | ✅ **Input params** (skattefunn) |
| **Template file** | ❌ None | ❌ None | ✅ Fixed structure | ⚠️ **When structure is fixed** |
| **README file** | ❌ None | ❌ None | ✅ Comprehensive | ✅ **Always include** |
| **User interaction** | ❌ None | ❌ None | ✅ Phase 0.0, 0.5 | ✅ **When EPF lacks data** |
| **Validation strictness** | set -e (stop on error) | set -e (stop on error) | Collect all errors | ✅ **Collect all** (skattefunn) |
| **Dependencies** | None | yq + ajv | None | ⚠️ **Pure bash preferred** |
| **Domain utilities** | ❌ None | ❌ None | ✅ trim-violations.sh | ⚠️ **When domain needs it** |

---

## Action Items for Standardization

### 1. Immediate (Add to context-sheet and investor-memo)

- [ ] Add README.md to both generators (following skattefunn pattern)
- [ ] Move any working documents out of generator folders to .epf-work/
- [ ] Update validators to avoid `set -e` and collect all errors
- [ ] Add validation checkpoint sections between wizard phases

### 2. Short-term (Documentation updates)

- [ ] Create GENERATOR_TEMPLATE.md in outputs/ folder
  - Canonical structure
  - File templates
  - Copy-paste starter files
- [ ] Update outputs/STRUCTURE.md with standardization decisions
- [ ] Add "Creating a New Generator" step-by-step guide to outputs/README.md

### 3. Medium-term (Architectural improvements)

- [ ] Consider refactoring investor-memo to use input-focused schema (like skattefunn)
- [ ] Add template.md to investor-memo if structure becomes standardized
- [ ] Evaluate if context-sheet needs interactive selection (Phase 0.5 pattern)
- [ ] Consider consolidating validator common functions into shared library

### 4. Long-term (Framework evolution)

- [ ] Build generator scaffolding script: `create-new-generator.sh {name}`
- [ ] Add generator version bump automation
- [ ] Create test suite for validators
- [ ] Document generator lifecycle (create → validate → evolve → deprecate)

---

## Conclusion

**Strongest Example:** skattefunn-application demonstrates mature architecture:
- Comprehensive README for quick reference
- Interactive user input collection (Phase 0.0)
- Selective filtering (Phase 0.5)
- Fixed template for external compliance
- Domain-specific utilities (trim-violations.sh)
- Explicit transformation dictionaries
- Validation checkpoints between phases
- Thorough error collection (no set -e)

**Standardization Path:**
1. Use skattefunn folder structure as template
2. Always include README.md (quick reference)
3. Schema defines inputs, template defines outputs (when fixed)
4. Wizard has phased approach with validation checkpoints
5. Validator collects all errors (no premature exit)
6. Document configuration options and exit codes
7. Include transformation dictionaries and troubleshooting

**Copy-Paste Starting Point:**
```bash
# Create new generator from skattefunn template
cp -r docs/EPF/outputs/skattefunn-application docs/EPF/outputs/{new-generator}
cd docs/EPF/outputs/{new-generator}

# Adapt files (keep structure, change content)
# - schema.json: Define input parameters for your domain
# - wizard.instructions.md: Define transformation logic
# - template.md: Define output structure (if fixed)
# - validator.sh: Define validation rules
# - README.md: Customize quick reference
```

This analysis provides a foundation for building consistent, maintainable output generators going forward.
