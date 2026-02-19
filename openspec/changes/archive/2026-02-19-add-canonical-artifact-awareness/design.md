## Context

The EPF CLI distinguishes between **canonical** and **example** track artifacts at the definition-loader level (`internal/template/definitions.go`), but this distinction does not propagate to health checks, validation, or scoring. The result is false positive warnings for canonical tracks (strategy, org_ops, commercial) where artifacts are framework-provided and intentionally minimal.

The value model templates for all 4 tracks are already embedded in the binary and created at init. Canonical definitions (sd-*, pd-*, cd-*) are not.

### Stakeholders

- AI agents using MCP tools (primary consumers of health check output)
- Human developers running `epf-cli health`

## Goals / Non-Goals

### Goals

- Eliminate false positive health warnings for canonical track artifacts
- Embed canonical definitions in the CLI binary and create them at init
- Provide a reusable mechanism for any health check to query canonical status
- Follow the existing pattern in `valuemodel/quality.go` which already scopes checks to the Product track

### Non-Goals

- Changing the canonical definitions themselves (content remains upstream)
- Adding new MCP tool parameters for canonical awareness (it should be automatic)
- Changing the health report structure or output format
- Making canonical tracks completely invisible in health reports (they should still appear, just scored appropriately)

## Decisions

### Decision 1: Canonical context helper package

**What:** Create a `canonical` package (or add to existing `internal/template`) that provides functions like `IsCanonicalTrack(track string) bool` and `IsCanonicalArtifact(filePath string) bool`.

**Why:** Multiple check files need this logic. Centralizing it avoids scattered hardcoded track lists and makes it easy to update when new canonical content is added.

**Alternatives considered:**
- Pass a config flag through every check function (rejected: too invasive, changes function signatures across 8+ files)
- Use the existing `DefinitionLoader` directly in checks (rejected: it loads full definition content, overkill for a boolean check)

### Decision 2: Separate canonical and product scoring in health reports

**What:** Health checks that produce scores (content readiness, coverage, feature quality) SHALL compute separate metrics for canonical and product tracks. The overall health score SHALL weight product track artifacts more heavily.

**Why:** Canonical artifacts are framework-provided and often intentionally have `active: false` or minimal content. Scoring them the same as user-authored product artifacts inflates warning counts and lowers scores misleadingly.

**Alternatives considered:**
- Skip canonical tracks entirely in health checks (rejected: users need visibility that canonical artifacts exist and are structurally valid)
- Add a `--skip-canonical` flag (rejected: should be automatic, not opt-in)

### Decision 3: Embed canonical definitions via existing sync-embedded.sh

**What:** Extend `scripts/sync-embedded.sh` to copy canonical definitions into `internal/embedded/templates/READY/definitions/` (or similar). Add corresponding `//go:embed` directives in `embedded.go`.

**Why:** This follows the exact pattern already used for value model templates. The sync script already copies from the `canonical-epf` repo.

**Alternatives considered:**
- Load definitions from a network URL at runtime (rejected: CLI must work offline)
- Bundle as a separate data file alongside the binary (rejected: single-binary distribution is a key constraint)

### Decision 4: Init creates canonical definitions with 3-tier priority

**What:** `cmd/init.go` SHALL create canonical definitions using the same 3-tier loading priority already used for value models: instance files > canonical_path config > embedded fallback.

**Why:** Consistent behavior with existing value model template creation. Users who have a local `canonical-epf` checkout get fresh content; others get the embedded version.

## Risks / Trade-offs

- **Binary size increase:** Embedding canonical definitions adds ~50-100KB to the binary. Acceptable given value models already add more.
- **Sync freshness:** Embedded definitions may lag behind the canonical-epf repo. Mitigated by the 3-tier loading priority and the existing `sync-embedded.sh` workflow.
- **Canonical track evolution:** If the list of canonical tracks changes, the helper needs updating. Mitigated by centralizing the logic in one place.

## Open Questions

- Should the health report explicitly label sections as "canonical" vs "product" in the output? (Leaning yes for transparency.)
- Should canonical definitions be created in a `READY/definitions/` subdirectory or alongside other READY artifacts? (Follow existing convention from init.go.)
