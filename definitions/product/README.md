# Product Definitions (Feature Definitions)

This directory contains both the **template** for creating new feature definitions AND **reference examples** demonstrating EPF quality standards.

## Purpose

**Template + Examples together** for the Product track:
- **`_template/`** - Starting point for creating your feature definitions
- **Example directories** - Quality benchmarks showing what "good" looks like
- **Learning resources** for understanding feature definition structure
- **Pattern demonstrations** for personas, scenarios, and dependencies
- **Validation test cases** for schema and wizard development

## Note on Product Track

Unlike Strategy, OrgOps, and Commercial tracks (where canonical definitions ARE the templates), the **Product** track is product-specific:
- Each product has unique features (no universal "Product" definitions)
- Use the **template** to start, **examples** to learn patterns
- Your actual feature definitions belong in `_instances/{product}/FIRE/feature_definitions/`

---

## Quick Start

### 1. Copy Template → Fill In → Validate

```bash
# Copy template to your instance
cp definitions/product/_template/feature_definition_template.yaml \
   _instances/{product}/FIRE/feature_definitions/fd-{number}-{slug}.yaml

# Fill in the placeholders (see template comments for guidance)

# Validate against schema
./scripts/validate-feature-quality.sh _instances/{product}/FIRE/feature_definitions/fd-{number}-{slug}.yaml
```

### 2. Learn from Examples

Browse the example directories to see quality patterns:
- **Personas** with character names, metrics, and 200+ char narratives
- **Scenarios** with rich context/trigger/action/outcome structure
- **Dependencies** with WHY explanations (30+ chars)

---

## Directory Structure

| Directory | Description | Content |
|-----------|-------------|---------|
| **`_template/`** | Feature definition template | 1 template file (~200 lines with placeholders) |
| **`01-technical/`** | Technical capability examples | 7 validated examples |
| **`02-business/`** | Business capability examples | 5 validated examples |
| **`03-ux/`** | UX capability examples | 4 validated examples |
| **`04-cross-cutting/`** | Cross-cutting concern examples | 5 validated examples |

**Contents: 1 template + 21 reference feature definitions**

---

## Example Quality Standards

Each example demonstrates:
- ✅ Exactly 4 distinct personas with character names and metrics
- ✅ 3-paragraph narratives per persona (200+ chars each)
- ✅ Scenarios at top-level with rich context/trigger/action/outcome
- ✅ Rich dependency objects with WHY explanations (30+ chars)
- ✅ Comprehensive capabilities, contexts, scenarios coverage

## Schema Validation

All examples validate against `schemas/feature_definition_schema.json` (v2.0.0).

**Validate an example:**
```bash
./scripts/validate-feature-quality.sh definitions/product/01-technical/{feature-file}.yaml
```

**Validate all product definitions:**
```bash
./scripts/validate-feature-quality.sh definitions/product/
```

---

## Instance-Specific Features

**Your product's feature definitions belong in your product repository:**
```
{product-repo}/docs/EPF/_instances/{product}/FIRE/feature_definitions/
```

**Never create product-specific features in this canonical directory.**

---

## Resources

| Resource | Description |
|----------|-------------|
| [Template](_template/feature_definition_template.yaml) | Starting point for new features |
| [Creation Wizard](../../wizards/feature_definition.wizard.md) | Human-readable 7-step guide |
| [AI Agent Guidance](../../wizards/product_architect.agent_prompt.md) | AI-specific creation guidance |
| [Schema](../../schemas/feature_definition_schema.json) | JSON Schema (v2.0.0) |

---

## Migration Note

The template was consolidated into this directory (January 2026) as part of the unified definitions structure. Previously at `templates/FIRE/feature_definitions/`, it now lives alongside the examples for easier discovery.
