# Legacy Files

This directory contains **deprecated** EPF artifacts from versions v1.9.x and earlier.

**⚠️ DO NOT USE THESE FILES.** They are kept only for historical reference and migration support.

---

## What's Deprecated

### 1. Legacy Schemas (schemas/_legacy/)

**Deprecated schemas:**
- `okrs_schema.json` → Now part of `roadmap_recipe_schema.json`
- `assumptions_schema.json` → Now part of `roadmap_recipe_schema.json`
- `work_packages_schema.json` → Now part of `roadmap_recipe_schema.json`

**Why deprecated**: EPF v1.9.1 consolidated three separate READY phase files into a single comprehensive `roadmap_recipe.yaml` artifact with enhanced structure, solution scaffold, and execution planning.

### 2. Legacy Templates (templates/READY/_legacy/)

**Deprecated templates:**
- `okrs.yaml` → Now consolidated in `05_roadmap_recipe.yaml`
- `assumptions.yaml` → Now consolidated in `05_roadmap_recipe.yaml`
- `work_packages.yaml` → Now consolidated in `05_roadmap_recipe.yaml`

**Why deprecated**: Simple separate files replaced by track-based roadmap structure with:
- Enhanced OKRs with measurement methods and baselines
- Enhanced assumptions with types, criticality, evidence requirements
- Enhanced work packages with dependencies, traceability, execution details
- New solution scaffold section (architecture and component mapping)
- New execution plan section (sequencing, critical path, milestones)

### 3. Legacy Numbering (templates/READY/_legacy/numbering-transition/)

**Old numbering (v1.9.x):**
```
00_insight_analyses.yaml
01_insight_opportunity.yaml     ← Old: 02
02_strategy_formula.yaml        ← Old: 03
03_roadmap_recipe.yaml          ← Old: 04
```

**New numbering (v2.0.0+):**
```
00_north_star.yaml              ← NEW: Organizational foundation
01_insight_analyses.yaml
02_strategy_foundations.yaml    ← NEW: Strategic pillars
03_insight_opportunity.yaml     ← Was: 02
04_strategy_formula.yaml        ← Was: 03
05_roadmap_recipe.yaml          ← Was: 04
```

**Why changed**: EPF v1.9.2-v1.10.0 introduced two new strategic artifacts (North Star and Strategy Foundations) requiring renumbering of subsequent files to maintain logical READY phase flow.

---

## Migration Guidance

### If You Have Old Instances

**Option 1: Rename files** (quick fix, keeps content):

```bash
cd _instances/{product}/READY

# If using old numbering (pre-v2.0.0)
mv 02_insight_opportunity.yaml 03_insight_opportunity.yaml
mv 03_strategy_formula.yaml 04_strategy_formula.yaml
mv 04_roadmap_recipe.yaml 05_roadmap_recipe.yaml

# Validate structure
../../scripts/validate-instance.sh ..
```

**Option 2: Fresh start** (recommended for major version jump):

1. **Review current artifacts** for strategic content worth preserving
2. **Copy new templates** from `templates/READY/`:
   ```bash
   cp ../../templates/READY/00_north_star.yaml .
   cp ../../templates/READY/01_insight_analyses.yaml .
   cp ../../templates/READY/02_strategy_foundations.yaml .
   cp ../../templates/READY/03_insight_opportunity.yaml .
   cp ../../templates/READY/04_strategy_formula.yaml .
   cp ../../templates/READY/05_roadmap_recipe.yaml .
   ```
3. **Migrate content** to new structure (follow template guidance)
4. **Validate** with `scripts/validate-schemas.sh`

### Schema Migration

**IMPORTANT**: Old schemas are **incompatible** with new templates.

Always use schemas from `schemas/` root directory:
- `north_star_schema.json` (NEW in v1.9.4)
- `insight_analyses_schema.json`
- `strategy_foundations_schema.json` (NEW in v1.9.3)
- `insight_opportunity_schema.json` (replaces simple opportunity)
- `strategy_formula_schema.json` (replaces simple strategy)
- `roadmap_recipe_schema.json` (replaces okrs + assumptions + work_packages)

---

## Version History Summary

### v1.9.0 → v1.9.1 (READY Phase Consolidation)
- Introduced three-stage READY structure (INSIGHT → STRATEGY → ROADMAP)
- Consolidated `okrs.yaml`, `assumptions.yaml`, `work_packages.yaml` → `03_roadmap_recipe.yaml`
- Enhanced schemas with traceability support

### v1.9.2 → v1.9.3 (Strategy Foundations Added)
- Added `01_strategy_foundations.yaml` (Product Vision, Value Proposition, Strategic Sequencing, Information Architecture)
- Renumbered subsequent files: opportunity (01→02), formula (02→03), roadmap (03→04)
- Two-tier strategy phase: foundations (living) + formula (cycle-specific)

### v1.9.3 → v1.9.4 (North Star Added)
- Added `00_north_star.yaml` (Purpose, Vision, Mission, Values, Core Beliefs)
- Renumbered all READY files +1: analyses (00→01), foundations (01→02), opportunity (02→03), formula (03→04), roadmap (04→05)
- Organizational-level stability layer reviewed annually

### v1.9.x → v2.0.0 (Breaking Changes)
- Work packages scope clarified (EPF owns through KRs, spec tools own work packages)
- Feature definitions schema v2.0 (removed `value_propositions` field)
- Enhanced personas field structure (11-field comprehensive structure)
- Track-based roadmap structure (Product, Strategy, Org/Ops, Commercial tracks)

---

## Why Keep Legacy Files?

Legacy files serve three purposes:

1. **Historical Reference**: Understanding EPF evolution and design decisions
2. **Migration Support**: Helping teams with old instances upgrade to current version
3. **Backward Compatibility**: Supporting edge cases where old structure is still in use

**However**: Active development should ALWAYS use current templates and schemas.

---

## Need Help?

### Resources

- **New instances**: See [`docs/guides/INSTANTIATION_GUIDE.md`](../docs/guides/INSTANTIATION_GUIDE.md)
- **Migration support**: See [`MAINTENANCE.md`](../MAINTENANCE.md)
- **Version history**: See [`VERSION`](../VERSION) and [`README.md`](../README.md) changelog
- **Canonical purity rules**: See [`CANONICAL_PURITY_RULES.md`](../CANONICAL_PURITY_RULES.md)

### Support

- **Questions**: Open issue in canonical EPF repository (github.com/eyedea-io/epf-canonical-definition)
- **Bugs**: Report via GitHub issues
- **Contributions**: Follow guidelines in `MAINTENANCE.md`

---

**Last Updated**: EPF v2.0.0 (December 2025)  
**Status**: Archived/Deprecated