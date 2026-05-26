# EPF Health Check & Migration Guide

**Purpose:** Comprehensive guide to EPF's validation systems and artifact enrichment workflows  
**Audience:** Product teams, AI agents, EPF maintainers  
**Version:** 1.0.0 (EPF v2.3.3+)

---

## Overview: Two Complementary Health Check Systems

EPF provides **two distinct but complementary** validation systems:

### 1. Framework Health Check (`epf-health-check.sh`)
**Purpose:** Validate EPF framework repository integrity  
**Scope:** Framework files (schemas, templates, docs, scripts)  
**Use:** Before committing framework changes, during maintenance  
**Who:** EPF maintainers, framework developers

**What it checks:**
- VERSION file consistency across framework
- Schema JSON validity
- Documentation structure
- YAML parsing at framework level
- File organization

### 2. Enhanced Instance Health Check (3-Tier System)
**Purpose:** Assess strategic completeness and currency of instance artifacts  
**Scope:** Instance artifacts (roadmaps, features, strategies)  
**Use:** During product development, milestone reviews, quarterly checks  
**Who:** Product teams, product managers, strategic leads

**What it checks:**
- Tier 1: Schema compliance (required fields)
- Tier 2: Field coverage (strategic completeness)
- Tier 3: Version alignment (currency with schemas)

**This guide focuses on the Enhanced Instance Health Check (Tier 1-3).**  
For framework health check, see `scripts/epf-health-check.sh --help`.

---

## Quick Comparison: Framework vs Instance Health Checks

| Aspect | Framework Health Check | Instance Health Check (Tier 1-3) |
|--------|------------------------|----------------------------------|
| **Tool** | `epf-health-check.sh` | `validate-instance.sh`, `analyze-field-coverage.sh`, `check-version-alignment.sh` |
| **Purpose** | Validate framework integrity | Assess artifact strategic completeness |
| **Scope** | Framework files (schemas, templates, docs) | Instance artifacts (roadmaps, features) |
| **Who uses** | EPF maintainers, framework developers | Product teams, strategic leads |
| **When** | Before framework commits, after version bumps | During development, milestone reviews |
| **Checks** | VERSION consistency, schema validity, YAML parsing | Required fields, coverage %, version currency |
| **Output** | Pass/Warning/Error/Critical | PASS + Grade (A-D) + Recommendations |
| **Fix mode** | `--fix` (auto-repair VERSION issues) | Interactive/batch migration tools |

**Example Workflows:**

```bash
# Framework maintenance (EPF repo)
./scripts/epf-health-check.sh              # Check framework
./scripts/bump-framework-version.sh 2.3.3  # Bump version
./scripts/epf-health-check.sh --fix        # Verify + fix

# Instance quality (product repo)
./scripts/validate-instance.sh _instances/my-product    # Tier 1-3
./scripts/analyze-field-coverage.sh _instances/my-product  # Deep analysis
./scripts/migrate-artifact.sh path/to/artifact.yaml     # Enrich
```

---

## Table of Contents

1. [Philosophy: Beyond Compliance](#philosophy-beyond-compliance)
2. [The 3-Tier System](#the-3-tier-system)
3. [Field Importance Taxonomy](#field-importance-taxonomy)
4. [When to Use Each Tier](#when-to-use-each-tier)
5. [Migration Workflows](#migration-workflows)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Philosophy: Beyond Compliance

### The Problem with "Valid"

EPF artifacts can pass schema validation (Tier 1) but still be strategically incomplete. Consider this roadmap:

```yaml
# Minimal "valid" roadmap
id: roadmap-2025
version: "1.13.0"
tracks:
  product:
    objectives:
      - objective: "Build better product"
        key_results:
          - id: "kr-p-001"
            description: "Launch feature X"
            success_metric: "Feature shipped"
```

**Schema Validation says:** ✅ VALID (all required fields present)  
**Reality:** This roadmap is missing 67% of strategic fields:
- No TRL tracking (innovation maturity)
- No hypothesis testing structure
- No learning objectives
- No uncertainty addressed
- No experiment design

**Impact:** Team builds outputs, not learning. Can't validate assumptions. Sunk cost fallacy risk.

### The Solution: 3-Tier Validation

EPF's health check system goes beyond binary pass/fail to assess **strategic completeness**:

1. **Tier 1 (Compliance):** Are required fields present? (Schema validation)
2. **Tier 2 (Coverage):** What percentage of optional fields are populated? (Strategic depth)
3. **Tier 3 (Alignment):** Is artifact current with latest schema? (Currency)

**Philosophy:** Start minimal, enrich organically. Tier 2/3 guide teams to high-value improvements without overwhelming them.

---

## The 3-Tier System

### Tier 1: Schema Compliance

**Tool:** `validate-schemas.sh`, `validate-instance.sh`  
**Purpose:** Ensure artifacts meet minimum structural requirements  
**Pass Criteria:** All required fields present, correct types, valid structure

**Usage:**
```bash
# Validate instance
./scripts/validate-instance.sh _instances/my-product

# Validate schemas
./scripts/validate-schemas.sh _instances/my-product
```

**Output:**
```
✓ Found: 00_north_star.yaml
✓ Found: 05_roadmap_recipe.yaml
✓ Required fields present in: 05_roadmap_recipe.yaml
━━━ VALIDATION PASSED ━━━
```

**When to use:** Always. Every artifact must pass Tier 1 before Tier 2/3.

---

### Tier 2: Field Coverage Analysis

**Tool:** `analyze-field-coverage.sh`  
**Purpose:** Calculate strategic completeness and identify high-value gaps  
**Metrics:** Coverage %, health grade (A-D), gap categorization (CRITICAL/HIGH/MEDIUM/LOW)

**What it analyzes:**
- Presence of optional fields per artifact type
- Strategic importance of missing fields (from field-importance-taxonomy.json)
- ROI estimates for adding missing fields
- Effort estimates for enrichment

**Usage:**
```bash
# Analyze single artifact
./scripts/analyze-field-coverage.sh _instances/my-product/READY/05_roadmap_recipe.yaml

# Analyze entire instance
./scripts/analyze-field-coverage.sh _instances/my-product

# Analyze specific directory
./scripts/analyze-field-coverage.sh _instances/my-product/FIRE/feature_definitions
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
    
    Reason: Technology Readiness Level tracking for learning and 
            innovation maturity progression
    
    Value: Track R&D progression from concept to deployment, identify 
           knowledge gaps early, validate learning milestones, demonstrate 
           innovation maturity for stakeholders
    
    Effort: 2-3 hours for full roadmap (identifying R&D-qualifying work 
            and assessing maturity levels)

  HIGH (Hypothesis Testing): 0/3 fields (0%) ⚠️
    Missing:
      - success_criteria
      - uncertainty_addressed
      - experiment_design
    
    Reason: Hypothesis-driven development enables evidence-based pivots
    
    Value: Transform output-focused roadmap into learning-focused, 
           reduces sunk cost fallacy, validates assumptions early
    
    Effort: 2-3 hours for full roadmap (strategic thinking to articulate 
            hypotheses and experiments)

Recommendation:
  ⚠️  LOW COVERAGE - Strongly recommend enrichment
  PRIORITY: Add TRL fields to track innovation maturity progression

Next Steps:
  1. Review taxonomy: cat schemas/field-importance-taxonomy.json
  2. Run migration wizard: ./scripts/migrate-artifact.sh READY/05_roadmap_recipe.yaml
```

**Health Grades:**
- **A (90-100%):** Excellent - comprehensive strategic documentation
- **B (75-89%):** Good - solid foundation, minor enrichment opportunities
- **C (60-74%):** Adequate - passing but missing key strategic fields
- **D (<60%):** Poor - significant gaps, strong enrichment recommended

---

### Tier 3: Version Alignment Check

**Tool:** `check-version-alignment.sh`  
**Purpose:** Detect schema drift and guide migration priorities  
**Metrics:** Version gap severity, migration effort, artifact currency

**What it analyzes:**
- Artifact internal version vs current schema version
- Gap severity (CURRENT/BEHIND/STALE/OUTDATED)
- Breaking vs non-breaking changes
- Migration priority scoring

**Usage:**
```bash
# Check entire instance
./scripts/check-version-alignment.sh _instances/my-product

# Filter by status
./scripts/check-version-alignment.sh _instances/my-product | grep OUTDATED
```

**Output Example:**
```
╔═══════════════════════════════════════════════════════╗
║     EPF Version Alignment Check - my-product
╚═══════════════════════════════════════════════════════╝

━━━ Scanning Artifacts ━━━

Artifact: 00_north_star.yaml
  Path: _instances/my-product/READY/00_north_star.yaml
  Artifact version: 1.9.6
  Schema version: 1.13.0
  Status: ⚠️  STALE (3+ minor versions behind)
  Action: ENRICH (new fields available)
  Estimated effort: 2-6 hours (enrichment)
  
Artifact: 05_roadmap_recipe.yaml
  Path: _instances/my-product/READY/05_roadmap_recipe.yaml
  Artifact version: 1.9.6
  Schema version: 1.13.0
  Status: ⚠️  STALE (3+ minor versions behind)
  Action: ENRICH (new TRL fields, hypothesis testing)
  Estimated effort: 4-8 hours (strategic enrichment)

Artifact: fd-001_group_structures.yaml
  Path: _instances/my-product/FIRE/feature_definitions/fd-001_group_structures.yaml
  Artifact version: 1.5.2
  Schema version: 2.0.0
  Status: 🚨 OUTDATED (major version behind)
  Action: MIGRATE (breaking change: contexts→personas)
  Estimated effort: 1-2 hours per feature (breaking change migration)

━━━ Summary ━━━
Total artifacts analyzed: 18
  CURRENT:    6 (33%)  ✅ - Matches schema
  BEHIND:     3 (17%)  ⚠️ - 1-2 minor versions behind
  STALE:      5 (28%)  ⚠️ - 3+ minor versions behind
  OUTDATED:   4 (22%)  🚨 - Major version behind
  No version: 0 (0%)   ℹ️ - Cannot determine

Recommendations:
  1. PRIORITY: Migrate OUTDATED artifacts (breaking changes)
     Use: ./scripts/migrate-artifact.sh <artifact>
     
  2. NEXT: Enrich STALE artifacts (missing strategic fields)
     Use: ./scripts/batch-migrate.sh _instances/my-product --priority high
     
  3. MONITOR: BEHIND artifacts (minor enrichment available)
     Review after completing OUTDATED/STALE migrations
```

**Gap Severity Classifications:**

| Status | Gap | Action | Priority | Example |
|--------|-----|--------|----------|---------|
| **CURRENT** | 0 versions | None | ✅ N/A | v1.13.0 artifact, v1.13.0 schema |
| **BEHIND** | 1-2 minor | Enrich (optional) | ⚠️ Low | v1.11.0 artifact, v1.13.0 schema |
| **STALE** | 3+ minor | Enrich (recommended) | ⚠️ Medium | v1.9.0 artifact, v1.13.0 schema |
| **OUTDATED** | 1+ major | Migrate (required) | 🚨 High | v1.x artifact, v2.0.0 schema |

---

## Field Importance Taxonomy

**Location:** `schemas/field-importance-taxonomy.json`  
**Purpose:** Define strategic value of optional fields across all artifact types

### Categories

#### CRITICAL (Must have for strategic completeness)
Fields that fundamentally change how teams operate:
- **TRL tracking** (roadmaps): Innovation maturity, R&D funding visibility
- **Personas** (features v2.0): Target audience, transformation moments
- **Evidence** (strategies): Assumption validation, hypothesis testing

**Value:** Enables strategic pivots, prevents sunk cost fallacy, demonstrates learning  
**Typical Effort:** 2-6 hours per artifact  
**ROI:** Very high - changes team behavior and decision-making

#### HIGH (Strongly recommended for quality)
Fields that significantly enhance strategic value:
- **Hypothesis structure** (roadmaps): Success criteria, uncertainty addressed
- **Emotional resolution** (features): Transformation journey, relief/empowerment
- **Competitive analysis** (strategies): Market positioning, wedges

**Value:** Transforms output-focus into learning-focus, better stakeholder communication  
**Typical Effort:** 1-3 hours per artifact  
**ROI:** High - improves planning quality and risk management

#### MEDIUM (Nice to have for completeness)
Fields that improve tracking and evidence:
- **Dependencies** (features): Traceability, sequencing
- **Progress tracking** (roadmaps): Timeline, milestones
- **Risk documentation** (strategies): Mitigation plans

**Value:** Better project management, clearer traceability  
**Typical Effort:** 30min-2 hours per artifact  
**ROI:** Medium - process improvements, not strategic shifts

#### LOW (Optional enhancements)
Fields that provide convenience or minor value:
- **Tags** (all artifacts): Organization, filtering
- **Notes** (all artifacts): Context, reminders
- **Aliases** (features): Alternative names

**Value:** Organizational convenience, minor improvements  
**Typical Effort:** 5-30 minutes per artifact  
**ROI:** Low - add when convenient, not high priority

### Taxonomy Structure

```json
{
  "roadmap": {
    "CRITICAL": {
      "fields": ["trl_start", "trl_target", "trl_progression", "technical_hypothesis"],
      "reason": "TRL tracking for innovation maturity",
      "value": "Track R&D progression, identify knowledge gaps, validate learning",
      "effort": "2-3 hours for full roadmap"
    },
    "HIGH": {
      "fields": ["success_criteria", "uncertainty_addressed", "experiment_design"],
      "reason": "Hypothesis-driven development enables pivots",
      "value": "Transform output-focused into learning-focused",
      "effort": "2-3 hours for full roadmap"
    }
  }
}
```

---

## When to Use Each Tier

### Decision Tree

```
Starting new work?
├─ Creating artifacts? → Run Tier 1 (must pass)
├─ Updating existing? → Run Tier 1 (must pass)
└─ Major milestone?   → Run all 3 tiers

Artifact feels incomplete?
├─ Passes validation? → Run Tier 2 (find gaps)
└─ Fails validation?  → Fix Tier 1 first

EPF framework updated?
└─ Run Tier 3 (check currency)

Before stakeholder review?
└─ Run all 3 tiers (comprehensive health check)

Quarterly health check?
└─ Run all 3 tiers (systematic assessment)
```

### Recommended Schedules

**Tier 1 (Compliance):**
- ✅ Before every commit
- ✅ After creating/updating artifacts
- ✅ In CI/CD pipelines

**Tier 2 (Coverage):**
- ⚠️ After major artifact creation/updates
- ⚠️ Before milestone reviews
- ⚠️ When artifacts feel "incomplete"
- ⚠️ Quarterly health checks

**Tier 3 (Alignment):**
- ⚠️ After EPF framework version bumps
- ⚠️ Before starting new READY/FIRE cycles
- ⚠️ Quarterly health checks
- ⚠️ When artifacts haven't been updated in 3+ months

---

## Migration Workflows

### Interactive Migration (Single Artifact)

**Tool:** `migrate-artifact.sh`  
**Use case:** Enrich one artifact with wizard guidance

**Workflow:**
```bash
# 1. Run migration assistant
./scripts/migrate-artifact.sh _instances/my-product/READY/05_roadmap_recipe.yaml

# 2. Assistant performs:
#    - Auto-detects artifact type
#    - Runs pre-migration analysis (coverage + alignment)
#    - Creates timestamped backup
#    - Opens enrichment wizard (read-only reference)
#    - Prompts user to edit artifact
#    - Validates post-migration
#    - Shows improvement summary

# 3. Follow wizard guidance to add fields
#    (Wizard opens in $PAGER - read, then close)

# 4. Edit artifact in $EDITOR
#    (Add missing fields based on wizard examples)

# 5. Review results
#    Coverage: 41% → 75% (+34%)
#    Alignment: STALE → CURRENT
```

**Example Session:**
```
╔══════════════════════════════════════════════════════════════════╗
║           EPF Artifact Migration Assistant v1.0.0                ║
╚══════════════════════════════════════════════════════════════════╝

━━━ Artifact Detection ━━━
Detected artifact type: roadmap
Detected schema: roadmap_recipe_schema.json

━━━ Pre-Migration Analysis ━━━
Current coverage: 41% (5/12 fields per KR)
Health grade: C
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
New health grade: B
New alignment: CURRENT (v1.13.0)

✅ Migration successful!
   Coverage improved: 41% → 75%
   Health grade improved: C → B
   Version updated: v1.9.6 → v1.13.0
   Backup saved: 05_roadmap_recipe.backup-20260105-143022.yaml
```

---

### Batch Migration (Multiple Artifacts)

**Tool:** `batch-migrate.sh`  
**Use case:** Migrate multiple artifacts in priority order

**Prioritization Algorithm:**
```
Priority Score = (Version Gap × 40) + (Artifact Type × 30) + (Naming Hints × 30)

Version Gap Weights:
  OUTDATED (major behind) = 10 points
  STALE (3+ minor behind) = 7 points
  BEHIND (1-2 minor behind) = 4 points
  CURRENT = 0 points

Artifact Type Weights:
  Roadmap = 10 (strategic, high leverage)
  North Star = 9 (foundational)
  Strategy = 8 (strategic direction)
  Feature Definition = 7 (tactical, frequent)
  Value Model = 6 (structural, stable)

Naming Hints:
  "core", "critical", "mvp" in filename = +3 points
  "draft", "wip", "temp" in filename = -2 points
```

**Workflow:**
```bash
# 1. Analyze migration candidates (dry-run)
./scripts/batch-migrate.sh _instances/my-product --dry-run

# 2. Review prioritized queue
#    (Shows artifacts sorted by priority score 0-100)

# 3. Filter by priority level
./scripts/batch-migrate.sh _instances/my-product --priority critical
./scripts/batch-migrate.sh _instances/my-product --priority high
./scripts/batch-migrate.sh _instances/my-product --priority medium

# 4. Filter by artifact type
./scripts/batch-migrate.sh _instances/my-product --type roadmap
./scripts/batch-migrate.sh _instances/my-product --type feature_definition

# 5. Combine filters
./scripts/batch-migrate.sh _instances/my-product --type roadmap --priority high

# 6. Execute migration
#    (Interactive: confirms each artifact before migration)
./scripts/batch-migrate.sh _instances/my-product --priority high
```

**Example Output:**
```
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
  
  Migrate this artifact? [y/n/q]: y
  
  [Launches migrate-artifact.sh for this file]
  ...
  
  ✅ Migration complete: 05_roadmap_recipe.yaml
  
[PRIORITY: HIGH - Score: 74]
  Artifact: fd-001_core_group_structures.yaml
  Type: feature_definition
  Status: OUTDATED (v1.5 → v2.0.0)
  Gap Severity: 10/10
  Reason: Breaking change (contexts→personas), "core" in filename
  Estimated effort: 1-2 hours
  
  Migrate this artifact? [y/n/q]: y
  ...

━━━ Batch Migration Summary ━━━
Migrated: 2/5
Skipped: 3/5
Failed: 0/5
Total time: 3.2 hours
```

---

## Best Practices

### 1. Start Minimal, Enrich Organically

**Anti-pattern:** Try to fill every optional field immediately  
**Best practice:** Start with required fields (Tier 1), add strategic fields as artifacts mature

```
Artifact Lifecycle:
Day 1:    Create with required fields only (Tier 1 pass)
Week 1:   Add CRITICAL fields after initial testing (Tier 2 guidance)
Month 1:  Add HIGH fields after learning (Tier 2 guidance)
Quarter:  Review MEDIUM fields for completeness (Tier 3 check)
```

### 2. Use Coverage as Discovery Tool

**Anti-pattern:** Ignore low coverage scores  
**Best practice:** Treat low coverage as signal to review field taxonomy

```bash
# When coverage shows LOW (Grade D):
./scripts/analyze-field-coverage.sh _instances/my-product/READY/05_roadmap_recipe.yaml

# Review what's missing and WHY it matters
cat schemas/field-importance-taxonomy.json

# Decide: Is this missing field valuable for OUR context?
# If YES → Add field
# If NO → Accept lower coverage (not all fields suit all contexts)
```

### 3. Prioritize CRITICAL/HIGH Gaps

**Anti-pattern:** Add LOW importance fields first (easy wins)  
**Best practice:** Address CRITICAL/HIGH gaps first (strategic wins)

**Impact hierarchy:**
1. CRITICAL gaps (0% coverage) = strategic blindness
2. HIGH gaps (0-25% coverage) = missed opportunities
3. MEDIUM gaps (25-50% coverage) = process improvements
4. LOW gaps (>50% coverage) = convenience features

### 4. Batch OUTDATED Before STALE

**Anti-pattern:** Enrich STALE artifacts while OUTDATED languish  
**Best practice:** Migrate OUTDATED (breaking changes) first

**Reasoning:**
- OUTDATED = incompatible with current patterns
- STALE = compatible but missing new features
- Fix compatibility before adding features

### 5. Re-validate After Migration

**Anti-pattern:** Assume migration succeeded  
**Best practice:** Run all 3 tiers after migration

```bash
# After migration:
./scripts/validate-instance.sh _instances/my-product  # Tier 1
./scripts/analyze-field-coverage.sh _instances/my-product  # Tier 2
./scripts/check-version-alignment.sh _instances/my-product  # Tier 3
```

### 6. Version Artifacts After Enrichment

**Anti-pattern:** Add 10 fields without updating internal version  
**Best practice:** Bump artifact internal version to match schema after enrichment

```yaml
# Before enrichment
version: "1.9.6"

# After enrichment (added TRL fields from v1.13.0 schema)
version: "1.13.0"
```

### 7. Use Wizards as Living Documentation

**Anti-pattern:** Read wizard once, never revisit  
**Best practice:** Open wizard every time you enrich that artifact type

**Why:** Wizards contain:
- Field-by-field guidance
- Examples for all 4 tracks
- Common pitfalls
- Validation checklists

```bash
# Always open wizard before manual enrichment
less wizards/roadmap_enrichment.wizard.md
less wizards/feature_enrichment.wizard.md
```

---

## Troubleshooting

### "Artifact passes validation but feels incomplete"

**Cause:** Passing Tier 1 (compliance) but missing optional fields  
**Solution:** Run Tier 2 (coverage analysis)

```bash
./scripts/analyze-field-coverage.sh path/to/artifact.yaml
```

### "Coverage is 40% but I don't know what to add"

**Cause:** Need guidance on which fields matter most  
**Solution:** Review field taxonomy + open enrichment wizard

```bash
# See what's missing and why it matters
cat schemas/field-importance-taxonomy.json

# Get step-by-step guidance
./scripts/migrate-artifact.sh path/to/artifact.yaml
```

### "Too many artifacts to migrate manually"

**Cause:** Large instance with multiple outdated artifacts  
**Solution:** Use batch migration with filters

```bash
# See what needs migration
./scripts/batch-migrate.sh _instances/my-product --dry-run

# Migrate OUTDATED first
./scripts/batch-migrate.sh _instances/my-product --priority critical

# Then STALE
./scripts/batch-migrate.sh _instances/my-product --priority high
```

### "Migration wizard opens but I can't edit artifact"

**Cause:** Wizard opens in read-only $PAGER (less), artifact opens in $EDITOR  
**Solution:** This is by design - wizard is reference, not editable

**Workflow:**
1. Wizard opens in `$PAGER` (usually `less`) - READ wizard, press `q` to exit
2. Script prompts: "Ready to edit artifact?"
3. Say `y` - artifact opens in `$EDITOR` (usually `vi`/`nano`) - EDIT artifact

### "Health grade doesn't improve after adding fields"

**Cause:** Added LOW importance fields instead of CRITICAL/HIGH  
**Solution:** Check what field categories are still at 0%

```bash
# Before adding more fields, see what matters most
./scripts/analyze-field-coverage.sh path/to/artifact.yaml | grep "CRITICAL\|HIGH"
```

### "Version alignment shows 'No version' for artifact"

**Cause:** Artifact missing internal `version` field  
**Solution:** Add version field matching current schema

```yaml
# Add at top of artifact
id: my-artifact-001
version: "1.13.0"  # Match current schema version
```

### "Backup files accumulating in directory"

**Cause:** Migration assistant creates backup on each run  
**Solution:** Clean up old backups periodically (or keep for audit trail)

```bash
# See backups
ls -la *.backup-*

# Clean old backups (keep last 3)
ls -t *.backup-* | tail -n +4 | xargs rm
```

### "Enrichment wizard feels overwhelming"

**Cause:** Wizards are comprehensive (20-25 pages)  
**Solution:** Use wizard sections incrementally, not all at once

**Recommended approach:**
1. First pass: Read "Pre-Migration Checklist" and "Quick Start"
2. Second pass: Focus on CRITICAL fields section
3. Third pass: Add HIGH fields when ready
4. Later: Review MEDIUM fields for polish

---

## Appendices

### A. Complete Tool Reference

| Tool | Purpose | Tier | Usage |
|------|---------|------|-------|
| `validate-schemas.sh` | Schema compliance | 1 | `./scripts/validate-schemas.sh _instances/my-product` |
| `validate-instance.sh` | Instance structure + 3-tier dashboard | 1-3 | `./scripts/validate-instance.sh _instances/my-product` |
| `analyze-field-coverage.sh` | Coverage analysis | 2 | `./scripts/analyze-field-coverage.sh path/to/artifact.yaml` |
| `check-version-alignment.sh` | Version drift detection | 3 | `./scripts/check-version-alignment.sh _instances/my-product` |
| `migrate-artifact.sh` | Interactive enrichment | N/A | `./scripts/migrate-artifact.sh path/to/artifact.yaml` |
| `batch-migrate.sh` | Batch enrichment | N/A | `./scripts/batch-migrate.sh _instances/my-product` |

### B. Exit Codes

All health check tools follow consistent exit codes:
- `0` - Success (checks passed or analysis complete)
- `1` - Validation failed or issues found
- `2` - Usage error (missing args, dependencies, etc.)

### C. Environment Variables

Health check tools respect these environment variables:

```bash
# Editor for artifact modification
export EDITOR=vim          # Default: vi or nano

# Pager for wizard display
export PAGER=less          # Default: less or more

# Disable color output
export NO_COLOR=1

# Specify EPF root (if not in standard location)
export EPF_ROOT=/path/to/EPF
```

### D. Related Documentation

- **Scripts README:** [`scripts/README.md`](../../scripts/README.md) - Complete tool documentation
- **Field Taxonomy:** [`schemas/field-importance-taxonomy.json`](../../schemas/field-importance-taxonomy.json) - Field definitions
- **Roadmap Enrichment Wizard:** [`wizards/roadmap_enrichment.wizard.md`](../../wizards/roadmap_enrichment.wizard.md) - TRL guidance
- **Feature Enrichment Wizard:** [`wizards/feature_enrichment.wizard.md`](../../wizards/feature_enrichment.wizard.md) - Persona upgrade
- **Enhanced Health Check Proposal:** [`.epf-work/enhanced-health-check-proposal.md`](../../.epf-work/enhanced-health-check-proposal.md) - Original design

---

**Last Updated:** 2026-01-05  
**EPF Version:** v2.3.3+  
**Guide Version:** 1.0.0
