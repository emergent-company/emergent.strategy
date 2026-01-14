# EPF Track Definitions

This directory contains definitions across EPF tracks. **Three tracks have canonical definitions** (Strategy, OrgOps, Commercial), while the **Product track contains examples only** (each product has unique features).

## ⚠️ Important: Canonical vs Non-Canonical

| Track | Status | What's Here | Use Case |
|-------|--------|-------------|----------|
| **Strategy** | ✅ CANONICAL | Standardized strategy definitions | Use directly or customize |
| **OrgOps** | ✅ CANONICAL | Standardized process definitions | Use directly or customize |
| **Commercial** | ✅ CANONICAL | Standardized commercial definitions | Use directly or customize |
| **Product** | ⚠️ EXAMPLES | Quality examples, NOT templates | Learn patterns, create your own |

**Why Product is different:** Every product has unique features. There's no "universal feature" that applies to all products. The Product directory shows _how_ to create feature definitions, not _what_ features to create.

## Structure

```
definitions/
├── product/          # Feature examples (NOT canonical - each product is unique)
│   └── _template/    # Starting template for new feature definitions
├── strategy/         # Strategy definitions for strategists (CANONICAL)
├── org_ops/          # Process definitions for operations teams (CANONICAL)
└── commercial/       # Commercial definitions for revenue teams (CANONICAL)
```

## The Pattern

Each EPF track follows the same definition pattern:

| Track | Definition Type | Practitioner | Output | Canonical? |
|-------|-----------------|--------------|--------|------------|
| **Product** | Feature Definition (fd-*) | Engineer/Designer | Working software | ❌ Examples only |
| **Strategy** | Strategy Definition (sd-*) | Strategist/Leader | READY artifacts | ✅ Canonical |
| **OrgOps** | Process Definition (pd-*) | Ops/HR/Finance | Running processes | ✅ Canonical |
| **Commercial** | Commercial Definition (cd-*) | Sales/Marketing | Relationships, campaigns | ✅ Canonical |

## Maturity Tiers

EPF definitions support a "grow with organization" philosophy through maturity tiers:

| Tier | Name | Target Size | Effort | Description |
|------|------|-------------|--------|-------------|
| **1** | Basic | 1-10 people | 1-2 days | Minimum viable implementation |
| **2** | Intermediate | 10-50 people | 1-2 weeks | Adds metrics, documentation, automation |
| **3** | Advanced | 50+ people | 1+ months | Full governance, integrations, optimization |

Canonical definitions (Strategy, OrgOps, Commercial) start at Tier 1 with guidance for growing into higher tiers. Product examples demonstrate quality standards at various tiers.

## Narrow Scope Principle

Definitions are intentionally **narrow in scope**:

- **Single responsibility**: One definition = one outcome
- **MVP-first**: Basic tier implementable in 1-2 days
- **Composable**: Narrow definitions can combine into larger workflows
- **Iterable**: Start basic, add sophistication as needed

**Test**: If a definition has >10 steps or >5 actors, consider splitting it.

## Canonical vs Instance Definitions

**Canonical definitions** (in this directory):
- Standardized templates usable by any organization
- Exist for **Strategy, OrgOps, Commercial only** (these also have canonical value models)
- Product track has examples, not canonical templates (product-specific)

**Instance definitions** (in `_instances/{product}/`):
- Organization-specific adaptations
- **Product definitions are ALWAYS instance-specific**
- **Product value model is ALWAYS instance-specific** (placeholder template only)
- Other tracks may customize canonical templates

## Value Model Alignment

Each definition links to its value model via `contributes_to`:

```yaml
contributes_to:
  - OrgOps.TalentManagement.orientation-programs
```

This creates traceability from value model capabilities → definitions → execution.

## Usage

1. **Find**: Browse track directories or search by value model path
2. **Adopt**: Copy canonical definition to your instance (if customizing)
3. **Execute**: Follow the definition's steps at your maturity tier
4. **Grow**: Upgrade to higher tiers as organization scales

## Schema Validation

Validate definitions against their schemas:

```bash
# Base schema for all tracks
./scripts/validate-schemas.sh definitions/org_ops/pd-001-new-hire-orientation.yaml

# Track-specific validation
ajv validate -s schemas/org_ops_definition_schema.json -d definitions/org_ops/*.yaml
```

## Related Resources

- [Track Definition Base Schema](../schemas/track_definition_base_schema.json)
- [OrgOps Definition Schema](../schemas/org_ops_definition_schema.json)
- [Value Model Schema](../schemas/value_model_schema.json)
- [Adoption Guide](../docs/guides/ADOPTION_GUIDE.md)
