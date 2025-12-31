# EPF Output Generators - Directory Structure

**Last Updated:** December 31, 2025

---

## Overview

Each output generator is **self-contained** in its own folder with all necessary files:
- `schema.json` - Input validation (required fields, types, constraints)
- `wizard.instructions.md` - Generation logic and transformation rules
- `template.md` - Output structure (optional, if fixed template exists)
- `validator.sh` - Output validation script (optional)
- Additional documentation (QUICK_REFERENCE.md, TEST_RUN_REPORT.md, etc.)

---

## Current Structure

```
docs/EPF/outputs/
├── README.md                           # Main documentation
├── QUICK_START.md                      # Getting started guide
├── VALIDATION_README.md                # Validation documentation
├── STRUCTURE.md                        # This file
│
├── context-sheet/                      # Context Sheet Generator
│   ├── schema.json                     # Input validation (11.8 KB)
│   ├── wizard.instructions.md          # Generation logic (15.0 KB)
│   └── validator.sh                    # Output validation (20.4 KB)
│
├── investor-memo/                      # Investor Materials Generator
│   ├── schema.json                     # Input validation (17.1 KB)
│   ├── wizard.instructions.md          # Generation logic (34.3 KB)
│   └── validator.sh                    # Output validation (30.6 KB)
│
└── skattefunn-application/             # SkatteFUNN (Norwegian R&D Tax) Generator
    ├── schema.json                     # Input validation (6.8 KB)
    ├── wizard.instructions.md          # Generation logic (23.4 KB)
    ├── template.md                     # Output template (5.6 KB)
    ├── QUICK_REFERENCE.md              # Usage guide (17.4 KB)
    └── TEST_RUN_REPORT.md              # Validation proof (24.7 KB)
```

---

## Generator Status

| Generator | Status | Schema | Wizard | Template | Validator | Docs |
|-----------|--------|--------|--------|----------|-----------|------|
| **context-sheet** | ✅ Production | ✅ | ✅ | - | ✅ | - |
| **investor-memo** | ✅ Production | ✅ | ✅ | - | ✅ | - |
| **skattefunn-application** | ✅ Production | ✅ | ✅ | ✅ | ⏳ TBD | ✅ |

---

## Adding a New Generator

### 1. Create Generator Folder

```bash
cd docs/EPF/outputs
mkdir my-new-generator
cd my-new-generator
```

### 2. Create Required Files

**Minimum Required:**
- `schema.json` - Input validation
- `wizard.instructions.md` - Generation logic

**Recommended:**
- `template.md` - Output template (if fixed structure)
- `validator.sh` - Output validation script
- `QUICK_REFERENCE.md` - Usage guide for future users

### 3. File Naming Conventions

| File | Naming | Purpose |
|------|--------|---------|
| Schema | `schema.json` | Input validation, NOT `{generator}_schema.json` |
| Wizard | `wizard.instructions.md` | Generation logic, NOT `{generator}_generator.wizard.md` |
| Template | `template.md` | Output structure, NOT `{generator}_template.md` |
| Validator | `validator.sh` | Output validation, NOT `validate-{generator}.sh` |

**Rationale:** Since each generator is in its own folder, file names can be simple and consistent across all generators.

### 4. Update Main README

Edit `docs/EPF/outputs/README.md`:
- Add generator to directory structure
- Update generator status table
- Add usage example

---

## File Responsibilities

### schema.json

**Purpose:** Validate user inputs BEFORE generation

**Contents:**
- Required fields (e.g., `organization`, `budget`, `timeline`)
- Field types and constraints (e.g., `max_budget: 25000000`)
- Validation rules (e.g., `timeline: 1-48 months`)
- Default values where applicable

**Example:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["organization", "start_date", "end_date"],
  "properties": {
    "organization": {
      "type": "object",
      "required": ["name", "org_number"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "org_number": { "type": "string", "pattern": "^[0-9]{9}$" }
      }
    }
  }
}
```

### wizard.instructions.md

**Purpose:** Generation logic - how to transform EPF data into output

**Contents:**
- **Prerequisites:** Required EPF files and data
- **Phase-by-phase logic:** Extraction → Transformation → Assembly
- **Transformation rules:** How to convert EPF language to output language
- **Quality checklist:** Validation points before output
- **Examples:** Before/after transformations

**Structure:**
```markdown
# {Generator Name}

## Overview
- Purpose, audience, expected time

## Prerequisites
- Required EPF files
- Required user inputs

## Phase 1: Pre-flight Validation
- Check EPF completeness
- Validate user parameters

## Phase 2: Data Extraction
- What to read from EPF files
- How to structure extracted data

## Phase 3: Content Synthesis
- Transformation rules (core logic)
- Language patterns (mandatory/avoided phrases)
- Section-by-section generation

## Phase 4: Document Assembly
- How to structure final output
- Formatting requirements

## Phase 5: Quality Assurance
- Validation checklist
- Common issues and fixes
```

### template.md

**Purpose:** Output structure (optional, only if fixed template exists)

**When to Include:**
- Output has fixed sections/structure
- Boilerplate text that's always the same
- Tables with consistent columns

**When to Skip:**
- Output structure varies significantly
- Content is fully dynamic based on inputs

**Example:**
```markdown
# {Project Title}

## 1. Organization Information

| Field | Value |
|-------|-------|
| Organization Name | {{organization.name}} |
| Org Number | {{organization.org_number}} |

## 2. Project Details

{{project.background}}

### 2.1 Technical Challenges

{{technical_challenges}}
```

### validator.sh

**Purpose:** Validate generated output AFTER generation

**Contents:**
- Check required sections exist
- Verify data completeness (no [TBD] placeholders)
- Validate calculations (e.g., budget sums to 100%)
- Language pattern checks (mandatory phrases present)

**Example:**
```bash
#!/bin/bash

# Check required sections
sections=("Organization" "Technical Challenges" "Budget")
for section in "${sections[@]}"; do
  if ! grep -q "## $section" "$file"; then
    echo "❌ Missing section: $section"
    exit 1
  fi
done

# Check for placeholders
if grep -q "\[TBD\]" "$file"; then
  echo "❌ Found [TBD] placeholders"
  exit 1
fi

echo "✅ Validation passed"
```

---

## Migration from Old Structure

The previous structure had:
```
outputs/
├── schemas/           # All schemas together
├── wizards/           # All wizards together
├── templates/         # All templates together
└── validation/        # All validators together
```

**Why we changed:**
- **Discoverability:** Everything for a generator in one place
- **Maintainability:** Related files grouped together
- **Consistency:** Same pattern for all generators
- **Clarity:** No need to search across multiple folders

**Files moved:**
- `schemas/context_sheet.schema.json` → `context-sheet/schema.json`
- `wizards/context_sheet_generator.wizard.md` → `context-sheet/wizard.instructions.md`
- `validation/validate-context-sheet.sh` → `context-sheet/validator.sh`
- (Same pattern for investor-memo)

---

## Best Practices

### 1. Self-Contained Generators

Each generator folder should be **self-documenting** and **self-sufficient**:
- New user can understand generator by reading just the wizard file
- All validation logic (input + output) is in the folder
- Documentation explains usage without external references

### 2. Consistent Naming

Use simple, consistent names across all generators:
- `schema.json` (not `skattefunn_application.schema.json`)
- `wizard.instructions.md` (not `skattefunn_application_generator.wizard.md`)
- `validator.sh` (not `validate-skattefunn-application.sh`)

### 3. Documentation

Include additional docs when helpful:
- `QUICK_REFERENCE.md` - Quick usage guide
- `TEST_RUN_REPORT.md` - Validation proof from test run
- `EXAMPLES.md` - Sample inputs/outputs
- `CHANGELOG.md` - Version history

### 4. Cross-Generator References

Link to other generators when relevant:
```markdown
## Related Generators
- **Investor Memo**: [`../investor-memo/`](../investor-memo/) - Fundraising materials
- **Context Sheet**: [`../context-sheet/`](../context-sheet/) - AI context summaries
```

---

## Future Generators (Ideas)

Potential generators to add:
- **product-brief/** - Product requirement documents
- **competitor-analysis/** - Market positioning reports
- **partner-integration-guide/** - Partner onboarding docs
- **customer-case-study/** - Success stories and testimonials
- **api-documentation/** - Technical integration guides
- **status-report/** - Internal progress updates
- **grant-application/** - Generic grant application (not country-specific)

---

**Maintained By:** EPF Framework Contributors  
**Version:** 2.0 (Self-contained generator structure)
