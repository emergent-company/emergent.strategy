# Emergent Product Framework (EPF) Repository - v2.12.0

This repository contains the complete skeleton for managing product, strategy, org & ops, and commercial development using the Emergent Product Framework. It is designed to be an **executable operating system**, managed by a human-in-the-loop with the assistance of an AI Knowledge Agent.

---

## What's New in v2.12.0

Add value-model-preview output generator with gist publishing automation

## What's New in v2.11.0

Add development-brief output generator for development team handover

## What's New in v2.9.2

Add AGENTS.md - AI agent instructions with script lookup table to prevent raw command usage

## What's New in v2.9.1

Fix: Migration tooling now compares artifacts against schema versions, not framework version. This eliminates false positives where artifacts at v1.13.0 were incorrectly flagged as needing migration when their schema was also at v1.13.0.

## What's New in v2.9.0

Migration infrastructure with AI routing protocol

## What's New in v2.8.0

Feature Maturity Tracking - Added feature_maturity section to feature definitions enabling per-capability maturity tracking aligned with VMM stages (hypothetical→emerging→proven→scaled)

## What's New in v2.7.4

Make Living Reality Assessment a hard gate for AI agents

## What's New in v2.7.3

Add verify-canonical-sync.sh for deep framework file verification against canonical

## What's New in v2.7.2

Fixed bash arithmetic bug in check_artifact_version_alignment grep handling

## What's New in v2.7.1

Replace script version checks with artifact version alignment in health check

## What's New in v2.7.0

Reality Baseline Protocol v1.14.0 - Living Reality Assessment

**New artifacts:**
- `living_reality_assessment.yaml` - persistent baseline (replaces snapshot CRA)
- `track_health_signals.yaml` - ephemeral signals collected during AIM
- `current_reality_assessment_schema.json` - schema for LRA
- `track_health_assessment_schema.json` - schema for THA
- `reality_baseline_protocol.md` - core principles document

**Updated wizards with Reality Baseline integration:**
- lean_start: Step 0 baseline collection, Step 3/6 persistence
- pathfinder: STEP 0 baseline check, session completion updates
- synthesizer: STEP 0 context loading, THA collection, LRA updates

**Lifecycle model:** bootstrap → maturing → evolved  
**Signal vocabulary:** velocity, quality, attention_backlog, capacity

Fixes cold-start problem where first cycle had no prior AIM data.

## What's New in v2.6.3

Fix false positives in content readiness checker with context-aware exclusion patterns

## What's New in v2.6.2

Added Bidirectional Emergence section to White Paper - clarifies EPF's simultaneous top-down constraints and bottom-up learning model

## What's New in v2.6.1

Documentation updates for v2.6.0 canonical track definitions - White Paper and Database Object Model

## What's New in v2.6.0

Track definitions system, Commercial/OrgOps separation, canonical clarity

## New Features
- Added unified definitions/ directory with canonical track definitions (Strategy, OrgOps, Commercial)
- Product track as examples-only (non-canonical) with _template/ subdirectory  
- Track-specific schemas (strategy, org_ops, commercial definition schemas)
- New validate-track-definitions.sh script
- Enhanced health check with Commercial/OrgOps boundary validation

## Fixes
- Fixed Commercial vs OrgOps separation (acquisition vs maintenance)
- Moved 5 definitions to correct tracks based on business logic
- Consolidated feature template to definitions/product/_template/

## Documentation
- Added canonical vs non-canonical clarity throughout
- Updated all documentation with new paths and distinctions

## What's New in v2.5.0

**MINOR Release**: Value Model Maturity (VMM) - Track where you are on the journey from hypothesis to scaled value delivery

### New Feature: Value Model Maturity (VMM)

VMM is a system for tracking maturity at the Value Model level, answering: **"How proven is the value we're claiming to deliver?"**

**Key Capabilities:**
- **4 Maturity Stages**: `hypothetical` → `emerging` → `proven` → `scaled`
- **3 Universal Milestones**: Problem-Approach Fit → Value-Recipient Fit → Sustainable-Domain Fit
- **Bottom-Up Evidence Model**: Maturity assessed at L3 sub-components, emerges upward using 80% rule
- **All 4 Tracks**: Product, Strategy, OrgOps, Commercial each have independent maturity journeys
- **Roadmap Integration**: KRs can target specific Value Model components for maturity advancement

**What Changed:**
- **`value_model_schema.json`**: Added `track_maturity`, `maturity_summary` (L1/L2), and `maturity` (L3) fields
- **`roadmap_recipe_schema.json`**: Added `value_model_target` field to KRs
- **`north_star_schema.json`**: Added `strategic_maturity_context` for portfolio-level visibility
- **Value Model Templates**: All 4 templates now include `track_maturity` section
- **New Guide**: [`docs/guides/VALUE_MODEL_MATURITY_GUIDE.md`](docs/guides/VALUE_MODEL_MATURITY_GUIDE.md)

**Why VMM Matters:**
- **Honest Assessment**: Separates hypothetical value claims from proven delivery
- **Multi-Product Aware**: Each product line has independent maturity (not just org-level)
- **Evidence-Based**: No hand-waving - maturity requires documented evidence
- **Strategic Focus**: Identifies which tracks or components need investment

**Quick Start:**
```yaml
# In your value model (L3 sub-component level)
sub_components:
  - id: csv-import
    name: CSV Import
    maturity:
      stage: "proven"
      evidence:
        - type: "usage_metric"
          description: "847 customers weekly, 99.2% success rate"
      milestone_achieved: "value_recipient_fit"
```

See [VALUE_MODEL_MATURITY_GUIDE.md](docs/guides/VALUE_MODEL_MATURITY_GUIDE.md) for complete documentation.

---

## Previous Release: v2.5.0

**PATCH Release**: Enhanced EPF sync safety and automation

### Framework Improvements
- **sync-repos.sh**: Added prominent warning banner with explicit DO NOT / ALWAYS DO examples
- **sync-repos.sh**: Added check for recent commits needing version bump (prevents syncing unbumped changes)
- **create-epf-product-repo.sh**: Auto-generates `.github/copilot-instructions.md` in new product repos
- **create-epf-product-repo.sh**: Auto-generates `.vscode/settings.json` to load EPF guidance

### Why This Matters
These improvements prevent AI assistants from using manual git commands on EPF subtree, protecting the canonical repo from product data contamination. Multi-layer protection at workspace, script, and IDE levels.

---

## 🚨 CRITICAL: For AI Agents & Contributors

**This is the CANONICAL EPF framework repository. It MUST remain instance-agnostic.**

### ⚠️ ABSOLUTE RULES - NEVER VIOLATE:

1. **❌ NO product names** (twentyfirst, huma-blueprint-ui, lawmatics, emergent, etc.)
2. **❌ NO instance-specific data** (validation reports, product examples, org references)
3. **❌ NO validation results** mentioning specific products
4. **✅ ONLY generic framework** (templates, schemas, documentation, wizards)

**Instance data belongs in product repositories** (`/path/to/product/docs/EPF/_instances/<product>/`), **NEVER in this canonical repository.**

**📋 Pre-Action Checklist:** Before creating/editing ANY file here, ask:
- Am I in the canonical EPF repository? (`pwd` to check)
- Does this mention specific products? (If YES → **STOP!** Move to product repo)
- Is this a validation report/result? (If YES → **STOP!** Belongs in product repo)
- Could this apply to ANY product? (If NO → **STOP!** Not generic enough)

**📚 Full Rules:** See [`CANONICAL_PURITY_RULES.md`](./CANONICAL_PURITY_RULES.md) for detailed guidance, examples, and violation corrections.

**📖 Maintenance Guide:** See [`MAINTENANCE.md`](./MAINTENANCE.md) for framework/instance separation enforcement rules.

---

## 🤖 AI Agent Quick Start

**Choose your entry point based on what you're doing:**

| Your Situation | Start Here | Purpose |
|----------------|------------|----------|
| 🆕 **User adopting EPF for first time** | [`.ai-agent-first-contact.md`](.ai-agent-first-contact.md) | Discovery & onboarding workflow |
| 📋 **Daily work in product repo** | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) | Quick commands & sync procedures |
| 🔧 **Modifying EPF framework** | [`.ai-agent-instructions.md`](.ai-agent-instructions.md) | Consistency protocol & maintenance |
| 📝 **Enriching instance artifacts** | [`.ai-agent-instructions.md`](.ai-agent-instructions.md) | Schema-first enrichment workflow |
| 🚨 **User asks "validate work"** | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) | Validation commands |

**Essential reading for ALL EPF work:**

1. 📋 **Purity Rules** (10 min): [`CANONICAL_PURITY_RULES.md`](CANONICAL_PURITY_RULES.md)
   - Framework vs instance separation (critical to understand)
   - Decision trees and violation examples

2. 🔧 **Framework Overview** (15 min): This README
   - EPF structure, phases, artifacts, version history

**Daily Operations:**

- 🧙 **Creating EPF artifacts?** → [`wizards/README.md`](wizards/README.md) (find right wizard)
- 📤 **Generating external outputs?** → [`outputs/README.md`](outputs/README.md) (context sheets, investor memos, etc.)
- ✅ **Validating work?** → [`scripts/README.md`](scripts/README.md) (find right validator)
- 📖 **Understanding concepts?** → [`docs/guides/README.md`](docs/guides/README.md) (find right guide)
- 📐 **Schema questions?** → [`schemas/README.md`](schemas/README.md) (schema-template-guide pattern)

### Schema Reference

All JSON schemas in `schemas/` for artifact validation:

| Schema | Purpose |
|--------|---------|
| `north_star_schema.json` | Organization-level purpose, vision, mission, values |
| `insight_analyses_schema.json` | READY Phase trend, market, SWOT, problem analyses |
| `insight_opportunity_schema.json` | Opportunity statement from INSIGHT synthesis |
| `strategy_foundations_schema.json` | Vision, value prop, sequencing, info architecture |
| `strategy_formula_schema.json` | Winning aspirations and strategic choices |
| `roadmap_recipe_schema.json` | OKRs, assumptions, work packages by track |
| `value_model_schema.json` | FIRE Phase value layers and components |
| `feature_definition_schema.json` | Individual feature specifications |
| `mappings_schema.json` | Traceability between features and value model |
| `workflow_schema.json` | State machine and workflow definitions |
| `assessment_report_schema.json` | AIM Phase cycle assessment |
| `calibration_memo_schema.json` | AIM Phase learning calibration |
| `current_reality_assessment_schema.json` | Living Reality Assessment (LRA) |
| `track_health_assessment_schema.json` | Track Health Assessment (THA) signals |
| `aim_trigger_config_schema.json` | AIM phase trigger configuration |
| `product_portfolio_schema.json` | Multi-product portfolio structure |
| `track_definition_base_schema.json` | Base schema for track definitions |
| `strategy_definition_schema.json` | Strategy track component definitions |
| `org_ops_definition_schema.json` | OrgOps track component definitions |
| `commercial_definition_schema.json` | Commercial track component definitions |
| `field-importance-taxonomy.json` | Field importance classification for health checks |

**Maintaining EPF?**

- 🔧 **Complete protocol** → [`MAINTENANCE.md`](MAINTENANCE.md) (STEP 0-5 consistency protocol)
- 📚 **Learn from past mistakes** → [`.github/instructions/self-learning.instructions.md`](.github/instructions/self-learning.instructions.md)

---

## 🚀 Getting Started: Choose Your Adoption Level

**First time adopting EPF in your organization?** EPF is designed for **organic growth** - you don't implement "full EPF" on day one.

**Why this matters now:** We're entering an era where **1-5 person teams can build products that previously required 20-50 people**. AI amplifies capability across strategy, code, design, data, and content. But small teams building complex products need a **product operating system** that scales seamlessly from Day 1 to Day 1000 without migrations. EPF provides this: start minimal (2-3 hours), scale organically (add artifacts as complexity emerges), maintain strategic coherence regardless of team size.

**Start simple, add artifacts as organizational complexity grows:**

| Your Situation | Team Size | Start At | Time Investment |
|----------------|-----------|----------|-----------------|
| Solo founder | 1-2 | **Level 0** (North Star only) | 2-3 hours initial |
| Small startup | 3-5 | **Level 1** (Add Evidence + Roadmap) | 4-6 hrs/quarter |
| Growing startup | 6-15 | **Level 2** (Add Value Models + 4 tracks) | 8-12 hrs/quarter |
| Product org | 15-50+ | **Level 3** (Full validation) | 20-30 hrs/quarter |

**📖 Complete adoption guide:** See [`docs/guides/ADOPTION_GUIDE.md`](docs/guides/ADOPTION_GUIDE.md) for:
- AI-enabled small team thesis (why EPF matters for 1-5 person teams)
- Detailed escalation model (Level 0 → Level 3)
- Growth triggers ("when to add next artifact type")
- Time breakdowns per level
- Success metrics and common mistakes
- Special cases (open source, enterprise teams, multiple products)

**Philosophy:** Like a coral reef growing one polyp at a time, EPF grows one artifact at a time. The system emerges as your strategic complexity emerges. Just as AI enables small teams to build big products, EPF's simple rules generate sophisticated strategic systems - that's why it's called the **Emergent** Product Framework.

---

## 🏥 Health Check & Validation

**Before committing any EPF changes, run the health check:**

```bash
./docs/EPF/scripts/epf-health-check.sh
```

**What it validates:**

1. **Framework Integrity** - Version consistency, schemas, documentation
2. **Instance Structure** - Folder structure, metadata, FIRE phase content  
3. **Content Quality** - Analyzes READY phase artifacts for:
   - Template patterns and placeholder content
   - Critical field completeness
   - Strategic depth and specificity
   - **Readiness scores (0-100) with letter grades (A-F)**

**Example output:**
```
Content Quality Assessment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Instance: YourProduct
✓   01_insight_analyses.yaml: 100/100 (Grade: A)
⚠   00_north_star.yaml: 70/100 (Grade: C)
✗   05_roadmap_recipe.yaml: 50/100 (Grade: D) - needs enrichment

Instance average: 73/100 across 6 artifacts
```

**For detailed content analysis:**
```bash
# Analyze specific artifact with enrichment recommendations
./scripts/check-content-readiness.sh _instances/YourProduct/READY/00_north_star.yaml

# Analyze entire READY phase
./scripts/check-content-readiness.sh _instances/YourProduct/READY
```

**📖 Complete validation documentation:** [`scripts/README.md`](scripts/README.md)

---

## What's New in v2.4.1

Enhanced pre-commit hook to automatically check for version bump requirements using classify-changes.sh

## What's New in v2.4.0

Add AI agent discovery system with first-contact guidance and improve file coordination

## What's New in v2.3.3

**Bug Fixes & Quality Improvements (2026-01-06):**

Fixed critical bugs discovered through real-world usage in product repositories:

**Fixed Issues:**
- **Validation Script Phase Structure (v1.13.1):** Updated `validate-schemas.sh` to support phase-based instance structure (READY/, FIRE/, AIM/). Script now works with both new phase-based and legacy flat structures.
- **Canonical Value Model IDs:** Fixed all canonical value model templates (Strategy, Commercial, OrgOps) to use lowercase kebab-case IDs matching schema requirements. Templates now validate successfully.
- **Add-to-Repo Script:** Fixed `add-to-repo.sh` to copy FIRE phase value model templates when creating new instances.

**Documentation:**
- Added `KNOWN_ISSUES.md` to track framework issues discovered during product repo usage
- Improved "eating your own dog food" quality process

All canonical templates now validate successfully. These fixes improve the out-of-box experience for new EPF users.

---

## What's New in v2.3.2

**Enhanced Health Check & Migration System (2026-01-05):**

EPF now includes a comprehensive 3-tier health check system that goes beyond basic schema validation to assess strategic completeness and guide artifact enrichment.

**New Tools:**
- **Tier 2 - Field Coverage:** `analyze-field-coverage.sh` calculates coverage percentages, identifies CRITICAL/HIGH/MEDIUM field gaps, and provides ROI estimates for enrichment
- **Tier 3 - Version Alignment:** `check-version-alignment.sh` detects schema drift (CURRENT/BEHIND/STALE/OUTDATED) and recommends migrations
- **Interactive Migration:** `migrate-artifact.sh` guides users through enriching artifacts with wizard support and validation
- **Batch Migration:** `batch-migrate.sh` prioritizes and migrates multiple artifacts with dry-run mode
- **Integrated Dashboard:** `validate-instance.sh` now includes all 3 tiers in consolidated health report

**Field Importance Taxonomy:**
- `schemas/field-importance-taxonomy.json` defines strategic value of optional fields across all artifact types
- Categories: CRITICAL (innovation maturity, learning), HIGH (hypothesis testing, strategic direction), MEDIUM (tracking, evidence), LOW (nice-to-have)
- Includes value statements, effort estimates, and migration guidance

**Migration Wizards:**
- `wizards/roadmap_enrichment.wizard.md` (25+ pages): Complete guide for adding TRL fields to roadmaps with examples for all 4 tracks (Product, Strategy, Org&Ops, Commercial)
- `wizards/feature_enrichment.wizard.md` (20+ pages): Guide for upgrading feature definitions v1.x→v2.0 (contexts→personas) with transformation moment and emotional resolution focus

**Why This Matters:**
- **Beyond Compliance:** "Valid" doesn't mean "complete" - artifacts can pass schema validation but miss 60-70% of strategic fields
- **Guided Enrichment:** Automated gap detection with clear ROI and effort estimates guides teams to high-value improvements
- **Version Currency:** Track schema evolution and get migration recommendations before artifacts become severely outdated
- **Organic Growth:** Teams can start minimal and enrich artifacts as they mature, with clear guidance on what to add next

**Example Impact:**
- twentyfirst roadmap: 41% coverage → identified 2 CRITICAL gaps (TRL fields worth "millions in funding visibility")
- Automated prioritization: Batch migration tool scores artifacts (0-100) combining version gaps + artifact importance + naming hints
- Clear upgrade paths: "OUTDATED" feature definitions get step-by-step persona upgrade guidance

**Documentation:**
- Complete usage guide: [`scripts/README.md`](scripts/README.md) (Enhanced Health Check System section)
- See [`docs/guides/`](docs/guides/) for methodology guides
- Proposal document: [`.epf-work/enhanced-health-check-proposal.md`](.epf-work/enhanced-health-check-proposal.md)

**Backward Compatible:** All new tools are optional enhancements. Existing validation continues to work unchanged.

---

## What's New in v2.3.2

Integrate classify-changes.sh with sync-repos.sh

- sync-repos.sh now checks for framework changes before push
- Added 'classify' command to sync-repos.sh
- Push operations require version bump if framework content changed
- Updated copilot instructions to reflect new workflow
- Prevents accidental pushes without proper versioning
- Fixed bump-framework-version.sh regex issues (use sed -E for portability)

## What's New in v2.3.2

Integrate classify-changes.sh with sync-repos.sh

- sync-repos.sh now checks for framework changes before push
- Added 'classify' command to sync-repos.sh
- Push operations require version bump if framework content changed
- Updated copilot instructions to reflect new workflow
- Prevents accidental pushes without proper versioning

## What's New in v2.3.1

Output generators v1.0 standardization + fail-safe framework content detection

## What's New in v2.3.0

**Outputs System for External Artifact Generation (2026-01-03):**

EPF now includes a complete system for generating external artifacts from EPF data:

- **NEW**: `outputs/` directory with generators, schemas, validators, and wizards
- **Three initial generators:**
  - `skattefunn-application` (v2.0.1): Norwegian R&D tax credit applications
  - `context-sheet`: AI context summaries for external tools (ChatGPT, Claude, etc.)
  - `investor-memo`: Complete investor materials package (memo, FAQ, one-pager, etc.)
- **Dynamic framework sync:** Sync script now auto-discovers framework additions (no hardcoded lists)
- **True iterative development:** Iterate in product repos, sync to canonical - any new directory/file automatically included

**Why this matters:**
- Enables EPF instances to generate external artifacts (investor materials, context sheets, grant applications, etc.) from EPF data
- Full validation and traceability for all generated outputs
- True iterative development philosophy: evolve EPF in product repos, sync improvements back to canonical

**Backward compatible:** Fully compatible with v2.2.0 instances. No migration required.

## What's New in v2.2.0

Add comprehensive output generators system with validation infrastructure. New generators: context-sheet (product context), investor-memo (investor materials), skattefunn-application (Norwegian R&D grant). Each includes JSON schema, wizard instructions, and shell validator. Enhanced documentation with QUICK_START, STRUCTURE, and VALIDATION_README guides.

## What's New in v2.1.0

Add layer-level solution_steps support to value model schema

MINOR version bump - adds new optional field to layer structure

What changed:
- Added solution_steps field to layer properties in value_model_schema.json
- Updated product.value_model.yaml template with solution_steps examples
- Pattern: Each layer can now have 3-5 solution steps explaining HOW value is delivered

Why this matters:
- Bridges strategic intent (high_level_model solution_steps) with architectural execution (layer-specific steps)
- Helps teams understand implementation sequence and priorities at each architectural level
- Provides actionable guidance for layer activation

Backward compatible:
- solution_steps is optional at layer level (existing models remain valid)
- No breaking changes to existing schema structure
- Enhances value model expressiveness without requiring updates

## What's New in v2.0.0

**Balance Checker Wizard (2025-12-28):**
- **NEW**: AI-powered roadmap viability assessment wizard (`wizards/balance_checker.agent_prompt.md`)
- Pre-FIRE phase validation across 4 dimensions: Resource Viability (30%), Portfolio Balance (25%), Coherence (25%), Strategic Alignment (20%)
- Prevents common pitfalls: over-commitment, imbalanced portfolios, circular dependencies, timeline infeasibility
- Iterative refinement workflow: assess → recommend → adjust → re-assess until ≥75/100 viability score
- Comprehensive guidance: 5 real-world scenarios, detailed algorithms, troubleshooting, best practices
- **Why this matters**: EPF's "braided model" has 4 interdependent tracks (Product, Strategy, OrgOps, Commercial) - balance checking ensures mutual support before FIRE phase commitment

**AI Instruction File Consolidation (2025-12-28):**
- Consolidated AI instruction files from 4 overlapping files into 3 focused files with clear purposes
- **NEW**: Comprehensive "AI Agent Consistency Protocol" section added to `MAINTENANCE.md` (STEP 0-5 complete operating protocol)
- **UPDATED**: Simplified `.github/copilot-instructions.md` to quick reference + links (was 432 lines of duplication, now 150 lines focused)
- **REMOVED**: Duplicate files eliminated (.ai-agent-instructions.md, .github/instructions/epf-framework.instructions.md had 95% overlap)
- **KEPT**: `.github/instructions/self-learning.instructions.md` (unique learning log - continues growing)
- Single source of truth: MAINTENANCE.md is now THE authoritative maintenance reference
- Clearer file purposes: no more "which file do I read?" confusion
- Better AI agent guidance: pre-flight checklist → quick start (copilot-instructions) → comprehensive protocol (MAINTENANCE.md) → learning log (self-learning)

BREAKING CHANGE: Remove value_propositions field from feature_definition_schema.json

The value_propositions field has been removed from the feature definition schema as it duplicated functionality provided by the enhanced personas field structure. All persona narratives are now exclusively defined within the personas field using the comprehensive 11-field structure.

Migration Impact:
- 7/7 feature definitions migrated successfully (100% coverage)
- ~1,314 lines of duplicate content removed
- All instances validated and passing quality checks
- Migration guide: docs/VALUE_PROPOSITIONS_REMOVAL_COMPLETE.md

This is a breaking change requiring instance migration. The enhanced personas field provides superior organization with dedicated slots for target personas, pain points, solutions, benefits, and outcomes - eliminating the need for a separate value_propositions section.

## What's New in v1.13.0

* **Value Model Business Language Enforcement:** New comprehensive guide (`docs/guides/VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md`) ensuring value models use business language understandable to stakeholders while remaining actionable for engineers. Includes forbidden technical terms list and context tags pattern.
* **Value Model Anti-Patterns Reference:** Complete reference guide (`docs/guides/VALUE_MODEL_ANTI_PATTERNS_REFERENCE.md`) documenting common mistakes in value modeling with corrected examples.
* **Product Architect Wizard:** Enhanced AI agent prompt (`wizards/product_architect.agent_prompt.md`) for FIRE phase execution with detailed value model creation guidance.
* **Enhanced Value Models:** Updated commercial, org_ops, product, and strategy value model templates with richer examples and business language patterns.
* **AI Agent Pre-Flight Checklist:** Strengthened canonical purity enforcement in `.ai-agent-instructions.md` to prevent instance contamination.
* **Sync Script Improvements:** Enhanced `scripts/sync-repos.sh` with automatic fallback for broken git subtree states and improved error handling.

## What's New in v1.12.0

* **Feature Definition Schema v2.0 Quality System:** Comprehensive quality enforcement to prevent lengthy manual rework:
  - **Schema v2.0 Enhancements**: Exactly 4 personas required, 200+ character narratives, structured context arrays (key_interactions, data_displayed), rich dependency objects with 30+ char rationale
  - **Wizard Guidance** (`wizards/feature_definition.wizard.md`): Human-readable 7-step creation guide reducing creation time from 2-3 hours to 45-60 minutes
  - **Enhanced Agent Prompt** (`wizards/product_architect.agent_prompt.md`): +300 lines of AI-specific guidance with pre-creation validation checklist and PAUSE-and-validate workflow
  - **Automated Validation** (`scripts/validate-feature-quality.sh`): 379-line quality checker with 6 validation categories (CI/CD ready, requires yq and ajv-cli)
  - **System Documentation** (`docs/EPF_SCHEMA_V2_QUALITY_SYSTEM.md`): Complete reference with v1.0→v2.0 migration guide, troubleshooting, and examples
  - **Bug Fix**: Corrected JSON syntax error in feature_definition_schema.json

### Migration from v1.11.0

1. **No action required** for existing v1.0 feature definitions (remain valid)
2. **To adopt v2.0 quality system**: Follow migration guide in `docs/EPF_SCHEMA_V2_QUALITY_SYSTEM.md`
3. **New features**: Use wizard or validation script for quality enforcement
4. **Update _meta.yaml**: Set `epf_version: "1.12.0"`

## What's New in v1.11.0

* **Enhanced Strategy Formula Schema:** Major expansion of `strategy_formula_schema.json` to support richer strategic documentation:
  - **Competitive Advantages**: Now supports structured objects with `name`, `description`, `defensibility`, and `evidence` fields (in addition to simple strings)
  - **Competitor Analysis**: New `vs_competitors` array with detailed competitor-by-competitor analysis including `their_strength`, `our_angle`, `wedge`, and `key_differences`
  - **Competitive Positioning Summary**: New section for summarizing positioning options and unique combinations
  - **Ecosystem Differentiation**: New top-level section for documenting ecosystem components, synergies, and expansion vectors
  - **Success Metrics**: New section with `leading_indicators` and `lagging_indicators` for measuring strategy success
  - **Enhanced Risk Tracking**: Risks now support `likelihood`, `impact`, and `monitoring` fields
  - **Validation Fields**: New `confidence_rationale` and `next_validation_needed` fields
  - **Change Log**: Top-level `change_log` array for tracking document evolution
  - **Flexible Fields**: Most array fields now support both simple strings and structured objects using `oneOf`
* **Backward Compatible**: All existing strategy formula documents remain valid

### Migration from v1.10.1

1. **No action required** if your strategy formulas use simple string arrays
2. **Optional enhancement**: Expand your `advantages`, `constraints`, `risks`, etc. to use the richer object format
3. **Update _meta.yaml:** Set `epf_version: "1.11.0"`

## What's New in v1.10.1

* **Product Portfolio Support (NEW):** New `product_portfolio.yaml` artifact and schema for organizations with multiple product lines:
  - **Product Lines**: Track distinct products with their own value models (software, hardware, services)
  - **Product Line Relationships**: Document how products interact (controls, monitors, integrates_with)
  - **Brand Architecture**: Flexible brand identities at various granularities (product_lines, components, offerings)
  - **Offerings**: Concrete commercial implementations that customers purchase
  - See `PRODUCT_PORTFOLIO.md` for complete documentation and examples
* **New Schema**: `schemas/product_portfolio_schema.json` for validating portfolio artifacts
* **Fixed North Star Template**: YAML structure corrected for `value_conflicts` placement
* **Enhanced Validation**: `scripts/epf-health-check.sh` now validates version consistency across all files

### Migration from v1.9.7

1. **No action required** if you have a single product
2. **For multi-product organizations:** Create `product_portfolio.yaml` in your instance using the template
3. **Update _meta.yaml:** Set `epf_version: "1.10.1"`

## What's New in v1.9.7

* **Work Packages Fully Removed:** EPF no longer contains any work package references. Key Results (KRs) are the lowest level EPF defines. Work packages are created by spec-driven development tools (Linear, Jira, etc.) that consume EPF's output.
* **Clear Boundary Definition:**
  - **EPF owns:** North Star → Analyses → Opportunity → Strategy → OKRs → Key Results → Feature Definitions
  - **Spec tools own:** Work Packages → Tasks → Tickets → Pull Requests
* **KRs as "Meta Work Packages":** Key Results are measurable strategic milestones. They are handed off to implementation tools which decompose them into work packages.
* **Referential Integrity Rules (NEW):** Formal rules for ID references across artifacts:
  - Forward references MUST resolve (e.g., `linked_to_kr` must point to existing KR)
  - Deletion requires cascade check (search and update all referencing files)
  - Feature Definition ↔ KR bidirectional integrity enforced
  - Automated validation script provided in `MAINTENANCE.md`
* **Updated Schemas:** `roadmap_recipe_schema.json` and `assessment_report_schema.json` no longer contain work package definitions.
* **Simplified Roadmap:** `05_roadmap_recipe.yaml` contains only OKRs, assumptions, solution scaffold, and KR-level execution planning.
* **KR-Level Assessment:** `assessment_report.yaml` tracks outcomes at the Key Result level with learnings, not work package completion status.
* **Updated Wizards:** All agent prompts (Pathfinder, Synthesizer, Product Architect) updated to reflect KR-based workflow.

### Migration from v1.9.6

1. **No action required** if you weren't using work packages in your instance
2. **Update _meta.yaml:** Set `epf_version: "1.9.7"`
3. **Update any custom tooling:** If you built integrations that consumed work packages from EPF, migrate to consuming KRs instead

## What's New in v1.9.6

* **Work Packages Scope Clarified:** EPF no longer defines work packages. Work packages and tasks belong entirely to the spec-driven tools domain. This creates a cleaner separation of concerns:
  - **EPF owns:** Objectives → Key Results → Feature Definitions
  - **Spec tools own:** Work Packages → Tasks
* **KRs are the "Meta Work Packages":** Key Results define measurable milestones. They are the highest-level unit that gets handed off to spec-driven tools. EPF does not decompose KRs into work packages - that's the tool's responsibility.
* **Feature Definitions as Primary Interface:** Feature definitions translate KR intent into capabilities, scenarios, and boundaries that spec-driven tools consume. They are the "API" between EPF and implementation.
* **Roadmap Simplified:** The `05_roadmap_recipe.yaml` now contains only:
  - OKRs (Objectives and Key Results)
  - Riskiest Assumptions
  - Solution Scaffold (components, architecture principles, constraints)
  - Cross-track dependencies (between KRs, not work packages)
  - Timeline and milestones
* **Integration Specification Updated:** `integration_specification.yaml` v1.2.0 reflects the corrected work hierarchy.

## What's New in v1.9.5

* **Feature Definitions as Implementation Bridge:** Feature definitions now have formal guidance for creating specifications that bridge EPF strategy to spec-driven implementation tools. Template at `/definitions/product/_template/` with 21 quality examples.
* **N:M Value Model Mapping:** Feature definitions explicitly support many-to-many relationships with value model components - features often cross-cut multiple L2/L3 components.
* **Tool-Agnostic Export Format:** Feature definitions are designed to be consumed by external spec-driven development tools (e.g., specification frameworks, AI coding agents) without EPF being coupled to any specific tool.
* **Lean Documentation Principles:** New framework philosophy emphasizes that git handles versioning and history - EPF artifacts should not duplicate what can be inferred from repository state.
* **Immutable Ledger for AI Context:** Decision history and what NOT to do is as important as what to do - git history provides organizational memory for AI agents.

## What's New in v1.9.4

* **North Star Document:** New `00_north_star.yaml` captures organizational-level strategic foundation:
  - **Purpose:** Why the organization exists
  - **Vision:** Where we imagine being in 5-10 years (organizational, not product-specific)
  - **Mission:** What we do to deliver value
  - **Values:** Normative rules for behavior and decisions
  - **Core Beliefs:** First principles that underpin all reasoning
* **Stability Layer:** North Star is reviewed annually or during major pivots, providing stable context for cycle-specific work
* **File Renumbering:** All READY phase files renumbered to accommodate North Star at position 00:
  - `00_north_star.yaml` (NEW - organizational foundation)
  - `01_insight_analyses.yaml` (was 00 - cycle analyses)
  - `02_strategy_foundations.yaml` (was 01 - cycle strategy foundations)
  - `03_insight_opportunity.yaml` (was 02 - cycle opportunity)
  - `04_strategy_formula.yaml` (was 03 - cycle formula)
  - `05_roadmap_recipe.yaml` (was 04 - cycle roadmap)
* **Alignment Tracking:** North Star explicitly documents how it informs each READY phase artifact
* **Consistency Protocol:** All cycle-specific work must align with North Star

## What's New in v1.9.3

* **Strategic Foundations Document:** New `01_strategy_foundations.yaml` captures four core strategic artifacts: Product Vision, Value Proposition, Strategic Sequencing, and Information Architecture. These are living documents that inform the strategy formula.
* **Two-Tier Strategy Phase:** STRATEGY phase now has two artifacts:
  - `01_strategy_foundations.yaml` - Strategic foundations (living document, refined through AIM)
  - `03_strategy_formula.yaml` - Winning formula synthesized from foundations
* **File Renumbering:** READY phase files renumbered to accommodate foundations:
  - `00_insight_analyses.yaml` (unchanged)
  - `01_strategy_foundations.yaml` (NEW)
  - `02_insight_opportunity.yaml` (was 01)
  - `03_strategy_formula.yaml` (was 02)
  - `04_roadmap_recipe.yaml` (was 03)
* **Consistency Protocol:** Changes to foundations trigger updates to strategy formula, similar to how analyses inform opportunity.
* **Enhanced Calibration:** `calibration_memo.yaml` now includes `foundations_updates` for feedback loop.

## What's New in v1.9.2

* **Track-Based Roadmap Structure:** The roadmap (`05_roadmap_recipe.yaml`) is now organized by four parallel tracks (Product, Strategy, Org/Ops, Commercial) to align with the four value models in the FIRE phase. Each track has its own OKRs, assumptions, and solution scaffold.
* **Cross-Track Dependency Management:** New `cross_track_dependencies` section explicitly maps dependencies between Key Results across tracks.
* **Updated Roadmap Schema:** `roadmap_recipe_schema.json` now validates the track-based structure with proper ID prefixes (p/s/o/c).
* **Track-Specific Assessment:** `assessment_report.yaml` now organizes assessments by track for clearer performance tracking.
* **Specialized INSIGHT Agents:** Four new specialized agents (`01_trend_scout`, `02_market_mapper`, `03_internal_mirror`, `04_problem_detective`) help teams quickly establish first-draft foundational analyses following the 80/20 principle.

## What's New in v1.9.1

* **Three-Stage READY Phase:** The READY phase is now formally structured as INSIGHT → STRATEGY → ROADMAP, providing a complete progression from opportunity identification to execution planning.
* **New READY Artifacts:** Three new comprehensive artifacts replace the simple legacy files:
  - `01_insight_opportunity.yaml` - Captures market opportunities with evidence and value hypothesis
  - `02_strategy_formula.yaml` - Defines competitive positioning, business model, and winning formula
  - `03_roadmap_recipe.yaml` - Consolidates OKRs, assumptions, solution scaffold, and execution plan
* **Enhanced Schemas:** Three new schemas validate the READY phase artifacts with full traceability support
* **Updated AI Agents:** Pathfinder and Synthesizer agent prompts now guide teams through the full three-stage READY flow
* **Enhanced AIM Phase:** Assessment and calibration artifacts now reference roadmaps and provide structured inputs for the next READY cycle
* **Legacy Archive:** Original simple files moved to `_legacy` folders to prevent confusion

## What's New in v1.9.0

* **Formalized Workflow Architecture:** This version introduces a new `/templates/FIRE/workflows` directory to formalize the management of state machines and their configurations. This promotes a more robust, scalable, and configurable approach to building product features.
* **Feature Definition Artifacts:** Feature definitions now live in `/definitions/product/` with template at `_template/` and examples in category subdirectories.
* **New `workflow_schema.json`:** A new schema is included to validate the structure of state machine definitions and their corresponding configuration files.
* **Enhanced `value_model_schema.json`:** The value model schema has been updated to include an optional `premium: boolean` flag for L3 sub-components, allowing for clear distinction of premium features.

## Core Philosophy

EPF is built on a few key principles:
1. **READY → FIRE → AIM:** A core operating loop focused on learning and calibration under uncertainty.
2. **80/20 Principle:** We focus on the 20% of work that yields 80% of the learning and value.
3. **De-risking through Falsification:** We prioritize testing our riskiest assumptions and aim to disprove them quickly to accelerate learning.
4. **Traceability:** Every piece of work is traceable from a strategic objective down to its implementation and resulting outcome.
5. **Lean Documentation:** Git handles versioning and history - EPF artifacts should not duplicate what can be inferred from repository state.
6. **Immutable Ledger:** Decision history (including what NOT to do) provides organizational memory for AI agents and team members.

## Work Hierarchy and Handoff Point

EPF defines a 4-level information architecture hierarchy, with clear boundaries between strategic artifacts (EPF's domain) and technical implementation (outside EPF):

```
EPF STRATEGIC DOMAIN (✅)               ENGINEERING DOMAIN (❌)
──────────────────────────────────────  ──────────────────────────────
Value Model                             
  │ WHY we exist (purpose, value drivers)
  │ HOW value flows (capabilities, logical structure)
  │ (persistent foundation)
  │                                     
  └──► Feature Definition                
        │ Inherits WHY from value model
        │ HOW users achieve outcomes (scenarios, workflows)
        │ WHAT value is delivered (contexts, outcomes, criteria)
        │ (outcome-oriented, non-implementation)
        │                               
        │ Includes: Personas, scenarios,
        │ acceptance criteria, value    
        │ mapping                       
        │                               
        ══════╪═════════════════════════  ◄── HANDOFF POINT
              │                         
              └──────────────────────────► Feature Implementation Spec
                                            │ HOW to technically build it
                                            │ WHAT technologies to use
                                            │ (architecture, APIs, schemas)
                                            │
                                            │ Includes: API specs, database
                                            │ schemas, architecture, PRDs
                                            │
                                            └──► Implemented Feature/Code
                                                  │ Implemented WHAT
                                                  │ (the actual running software)
                                                  │
                                                  │ Includes: Source code, tests,
                                                  │ deployments, monitoring

WITHIN EPF STRATEGIC DOMAIN:

Objective (O) → Key Result (KR) → Feature Definition
  │               │                    │
  │               │                    └─► Links to Value Model paths
  │               └─────────────────────► Measures feature success
  └─────────────────────────────────────► Sets strategic direction
```

### EPF's Scope: What's In, What's Out

| Artifact Level | WHY-HOW-WHAT | EPF Responsibility | Owner | Changes |
|----------------|--------------|-------------------|-------|---------|
| **1. Value Model** | **WHY + HOW** (strategic) | ✅ YES - Define WHY (purpose, value drivers) and HOW (value flows, capabilities) | Product team | Annually or less |
| **2. Feature Definition** | **HOW + WHAT** (tactical/strategic) | ✅ YES - Define HOW (user workflows, scenarios) and WHAT (outcomes, contexts, criteria on high level) | Product team | Quarterly or less |
| **3. Feature Implementation Spec** | **HOW + WHAT** (technical) | ❌ NO - Technical HOW (architecture, APIs) and technical WHAT (specific technologies) | Engineering team | Monthly |
| **4. Implemented Feature/Code** | **WHAT** (concrete) | ❌ NO - The actual running software | Engineering team | Daily/weekly |

### Key Principles: The WHY-HOW-WHAT Continuum

- **Value Model defines strategic WHY + HOW.** It answers "WHY do we exist?" (purpose, value drivers) and "HOW does value flow?" (capabilities, logical structure). This is persistent information architecture.

- **Feature Definitions inherit WHY and define tactical HOW + strategic WHAT.** They answer "HOW do users achieve outcomes?" (scenarios, workflows) and "WHAT value is delivered?" (contexts, jobs-to-be-done, acceptance criteria) on a high, non-implementation level.

- **Each level overlaps with the next.** The WHAT from one level becomes context for the next level's HOW decisions. This tight coupling ensures emergence—the complete solution emerges from overlapping, interconnected pieces.

- **EPF covers WHY + HOW, NOT technical WHAT.** EPF defines purpose and approach (strategic/tactical). Engineering defines technical implementation (architecture, code).

- **Handoff Point is between Product and Engineering.** Product team creates WHY + HOW artifacts (Levels 1-2). Engineering team creates technical HOW + WHAT artifacts (Levels 3-4).

See `integration_specification.yaml` for the complete machine-readable contract.

## Feature Definitions: The Bridge to Implementation

Feature definitions are the **primary output** of EPF that serves as the handoff point to engineering teams. They bridge the gap between EPF's strategic artifacts (value model, roadmap) and technical implementation (API specs, database schemas, architecture, code).

### Purpose and Scope

**What Feature Definitions ARE (EPF Scope ✅):**
- **Tactical HOW + Strategic WHAT specifications** inheriting WHY from value model
- Define **HOW users achieve outcomes** through scenarios and workflows
- Define **WHAT value is delivered** through contexts, jobs-to-be-done, and acceptance criteria (on high, non-implementation level)
- Business-focused documents with personas, scenarios, and acceptance criteria
- Outcome-oriented specifications that engineering uses to create technical specs
- YAML artifacts maintained by product team

**What Feature Definitions are NOT (Outside EPF ❌):**
- Technical implementation specifications (API contracts, database schemas)
- Architecture diagrams or system design documents (technical HOW)
- Technology choices or specific endpoints (technical WHAT)
- Source code or test specifications

**The Critical Distinction:**
- Feature Definition WHAT: "Alert delivered within 30 seconds" (outcome, acceptance criteria)
- Implementation Spec WHAT: "WebSocket endpoint `/ws/alerts` using Kafka" (technical, specific)

Feature definitions contain WHAT on a **strategic level** (what outcomes, what user experiences, what acceptance criteria). They do NOT contain WHAT on a **technical level** (what APIs, what database tables, what architecture patterns).

**The Handoff:** Product team creates feature definitions → Engineering team creates implementation specs → Engineers write code.

### N:M Mapping to Value Model

Feature definitions derive from and map to value model components. This relationship is many-to-many (N:M):
- A single feature may contribute value to multiple L2/L3 components
- A single L2/L3 component may receive value from multiple features
- This many-to-many relationship is by design - features are cross-cutting concerns

**Example:** A "Digital Twin" feature might contribute to:
- `Product.Operate.Monitoring` (real-time visibility)
- `Product.Optimize.Recommendations` (AI-driven suggestions)
- `Commercial.Trust.Verification` (audit trail)

### Loose References for Traceability

Feature definitions maintain loose references to:
- `contributes_to`: Which value model L2/L3 paths receive value
- `tracks`: Which roadmap track(s) this feature belongs to
- `assumptions_tested`: Which assumptions from the roadmap this feature helps validate

These are **pointers for traceability**, not rigid dependencies.

### Engineering's Responsibility

After receiving a feature definition, engineering teams create:
1. **Feature Implementation Specification** (technical PRD, API contracts, database schemas, architecture)
2. **Implemented Feature** (source code, tests, deployments)

EPF does not define or prescribe HOW features are implemented - that's engineering's domain.
- The interface is the feature definition file itself - tools learn to parse it

**For tool developers:** See `integration_specification.yaml` for the machine-readable contract that defines:
- What EPF provides (artifacts, schemas, locations)
- What EPF expects from tools (traceability, anti-patterns)
- Recommended tool behaviors (on read, on complete, on assumption invalidation)
- Example prompts for AI-based tools

### Lean Documentation Approach

Feature definitions follow the lean documentation principle:
- **One file per feature** - no complex folder hierarchies
- **Git handles versioning** - no version fields or change history in the YAML
- **Minimal structure** - only what's needed for implementation tools to consume
- **Let AI infer** - context that can be derived from git history doesn't need explicit documentation

---

## Health Check & Artifact Quality

EPF provides **two complementary validation systems**:

### Framework Health Check
**Tool:** `epf-health-check.sh`  
**Purpose:** Validate EPF framework repository integrity  
**Scope:** Framework files (schemas, templates, documentation)  
**Use:** Before committing framework changes

Checks VERSION consistency, schema validity, YAML parsing, documentation structure. See [scripts/README.md](scripts/README.md) for details.

### Instance Health Check (3-Tier System)
**Purpose:** Assess strategic completeness and currency of product artifacts  
**Scope:** Instance artifacts (roadmaps, features, strategies)  
**Use:** During product development, milestone reviews

EPF provides a **3-tier validation system** that ensures both compliance and strategic completeness:

### Tier 1: Schema Compliance (Required)
Basic validation that all required fields are present and types are correct. This is the minimum bar - an artifact must pass schema validation to be considered "valid."

**Tools:** `validate-schemas.sh`, `validate-instance.sh`  
**Checks:** Required fields, type correctness, structure validity  
**Pass/Fail:** Binary (valid or invalid)

### Tier 2: Field Coverage Analysis (Recommended)
Analyzes what percentage of optional fields are populated and identifies high-value missing fields. An artifact can be "valid" but only 40% complete.

**Tool:** `analyze-field-coverage.sh`  
**Provides:**
- Coverage percentage (0-100%)
- Health grade (A/B/C/D)
- Missing fields by importance (CRITICAL/HIGH/MEDIUM/LOW)
- ROI and effort estimates for enrichment
- Strategic impact assessment

**Example:** twentyfirst roadmap = 41% coverage, Grade C
- Missing CRITICAL fields: TRL tracking (innovation maturity)
- Missing HIGH fields: Hypothesis validation structure
- Recommendation: Add TRL fields (2-3 hours, high strategic value)

### Tier 3: Version Alignment (Recommended)
Detects when artifact internal versions lag behind schema evolution. Ensures artifacts remain current as EPF framework evolves.

**Tool:** `check-version-alignment.sh`  
**Classifications:**
- **CURRENT** (0 versions behind) ✅ - Artifact matches current schema
- **BEHIND** (1-2 minor behind) ⚠️ - Minor enrichment available
- **STALE** (3+ minor behind) ⚠️ - Significant new fields available
- **OUTDATED** (major version behind) 🚨 - Breaking changes, migration required

**Example:** feature definition v1.5 when schema is v2.0 = OUTDATED
- Action: Migrate contexts→personas (breaking change)
- Tool: `migrate-artifact.sh` with feature_enrichment.wizard.md

### Migration Support

When Tier 2/3 identify gaps, EPF provides guided migration:

- **Interactive:** `migrate-artifact.sh` - Wizard-guided enrichment with validation
- **Batch:** `batch-migrate.sh` - Prioritized migration of multiple artifacts
- **Wizards:** 
  - `roadmap_enrichment.wizard.md` - TRL fields for all 4 tracks
  - `feature_enrichment.wizard.md` - v1.x→v2.0 persona upgrade

**Complete documentation:** [`scripts/README.md`](scripts/README.md) - Enhanced Health Check System section

---

## The READY Phase Structure

The READY phase is subdivided into three sequential sub-phases:

### 1. INSIGHT → Big Opportunity Identified
- Conduct foundational analyses: Trends, Market, Internal (SWOT), User/Problem
- Synthesize insights from analyses to identify opportunity convergence
- Validate opportunities with evidence (quantitative and qualitative)
- Define clear value hypothesis
- Outputs:
  - `01_insight_analyses.yaml` - Living document with 4 foundational analyses
  - `03_insight_opportunity.yaml` - Clear opportunity statement synthesized from analyses

### 2. STRATEGY → Winning Formula Identified
- Define strategic foundations: Product vision, Value proposition, Strategic sequencing, Information architecture
- Ensure foundations are consistent with INSIGHT findings and organizational North Star
- Define competitive positioning and unique value proposition
- Articulate the business model and growth engines
- Identify strategic risks and trade-offs
- Outputs:
  - `02_strategy_foundations.yaml` - Living document with 4 strategic foundations
  - `04_strategy_formula.yaml` - Winning formula synthesized from foundations

### 3. ROADMAP → Recipe for Solution Identified
- Set OKRs and identify riskiest assumptions **per track** (Product, Strategy, Org/Ops, Commercial)
- Create solution scaffold (high-level architecture) for each track
- Define work packages with clear traceability within and across tracks
- Build execution plan with cross-track dependencies and milestones
- Output: `05_roadmap_recipe.yaml` - organized by four tracks, feeds into corresponding value models in FIRE phase

## How to Use This Repository

This skeleton provides the complete directory structure, schemas, and placeholder artifacts. Your team's workflow will involve populating and updating these artifacts as you move through the EPF cycles. The AI Knowledge Agent should use the schemas in the `/schemas` directory to validate all artifacts and assist users via the prompts in the `/wizards` directory.

### Important Files for Maintenance

- **`MAINTENANCE.md`** - Complete consistency checklist for human maintainers
- **`.ai-agent-instructions.md`** - Protocol for AI agents to automatically maintain repository consistency

**Note:** Any change to the EPF repository MUST be followed by a consistency check. AI agents should automatically perform this check using the protocol in `.ai-agent-instructions.md`.

### Workflow
0. **Before Starting EPF Cycles:**
   - Review/Create `00_north_star.yaml` (Purpose, Vision, Mission, Values, Core Beliefs)
   - This provides stable organizational context for all cycles
   - Update only during major strategic shifts or annual review

1. **READY Phase:**
   - Step 1a: Complete/Update `01_insight_analyses.yaml` (INSIGHT - foundational analyses)
   - Step 1b: Complete `03_insight_opportunity.yaml` (INSIGHT - opportunity synthesis)
   - Step 2a: Complete/Update `02_strategy_foundations.yaml` (STRATEGY - strategic foundations)
   - Step 2b: Complete `04_strategy_formula.yaml` (STRATEGY - winning formula synthesis)
   - Step 3: Complete `05_roadmap_recipe.yaml` (ROADMAP) - organized by four tracks:
     - **Product track:** OKRs, assumptions, work packages for core product development
     - **Strategy track:** OKRs, assumptions, work packages for market positioning
     - **Org/Ops track:** OKRs, assumptions, work packages for operational capabilities
     - **Commercial track:** OKRs, assumptions, work packages for go-to-market
   - Note: `01_insight_analyses.yaml` and `02_strategy_foundations.yaml` are living documents that get refined through AIM learnings
   - Note: `00_north_star.yaml` is reviewed annually or during major strategic shifts
   - Note: Original `okrs.yaml`, `assumptions.yaml`, `work_packages.yaml` are now legacy - use the track-based roadmap instead

2. **FIRE Phase:**
   - Execute work packages defined in the roadmap
   - Detail the value models
   - Create feature definitions
   - Maintain traceability via mappings

3. **AIM Phase:**
   - Generate assessment report
   - Create calibration memo
   - Feed learnings back into next READY cycle

### AI Agent Prompts

The `wizards/` directory contains AI agent persona prompts:

**Phase Orchestrators:**
- **pathfinder.agent_prompt.md**: Guides teams through READY phase (all three stages)
- **product_architect.agent_prompt.md**: Guides teams through FIRE phase
- **synthesizer.agent_prompt.md**: Guides teams through AIM phase

**Specialized INSIGHT Analysis Agents** (for 80/20 first-draft creation):
- **01_trend_scout.agent_prompt.md**: Rapid trend analysis (~30 min)
- **02_market_mapper.agent_prompt.md**: Quick market landscape mapping (~45 min)
- **03_internal_mirror.agent_prompt.md**: Honest SWOT assessment (~45 min)
- **04_problem_detective.agent_prompt.md**: User/problem validation (~50 min)

**When to use specialized agents:** For first-time EPF setup or new product initiatives, use the four specialized agents sequentially to quickly establish first versions of the foundational analyses (~2.5-3 hours total). This 80/20 approach gets you to 80% confidence with 20% of the effort. After completing all four analyses, the Pathfinder can help synthesize the opportunity statement and guide through Strategy and Roadmap phases.
