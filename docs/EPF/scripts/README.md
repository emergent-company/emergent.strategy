# EPF Scripts

This directory contains automation scripts for EPF framework management, validation, and maintenance.

## Validation Scripts

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
./scripts/validate-feature-quality.sh features/01-technical/fd-001-document-ingestion.yaml

# Validate entire directory
./scripts/validate-feature-quality.sh features/

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
./scripts/validate-cross-references.sh features/

# Exit codes: 0 = all refs valid, 1 = missing references found
```

**Output Example:**
```
Checking: features/01-technical/fd-003-semantic-search-query-interface.yaml (ID: fd-003)
✓   requires: fd-001 → features/01-technical/fd-tech-001-document-ingestion.yaml
✓   requires: fd-002 → features/01-technical/fd-002-knowledge-graph-engine.yaml
✓   enables: fd-004 → features/01-technical/fd-004-llm-processing-pipeline.yaml
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
./scripts/validate-value-model-references.sh features/

# Specify custom value models directory
./scripts/validate-value-model-references.sh features/ templates/FIRE/value_models

# Exit codes: 0 = all paths valid, 1 = invalid paths found
```

**Output Example:**
```
Checking: features/01-technical/fd-002-knowledge-graph-engine.yaml (ID: fd-002)
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
./scripts/validate-roadmap-references.sh features/

# Specify custom roadmap file
./scripts/validate-roadmap-references.sh features/ templates/READY/05_roadmap_recipe.yaml

# Exit codes: 0 = all refs valid, 1 = invalid refs found
```

**Output Example:**
```
Checking: features/01-technical/fd-002-knowledge-graph-engine.yaml (ID: fd-002)
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

Validates complete instance structure, naming conventions, and file organization.

**Checks:**
- Instance directory structure
- File naming conventions
- Required files present
- Integration spec format

**Usage:**
```bash
# Validate instance
./scripts/validate-instance.sh _instances/my-product

# Exit codes: 0 = structure valid, 1 = issues found
```

## Workflow Scripts

### epf-health-check.sh

Comprehensive health check for EPF framework consistency.

**Checks:**
- VERSION file alignment across all scripts
- Schema-artifact alignment
- Feature definition quality
- Instance validation

**Usage:**
```bash
# Run health check
./scripts/epf-health-check.sh

# With auto-fix for version mismatches
./scripts/epf-health-check.sh --fix

# Exit codes: 0 = healthy, 1 = issues found, 2 = auto-fix applied
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

### add-to-repo.sh

Adds EPF framework to a new product repository as git subtree.

**Usage:**
```bash
# From product repo root
curl -sSL https://raw.githubusercontent.com/eyedea-io/epf/main/scripts/add-to-repo.sh | bash -s -- {product-name}

# Or manually
git remote add epf git@github.com:eyedea-io/epf.git
git subtree add --prefix=docs/EPF epf main --squash
```

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
vim features/02-business/fd-021-new-feature.yaml

# 2. Validate quality
./scripts/validate-feature-quality.sh features/02-business/fd-021-new-feature.yaml

# 3. Validate cross-references (if dependencies added)
./scripts/validate-cross-references.sh features/

# 4. Run full health check before committing
./scripts/epf-health-check.sh

# 5. Commit if all validations pass
git add features/02-business/fd-021-new-feature.yaml
git commit -m "EPF: Add fd-021 new feature definition"
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
