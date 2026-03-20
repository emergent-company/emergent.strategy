# Change: Enhance decomposer completeness with declarative schema reconciliation

## Why

Two related gaps prevent the EPF semantic engine from reaching its full graph fidelity:

1. **Silent schema drift (#11):** EPF-oriented Memory projects can run on stale schema versions indefinitely. The `huma-strategy` project ran on epf-engine v1.0.0 (7 types, 8 relationships) for 2 days while v2.0.0 (14 types, 17 relationships) was available. The decomposer created objects for types the schema didn't know about, causing embedding failures and empty `compiled-types`. Detection required manual `memory schemas installed` inspection.

2. **Incomplete decomposition (#12):** The decomposer only produces a subset of the possible structural relationships. Several relationship types that can be inferred from explicit YAML references (e.g., `informs`, `constrains`, `delivers`, `validates`) are not created, leaving gaps that limit propagation circuit cascade depth. Additionally, 4 object types present in YAML artifacts are not extracted.

The root cause of #11 is an **inverted dependency**: the schema is treated as an independent artifact that the decomposer must conform to, creating a two-artifact synchronization problem. The fix is to invert the dependency — the decomposer code IS the schema. It declaratively reconciles Memory to support what it needs.

## What Changes

### Architectural shift: decomposer owns the schema contract

The decomposer code becomes the single source of truth for EPF graph types. Type definitions live as Go constants alongside the extraction code. At ingest/sync time, a `Reconcile()` function ensures the Memory project has all needed types — creating missing ones, leaving existing ones unchanged. No separate schema JSON file. No version strings. No drift.

This replaces:
- `.memory/blueprints/epf-engine/packs/epf-engine.json` as a hand-maintained artifact
- `memory schemas install` / `memory schemas uninstall` manual steps
- Schema version tracking (`v2.0.0`, `v2.1.0`)
- The `epf_memory_status` schema version check (replaced by reconciliation status)

### Declarative reconciliation during ingest/sync

- `epf-cli ingest` and `epf-cli sync` call `Reconcile()` as the first pipeline step
- Reconciliation checks existing types in the Memory project against the decomposer's type definitions
- Missing types are created; existing types are left unchanged (additive only)
- Reconciliation is idempotent and safe to run on any project (doesn't remove non-EPF types)

### Decomposer completeness (#12)

**4 new object types extracted from YAML:**
- `IntegrationPoint` from `roadmap.integration_points[]`
- `Constraint` from `feature.constraints[]` and `roadmap.technical_constraints[]`
- `Opportunity` from `insight_analyses.opportunities[]`
- `CrossTrackDependency` from `roadmap.cross_track_dependencies[]`

**8 new structural relationship types:**
- `informs` — Belief → Positioning (beliefs inform positioning claims)
- `constrains` — Assumption → Feature (reverse of `tests_assumption`)
- `delivers` — OKR → Feature (from KR feature references)
- `validates` — Capability → Assumption (proven capability validates tested assumption)
- `shared_technology` — Feature → Feature (overlapping `contributes_to` paths)
- `addresses` — Feature → Opportunity
- `converges_at` — CrossTrackDependency → OKR
- `unlocks` — IntegrationPoint → Feature

Semantic-only relationships remain in `semantic-edges`: `supports`, `contradicts`, `parallels`, `invalidates`.

## Impact

- Affected specs: `epf-semantic-engine`
- Affected code:
  - `apps/epf-cli/internal/decompose/` — new types, relationships, and schema definition constants
  - `apps/epf-cli/internal/ingest/` — reconciliation step added to Ingest() and Sync()
  - `apps/epf-cli/internal/memory/` — type management API methods (or template pack generation)
  - `apps/epf-cli/internal/mcp/memory_tools.go` — reconciliation status in `epf_memory_status`, updated type list
- `.memory/blueprints/epf-engine/packs/epf-engine.json` — deprecated (type definitions move to Go code)
- Graph impact: ~900+ objects, ~2800+ relationships per Emergent instance
- Cascade depth: Beliefs reach Features through `informs` chain
- GitHub issues resolved: #11, #12

## References

- GitHub Issue #12: https://github.com/emergent-company/emergent.strategy/issues/12
- GitHub Issue #11: https://github.com/emergent-company/emergent.strategy/issues/11
