# EPF Migration Guide

> **Version**: 2.8.0  
> **Purpose**: Unified strategy and workflow for migrating EPF instances when the framework evolves

---

## 🚨 AI AGENTS: MANDATORY PROTOCOL 🚨

**YOU MUST USE THIS DOCUMENTED APPROACH. DO NOT INVENT YOUR OWN.**

When asked to migrate, update, or upgrade EPF artifacts:

### ❌ DO NOT:
- Invent your own migration approach
- Guess what changed between versions
- Make assumptions about schema structure
- Skip reading the registry and guides
- Apply changes without validation at each step
- Proceed if validation fails

### ✅ ALWAYS DO:
1. **Read `migrations/registry.yaml`** to understand what changed
2. **Read the migration guide** for the specific version transition
3. **Generate a migration plan**: `./scripts/generate-migration-plan.sh _instances/{product}/`
4. **Follow the plan's `ai_instructions`** step-by-step
5. **Validate after EACH artifact** - stop if validation fails
6. **Report status** before proceeding to next artifact

### Where to Find What:

| Question | Answer Location |
|----------|-----------------|
| What changed between versions? | `migrations/registry.yaml` |
| How do I migrate from vX to vY? | `migrations/guides/vX-to-vY.md` |
| What's the overall strategy? | This file (`MIGRATIONS.md`) |
| Per-artifact workflow? | `registry.yaml` → `ai_migration_protocol` |
| Generate migration plan? | `./scripts/generate-migration-plan.sh` |

**If you cannot find documented guidance for your migration task, ASK THE USER rather than improvising.**

---

## Overview

When EPF evolves, product instances may need updates to stay aligned with the framework. This document provides:

1. **Migration Registry** - Tracks what changed between versions
2. **Assessment Protocol** - How to evaluate what needs migration
3. **Execution Workflow** - How to perform migrations safely
4. **AI Agent Instructions** - How AI should approach migrations

---

## Core Principles

### 1. Schema is the Source of Truth
- Every artifact type has a JSON Schema in `schemas/`
- Schemas define both structure AND semantic intent (via `$comment` fields)
- Migration = bringing artifacts into alignment with current schemas

### 2. Semantic Versioning Drives Migration Scope
- **PATCH (x.y.Z)**: No migration required - docs/fixes only
- **MINOR (x.Y.z)**: Optional enrichment - new fields available but not required
- **MAJOR (X.y.z)**: Required migration - breaking changes to structure/semantics

### 3. Progressive Enhancement Over Big Bang
- Migrate artifacts incrementally, not all at once
- Prioritize by usage frequency and business criticality
- Validate each artifact after migration before proceeding

### 4. AI Executes, Humans Validate
- AI agents handle mechanical transformation (adding fields, restructuring)
- Humans validate strategic content quality and business accuracy
- Migration assessment should be machine-readable

---

## Migration Registry

The migration registry tracks breaking changes and required transformations between versions.

### Registry Location

`migrations/` directory contains:
```
migrations/
├── README.md                    # This file (migration index)
├── registry.yaml                # Machine-readable migration registry
└── guides/                      # Detailed migration guides per version
    ├── v2.0.0-to-v2.1.0.md
    ├── v2.7.0-to-v2.8.0.md
    └── ...
```

### Registry Format (`migrations/registry.yaml`)

```yaml
# EPF Migration Registry
# Machine-readable record of version changes and required migrations

registry_version: "1.0.0"
epf_current_version: "2.8.0"

versions:
  - version: "2.8.0"
    release_date: "2025-01-25"
    migration_type: "minor"  # major | minor | patch
    breaking_changes: []
    new_fields:
      - schema: "roadmap_recipe_schema.json"
        field: "tracks.*.key_results[].trl_progression"
        required: false
        default: null
        migration_guide: "guides/v2.7.0-to-v2.8.0.md#trl-fields"
    deprecated_fields: []
    renamed_fields: []
    
  - version: "2.7.0"
    release_date: "2025-01-15"
    migration_type: "minor"
    breaking_changes: []
    new_fields:
      - schema: "feature_definition_schema.json"
        field: "strategic_context.tracks"
        required: false
        default: ["product"]
    deprecated_fields: []
    renamed_fields: []

  - version: "2.0.0"
    release_date: "2024-12-01"
    migration_type: "major"
    breaking_changes:
      - description: "Feature definition personas restructured"
        schema: "feature_definition_schema.json"
        change_type: "restructure"
        old_structure: "value_propositions[]"
        new_structure: "personas[] with narrative fields"
        migration_guide: "guides/v1.x-to-v2.0.0.md#personas"
        
      - description: "Scenarios moved to top-level"
        schema: "feature_definition_schema.json"
        change_type: "restructure"
        old_structure: "definition.scenarios[]"
        new_structure: "scenarios[] (top-level)"
        migration_guide: "guides/v1.x-to-v2.0.0.md#scenarios"
    new_fields: []
    deprecated_fields:
      - schema: "feature_definition_schema.json"
        field: "value_propositions"
        replacement: "personas"
    renamed_fields: []
```

---

## Assessment Protocol

Before any migration, run the assessment to understand scope.

### Step 1: Version Gap Analysis

```bash
# Check version gap for a product repo
./scripts/check-version-alignment.sh _instances/{product}/

# Output shows:
# - Current artifact versions vs schema versions
# - Classification: CURRENT | BEHIND | STALE | OUTDATED
# - Estimated effort per artifact
```

### Step 2: Field Coverage Analysis

```bash
# Check what fields are missing (regardless of version)
./scripts/analyze-field-coverage.sh _instances/{product}/

# Output shows:
# - Missing CRITICAL fields (blocking)
# - Missing HIGH fields (recommended)
# - Missing MEDIUM/LOW fields (optional enrichment)
```

### Step 3: Generate Migration Plan

```bash
# Generate comprehensive migration plan
./scripts/generate-migration-plan.sh _instances/{product}/

# Output: _instances/{product}/MIGRATION_PLAN.yaml
# This plan stays with the instance and guides AI-driven migration
```

### Migration Plan Format

```yaml
# Migration Plan for {product}
# Generated: 2025-01-25
# Source EPF Version: 2.7.4
# Target EPF Version: 2.8.0

summary:
  total_artifacts: 24
  requiring_migration: 8
  optional_enrichment: 12
  already_current: 4
  estimated_effort_hours: 4-8
  priority: "medium"  # critical | high | medium | low

artifacts:
  - path: "READY/05_roadmap_recipe.yaml"
    current_version: "1.9.6"
    target_version: "2.8.0"
    status: "OUTDATED"
    migration_type: "major"
    changes_required:
      - type: "add_field"
        field: "tracks.*.key_results[].trl_start"
        effort: "low"
        guidance: "Add TRL starting level (1-9) for each KR"
      - type: "add_field"
        field: "tracks.*.key_results[].trl_target"
        effort: "low"
        guidance: "Add TRL target level for each KR"
    ai_instructions: |
      1. Read the current roadmap file
      2. For each Key Result in each track:
         - Assess current technology readiness (trl_start)
         - Define target readiness level (trl_target)
         - Add trl_progression array if applicable
      3. Update meta.epf_version to "2.8.0"
      4. Validate against schema

  - path: "FIRE/feature_definitions/fd-001_groups.yaml"
    current_version: "1.9.6"
    target_version: "2.0.0"
    status: "OUTDATED"
    migration_type: "major"
    changes_required:
      - type: "restructure"
        from: "value_propositions[]"
        to: "personas[]"
        effort: "medium"
        guidance: "Convert each value proposition to persona format with narratives"
    ai_instructions: |
      1. Read existing value_propositions array
      2. For each value proposition, create persona:
         - persona_type: derived from stakeholder type
         - current_situation: 200+ chars describing pain before
         - transformation_moment: 200+ chars describing the change
         - emotional_resolution: 200+ chars describing outcome
      3. Ensure exactly 4 personas exist
      4. Move scenarios to top-level if nested
      5. Update all internal version references
```

---

## Execution Workflow

### For AI Agents

When asked to migrate EPF artifacts, follow this protocol:

#### Phase 1: Assess

```
1. ALWAYS start by reading:
   - migrations/registry.yaml (understand what changed)
   - The relevant migration guide in migrations/guides/
   - The target schema (schemas/*.json)

2. Run assessment:
   - ./scripts/check-version-alignment.sh
   - ./scripts/analyze-field-coverage.sh
   
3. If migration plan exists, read it:
   - migrations/_instances/{product}/MIGRATION_PLAN.yaml
   
4. Report findings to user before making changes
```

#### Phase 2: Plan

```
1. List all artifacts requiring migration
2. Propose order based on dependencies:
   - North Star first (foundational)
   - Strategy/roadmap second (depends on North Star)
   - Feature definitions last (depend on roadmap)
   
3. For each artifact, state:
   - What will change
   - What content needs human input
   - What can be auto-migrated
   
4. Get user approval before proceeding
```

#### Phase 3: Execute (Validate-As-You-Go)

**CRITICAL: Build quality control into each step. FAIL FAST - fix errors before proceeding.**

Process artifacts in priority order (high → medium → low). For EACH artifact:

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: BACKUP                                              │
├─────────────────────────────────────────────────────────────┤
│ cp {artifact}.yaml {artifact}.backup-$(date +%Y%m%d-%H%M%S) │
│                                                             │
│ WHY: Enables rollback if migration fails                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: UNDERSTAND                                          │
├─────────────────────────────────────────────────────────────┤
│ Read:                                                       │
│   - Current artifact content                                │
│   - Target schema: schemas/{schema}.json                    │
│   - Migration guide (if specified)                          │
│   - registry.yaml for version-specific ai_instructions      │
│                                                             │
│ WHY: Can't transform what you don't understand              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: TRANSFORM                                           │
├─────────────────────────────────────────────────────────────┤
│ Apply changes following migration guide:                    │
│   - Preserve ALL existing user content                      │
│   - Add new required fields                                 │
│   - Use [TODO] markers for fields needing human input       │
│   - Update version metadata                                 │
│                                                             │
│ RULE: Never delete user data! Only add/restructure.         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: VALIDATE SCHEMA (MANDATORY)                         │
├─────────────────────────────────────────────────────────────┤
│ ./scripts/validate-schemas.sh {artifact}.yaml               │
│                                                             │
│ ✓ PASS: Proceed to Step 5                                   │
│ ✗ FAIL: STOP! Fix errors. Re-validate. Do NOT proceed.      │
│                                                             │
│ WHY: Schema errors caught now save hours of debugging later │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: VALIDATE CONTENT (RECOMMENDED)                      │
├─────────────────────────────────────────────────────────────┤
│ ./scripts/check-content-readiness.sh {artifact}.yaml        │
│                                                             │
│ Grade A-C: Good, proceed                                    │
│ Grade D: Acceptable for migration, note for follow-up       │
│ Grade F: Review for obvious placeholders, fix if easy       │
│                                                             │
│ WHY: Catches template content that should be real data      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: REPORT & PROCEED                                    │
├─────────────────────────────────────────────────────────────┤
│ Report for this artifact:                                   │
│   - Schema validation: PASS ✓                               │
│   - Content grade: [A/B/C/D/F]                              │
│   - Status: Ready for next artifact                         │
│                                                             │
│ Then: Proceed to next artifact in priority order            │
└─────────────────────────────────────────────────────────────┘
```

**Summary: The Non-Negotiable Rules**

| Rule | Why |
|------|-----|
| Backup before touching | Can rollback if things go wrong |
| Read schema before transforming | Know the target structure |
| Validate after EACH artifact | Catch errors immediately |
| STOP on validation failure | Don't accumulate errors |
| Fix before proceeding | One clean artifact at a time |
| Report status per artifact | User sees progress and quality |

#### Phase 4: Verify

After ALL migrations are complete, run these validation checks:

```bash
# REQUIRED - Must pass for migration to be considered complete

# 1. Schema Validation (MANDATORY)
./scripts/validate-instance.sh _instances/{product}/
# All artifacts MUST validate against their schemas
# Exit code 0 = pass, anything else = fix errors

# 2. Version Alignment (MANDATORY)
./scripts/check-version-alignment.sh _instances/{product}/
# All migrated artifacts should show "CURRENT" status
# If any show BEHIND/STALE/OUTDATED, re-migrate those

# 3. Health Check (MANDATORY)
./scripts/epf-health-check.sh
# Framework-level consistency check
```

```bash
# RECOMMENDED - Understand post-migration quality

# 4. Content Readiness Assessment
./scripts/check-content-readiness.sh _instances/{product}/READY
# Shows content quality after migration:
# - Template patterns that may need real content
# - Placeholder text that should be replaced
# - Strategic depth assessment
# - Grade A-F with recommendations

# 5. Field Coverage Analysis
./scripts/analyze-field-coverage.sh _instances/{product}/
# Shows what enrichment is available:
# - Missing CRITICAL fields (should address)
# - Missing HIGH fields (recommended)
# - Missing MEDIUM/LOW fields (nice to have)
```

**Understanding the Difference:**

| Check Type | Purpose | When to Use |
|------------|---------|-------------|
| **Schema Validation** | Structure is correct | MUST pass |
| **Version Alignment** | Artifacts are current | MUST show CURRENT |
| **Content Readiness** | Quality of content | Understand what needs attention |
| **Field Coverage** | Completeness | Identify enrichment opportunities |

Migration is **complete** when mandatory checks pass. Content quality improvements can be done **incrementally** based on readiness and coverage assessments.

```
1. Run full instance validation:
   - ./scripts/validate-instance.sh _instances/{product}/
   
2. Run health check:
   - ./scripts/epf-health-check.sh
   
3. Run content assessments:
   - ./scripts/check-content-readiness.sh _instances/{product}/READY
   - ./scripts/analyze-field-coverage.sh _instances/{product}/
   
4. Update _meta.yaml:
   - epf_version: "{new_version}"
   - Add entry to history.epf_framework_migrations[]
   
5. Report summary to user including:
   - Validation status (pass/fail)
   - Content readiness grade
   - Field coverage percentage
   - Recommended next steps for quality improvement
```

### For Humans

1. **Review AI-generated changes** - Especially strategic content
2. **Fill [TODO] markers** - AI marks fields needing human judgment
3. **Validate business accuracy** - AI can't judge if strategy is correct
4. **Approve final commit** - Human ownership of migration

---

## Creating Migration Guides

When EPF is updated with breaking changes:

### 1. Update Registry

Add entry to `migrations/registry.yaml`:

```yaml
versions:
  - version: "X.Y.Z"
    release_date: "YYYY-MM-DD"
    migration_type: "major|minor|patch"
    breaking_changes:
      - description: "What changed"
        schema: "affected_schema.json"
        change_type: "add|remove|rename|restructure"
        migration_guide: "guides/vA.B.C-to-vX.Y.Z.md#section"
```

### 2. Create Migration Guide

Create `migrations/guides/vOLD-to-vNEW.md`:

```markdown
# Migration Guide: vOLD → vNEW

## Summary
Brief description of what changed and why.

## Breaking Changes

### Change 1: [Name]
**Affected Schema**: `schema_name.json`
**Change Type**: restructure

**Before (vOLD)**:
```yaml
old_structure:
  field: value
```

**After (vNEW)**:
```yaml
new_structure:
  different_field: value
```

**Migration Steps**:
1. Step one
2. Step two

**AI Instructions**:
```
Specific instructions for AI to perform this migration
```

## New Optional Fields

### Field: `path.to.new.field`
- **Purpose**: Why this field exists
- **Default**: What to use if not specified
- **Enrichment Guide**: How to populate meaningfully
```

### 3. Update Assessment Scripts

If new checks are needed, update:
- `scripts/check-version-alignment.sh`
- `scripts/analyze-field-coverage.sh`

---

## Quick Reference: Common Migrations

### Adding TRL Fields to Roadmap KRs

```yaml
# Before
key_results:
  - id: "kr-p-001"
    description: "Launch feature X"
    metric: "Active users"
    target: 1000

# After
key_results:
  - id: "kr-p-001"
    description: "Launch feature X"
    metric: "Active users"
    target: 1000
    trl_start: 4        # NEW: Current tech readiness
    trl_target: 7       # NEW: Target tech readiness
    trl_progression:    # NEW: Expected progression
      - level: 5
        milestone: "Prototype validated"
      - level: 6
        milestone: "System demonstrated"
```

### Converting Value Propositions to Personas

```yaml
# Before (v1.x)
value_propositions:
  - stakeholder: "Admin"
    value: "Saves time managing users"

# After (v2.x)
personas:
  - persona_type: "power_user"
    current_situation: |
      Admin Sarah spends 3 hours daily managing user access...
      (200+ characters describing pain point)
    transformation_moment: |
      With automated provisioning, Sarah's workflow changes...
      (200+ characters describing the shift)
    emotional_resolution: |
      Sarah now focuses on strategic IT initiatives...
      (200+ characters describing the outcome)
```

---

## Maintenance

### When Updating EPF

1. **Before Release**:
   - Document all changes in `migrations/registry.yaml`
   - Create migration guide if breaking changes
   - Test migration on one product instance

2. **After Release**:
   - Update this document's version number
   - Announce migration requirements to product teams
   - Support AI agents with clear instructions

### Keeping Registry Current

The migration registry should be updated:
- With every MINOR or MAJOR version bump
- When new required fields are added to schemas
- When field semantics change (even if structure doesn't)

---

## Troubleshooting

### "Schema validation fails after migration"

1. Check you're using the correct target schema version
2. Ensure all required fields are present
3. Validate field formats (especially IDs, dates)
4. Run: `./scripts/validate-schemas.sh {artifact} --verbose`

### "AI generated incorrect content"

1. AI should mark uncertain content with `[TODO]` or `[VERIFY]`
2. Check if AI read the migration guide before executing
3. Provide more specific guidance in the migration plan

### "Instance is too far behind (multiple major versions)"

1. Migrate incrementally: v1.x → v2.0 → v2.5 → v2.8
2. Use each version's migration guide in sequence
3. Validate after each major version jump

---

## Related Documentation

- [MAINTENANCE.md](MAINTENANCE.md) - Framework consistency protocol
- [scripts/README.md](scripts/README.md) - Migration script documentation
- [.ai-agent-instructions.md](.ai-agent-instructions.md) - AI agent guidelines
- [schemas/README.md](schemas/README.md) - Schema documentation
