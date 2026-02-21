# Change: Unify all track definitions in FIRE phase

## Why

EPF defines four tracks — Product, Strategy, OrgOps, Commercial — each with the same three-layer
pattern: value model → definitions → execution. All four track definitions share the same base
schema (`track_definition_base_schema.json`), the same ID format (`fd-/sd-/pd-/cd-`), and the
same purpose: defining how value will be created and tracking maturity as implementation happens.

Currently, product definitions (`fd-*`) live in `FIRE/feature_definitions/` while strategy,
org_ops, and commercial definitions live in `READY/definitions/`. This split is a historical
accident — product definitions existed first and were placed in FIRE when FIRE was only about
product execution; the other three tracks were added later and placed in READY because they felt
"foundational." But this reasoning is wrong: all four track definitions are execution state
artifacts that carry maturity tracking, implementation references, and live progress data.
They belong in FIRE, alongside the value models they trace to.

FIRE's role is the **strategy-execution hinge**: it holds the stable targets that execution tools
(OpenSpec, OpenCode, ClickUp) point back to, and it feeds the AIM phase with evidence of delivery.
All four tracks use FIRE in this way. There is no conceptual justification for the split.

## What Changes

- **BREAKING:** `FIRE/feature_definitions/` renamed to `FIRE/definitions/product/`
- **BREAKING:** `READY/definitions/strategy/` moved to `FIRE/definitions/strategy/`
- **BREAKING:** `READY/definitions/org_ops/` moved to `FIRE/definitions/org_ops/`
- **BREAKING:** `READY/definitions/commercial/` moved to `FIRE/definitions/commercial/`
- Embedded templates reorganized from `templates/READY/definitions/` → `templates/FIRE/definitions/`
- New `epf_migrate_definitions` MCP tool and CLI command for auto-migrating existing instances
- Health check updated to detect old structure and guide migration
- Schema artifact detection regexes updated for new paths
- All internal path references updated across the entire codebase (~30 Go files)
- All wizard, agent prompt, and documentation references updated
- `epf_sync_canonical` updated to sync to `FIRE/definitions/` instead of `READY/definitions/`
- `epf_init_instance` updated to create `FIRE/definitions/{product,strategy,org_ops,commercial}/`
- Instance documentation (`AGENTS.md`, `README.md`, canonical templates) updated

## Impact

- **Affected specs:** `epf-cli-mcp`, `epf-strategy-instance`
- **Affected code:** ~30 Go files across `internal/schema/`, `internal/checks/`, `internal/mcp/`,
  `internal/strategy/`, `internal/aim/`, `internal/relationships/`, `internal/template/`,
  `internal/embedded/`
- **Affected instances:** All existing EPF instances with definitions in either location.
  Migration tool provided; old structure detected and warned on health check.
- **Affected documentation:** `docs/EPF/AGENTS.md`, `docs/EPF/_instances/emergent/AGENTS.md`,
  `docs/EPF/_instances/emergent/README.md`, all embedded wizards and agent prompts
- **Backward compatibility:** Migration tool (`epf_migrate_definitions` / `epf migrate definitions`)
  auto-moves files to the new locations. Health check detects old structure and blocks with a
  clear migration instruction. A transitional dual-path detection period (detect both old and new
  locations) is NOT provided — clean break with migration tooling is the safer long-term path.

## User-Facing New Structure

```
READY/                          ← Strategic intent (unchanged)
  00_north_star.yaml
  01_insight_analyses.yaml
  02_strategy_foundations.yaml
  03_insight_opportunity.yaml
  04_strategy_formula.yaml
  05_roadmap_recipe.yaml

FIRE/                           ← Strategy-execution hinge (all 4 tracks)
  value_models/                 ← WHY: business outcomes, all 4 tracks
  definitions/                  ← WHAT + HOW: all 4 track definitions
    product/                    ← fd-*.yaml (was: feature_definitions/)
    strategy/                   ← sd-*.yaml (was: READY/definitions/strategy/)
    org_ops/                    ← pd-*.yaml (was: READY/definitions/org_ops/)
    commercial/                 ← cd-*.yaml (was: READY/definitions/commercial/)
  mappings.yaml

AIM/                            ← Learning & adaptation (unchanged)
  living_reality_assessment.yaml
  assessment_report.yaml
  calibration_memo.yaml
```
