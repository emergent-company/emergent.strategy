# EPF Migrations

This directory contains the EPF migration framework - documentation, registry, and guides for migrating instance artifacts between EPF versions.

## Quick Start

```bash
# 1. Assess what needs migration
./scripts/check-version-alignment.sh _instances/{product}/

# 2. Generate a migration plan
./scripts/generate-migration-plan.sh _instances/{product}/

# 3. Review the plan
cat _instances/{product}/MIGRATION_PLAN.yaml

# 4. Execute migrations (AI-assisted or manual)
# Follow ai_instructions in the plan

# 5. Validate
./scripts/validate-instance.sh _instances/{product}/
```

## Directory Structure

```
migrations/
├── README.md              # This file
├── registry.yaml          # Machine-readable version history
└── guides/                # Detailed migration guides
    ├── v1.x-to-v2.0.0.md  # Major: Feature definition restructure
    └── v2.7.x-to-v2.8.x.md # Minor: TRL fields
```

## Files

### registry.yaml

Machine-readable record of what changed between EPF versions. AI agents and scripts read this to understand migration requirements.

**Contains:**
- Version history with changes
- Breaking changes with AI instructions
- New/deprecated/renamed fields
- Schema-to-artifact mapping
- Compatibility matrix

### guides/

Detailed human and AI-readable guides for specific version transitions.

| Guide | Migration Type | Scope | Effort |
|-------|---------------|-------|--------|
| [v1.x-to-v2.0.0.md](guides/v1.x-to-v2.0.0.md) | MAJOR | Feature definitions | 1-3 hrs/feature |
| [v2.7.x-to-v2.8.x.md](guides/v2.7.x-to-v2.8.x.md) | MINOR | Roadmaps | 30-60 min/roadmap |

## Related Scripts

| Script | Purpose |
|--------|---------|
| `scripts/check-version-alignment.sh` | Detect version gaps |
| `scripts/generate-migration-plan.sh` | Create MIGRATION_PLAN.yaml |
| `scripts/analyze-field-coverage.sh` | Check field completeness |
| `scripts/migrate-artifact.sh` | Interactive single-artifact migration |
| `scripts/batch-migrate.sh` | Batch migration tool |

## Core Principle

**AI handles the actual edits; EPF provides the strategy.**

The migration framework doesn't automatically modify files. Instead, it:
1. Assesses what needs to change
2. Generates a structured plan
3. Provides AI-readable instructions
4. Validates the results

This keeps humans in control while leveraging AI for the tedious transformation work.

## For More Information

- [MIGRATIONS.md](../MIGRATIONS.md) - Full migration strategy documentation
- [scripts/README.md](../scripts/README.md) - Script documentation
