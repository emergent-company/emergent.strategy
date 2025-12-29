# EPF Feature Definition Examples

This directory contains **reference feature definitions** demonstrating EPF compliance and quality standards.

## Purpose

These examples serve as:
- **Quality benchmarks** showing what "good" looks like
- **Learning resources** for understanding feature definition structure
- **Pattern demonstrations** for personas, scenarios, and dependencies
- **Validation test cases** for schema and wizard development

---

## Template vs Examples

### Need a Starting Point? Use the Template

- **Location**: [`templates/FIRE/feature_definitions/feature_definition_template.yaml`](../templates/FIRE/feature_definitions/feature_definition_template.yaml)
- **Size**: ~200 lines with placeholders and instructional comments
- **Purpose**: Starting structure for your feature definition
- **Best for**: Creating new features from scratch

### Need to Learn Patterns? Review These Examples

- **Location**: `features/` (this directory)
- **Size**: 21 complete features (350-790 lines each)
- **Purpose**: Demonstrate quality standards and patterns
- **Best for**: Understanding what excellent feature definitions look like

### Recommended Workflow

1. **Start**: Copy template to your instance (`_instances/{product}/FIRE/feature_definitions/`)
2. **Fill**: Complete basic structure using template placeholders
3. **Learn**: Review examples in this directory for quality patterns
4. **Validate**: Run `./scripts/validate-feature-quality.sh {your-file}.yaml`
5. **Iterate**: Fix errors and refine until 0 errors
6. **Commit**: Only after passing validation

---

## Why "features" not "feature_definitions"?

This canonical directory uses the shorter name `/features/` for convenience and historical precedent. Product instances use the explicit name `FIRE/feature_definitions/` to clarify purpose within the FIRE phase structure.

Both refer to the same artifact type: EPF-compliant feature specifications in YAML format.

---

## Organization

- **01-technical/**: Technical capability examples (data, APIs, search)
- **02-business/**: Business capability examples (users, workflows, reporting)
- **03-ux/**: UX capability examples (navigation, collaboration)
- **04-cross-cutting/**: Cross-cutting concern examples (security, performance)

## Example Quality Standards

Each example demonstrates:
- ✅ Exactly 4 distinct personas with character names and metrics
- ✅ 3-paragraph narratives per persona (200+ chars each)
- ✅ Scenarios at top-level with rich context/trigger/action/outcome
- ✅ Rich dependency objects with WHY explanations (30+ chars)
- ✅ Comprehensive capabilities, contexts, scenarios coverage

## Validation

All examples validate against `schemas/feature_definition_schema.json`.

**Validate an example:**
```bash
./scripts/validate-feature-quality.sh features/01-technical/{feature-file}.yaml
```

## Using These Examples

1. **Read examples** to understand quality standards
2. **Copy structure** to your product instance
3. **Customize content** for your specific features
4. **Validate** using schema and validation script

## Instance-Specific Features

**Your product's feature definitions belong in your product repository:**
```
{product-repo}/docs/EPF/_instances/{product}/FIRE/feature_definitions/
```

**Never create product-specific features in this canonical directory.**

## Resources

For creation guidance, see:
- **Creation Wizard**: [`wizards/feature_definition.wizard.md`](../wizards/feature_definition.wizard.md) - Human-readable 7-step guide
- **AI Agent Guidance**: [`wizards/product_architect.agent_prompt.md`](../wizards/product_architect.agent_prompt.md) - AI-specific guidance
- **Template**: [`templates/FIRE/feature_definitions/README.md`](../templates/FIRE/feature_definitions/README.md) - Template structure
- **Validation Schema**: [`schemas/feature_definition_schema.json`](../schemas/feature_definition_schema.json) - JSON Schema
- **Quality System**: [`docs/technical/EPF_SCHEMA_V2_QUALITY_SYSTEM.md`](../docs/technical/EPF_SCHEMA_V2_QUALITY_SYSTEM.md) - Complete quality documentation

