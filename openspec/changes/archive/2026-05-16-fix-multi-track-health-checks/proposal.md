# Change: Fix Multi-Track Health Checks

## Why

EPF is a four-track framework (Product, Strategy, OrgOps, Commercial) with
definitions in `FIRE/definitions/{product,strategy,org_ops,commercial}/`. But
the health check system — relationship validation, feature quality, cross-
references, and coverage analysis — only inspects `definitions/product/` (`fd-*`
files). The other three tracks are completely invisible.

This means:
- **Invalid `contributes_to` paths** in commercial/org_ops/strategy definitions
  are never caught. The emergent instance currently has 30 broken paths across
  21 definition files — none reported by `epf-cli health`.
- **Coverage analysis** reports `Commercial 0% (0/0)` — zero paths *checked*,
  not zero coverage. Users see "100% healthy" when their commercial definitions
  are structurally broken.
- **Feature quality** checks (persona count, narrative length, capability
  completeness) skip non-product definitions entirely.
- **Cross-reference** validation (dependency IDs) only checks `fd-*` references.

This is a bug, not a feature gap. The health check claims to validate the
instance but silently ignores 75% of the definition surface.

### Evidence

Running `epf-cli ingest --dry-run` against the emergent instance produces
30 warnings about invalid `contributes_to` paths — all in commercial and
org_ops definitions. Running `epf-cli health` reports "87/87 paths valid,
Score 100/100, Grade A" because it only checks the 24 product definitions.

## What Changes

### 1. Feature loader scans all track directories

`internal/relationships/feature_loader.go` currently hardcodes
`FIRE/definitions/product/`. Change to scan all four subdirectories:
`product/`, `strategy/`, `org_ops/`, `commercial/`.

Add a `Track` field to `FeatureDefinition` so downstream code can
distinguish which track a definition belongs to.

### 2. Relationship validation covers all tracks

`internal/checks/relationships.go` validates `contributes_to` paths for
all loaded definitions, not just `fd-*`. Each definition's paths are
checked against the value model for its corresponding track.

### 3. Feature quality checks cover all tracks

`internal/checks/features.go` applies quality checks (personas, narratives,
capabilities) to all definition types, respecting that non-product tracks
may have different schemas with different required fields.

### 4. Cross-reference validation covers all tracks

`internal/checks/crossrefs.go` validates dependency references across
all definition prefixes (`fd-*`, `cd-*`, `sd-*`, `pd-*`), including
cross-track dependencies.

### 5. Coverage analysis reports per-track

`internal/checks/relationships.go` reports coverage for all tracks,
not just product. The health output already shows per-track percentages
but they're 0/0 for non-product tracks because no definitions are loaded.

### 6. Fix the emergent instance data

Update the 21 commercial/org_ops definition files with corrected
`contributes_to` paths (see tasks.md for the complete list).

## Impact

- **Affected specs:** `epf-cli-mcp` (health check tool responses will include
  more findings; MCP tool `epf_health_check` may return lower scores for
  instances with broken non-product definitions)
- **Affected code:**
  - `internal/relationships/feature_loader.go` — scan all 4 directories
  - `internal/relationships/feature_loader_test.go` — test multi-track loading
  - `internal/checks/relationships.go` — validate all tracks
  - `internal/checks/features.go` — quality check all tracks
  - `internal/checks/crossrefs.go` — cross-ref all tracks
  - `internal/checks/coverage.go` — coverage for all tracks
  - `cmd/health.go` — display per-track breakdown
- **Affected data:** 21 definition files in `emergent-epf` instance with
  corrected `contributes_to` paths
- **No changes to `apps/strategy-server/`**
- **Risk:** Instances that currently show "healthy" may show warnings after
  this change. This is by design — the warnings were always there, just hidden.
  This is a **bug fix exception** to the epf-cli freeze.
