# ⚠️ MOVED: Feature Definitions

**This directory has been deprecated.**

Feature definitions have been moved to the unified definitions structure:

## New Location

```
/definitions/product/
├── 01-technical/    (7 feature definitions)
├── 02-business/     (5 feature definitions)
├── 03-ux/           (4 feature definitions)
├── 04-cross-cutting/ (5 feature definitions)
└── README.md
```

**➡️ See: [`/definitions/product/README.md`](../definitions/product/README.md)**

---

## Why the Move?

EPF now uses a unified `/definitions/` structure for all track definitions:
- `/definitions/product/` - Product/Feature definitions (examples)
- `/definitions/strategy/` - Strategy definitions
- `/definitions/org_ops/` - OrgOps definitions
- `/definitions/commercial/` - Commercial definitions

This provides consistency across all tracks and makes navigation easier.

---

## Quick Links

- **New location**: [`definitions/product/`](../definitions/product/)
- **Template**: [`definitions/product/_template/`](../definitions/product/_template/)
- **Schema**: [`schemas/feature_definition_schema.json`](../schemas/feature_definition_schema.json)
- **Validation**: `./scripts/validate-feature-quality.sh definitions/product/`

