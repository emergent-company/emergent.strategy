# EPF Schemas

JSON Schema validation files for all EPF artifacts.

---

## Schema-Template-Guide Pattern

Every EPF artifact follows a three-part system:

```
Guide (Markdown)        Template (YAML)         Schema (JSON Schema)
docs/guides/     →     ../templates/     →     schemas/
     ↓                      ↓                       ↓
Read to understand    Copy to create        Validates correctness
   WHY/HOW            structured format      technical compliance
```

**Workflow:**
1. **Read guide** → Understand artifact purpose and best practices
2. **Copy template** → Get structured YAML format
3. **Fill content** → Create your instance data
4. **Validate schema** → Ensure technical correctness

---

## Validation

### Validate Single Artifact

```bash
# Using schema validation script
./scripts/validate-schemas.sh path/to/artifact.yaml

# Direct ajv-cli validation (requires: npm install -g ajv-cli)
ajv validate -s schemas/feature_definition_schema.json -d path/to/feature.yaml
```

### Validate Entire Instance

```bash
# Validate all artifacts in product instance
./scripts/validate-instance.sh _instances/product-name/

# Example output:
# ✓ Validating: 00_north_star.yaml
# ✓ Validating: 01_insight_analyses.yaml
# ✓ Validating: FIRE/feature_definitions/fd-001.yaml
```

### Quality Validation (Beyond Schema)

```bash
# Feature quality checks (personas, scenarios, dependencies)
./scripts/validate-feature-quality.sh definitions/product/path/to/feature.yaml

# Cross-reference validation (dependencies exist)
./scripts/validate-cross-references.sh definitions/product/

# Value model references (traceability)
./scripts/validate-value-model-references.sh definitions/product/

# Roadmap references (KR links)
./scripts/validate-roadmap-references.sh definitions/product/
```

**See:** [`../scripts/README.md`](../scripts/README.md) for complete validation tool documentation

---

## Available Schemas

### READY Phase Schemas (Strategic Foundation)

| Schema | Template | Guide | Purpose |
|--------|----------|-------|---------|
| [`north_star_schema.json`](north_star_schema.json) | [`templates/READY/00_north_star.yaml`](../templates/READY/00_north_star.yaml) | [`docs/guides/NORTH_STAR_GUIDE.md`](../docs/guides/NORTH_STAR_GUIDE.md) | Organizational strategic foundation |
| [`insight_analyses_schema.json`](insight_analyses_schema.json) | [`templates/READY/01_insight_analyses.yaml`](../templates/READY/01_insight_analyses.yaml) | - | Market trends, forces, internal state |
| [`strategy_foundations_schema.json`](strategy_foundations_schema.json) | [`templates/READY/02_strategy_foundations.yaml`](../templates/READY/02_strategy_foundations.yaml) | [`docs/guides/STRATEGY_FOUNDATIONS_GUIDE.md`](../docs/guides/STRATEGY_FOUNDATIONS_GUIDE.md) | Strategic pillars and principles |
| [`insight_opportunity_schema.json`](insight_opportunity_schema.json) | [`templates/READY/03_insight_opportunity.yaml`](../templates/READY/03_insight_opportunity.yaml) | - | Synthesized opportunities from insights |
| [`strategy_formula_schema.json`](strategy_formula_schema.json) | [`templates/READY/04_strategy_formula.yaml`](../templates/READY/04_strategy_formula.yaml) | - | Strategic bets, positioning, ecosystem |
| [`roadmap_recipe_schema.json`](roadmap_recipe_schema.json) | [`templates/READY/05_roadmap_recipe.yaml`](../templates/READY/05_roadmap_recipe.yaml) | - | OKR-based roadmap across 4 tracks |

### FIRE Phase Schemas (Execution)

| Schema | Template/Definitions | Guide | Purpose |
|--------|----------|-------|---------|
| [`feature_definition_schema.json`](feature_definition_schema.json) | [`definitions/product/_template/`](../definitions/product/_template/) | [`docs/guides/FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md`](../docs/guides/FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md) | Feature definitions with personas, scenarios, contexts |
| [`value_model_schema.json`](value_model_schema.json) | [`templates/FIRE/value_model.yaml`](../templates/FIRE/value_model.yaml) | [`docs/guides/VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md`](../docs/guides/VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md) | Value models (product, strategy, org_ops, commercial) |
| [`workflow_schema.json`](workflow_schema.json) | [`templates/FIRE/workflow.yaml`](../templates/FIRE/workflow.yaml) | - | Workflow definitions |
| [`mappings_schema.json`](mappings_schema.json) | [`templates/FIRE/mappings.yaml`](../templates/FIRE/mappings.yaml) | - | Cross-track mappings (features ↔ value drivers) |

### AIM Phase Schemas (Assessment)

| Schema | Template | Guide | Purpose |
|--------|----------|-------|---------|
| [`assessment_report_schema.json`](assessment_report_schema.json) | [`templates/AIM/assessment_report.yaml`](../templates/AIM/assessment_report.yaml) | - | Post-cycle retrospective assessment |
| [`calibration_memo_schema.json`](calibration_memo_schema.json) | [`templates/AIM/calibration_memo.yaml`](../templates/AIM/calibration_memo.yaml) | - | Strategy calibration decisions |

---

## Schema Versioning

### Current Versions

- **Feature Definition Schema**: v2.1.0 (feature_maturity added in EPF v2.8.0)
  - **New in v2.1.0**: Optional `feature_maturity` section for capability-level maturity tracking
  - **Breaking change (v2.0.0)**: Removed `value_propositions` field (duplicated personas content)
  - **Requirements**: Exactly 4 personas, structured contexts, rich dependencies
- **Strategy Formula Schema**: v1.11.0 (enhanced competitive analysis)
- **All other schemas**: v1.0.0 (stable)

### Feature Definition Schema v2.1.0 Changes

**New `feature_maturity` section (optional):**
```json
"feature_maturity": {
  "type": "object",
  "description": "Optional capability-level maturity tracking",
  "properties": {
    "overall_stage": {
      "type": "string",
      "enum": ["hypothetical", "emerging", "proven", "scaled"]
    },
    "capability_maturity": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "capability_id": { "type": "string" },
          "stage": { "enum": ["hypothetical", "emerging", "proven", "scaled"] },
          "delivered_by_kr": { "type": "string" },
          "evidence": { "type": "string" }
        }
      }
    },
    "last_advanced_by_kr": { "type": "string" },
    "last_assessment_date": { "type": "string", "format": "date" }
  }
}
```

**Usage:** Track capability maturity using same 4 stages as Value Model Maturity (VMM).

**See:** [VALUE_MODEL_MATURITY_GUIDE.md](../docs/guides/VALUE_MODEL_MATURITY_GUIDE.md) for detailed explanation.

### Breaking Changes

**EPF v2.0.0 (Feature Definition Schema):**
- ❌ Removed: `value_propositions` field (no longer allowed)
- ✅ Required: Exactly 4 personas (was: 0-N)
- ✅ Required: 200+ character persona narratives (3 fields: current_situation, transformation_moment, emotional_resolution)
- ✅ Enhanced: Context structure (key_interactions, data_displayed arrays required)

**Migration:** See `docs/VALUE_PROPOSITIONS_REMOVAL_COMPLETE.md` for migration guide

---

## Schema Structure

### Common Patterns

All EPF schemas follow JSON Schema Draft-07 standard with common patterns:

**Metadata Section:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Artifact Name",
  "description": "Artifact purpose and usage",
  "type": "object"
}
```

**Required vs Optional:**
- Required fields: Must be present, will fail validation if missing
- Optional fields: Can be omitted, have default values or null allowed

**String Length Constraints:**
- Most descriptions: `minLength: 10` (prevent empty content)
- Quality narratives: `minLength: 200` (e.g., persona narratives)
- Rationales: `minLength: 30` (e.g., dependency reasons)

**Array Constraints:**
- Most arrays: `minItems: 1` (prevent empty arrays)
- Personas (feature definitions): `minItems: 4, maxItems: 4` (exactly 4)

---

## Validation Tools

### Schema Validation Scripts

Located in `../scripts/`:

1. **`validate-schemas.sh`** - Validate YAML against JSON Schema
   - Requires: `yq`, `ajv-cli`
   - Usage: `./scripts/validate-schemas.sh path/to/file.yaml`

2. **`validate-instance.sh`** - Validate entire product instance
   - Checks all artifacts in instance directory
   - Usage: `./scripts/validate-instance.sh _instances/product-name/`

3. **`validate-feature-quality.sh`** - Enhanced feature validation
   - Checks beyond schema: persona count, narrative lengths, scenario structure
   - Usage: `./scripts/validate-feature-quality.sh definitions/product/file.yaml`

### Cross-Reference Validators

4. **`validate-cross-references.sh`** - Verify feature dependencies exist
5. **`validate-value-model-references.sh`** - Verify value driver references
6. **`validate-roadmap-references.sh`** - Verify roadmap KR links

**See:** [`../scripts/README.md`](../scripts/README.md) for detailed usage

---

## Schema Development

### Adding New Schema Fields

1. Update JSON Schema file (e.g., `feature_definition_schema.json`)
2. Update corresponding template (e.g., `definitions/product/_template/feature_definition_template.yaml`)
3. Update guide if exists (e.g., `docs/guides/FEATURE_DEFINITION_IMPLEMENTATION_GUIDE.md`)
4. Test validation with sample data
5. Update VERSION and CHANGELOG in root directory
6. Commit with message: `schema: Add [field] to [artifact]_schema.json`

### Schema Best Practices

**For Framework Maintainers:**

- ✅ Keep schemas strict (better to reject invalid data than accept bad data)
- ✅ Use `minLength` constraints to prevent empty strings
- ✅ Use `minItems` for arrays that must have content
- ✅ Add `description` fields for all properties (aids understanding)
- ✅ Use `examples` in schema to show valid formats
- ✅ Version breaking changes (document in CHANGELOG)

**For Schema Validation:**

- ✅ Always validate after creating/editing artifacts
- ✅ Fix validation errors before committing
- ✅ Use quality validators (not just schema) for features
- ✅ Check cross-references after adding dependencies

---

## Legacy Schemas

Legacy schemas (deprecated/superseded) are moved to `_legacy/` subdirectory with README explaining deprecation.

**See:** [`_legacy/README.md`](_legacy/README.md) for legacy schema information

---

## Related Documentation

- **Templates**: [`../templates/README.md`](../templates/README.md) - Copy to create artifacts
- **Guides**: [`../docs/guides/README.md`](../docs/guides/README.md) - Understand concepts
- **Wizards**: [`../wizards/README.md`](../wizards/README.md) - AI-assisted creation
- **Scripts**: [`../scripts/README.md`](../scripts/README.md) - Validation tools
- **Maintenance**: [`../MAINTENANCE.md`](../MAINTENANCE.md) - Framework maintenance protocol

---

## Quick Commands

```bash
# Install validation tools
npm install -g ajv-cli

# Validate single artifact
./scripts/validate-schemas.sh _instances/product/00_north_star.yaml

# Validate all instance artifacts
./scripts/validate-instance.sh _instances/product/

# Validate feature quality (enhanced checks)
./scripts/validate-feature-quality.sh definitions/product/01-technical/fd-001.yaml

# Check all cross-references
./scripts/validate-cross-references.sh definitions/product/
./scripts/validate-value-model-references.sh definitions/product/
./scripts/validate-roadmap-references.sh definitions/product/
```

---

**For AI Agents:** When validating artifacts, always check both schema compliance AND quality validators (for features). Schema ensures structure, quality validators ensure content richness (personas, narratives, dependencies).
