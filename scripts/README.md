# EPF Scripts

This directory contains automation scripts for EPF framework management, validation, and maintenance.

## 🏥 Health Check & Quality Assessment

### epf-health-check.sh ⭐ PRIMARY HEALTH CHECK

**Comprehensive health check for EPF framework and instances.** This is the primary tool for validating EPF integrity - runs all validation checks in a single command.

**What it checks:**
1. **Version Consistency** - VERSION file matches README.md, MAINTENANCE.md, integration_specification.yaml
2. **YAML Parsing** - All YAML files parse without syntax errors
3. **JSON Schemas** - All schema files are valid JSON
4. **Documentation Completeness** - Required docs exist (README, guides, etc.)
5. **File Structure** - Required directories exist (schemas, scripts, wizards, _instances)
6. **FIRE Phase Content** - Canonical templates validate, instance value models check
7. **Instance Validation** - Instance metadata, folder structure, FIRE subfolders
8. **Content Quality Assessment** - Analyzes READY phase artifacts for template patterns, placeholder content, strategic depth
9. **Canonical Track Consistency** - Validates that documentation correctly distinguishes canonical (Strategy, OrgOps, Commercial) from non-canonical (Product) tracks
10. **Artifact Version Alignment (Tier 3)** - Checks instance artifacts are up-to-date with schema versions

**Note on Script Versioning:**
Scripts have **independent versioning** - script versions reflect when the script itself changes, not the framework version. This provides semantic accuracy. For example, a script at version 2.4.4 may work perfectly with EPF v2.7.0 if the script hasn't needed changes.

Artifact version alignment (checking that YAML files in `_instances/` have versions matching their schemas) is handled by `check-version-alignment.sh` (Tier 3), which is integrated into this health check.

**Usage:**
```bash
# Run complete health check (recommended before commits)
./scripts/epf-health-check.sh

# Auto-fix version mismatches
./scripts/epf-health-check.sh --fix

# Detailed output
./scripts/epf-health-check.sh --verbose
```

**Output:**
- ✅ Passed: Checks that succeeded
- ⚠️ Warnings: Issues that should be addressed
- ❌ Errors: Problems that must be fixed before commit
- 🚨 Critical: Blockers - DO NOT COMMIT

**Content Quality Dashboard:**
```
Content Quality Assessment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Instance: GMS
✓   01_insight_analyses.yaml: 100/100 (Grade: A)
⚠   00_north_star.yaml: 70/100 (Grade: C)
✗   05_roadmap_recipe.yaml: 50/100 (Grade: D) - needs enrichment

Instance average: 77/100 across 6 artifacts
```

**Exit codes:**
- `0` - All checks passed ✅
- `1` - Errors found (should fix before commit)
- `2` - Warnings only (consider fixing)
- `3` - Missing dependencies or EPF root not found

### verify-canonical-sync.sh ⭐ DEEP SYNC VERIFICATION

**Deep verification that product repo EPF files match canonical exactly.** Use when health check passes but you need to verify actual file content matches canonical source.

**Purpose:** Goes beyond VERSION comparison to compare actual file content against canonical EPF repository.

**What it compares:**
- `scripts/*.sh` - All shell scripts
- `schemas/*.json` - All JSON schema files  
- Core files - VERSION, README.md, MAINTENANCE.md, CANONICAL_PURITY_RULES.md, integration_specification.yaml
- `wizards/*.md` - All wizard/agent prompt files
- `templates/READY/*`, `templates/FIRE/*`, `templates/AIM/*` - All template files

**When to use:**
- Health check passes but behavior differs from canonical
- Debugging "works in canonical, fails in product" issues
- After manual edits to framework files (not using sync-repos.sh)
- Before major releases requiring guaranteed sync
- When you suspect sync-repos.sh didn't complete properly

**Usage:**
```bash
# Quick check - just show summary
./scripts/verify-canonical-sync.sh

# Verbose - show each file comparison
./scripts/verify-canonical-sync.sh --verbose

# Auto-fix - sync if differences found
./scripts/verify-canonical-sync.sh --fix
```

**Output example:**
```
EPF Canonical Sync Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Comparing against: epf/main

Checking scripts...
✓ scripts/epf-health-check.sh
✗ scripts/validate-schemas.sh (DIFFERS)

Summary: 1 differences found in 45 files checked
Run with --fix to sync from canonical
```

**Exit codes:**
- `0` - All files match canonical ✅
- `1` - Differences found (needs sync)
- `2` - Error (missing remote, git issues)

**Relationship to other tools:**
- `check-epf-version.sh` - Quick VERSION string comparison (use at session start)
- `verify-canonical-sync.sh` - Deep file content comparison (use when debugging)
- `sync-repos.sh pull` - Actually performs the sync
- `epf-health-check.sh` - Internal consistency only (doesn't compare to canonical)

### check-content-readiness.sh

**Deep content quality analysis for individual artifacts.** Goes beyond schema validation to assess strategic depth, detect template patterns, and identify placeholder content.

**What it checks:**
- **Template Patterns** - Detects "Example:", "TBD", "TODO", placeholder dates
- **Critical Fields** - Verifies required fields have real content (not templates)
- **Content Richness** - Assesses depth and specificity of strategic content
- **Readiness Score** - 0-100 score with letter grade (A-F)

**Usage:**
```bash
# Analyze single artifact
./scripts/check-content-readiness.sh _instances/GMS/READY/01_insight_analyses.yaml

# Analyze entire instance READY phase
./scripts/check-content-readiness.sh _instances/GMS/READY

# With AI assessment prompt (placeholder for future integration)
./scripts/check-content-readiness.sh --ai-assess _instances/GMS/READY/00_north_star.yaml
```

**Output:**
```
Content Readiness Score: 70/100 (Grade: C)

⚠️  Template Content Detected: 6 matches
  - example: 3 occurrences
  - template_markers: 3 occurrences

✅ All critical fields populated

Recommendations:
⚠️  MODERATE: Some template content remains
   Consider enriching for better strategic clarity.

Enrichment wizards for this artifact:
  - docs/EPF/wizards/01_trend_scout.agent_prompt.md
```

**Grading scale:**
- **A (90-100)**: Production-ready, minimal refinements needed
- **B (75-89)**: Good quality, minor improvements suggested
- **C (60-74)**: Moderate template content, needs enrichment
- **D (40-59)**: Significant placeholder content, requires work
- **F (0-39)**: Mostly template, not ready for strategic use

**Integration:**
- Called automatically by `epf-health-check.sh` for all instances
- Can be run standalone for detailed analysis and enrichment guidance
- Provides wizard recommendations for content improvement

## 🔍 Validation Scripts

### validate-feature-quality.sh

Validates feature definitions against quality standards beyond basic schema compliance.

**Checks:**
- Persona count (must be exactly 4)
- Persona narrative lengths (200+ characters for quality)
- Scenario structure (v2.0 format with 8 required fields)
- Context arrays (key_interactions, data_displayed minimum 1 item each)
- Dependency richness (30+ character reasons, object format)

**Usage:**
```bash
# Validate single file
./scripts/validate-feature-quality.sh definitions/product/01-technical/fd-001-document-ingestion.yaml

# Validate entire directory
./scripts/validate-feature-quality.sh definitions/product/

# Exit codes: 0 = pass, 1 = validation errors
```

### validate-cross-references.sh

Validates that all feature definition cross-references point to existing features.

**Checks:**
- `dependencies.requires[].id` → feature must exist
- `dependencies.enables[].id` → feature must exist
- `dependencies.based_on[].id` → feature must exist

**Usage:**
```bash
# Validate all features
./scripts/validate-cross-references.sh definitions/product/

# Exit codes: 0 = all refs valid, 1 = missing references found
```

**Output Example:**
```
Checking: definitions/product/01-technical/fd-003-semantic-search-query-interface.yaml (ID: fd-003)
✓   requires: fd-001 → definitions/product/01-technical/fd-tech-001-document-ingestion.yaml
✓   requires: fd-002 → definitions/product/01-technical/fd-002-knowledge-graph-engine.yaml
✓   enables: fd-004 → definitions/product/01-technical/fd-004-llm-processing-pipeline.yaml
```

### validate-value-model-references.sh

Validates that feature `contributes_to` paths exist in value models (THE LINCHPIN of EPF traceability).

**Checks:**
- `strategic_context.contributes_to[]` paths exist in value models
- Path format: `Pillar.L2Component.L3SubComponent` (e.g., `Product.Decide.Analysis`)
- Pillars: Product, Strategy, OrgOps, Commercial
- L2: `layers[].components[].id` in `{pillar}.value_model.yaml`
- L3: `components[].sub_components[].id` within L2 component

**Usage:**
```bash
# Validate all features against value models
./scripts/validate-value-model-references.sh definitions/product/

# Specify custom value models directory
./scripts/validate-value-model-references.sh definitions/product/ templates/FIRE/value_models

# Exit codes: 0 = all paths valid, 1 = invalid paths found
```

**Output Example:**
```
Checking: definitions/product/01-technical/fd-002-knowledge-graph-engine.yaml (ID: fd-002)
✓ Product.Decide.Analysis → product.value_model.yaml (Decide / Analysis)
✓ Product.Operate.Knowledge → product.value_model.yaml (Operate / Knowledge)
```

**Why Critical:** This validator ensures features maintain strategic alignment with value delivery. Without it, features can silently reference non-existent capabilities, breaking the strategy→product→features traceability chain.

### validate-roadmap-references.sh

Validates that feature `assumptions_tested` IDs exist in roadmap.

**Checks:**
- `strategic_context.assumptions_tested[]` IDs exist in roadmap
- Format: `asm-{track_prefix}-{number}` (e.g., `asm-p-001`)
- Track prefixes: `p` (product), `s` (strategy), `o` (org_ops), `c` (commercial)
- Assumptions defined in: `roadmap.tracks.{track}.riskiest_assumptions[].id`

**Usage:**
```bash
# Validate all features against roadmap
./scripts/validate-roadmap-references.sh definitions/product/

# Specify custom roadmap file
./scripts/validate-roadmap-references.sh definitions/product/ templates/READY/05_roadmap_recipe.yaml

# Exit codes: 0 = all refs valid, 1 = invalid refs found
```

**Output Example:**
```
Checking: definitions/product/01-technical/fd-002-knowledge-graph-engine.yaml (ID: fd-002)
✓ asm-p-001 → product track (problem: Users struggle to find relevant information)
✓ asm-s-002 → strategy track (solution: Knowledge graph provides context)
```

**Note:** `assumptions_tested` is optional - features without roadmap assumptions will show info message, not error.

### validate-schemas.sh

Validates instance artifacts against JSON schemas using ajv-cli.

**Usage:**
```bash
# Validate specific instance
./scripts/validate-schemas.sh _instances/my-product

# Exit codes: 0 = schema compliant, 1 = validation errors
```

### validate-instance.sh

Validates complete instance structure, naming conventions, and file organization with **integrated 3-tier health check**.

**Tier 1 - Compliance:**
- Instance directory structure
- File naming conventions
- Required files present
- Integration spec format

**Tier 2 - Coverage (if analyze-field-coverage.sh available):**
- Field coverage percentage
- CRITICAL/HIGH/MEDIUM field gaps
- Strategic completeness assessment

**Tier 3 - Alignment (if check-version-alignment.sh available):**
- Schema version drift detection
- CURRENT/BEHIND/STALE/OUTDATED classification
- Migration recommendations

**Usage:**
```bash
# Validate instance (runs all 3 tiers if tools available)
./scripts/validate-instance.sh _instances/my-product

# Exit codes: 0 = all checks passed, 1 = issues found
```

**Output Example:**
```
━━━ 9. Enhanced Health Check ━━━
Running Tier 2: Field Coverage Analysis...
  Field Coverage Grade: C (55/100)
⚠ WARNING: Field Coverage: 2 CRITICAL field gap(s) found
    Run: ./scripts/analyze-field-coverage.sh _instances/my-product

Running Tier 3: Version Alignment Check...
⚠ WARNING: Version Alignment: 3 artifact(s) OUTDATED (major version behind)
    Run: ./scripts/check-version-alignment.sh _instances/my-product

Tier 1: Compliance (Required Fields)
  Passed:   51
  Warnings: 2
  Errors:   0

━━━ VALIDATION PASSED WITH RECOMMENDATIONS ━━━
```

## Enhanced Health Check System

EPF's enhanced health check provides **3 tiers of validation** that go beyond basic schema compliance to assess strategic completeness and currency.

### Tier 2: Field Coverage Analysis

**Tool:** `analyze-field-coverage.sh`  
**Purpose:** Calculate field coverage and identify high-value missing fields  
**Answers:** "How complete is this artifact?"

Analyzes YAML artifacts against field importance taxonomy to:
- Calculate overall coverage percentage (0-100)
- Identify missing fields categorized by importance (CRITICAL/HIGH/MEDIUM/LOW)
- Estimate ROI and effort for enrichment
- Generate health grades (A/B/C/D)

**Supported Artifacts:**
- Roadmaps (`05_roadmap_recipe.yaml`)
- Feature Definitions (`fd-XXX_*.yaml`)
- North Star (`00_north_star.yaml`)
- Strategy (`01_strategy.yaml`)
- Value Models (`*.value_model.yaml`)

**Usage:**
```bash
# Analyze single artifact
./scripts/analyze-field-coverage.sh _instances/twentyfirst/READY/05_roadmap_recipe.yaml

# Analyze entire instance directory
./scripts/analyze-field-coverage.sh _instances/twentyfirst

# Analyze specific directory
./scripts/analyze-field-coverage.sh _instances/twentyfirst/READY

# Exit codes: 0 = success, 1 = analysis failed
```

**Output Example:**
```
═══════════════════════════════════════════════════════════════
         EPF Field Coverage Analyzer v1.0.0                   
═══════════════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coverage Analysis: 05_roadmap_recipe.yaml
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Schema: roadmap_recipe_schema.json
Artifact internal version: v1.9.6

Overall Coverage: 41% (5/12 fields per Key Result)
Health Grade: C (55/100)

Field Categories:

  CRITICAL (Learning & Innovation Maturity): 0/4 fields (0%) ⚠️
    Missing:
      - trl_start
      - trl_target
      - trl_progression
      - technical_hypothesis
    Reason: Technology Readiness Level tracking for learning and innovation maturity
    Value: Track R&D progression, identify knowledge gaps, validate learning milestones
    Effort: 2-3 hours for full roadmap

  HIGH (Hypothesis Testing): 0/3 fields (0%) ⚠️
    Missing:
      - success_criteria
      - uncertainty_addressed
      - experiment_design
    Reason: Hypothesis-driven development enables evidence-based pivots
    Value: Transform output-focused into learning-focused, reduce sunk cost fallacy
    Effort: 2-3 hours for full roadmap

Recommendation:
  ⚠️  LOW COVERAGE - Strongly recommend enrichment
  PRIORITY: Add TRL fields to track innovation maturity progression

Next Steps:
  1. Review taxonomy: cat schemas/field-importance-taxonomy.json
  2. Run migration wizard: ./scripts/migrate-artifact.sh --artifact 05_roadmap_recipe.yaml
```

### Tier 3: Version Alignment Check

**Tool:** `check-version-alignment.sh`  
**Purpose:** Detect schema drift and guide migration  
**Answers:** "Is this artifact current with latest schema?"

Compares artifact internal versions against schema versions to identify:
- **CURRENT** - Artifact version matches schema (0 versions behind)
- **BEHIND** - Artifact 1-2 minor versions behind (minor enrichment needed)
- **STALE** - Artifact 3+ minor versions behind (significant enrichment needed)
- **OUTDATED** - Artifact major version behind (breaking changes, requires migration)

**Usage:**
```bash
# Check entire instance
./scripts/check-version-alignment.sh _instances/twentyfirst

# Filter by status
./scripts/check-version-alignment.sh _instances/twentyfirst | grep OUTDATED

# Exit codes: 0 = all current, 1 = gaps found, 2 = usage error
```

**Output Example:**
```
╔═══════════════════════════════════════════════════════╗
║     EPF Version Alignment Check - twentyfirst
╚═══════════════════════════════════════════════════════╝

━━━ Scanning Artifacts ━━━

Artifact: 00_north_star.yaml
  Path: _instances/twentyfirst/READY/00_north_star.yaml
  Artifact version: 1.9.6
  Schema version: 1.13.0
  Status: ⚠️  STALE (3+ minor versions behind)
  Action: ENRICH (new fields available)
  Estimated effort: 2-6 hours (enrichment)

Artifact: 05_roadmap_recipe.yaml
  Path: _instances/twentyfirst/READY/05_roadmap_recipe.yaml
  Artifact version: 1.9.6
  Schema version: 1.13.0
  Status: ⚠️  STALE (3+ minor versions behind)
  Action: ENRICH (new TRL fields, hypothesis testing)
  Estimated effort: 4-8 hours (strategic enrichment)

━━━ Summary ━━━
Total artifacts analyzed: 9
  CURRENT:    3 (33%)  ✅
  BEHIND:     0 (0%)   ⚠️
  STALE:      2 (22%)  ⚠️
  OUTDATED:   1 (11%)  🚨
  No version: 3 (33%)  ℹ️

Recommendations:
  1. Priority: Migrate OUTDATED artifacts (major version behind)
     Use: ./scripts/migrate-artifact.sh <artifact>
  2. Next: Enrich STALE artifacts (missing strategic fields)
     Use: ./scripts/batch-migrate.sh _instances/twentyfirst --priority high
```

## Migration Tools

### generate-migration-plan.sh ⭐ NEW

Generates a comprehensive MIGRATION_PLAN.yaml for an instance, documenting all artifacts that need migration or enrichment.

**Purpose:** Create actionable migration plan with AI-agent instructions  
**Output:** `MIGRATION_PLAN.yaml` in the instance directory

**Features:**
- Analyzes all YAML artifacts in instance
- **Compares artifact versions against SCHEMA versions** (not framework version!)
- Categorizes by priority (high/medium/low)
- Generates execution order
- Includes AI agent instructions for automation
- Links to relevant migration guides

**Important Versioning Note:**
EPF has independent schema versioning. Each schema (e.g., `roadmap_recipe_schema.json`) has its own version that only bumps when that schema changes. Artifacts are compared against their schema's version, NOT the EPF framework version.

Example: EPF framework is v2.9.0, but `roadmap_recipe_schema.json` is v1.13.0. An artifact at v1.13.0 is CURRENT (matches schema), even though the framework is v2.9.0.

**Usage:**
```bash
# Generate plan for instance (creates MIGRATION_PLAN.yaml)
./scripts/generate-migration-plan.sh _instances/twentyfirst

# Specify custom output location
./scripts/generate-migration-plan.sh _instances/emergent --output /tmp/plan.yaml

# Verbose mode (show each artifact analysis)
./scripts/generate-migration-plan.sh _instances/lawmatics --verbose

# Exit codes: 0 = success, 1 = error, 2 = usage error
```

**Output Structure:**
```yaml
meta:
  instance: "twentyfirst"
  instance_epf_version: "2.3.3"
  epf_framework_version: "2.9.0"
  versioning_note: "Artifacts compared against schema versions, not framework version"

summary:
  total_artifacts: 15
  needs_migration: 2      # Major version behind schema
  needs_enrichment: 5     # Minor versions behind schema
  current: 8
  overall_status: "MIGRATION_REQUIRED"

execution_order:
  high_priority:
    - "FIRE/feature_definitions/fd-001.yaml"
  medium_priority:
    - "READY/05_roadmap_recipe.yaml"
  low_priority:
    - "READY/00_north_star.yaml"

artifacts:
  - file: "FIRE/feature_definitions/fd-001.yaml"
    type: "feature_definition"
    current_version: "1.9.6"
    target_version: "2.8.0"
    status: "major_behind"
    action: "migrate"
    priority: "high"
    migration_guide: "migrations/guides/v1.x-to-v2.0.0.md"

ai_instructions:
  assess_phase: [...]
  execute_phase: [...]
  verify_phase: [...]
```

**Workflow:**
1. Run `generate-migration-plan.sh` to create the plan
2. Review the plan and priority order
3. AI agent reads plan and executes migrations
4. Validate with `validate-instance.sh`

### migrate-artifact.sh

Interactive migration assistant for enriching individual artifacts.

**Purpose:** Guide users through adding new fields with wizard support  
**Supports:** Roadmaps, feature definitions, north stars, strategy docs

**Features:**
- Auto-detects artifact type
- Creates timestamped backup before changes
- Opens relevant enrichment wizard (roadmap_enrichment.wizard.md, feature_enrichment.wizard.md)
- Prompts user to edit artifact
- Validates result with coverage/alignment checks
- Provides before/after comparison

**Usage:**
```bash
# Interactive migration (auto-detects type)
./scripts/migrate-artifact.sh _instances/twentyfirst/READY/05_roadmap_recipe.yaml

# Specific feature definition
./scripts/migrate-artifact.sh _instances/twentyfirst/FIRE/feature_definitions/fd-001_group.yaml

# Exit codes: 0 = success, 1 = migration failed, 2 = usage error
```

**Workflow:**
1. Creates backup: `<artifact>.backup-YYYYMMDD-HHMMSS.yaml`
2. Opens wizard in `$PAGER` or `less` (read-only reference)
3. Prompts: "Ready to edit artifact? [y/n]"
4. Opens artifact in `$EDITOR` (defaults to vi/nano)
5. Validates enriched artifact (coverage + alignment)
6. Shows improvement summary

**Example Session:**
```bash
$ ./scripts/migrate-artifact.sh _instances/twentyfirst/READY/05_roadmap_recipe.yaml

╔══════════════════════════════════════════════════════════════════╗
║           EPF Artifact Migration Assistant v1.0.0                ║
╚══════════════════════════════════════════════════════════════════╝

━━━ Artifact Detection ━━━
Detected artifact type: roadmap
Detected schema: roadmap_recipe_schema.json

━━━ Pre-Migration Analysis ━━━
Current coverage: 41% (5/12 fields per KR)
Current alignment: STALE (v1.9.6, schema v1.13.0)

Creating backup: 05_roadmap_recipe.backup-20260105-143022.yaml

━━━ Opening Enrichment Wizard ━━━
Opening: wizards/roadmap_enrichment.wizard.md
(Press 'q' to exit wizard when ready)

Ready to edit artifact? [y/n]: y

Opening artifact in editor...
(Make your changes, save and exit)

━━━ Post-Migration Validation ━━━
New coverage: 75% (9/12 fields per KR) [+34%]
New alignment: CURRENT (v1.13.0)

✅ Migration successful!
   Coverage improved: 41% → 75%
   Version updated: v1.9.6 → v1.13.0
   Backup saved: 05_roadmap_recipe.backup-20260105-143022.yaml
```

### batch-migrate.sh

Batch migration tool for prioritizing and enriching multiple artifacts.

**Purpose:** Migrate multiple artifacts in priority order with dry-run support  
**Supports:** Full instance directories with automatic prioritization

**Prioritization Algorithm:**
```
Priority Score = (Version Gap × 40) + (Artifact Type Weight × 30) + (Naming Hints × 30)

Version Gaps:
  OUTDATED (major) = 10 points
  STALE (3+ minor) = 7 points
  BEHIND (1-2 minor) = 4 points
  CURRENT = 0 points

Artifact Type Weights:
  Roadmap = 10 (strategic, high leverage)
  Feature Definition = 7 (tactical, frequent)
  North Star = 9 (foundational, rare changes)
  Strategy = 8 (strategic direction)
  Value Model = 6 (structural, stable)

Naming Hints:
  "core", "critical", "mvp" = +3 points
  "draft", "wip", "temp" = -2 points
```

**Usage:**
```bash
# Analyze and migrate all artifacts (interactive)
./scripts/batch-migrate.sh _instances/twentyfirst

# Dry-run mode (show plan without executing)
./scripts/batch-migrate.sh _instances/twentyfirst --dry-run

# Filter by priority (high = score ≥ 70)
./scripts/batch-migrate.sh _instances/twentyfirst --priority high

# Filter by type
./scripts/batch-migrate.sh _instances/twentyfirst --type roadmap
./scripts/batch-migrate.sh _instances/twentyfirst --type feature_definition

# Combine filters
./scripts/batch-migrate.sh _instances/twentyfirst --type roadmap --priority medium --dry-run

# Exit codes: 0 = success, 1 = migration errors, 2 = usage error
```

**Output Example:**
```bash
$ ./scripts/batch-migrate.sh _instances/twentyfirst --dry-run

╔══════════════════════════════════════════════════════════════════╗
║              EPF Batch Migration Tool v1.0.0                     ║
╚══════════════════════════════════════════════════════════════════╝

━━━ Scanning Instance ━━━
Found 18 artifacts to analyze

━━━ Prioritized Migration Queue ━━━

[PRIORITY: CRITICAL - Score: 87]
  Artifact: 05_roadmap_recipe.yaml
  Type: roadmap
  Status: STALE (v1.9.6 → v1.13.0)
  Gap Severity: 7/10
  Reason: Strategic roadmap 3+ versions behind, missing TRL fields
  Estimated effort: 4-8 hours

[PRIORITY: HIGH - Score: 74]
  Artifact: fd-001_group_structures.yaml
  Type: feature_definition
  Status: OUTDATED (v1.x → v2.0.0)
  Gap Severity: 10/10
  Reason: Breaking change (contexts→personas), core feature
  Estimated effort: 1-2 hours

[PRIORITY: MEDIUM - Score: 58]
  Artifact: 00_north_star.yaml
  Type: north_star
  Status: BEHIND (v1.11.0 → v1.13.0)
  Gap Severity: 4/10
  Reason: Minor enrichment fields available
  Estimated effort: 1-2 hours

━━━ Summary ━━━
Total artifacts: 18
  CRITICAL priority: 2
  HIGH priority: 5
  MEDIUM priority: 4
  LOW priority: 7

DRY-RUN MODE - No changes made
Run without --dry-run to execute migrations
```

## Workflow Scripts

### epf-health-check.sh

**Framework-level** consistency checker for EPF repository maintenance.

**Purpose:** Validates EPF framework integrity (VERSION alignment, schemas, documentation)  
**Scope:** Framework files, not instance artifacts  
**Use:** Before committing framework changes, during maintenance

**Checks:**
- VERSION file alignment across all scripts
- Schema-artifact consistency at framework level
- YAML parsing validity
- Documentation structure
- File organization

**Usage:**
```bash
# Run health check
./scripts/epf-health-check.sh

# With auto-fix for version mismatches
./scripts/epf-health-check.sh --fix

# Verbose output
./scripts/epf-health-check.sh --verbose

# Exit codes: 0 = healthy, 1 = errors, 2 = warnings, 3 = missing dependencies
```

**Relationship to Enhanced Health Check:**
- `epf-health-check.sh` = **Framework integrity** (structure, versions, consistency)
- Enhanced Health Check = **Instance quality** (artifact completeness, currency, enrichment)

**Example:**
```bash
# Framework maintenance workflow:
./scripts/epf-health-check.sh              # Check framework integrity
./scripts/bump-framework-version.sh 2.3.3  # Bump version
./scripts/epf-health-check.sh              # Verify consistency

# Instance quality workflow:
./scripts/validate-instance.sh _instances/my-product    # Tier 1-3
./scripts/analyze-field-coverage.sh _instances/my-product  # Deep dive
```

### bump-framework-version.sh

Automated framework version bumping with consistency checks.

**Features:**
- Updates VERSION file
- Updates all script headers
- Creates git commit
- Validates alignment before/after

**Usage:**
```bash
# Bump version
./scripts/bump-framework-version.sh "2.1.0" "Added cross-reference validation"

# Exit codes: 0 = success, 1 = validation failed
```

## Repository Management

### create-epf-product-repo.sh ⭐ NEW

**Complete automation:** Creates GitHub repository, clones it, adds EPF framework, and pushes - all in one command.

**What it does:**
1. Creates private repository under eyedea-io organization
2. Clones repository locally to specified directory
3. Creates initial commit (required for git subtree)
4. Runs `add-to-repo.sh` to add EPF framework
5. Pushes everything to GitHub

**Prerequisites:**
- GitHub CLI (`gh`) installed: `brew install gh`
- Authenticated with GitHub: `gh auth login`
- Access to eyedea-io organization

**Usage:**
```bash
# Create repo in default location (~/code/)
./scripts/create-epf-product-repo.sh my-new-product

# Create repo in specific location
./scripts/create-epf-product-repo.sh my-new-product /Users/me/projects

# Exit codes: 0 = success, 1 = error
```

**Example workflow:**
```bash
# Create repository with EPF
./scripts/create-epf-product-repo.sh acme-platform

# Output:
# ✓ Repository created: https://github.com/eyedea-io/acme-platform
# ✓ Cloned to ~/code/acme-platform
# ✓ EPF framework added
# ✓ Pushed to GitHub

# Start working
cd ~/code/acme-platform
open docs/EPF/_instances/acme-platform/READY/00_north_star.yaml
```

### add-to-repo.sh

Adds EPF framework to an **existing** product repository as git subtree.

**Usage:**
```bash
# From product repo root
curl -sSL https://raw.githubusercontent.com/eyedea-io/epf-canonical-definition/main/scripts/add-to-repo.sh | bash -s -- {product-name}

# Or manually
git remote add epf git@github.com:eyedea-io/epf-canonical-definition.git
git subtree add --prefix=docs/EPF epf main --squash
```

### sync-repos.sh ⭐ v2.4 WITH SELF-UPDATE

Synchronizes EPF framework between canonical repo and product instances.

**Key Features:**
- **SELF-UPDATE MECHANISM (v2.4+)**: Before pulling, checks if canonical has newer sync script and uses it instead. This prevents bootstrap problems where old/broken sync logic can't properly sync updates.
- Excludes `_instances/` from push operations (prevents canonical contamination)
- Auto-restores product-specific `.gitignore` after pull operations
- Validates version consistency before pushing
- Integrates with `classify-changes.sh` for version bump detection

**Usage:**
```bash
# In product repository (docs/EPF/ exists)
./docs/EPF/scripts/sync-repos.sh pull     # Pull updates from canonical
./docs/EPF/scripts/sync-repos.sh push     # Push changes to canonical
./docs/EPF/scripts/sync-repos.sh check    # Check sync status
./docs/EPF/scripts/sync-repos.sh validate # Validate version consistency
./docs/EPF/scripts/sync-repos.sh classify # Check if version bump needed
```

**Self-Update Flow (v2.4+):**
```
User runs: ./docs/EPF/scripts/sync-repos.sh pull

1. [BOOTSTRAP] Fetch canonical sync script version
2. [BOOTSTRAP] Compare: local v2.3 vs canonical v2.4
3. [BOOTSTRAP] Download newer script to /tmp/
4. [BOOTSTRAP] Re-execute with updated script
5. [SYNC] Newer script performs the actual sync
```

**Why Self-Update Matters:**
- Product repo may have old sync script with bugs
- New sync fixes/improvements should apply immediately
- Prevents infinite loops from broken sync logic
- Ensures sync mechanism improvements take effect on first sync

**Commands:**
| Command | Purpose |
|---------|---------|
| `pull` | Pull framework from canonical (triggers self-update check) |
| `push` | Push framework to canonical (excludes `_instances/`) |
| `check` | Verify sync status without changes |
| `validate` | Check version consistency |
| `classify` | Run change classifier |
| `init <name>` | Initialize new product instance |

### schema-migration.sh

Assists with migrating instances when schemas change.

**Features:**
- Detects schema version mismatches
- Provides migration guidance
- Creates backups before changes

**Usage:**
```bash
# Check instance for migration needs
./scripts/schema-migration.sh _instances/my-product
```

## Dependencies

Most scripts require:
- **bash** (v3.2+)
- **yq** (v4+) - YAML processing: `brew install yq`
- **ajv-cli** (optional) - JSON Schema validation: `npm install -g ajv-cli`
- **Python 3** (optional) - For epf-health-check.sh

## Exit Code Conventions

All validation scripts follow these exit codes:
- `0` - Validation passed, no issues
- `1` - Validation failed, errors found
- `2` - Script usage error (missing args, dependencies, etc.)

## Script Versioning

All scripts embed version numbers in headers that **must match** `VERSION` file.

Example:
```bash
#!/bin/bash
# EPF Feature Quality Validator
# Version: 2.0.0
```

The `bump-framework-version.sh` script automatically updates all script versions. **Never manually edit script version numbers** - use the bump script.

## Integration Workflow

Typical validation workflow for feature definitions:

```bash
# 1. Create/edit feature definition
vim definitions/product/02-business/fd-021-new-feature.yaml

# 2. Validate quality
./scripts/validate-feature-quality.sh definitions/product/02-business/fd-021-new-feature.yaml

# 3. Validate cross-references (if dependencies added)
./scripts/validate-cross-references.sh definitions/product/

# 4. Run full health check before committing
./scripts/epf-health-check.sh

# 5. Commit if all validations pass
git add definitions/product/02-business/fd-021-new-feature.yaml
git commit -m "EPF: Add fd-021 new feature definition"
```
```

## Maintenance

When adding new validation scripts:
1. Follow naming convention: `validate-{aspect}.sh`
2. Include version header matching VERSION file
3. Document in this README
4. Add to `.ai-agent-instructions.md` validation section
5. Consider integration with `epf-health-check.sh`
6. Ensure consistent exit codes (0/1/2)
7. Use standardized logging functions (log_error, log_warning, log_pass)
