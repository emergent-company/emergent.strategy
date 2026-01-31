# EPF Output Artifacts

> **Purpose**: This directory contains wizards, schemas, and validation scripts for **external artifacts** that EPF helps generate but are not core EPF framework files. These are outputs derived FROM EPF data, not EPF methodology artifacts themselves.

> **📚 Documentation Index**: See **[INDEX.md](./INDEX.md)** for complete navigation guide

---

## 🤖 FOR AI ASSISTANTS: READ THIS FIRST

**⚠️ CRITICAL:** Before generating ANY output, read **[AI_INSTRUCTIONS.md](./AI_INSTRUCTIONS.md)**

**TL;DR for AI:**
- ✅ **ALWAYS use** `wizard.instructions.md` (never create custom scripts)
- ✅ **ALWAYS follow** phases sequentially (0 → 1 → 2 → ...)
- ✅ **ALWAYS use** `template.md` structure if provided
- ✅ **ALWAYS validate** with `validator.sh`
- ❌ **NEVER skip** the wizard and invent your own logic
- ❌ **NEVER** create custom Python/JS generator scripts

**Why:** Wizards contain validated methodology (1,000-4,000 lines), compliance rules (Frascati, investor standards), and exact output structure. Your custom code WILL fail validation.

**Read:** [`AI_INSTRUCTIONS.md`](./AI_INSTRUCTIONS.md) (10 min) before starting any generation task.

---

## 📖 Framework vs Instance Outputs

**This directory (`docs/EPF/outputs/`)** contains:
- **Output generator definitions** (wizards, schemas, validators)
- **Templates and documentation** for each output type
- **Framework-level tools** that can be used across all EPF instances

**Generated outputs location** (`docs/EPF/_instances/{product}/outputs/`):
- **Actual generated artifacts** for specific products
- **Instance-specific outputs** (e.g., Emergent's context sheet, investor memo)
- **Product deliverables** created by running the generators in this directory

> 💡 **Think of it this way**: This directory is the "factory" (tools/blueprints), and `_instances/{product}/outputs/` is the "warehouse" (finished products).

**See also**: [`docs/EPF/_instances/emergent/outputs/README.md`](../_instances/emergent/outputs/README.md) for the generated artifacts directory.

---

## 🚀 Quick Start

**New to EPF outputs?** Start here: [`QUICK_START.md`](./QUICK_START.md) (5-minute guide)

**Building a new generator?** See: [`GENERATOR_GUIDE.md`](./GENERATOR_GUIDE.md) (comprehensive development guide)

**Want more powerful generators?** See: [`GENERATOR_ENHANCEMENTS.md`](./GENERATOR_ENHANCEMENTS.md) (v2.0 Studio-inspired features) ✨

**Want to generate?** Ask your AI: `"Generate a context sheet for [product] using the EPF output generator"`

---

## 🔮 Future Work (v2.0 Enhancements)

**Status:** All generators standardized at v1.0 (production-ready) ✅  
**Next:** Optional v2.0 enhancements for interactive studio experience

**📍 Single Source of Truth:** [`GENERATOR_ENHANCEMENTS.md`](./GENERATOR_ENHANCEMENTS.md)

This file contains:
- ✅ Complete v2.0 specification (Phase 0.4, 0.6, 6, 7)
- ✅ Bash implementation examples (no Python!)
- ✅ 4-milestone implementation roadmap (8-10 weeks)
- ✅ Testing checklist and success criteria
- ✅ Clear guidance for future AI sessions

**Future AI: Start here** → Read `GENERATOR_ENHANCEMENTS.md` first, then follow Milestone 1 (implement Phase 0.4 in investor-memo).

---

## 📁 Directory Structure

```
outputs/
├── README.md                           # This file
├── QUICK_START.md                      # Quick start guide
├── GENERATOR_GUIDE.md                  # Generator development guide
├── VALIDATION_README.md                # Validation documentation
├── STRUCTURE.md                        # Directory structure overview
├── context-sheet/                      # Context Sheet generator
│   ├── schema.json                     # Input validation
│   ├── wizard.instructions.md          # Generation logic
│   └── validator.sh                    # Output validation
├── development-brief/                  # Development Handover Brief generator
│   ├── schema.json                     # Input validation
│   ├── wizard.instructions.md          # Generation logic (interactive)
│   ├── validator.sh                    # Output validation
│   └── README.md                       # Quick reference
├── investor-memo/                      # Investor Materials generator
│   ├── schema.json                     # Input validation
│   ├── wizard.instructions.md          # Generation logic
│   └── validator.sh                    # Output validation
├── skattefunn-application/             # SkatteFUNN (Norwegian R&D Tax) generator
│   ├── schema.json                     # Input validation
│   ├── wizard.instructions.md          # Generation logic
│   ├── template.md                     # Output template
│   ├── validator.sh                    # Output validation
│   └── README.md                       # Quick reference
└── value-model-preview/                # Value Model HTML Preview generator
    ├── schema.json                     # Input validation
    ├── wizard.instructions.md          # Generation logic
    ├── template.html                   # HTML template with embedded CSS
    ├── validator.sh                    # Output validation
    └── README.md                       # Quick reference
```

**Note**: Each generator is self-contained in its own folder with all necessary files (schema, wizard, validator, README). See [`GENERATOR_GUIDE.md`](./GENERATOR_GUIDE.md) for the standardized architecture.

## 🎯 What Belongs Here vs. Core EPF

### ✅ Belongs in `/outputs/`

External artifacts generated FROM EPF data for external consumption:

- **AI Context Sheets** - Summaries for external AI tools (ChatGPT, Claude, etc.)
- **Investor Materials** - Memos, FAQs, pitch decks derived from EPF
- **Marketing Collateral** - Product briefs, positioning statements
- **Sales Enablement** - Battle cards, competitive analysis
- **Partner Documentation** - Integration guides, API documentation
- **Internal Reports** - Health checks, status updates, KPI dashboards
- **Customer-Facing Docs** - Product guides, feature announcements

**Rule**: If it's DERIVED from EPF data and consumed OUTSIDE the EPF workflow → it goes here.

### ❌ Belongs in Core EPF (`/templates/`, `/wizards/`, `/schemas/`)

Core EPF methodology artifacts:

- **North Star** (`00_north_star.yaml`) - EPF framework artifact
- **Strategy Formula** (`04_strategy_formula.yaml`) - EPF framework artifact
- **Roadmap Recipe** (`05_roadmap_recipe.yaml`) - EPF framework artifact
- **Value Models** - EPF framework artifact
- **Insight Analyses** - EPF framework artifact
- **Feature Definitions** - EPF framework artifact

**Rule**: If it's PART of the EPF methodology workflow → it stays in core EPF structure.

## 🏗️ Architecture Principles

### 1. Schema-First Design

Every output artifact type must have:
- JSON schema defining its structure
- Validation script using the schema
- Template showing expected format
- Generator wizard automating creation

### 2. Source Traceability

Every generated output must track:
```yaml
metadata:
  generated_at: "2025-12-30T10:00:00Z"
  epf_version: "2.1.0"
  source_files:
    - path: "docs/EPF/_instances/product/00_north_star.yaml"
      version: "1.2.0"
    - path: "docs/EPF/_instances/product/04_strategy_formula.yaml"
      version: "1.1.0"
  generator: "context_sheet_generator.wizard.md"
  generator_version: "1.0.0"
```

### 3. Validation Integration

All outputs must be validatable:
```bash
# Validate a specific output
npm run validate:output -- --type context-sheet --file path/to/sheet.md

# Validate all outputs for a product
npm run validate:outputs -- --product emergent

# Validate output schema itself
npm run validate:output-schema -- --schema context_sheet.schema.json
```

### 4. Instance-Specific Storage

Generated outputs are stored in product instances:
```
docs/EPF/_instances/{product}/outputs/
├── context-sheets/
│   └── {product}_context_sheet.md
├── investor-materials/
│   ├── investor_memo.md
│   ├── investor_faq.md
│   └── one_pager.md
└── marketing/
    └── ...
```

## 🚀 Quick Start

### Creating a New Output Type

1. **Define the schema**:
   ```bash
   touch docs/EPF/outputs/schemas/my_output.schema.json
   ```

2. **Create the template**:
   ```bash
   touch docs/EPF/outputs/templates/my_output_template.md
   ```

3. **Write the generator wizard**:
   ```bash
   touch docs/EPF/outputs/wizards/my_output_generator.wizard.md
   ```

4. **Add validation script** (shell script following EPF conventions):
   ```bash
   touch docs/EPF/outputs/validation/validate-my-output.sh
   chmod +x docs/EPF/outputs/validation/validate-my-output.sh
   ```
   Note: Use shell scripts for validators (like all 18 EPF validators) for consistency, performance, and minimal dependencies.

5. **Register in index** (see below)

### Using an Existing Generator

Ask the AI assistant:
```
"Generate a [output-type] for [product-name] using the EPF output generator"
```

Examples:
- "Generate a context sheet for emergent using the EPF output generator"
- "Create an investor memo for twentyfirst from EPF data"
- "Update the marketing brief for huma based on current EPF instance"

## 📚 Available Output Types

| Output Type | Purpose | Wizard | Schema | Template |
|------------|---------|--------|--------|----------|
| **Context Sheet** | AI context for external tools | ✅ | ✅ | ⏳ |
| **Development Brief** | Engineering handover from product | ✅ | ✅ | ❌ |
| **Investor Memo Package** | Complete investor materials (5 docs) | ✅ | ✅ | ⏳ |
| **SkatteFUNN Application** | Norwegian R&D tax deduction form | ✅ | ✅ | ✅ |
| **Marketing Brief** | Product marketing summary | ⏳ | ⏳ | ⏳ |
| **Sales Battlecard** | Competitive positioning | ⏳ | ⏳ | ⏳ |
| **Product Guide** | Customer-facing documentation | ⏳ | ⏳ | ⏳ |

Legend: ✅ Complete | 🔄 In Progress | ⏳ Planned | ❌ Not Needed

Legend: ✅ Complete | 🔄 In Progress | ⏳ Planned

**Note**: Investor Memo Package includes comprehensive memo, executive summary, one-page pitch, FAQ, and materials index.

## 🔍 Validation

### Schema Validation

All output schemas are validated against meta-schema:
```bash
npm run validate:output-schemas
```

### Content Validation

Generated outputs are validated against their schemas:
```bash
# Validate single file
npm run validate:output -- --file path/to/output.md

# Validate all outputs for product
npm run validate:product-outputs -- --product emergent
```

### Quality Checks

Additional quality checks beyond schema:
- Source file freshness (are EPF sources recent?)
- Completeness (all required sections present?)
- Consistency (values match source data?)
- Format compliance (markdown, YAML frontmatter, etc.)

## 🛠️ Development Workflow

### 1. Adding New Output Type

```bash
# 1. Create schema
touch outputs/schemas/new_output.schema.json
# Define JSON schema following existing patterns

# 2. Create template
touch outputs/templates/new_output_template.md
# Create markdown template with placeholders

# 3. Create wizard
touch outputs/wizards/new_output_generator.wizard.md
# Write step-by-step generator instructions

# 4. Create validator (shell script following EPF conventions)
touch outputs/validation/validate-new-output.sh
chmod +x outputs/validation/validate-new-output.sh
# Implement schema + quality validation using yq + ajv-cli

# 5. Test
npm run validate:output-schema -- --schema new_output.schema.json
# Generate sample output using wizard
# Validate generated output
```

### 2. Updating Existing Output Type

```bash
# 1. Update schema (increment version)
# Edit outputs/schemas/output_type.schema.json

# 2. Update template to match
# Edit outputs/templates/output_type_template.md

# 3. Update wizard if needed
# Edit outputs/wizards/output_type_generator.wizard.md

# 4. Update validator
# Edit outputs/validation/validate-output-type.sh

# 5. Regenerate all instances
npm run regenerate:outputs -- --type output_type
```

### 3. Migrating from ad-hoc-artifacts

Existing ad-hoc artifacts should be migrated:

```bash
# Old location (deprecated)
docs/EPF/_instances/{product}/ad-hoc-artifacts/

# New location
docs/EPF/_instances/{product}/outputs/{output-type}/
```

Migration script:
```bash
npm run migrate:ad-hoc-to-outputs -- --product emergent
```

## 📝 Examples

### Context Sheet Generator

**Location**: `outputs/wizards/context_sheet_generator.wizard.md`

**Usage**:
```
AI: "Generate a context sheet for emergent"
```

**Output**: 
```
docs/EPF/_instances/emergent/outputs/context-sheets/emergent_context_sheet.md
```

**Validation**:
```bash
bash docs/EPF/outputs/validation/validate-context-sheet.sh \
  docs/EPF/_instances/emergent/outputs/context-sheets/emergent_context_sheet.md
```

### Investor Memo Package Generator

**Location**: `outputs/wizards/investor_memo_generator.wizard.md`

**Usage**:
```
AI: "Generate investor materials package for emergent"
```

**Output**:
```
docs/EPF/_instances/emergent/outputs/investor-materials/2025-12-30/
├── 2025-12-30_investor_memo.md
├── 2025-12-30_investor_memo_executive_summary.md
├── 2025-12-30_investor_memo_one_page_pitch.md
├── 2025-12-30_investor_faq.md
├── 2025-12-30_investor_materials_index.md
└── manifest.json
```

**Validation**:
```bash
bash docs/EPF/outputs/validation/validate-investor-memo.sh \
  --manifest docs/EPF/_instances/emergent/outputs/investor-materials/2025-12-30/manifest.json
```

## 🔗 Integration with Core EPF

### Data Flow

```
┌─────────────────────────────────────────┐
│     Core EPF Artifacts (Source)         │
├─────────────────────────────────────────┤
│  • 00_north_star.yaml                   │
│  • 04_strategy_formula.yaml             │
│  • 05_roadmap_recipe.yaml               │
│  • value_models/*.value_model.yaml      │
│  • insights/*.insight_analysis.yaml     │
└─────────────────┬───────────────────────┘
                  │
                  │ READ (never modify)
                  ▼
┌─────────────────────────────────────────┐
│       Output Generators (Process)       │
├─────────────────────────────────────────┤
│  • Extract relevant data                │
│  • Transform to output format           │
│  • Validate against schema              │
│  • Add metadata & traceability          │
└─────────────────┬───────────────────────┘
                  │
                  │ GENERATE
                  ▼
┌─────────────────────────────────────────┐
│   External Outputs (Artifacts)          │
├─────────────────────────────────────────┤
│  • Context sheets                       │
│  • Investor materials                   │
│  • Marketing collateral                 │
│  • Sales enablement                     │
└─────────────────────────────────────────┘
```

### Rules

1. **Output generators READ core EPF, never WRITE**
2. **Generated outputs live in `/outputs/` subdirectory of instance**
3. **Outputs are DERIVED, not canonical** - EPF artifacts are source of truth
4. **Regeneration is safe** - outputs can be deleted and regenerated anytime
5. **Validation checks against both schema AND source EPF data**

## 🎓 Best Practices

### For Wizard Authors

1. **Be explicit about source files** - Document exactly which EPF files are read
2. **Show data extraction paths** - Use YAML paths like `north_star.purpose.statement`
3. **Include generation metadata** - Always add source tracking
4. **Provide regeneration instructions** - Make it easy to update outputs
5. **Handle missing data gracefully** - EPF may not have all fields populated

### For Schema Authors

1. **Follow JSON Schema best practices**
2. **Version your schemas** - Use `"$schema"` and `"version"` fields
3. **Document all fields** - Use `"description"` extensively
4. **Define required fields clearly**
5. **Include examples** in schema where possible

### For Validator Authors

1. **Schema validation first** - Structural correctness
2. **Semantic validation second** - Business logic
3. **Source consistency third** - Match EPF data
4. **Clear error messages** - Help users fix issues
5. **Exit codes** - 0 = success, non-zero = failure

## 🚧 Migration Plan

### Phase 1: Setup ✅ (Current)

- [x] Create `/outputs/` directory structure
- [x] Define README and architecture
- [ ] Migrate context sheet generator
- [ ] Create context sheet schema
- [ ] Create context sheet validator

### Phase 2: Core Outputs 🔄

- [x] Create investor memo package generator ✅
- [x] Create investor memo package schema ✅
- [x] Create investor memo validator ✅
- [ ] Add marketing brief generator
- [ ] Add sales battlecard generator

### Phase 3: Automation ⏳

- [ ] Add npm scripts for all operations
- [ ] Create migration script for ad-hoc artifacts
- [ ] Add CI/CD validation checks
- [ ] Create output regeneration pipeline

### Phase 4: Documentation ⏳

- [ ] Document all output types
- [ ] Create usage examples
- [ ] Add troubleshooting guide
- [ ] Create video tutorials

## 📖 See Also

- [Core EPF README](../README.md) - Framework overview
- [EPF Wizards](../wizards/README.md) - Core EPF workflow wizards
- [EPF Schemas](../schemas/README.md) - Core EPF artifact schemas
- [EPF Validation](../scripts/README.md) - Core EPF validation scripts
- [Canonical Purity Rules](../CANONICAL_PURITY_RULES.md) - Framework vs instance separation

---

**Questions? Issues?** Open an issue or ask your AI assistant for help with EPF output generation.
