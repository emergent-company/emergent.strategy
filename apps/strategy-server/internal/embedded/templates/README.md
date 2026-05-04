# EPF Templates

This directory contains **template YAML files** for instantiating EPF artifacts in your product organization.

## Purpose

Templates provide:
- **Structured formats** with all required fields
- **Placeholder content** showing what to fill in
- **Inline comments** explaining each section
- **Examples** as YAML comments to guide your work

## How to Use Templates

### 1. Read the Guide FIRST

**Before copying any template**, read its corresponding guide in `docs/guides/`:
- Understand **what** the artifact is and why it matters
- Learn **when** to create/update it
- See **how** to fill it out effectively
- Review **examples** of good completed artifacts

### 2. Copy Template to Your Instance

```bash
# Example: Copy North Star template to your instance
cp templates/READY/00_north_star.yaml _instances/{your-product}/READY/00_north_star.yaml
```

### 3. Fill in Your Content

- Replace placeholder values with your actual content
- Remove instructional comments (lines starting with `#`)
- Keep structure intact (don't change field names)

### 4. Validate Against Schema

```bash
# Validate your instance against the schema
./scripts/validate-schemas.sh _instances/{your-product}/READY/00_north_star.yaml
```

### 5. Iterate with Guide

Refer back to the guide to:
- Clarify field meanings
- Check examples for inspiration
- Verify strategic coherence
- Learn from best practices

## Template Structure

### READY Phase Templates

Strategic foundation templates:

| Template | Schema | Guide | Purpose |
|----------|--------|-------|---------|
| `00_north_star.yaml` | `schemas/north_star_schema.json` | `docs/guides/NORTH_STAR_GUIDE.md` | Organizational strategic foundation |
| `01_insight_analyses.yaml` | `schemas/insight_analyses_schema.json` | Built into template | Foundational analyses (trends, market, tech) |
| `02_strategy_foundations.yaml` | `schemas/strategy_foundations_schema.json` | `docs/guides/STRATEGY_FOUNDATIONS_GUIDE.md` | Strategic pillars and principles |
| `03_insight_opportunity.yaml` | `schemas/insight_opportunity_schema.json` | Built into template | Opportunities discovered from insights |
| `04_strategy_formula.yaml` | `schemas/strategy_formula_schema.json` | Built into template | How to compete and win |
| `05_roadmap_recipe.yaml` | `schemas/roadmap_recipe_schema.json` | Built into template | High-level roadmap structure |
| `product_portfolio.yaml` | `schemas/product_portfolio_schema.json` | `docs/guides/PRODUCT_PORTFOLIO_GUIDE.md` | Product lines, brands, offerings |

### FIRE Phase Templates

Execution-focused templates:

| Directory | Contents | Purpose | Status |
|-----------|----------|---------|--------|
| `feature_definitions/` | Redirect to `definitions/product/_template/` | Feature definition template | Moved |
| `mappings.yaml` | Mapping template | Map features to strategic context | Template |
| `value_models/` | Value model templates | Track value articulation | ⚠️ See note |
| `workflows/` | Workflow templates | Process and workflow definitions | Template |

**⚠️ Value Model Note:**
- **Strategy, OrgOps, Commercial** value models are **canonical** (use directly or customize)
- **Product** value model is a **placeholder** - each product defines unique value (customize entirely)

### AIM Phase Templates

Assessment and calibration templates:

| Template | Schema | Purpose |
|----------|--------|---------|
| `assessment_report.yaml` | `schemas/assessment_report_schema.json` | Periodic product/market assessment |
| `calibration_memo.yaml` | `schemas/calibration_memo_schema.json` | Strategic adjustments documentation |

## Template-Schema-Guide Pattern

Every EPF artifact follows this pattern:

```
Template (YAML)     →  Copy & customize for your product
   ↓                   (structured data you fill out)
   ↓
Schema (JSON)       →  Validates your instance
   ↓                   (ensures required fields present)
   ↓
Guide (Markdown)    →  Explains the concept
                       (read to understand purpose)
```

**Workflow**:
1. Read the **guide** to understand the artifact's purpose
2. Copy the **template** to your instance directory
3. Fill in your content following template structure
4. Validate against the **schema** to ensure correctness

## Instantiation Workflow

Complete workflow for creating a new product instance:

See `docs/guides/INSTANTIATION_GUIDE.md` for step-by-step instructions.

**Quick Overview**:

1. **Setup**: Create `_instances/{your-product}/` directory
2. **READY Phase**: Copy and fill strategic foundation templates
3. **FIRE Phase**: Define features, value models, workflows
4. **AIM Phase**: Create assessment and calibration artifacts
5. **Validate**: Run schema validation on all instances

## Related Documentation

- **`docs/guides/`** - Conceptual guides explaining each artifact
- **`schemas/`** - JSON schemas for validation
- **`scripts/validate-schemas.sh`** - Validation script
- **`wizards/`** - AI-assisted wizards for creating artifacts
- **`docs/guides/INSTANTIATION_GUIDE.md`** - Complete instantiation workflow

## Adding New Templates

When adding new templates:

1. Create template YAML in appropriate phase directory
2. Create corresponding JSON schema in `schemas/`
3. Create guide in `docs/guides/` explaining the artifact
4. Update this README with template entry
5. Update `docs/guides/INSTANTIATION_GUIDE.md` if part of workflow

## Notes

- Templates contain **placeholder content** and **instructional comments**
- Your instances should contain **real content** with comments removed
- Never modify templates directly - copy to `_instances/` first
- Templates are version-controlled in canonical EPF repository
