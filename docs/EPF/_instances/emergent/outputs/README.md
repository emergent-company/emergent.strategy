# Emergent - Generated Output Artifacts

> **Purpose**: This directory contains **generated external artifacts** for the Emergent product, created using EPF output generators. These are finished deliverables derived from Emergent's EPF instance data.

## 📂 Instance vs Framework Outputs

**This directory (`docs/EPF/_instances/emergent/outputs/`)** contains:
- **Generated artifacts** for the Emergent product
- **Actual deliverables** (context sheets, investor materials, applications)
- **Product-specific outputs** ready for external consumption

**Output generator definitions** (`docs/EPF/outputs/`):
- **Wizards and schemas** that create these artifacts
- **Templates and validators** for output types
- **Framework-level tools** that can be reused across products

> 💡 **Think of it this way**: `docs/EPF/outputs/` is the "factory" (tools/blueprints), and this directory is the "warehouse" (finished products for Emergent).

**See also**: [`docs/EPF/outputs/README.md`](../../../outputs/README.md) for the generator definitions directory.

---

## 📁 Directory Structure

```
outputs/
├── README.md                           # This file
├── context-sheets/                     # AI context summaries
│   └── 2025-12-30/                     # Version by generation date
│       ├── context_sheet.md            # Main context sheet
│       └── metadata.yaml               # Generation metadata
├── investor-materials/                 # Fundraising documents
│   └── 2025-12-30/                     # Version by generation date
│       ├── one_page_pitch.md           # Quick pitch
│       ├── executive_summary.md        # Executive overview
│       ├── comprehensive_memo.md       # Detailed memo
│       ├── faq.md                      # Investor FAQ
│       ├── materials_index.md          # Navigation guide
│       └── metadata.yaml               # Generation metadata
├── skattefunn-application/             # Norwegian R&D tax applications
│   ├── emergent-skattefunn-application-2026-01-02.md
│   └── trim-violations.sh              # Character limit fixer
└── ad-hoc-artifacts/                   # One-off generated content
    └── (various ad-hoc outputs)
```

## 🎯 Output Types

### Context Sheets
**Location**: `context-sheets/YYYY-MM-DD/`  
**Purpose**: Comprehensive product summaries for external AI tools (ChatGPT, Claude, etc.)  
**Source**: `00_north_star.yaml`, `04_strategy_formula.yaml`, `05_roadmap_recipe.yaml`, `value_model.yaml`  
**Generator**: `docs/EPF/outputs/context-sheet/wizard.instructions.md`

**Use cases**:
- Provide context to AI coding assistants
- Share product vision with consultants/contractors
- Onboard new team members quickly
- Reference document for strategic discussions

### Investor Materials
**Location**: `investor-materials/YYYY-MM-DD/`  
**Purpose**: Fundraising documents (pitch, memo, FAQ)  
**Source**: All EPF READY artifacts (north star, strategy, roadmap, value model)  
**Generator**: `docs/EPF/outputs/investor-memo/wizard.instructions.md`

**Use cases**:
- Seed/Series A fundraising
- Angel investor conversations
- Strategic partnership discussions
- Board presentations

### SkatteFUNN Applications
**Location**: `skattefunn-application/`  
**Purpose**: Norwegian R&D tax deduction applications  
**Source**: `05_roadmap_recipe.yaml` (work packages, budgets, timelines)  
**Generator**: `docs/EPF/outputs/skattefunn-application/wizard.instructions.md`

**Use cases**:
- Apply for Norwegian R&D tax benefits (up to 25% deduction)
- Document research & development activities
- Comply with Forskningsrådet requirements

### Ad-Hoc Artifacts
**Location**: `ad-hoc-artifacts/`  
**Purpose**: One-off generated content that doesn't fit other categories  
**Examples**: Custom reports, partner documentation, specific analyses

---

## 🔄 Regeneration Workflow

All artifacts in this directory can be regenerated when EPF source data changes.

### When to Regenerate

**Automatic triggers** (recommended via git hooks):
- EPF source files change (`00_north_star.yaml`, `04_strategy_formula.yaml`, etc.)
- Roadmap updates (work packages, timelines, budgets)
- Strategy pivots (market, differentiation, channels)

**Manual triggers**:
- Preparing for investor meetings (refresh with latest data)
- Post-sprint reviews (update roadmap-derived outputs)
- Quarterly planning cycles (regenerate all materials)

### How to Regenerate

**Context Sheet**:
```
Ask AI: "Regenerate context sheet for Emergent using the EPF output generator"
```

**Investor Materials**:
```
Ask AI: "Regenerate investor materials for Emergent using the EPF output generator"
```

**SkatteFUNN Application**:
```
Ask AI: "Regenerate SkatteFUNN application for Emergent using the EPF output generator"
```

### Version Management

Outputs are versioned by generation date (`YYYY-MM-DD/`) to:
- Track evolution of product narrative
- Compare before/after strategy changes
- Maintain audit trail for compliance (e.g., SkatteFUNN)
- Preserve historical snapshots for analysis

**Best practice**: Keep 2-3 most recent versions, archive older ones to `docs/EPF/.epf-work/archived-outputs/`.

---

## 📋 Metadata Tracking

Each generated artifact includes metadata for traceability:

```yaml
# metadata.yaml
generated_at: "2025-12-30T14:30:00Z"
epf_version: "2.1.0"
product: "emergent"
output_type: "context_sheet"
source_files:
  - path: "docs/EPF/_instances/emergent/READY/00_north_star.yaml"
    checksum: "sha256:abc123..."
    last_modified: "2025-12-25T10:00:00Z"
  - path: "docs/EPF/_instances/emergent/READY/04_strategy_formula.yaml"
    checksum: "sha256:def456..."
    last_modified: "2025-12-28T15:30:00Z"
generator:
  wizard: "context_sheet_generator.wizard.md"
  version: "1.0.0"
  schema_version: "1.0.0"
validation:
  status: "passed"
  errors: 0
  warnings: 2
```

This metadata enables:
- **Reproducibility**: Know exactly which EPF data generated this output
- **Change tracking**: Identify what changed between versions
- **Debugging**: Trace issues back to source data
- **Compliance**: Prove artifact provenance for audits

---

## 🔍 Finding Related Information

**EPF Source Data** (inputs for these outputs):
- READY artifacts: `docs/EPF/_instances/emergent/READY/`
- Value models: `docs/EPF/_instances/emergent/value_models/`
- Work-in-progress: `docs/EPF/_instances/emergent/WIP/`

**Output Generators** (tools that create these outputs):
- Framework: `docs/EPF/outputs/`
- Wizards: `docs/EPF/outputs/{type}/wizard.instructions.md`
- Schemas: `docs/EPF/outputs/{type}/schema.json`
- Validators: `docs/EPF/outputs/{type}/validator.sh`

**EPF Framework Documentation**:
- Getting started: `docs/EPF/README.md`
- Architecture: `docs/EPF/ARCHITECTURE.md`
- Contribution guide: `docs/EPF/.github/copilot-instructions.md`

---

## 🚨 Important Notes

### DO Store Here
✅ Generated final artifacts (context sheets, memos, applications)  
✅ Output metadata files  
✅ Version snapshots (dated folders)  
✅ Output-specific helper scripts (e.g., `trim-violations.sh`)

### DON'T Store Here
❌ EPF source data (goes in `READY/` or `WIP/`)  
❌ Working documents/analysis (goes in `.epf-work/`)  
❌ Templates (goes in `docs/EPF/outputs/{type}/`)  
❌ Generator wizards/schemas (goes in `docs/EPF/outputs/{type}/`)

### Backup files (.backup-*)
- Created automatically by trimming/fixing scripts
- Keep locally for safety
- NOT committed to git (in `.gitignore`)
- Can be deleted after verifying changes

---

## 📞 Questions?

- **"Where's the generator for this output?"** → Check `docs/EPF/outputs/{output_type}/`
- **"Where's the EPF data that created this?"** → Check metadata.yaml `source_files` section
- **"How do I regenerate this?"** → See "Regeneration Workflow" section above
- **"This output is outdated, should I update it?"** → Yes! Run the generator wizard again
- **"Can I edit these outputs manually?"** → Not recommended - regenerate from EPF source instead

---

**Last Updated**: 2026-01-02  
**Instance**: emergent  
**EPF Version**: 2.1.0
