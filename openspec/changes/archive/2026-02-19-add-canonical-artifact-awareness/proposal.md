# Change: Add Canonical Artifact Awareness to Health Checks and Init

## Why

EPF health checks, validation, and scoring treat all tracks equally, producing false positives for canonical (framework-provided) artifacts in strategy, org_ops, and commercial tracks. Canonical definitions (sd-*, pd-*, cd-*) are not embedded in the CLI binary and are not created during `epf init`, unlike value model templates which already are.

## What Changes

- **Embed canonical definitions** in the CLI binary alongside the already-embedded value model templates
- **Create canonical definitions at init time** when initializing new EPF instances
- **Propagate the existing `DefinitionType` concept** (canonical vs example) from `internal/template/definitions.go` into all health check and validation code paths
- **Suppress or adjust scoring** for canonical tracks in content readiness, coverage analysis, feature quality, relationship checks, and AIM health diagnostics
- **Add a `canonical_context` helper** that health check functions can query to determine whether a given file/track/artifact is canonical

## Impact

- Affected specs: `epf-cli-mcp`
- Affected code:
  - `apps/epf-cli/internal/embedded/embedded.go` (new embed directives for definitions)
  - `apps/epf-cli/cmd/init.go` (create canonical definitions at init)
  - `apps/epf-cli/scripts/sync-embedded.sh` (sync canonical definitions from upstream)
  - `apps/epf-cli/internal/checks/instance.go` (content readiness canonical exclusions)
  - `apps/epf-cli/internal/checks/coverage.go` (track-aware coverage scoring)
  - `apps/epf-cli/internal/checks/relationships.go` (canonical-aware relationship scoring)
  - `apps/epf-cli/internal/checks/features.go` (track context for feature quality)
  - `apps/epf-cli/internal/checks/versions.go` (canonical version alignment)
  - `apps/epf-cli/internal/checks/crossrefs.go` (canonical track awareness)
  - `apps/epf-cli/internal/aim/health.go` (canonical track thresholds for AIM)
  - `apps/epf-cli/cmd/health.go` (health orchestration)
- No breaking changes to MCP tool interfaces or CLI flags
- Existing health report structure unchanged; scores become more accurate
