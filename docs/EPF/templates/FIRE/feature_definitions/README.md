# Feature Definitions (MOVED)

> **⚠️ This location is deprecated.**
> 
> **The feature definition template has moved to:**
> 
> ### → [`definitions/product/_template/`](../../../definitions/product/_template/)
> 
> Feature templates now live alongside examples in the Product definitions directory for easier discovery.

---

## Why the Change?

For canonical tracks (Strategy, OrgOps, Commercial), the `definitions/{track}/` directory contains standardized definitions that can be used directly.

For the **Product** track, each product has unique features, so users need:
- A **template** to start from
- **Examples** to learn quality patterns

Consolidating template + examples in `definitions/product/` simplifies the repo structure.

---

## New Locations

| What You Need | Location |
|---------------|----------|
| Feature template | [`definitions/product/_template/feature_definition_template.yaml`](../../../definitions/product/_template/feature_definition_template.yaml) |
| Quality examples | [`definitions/product/`](../../../definitions/product/) (21 validated examples) |
| Creation wizard | [`wizards/feature_definition.wizard.md`](../../../wizards/feature_definition.wizard.md) |
| Schema | [`schemas/feature_definition_schema.json`](../../../schemas/feature_definition_schema.json) |
