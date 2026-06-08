# Change: Work Package Server Adoption — Decompose, State-Machine, Footprint, MCP Tools

## Why

canonical-epf v2.28.0 (epf-canonical#21) defines the `work_package` artifact
type — the bounded, four-track statement-of-work execution unit. epf-cli v0.47.0
already recognizes and validates it. strategy-server must now make the work
package a **live, queryable, event-emitting graph object** so that the
implementation orchestrator (`apps/orchestrator`) and ecosystem partners
(21st/org_ops, sequence/commercial) can consume it as the tool-agnostic handover
contract.

This realizes the design captured in `add-work-package-contract` on the
strategy-server side, and resolves emergent.strategy#47.

## Design Principles

1. **Schema is the source of truth.** The `work_package` schema is synced from
   canonical-epf; strategy-server adds behavior, never validation rules that
   contradict the schema.
2. **Footprint is derived, not authored.** strategy-server computes a work
   package's footprint as the union of `targets.value_model_paths` +
   `targets.definition_ids`, so an authoring tool cannot under-declare it.
   `kr_ids` are tracked as targets but are NOT part of the footprint (per the
   schema `$comment`).
3. **The work package is the shared state machine.** Status transitions
   (`proposed → approved → scheduled → executing → done`, plus terminal
   `cancelled`) are enforced server-side and emitted as subscribable events.
4. **Thin contract preserved.** No task model is added; tasks remain
   substrate-owned.

## What Changes

### 1. Embedded schema + artifact-type registry
- Sync embedded canonical from current `2.27.7` to `2.28.0`
  (`internal/embedded/`, via `task sync-embedded`).
- Register `work_package` in `internal/embedded/validator.go`
  (`artifactTypeToSchema` ~L24-42 and `payloadSignatures` ~L57-70 for
  auto-detection).
- Add `ArtifactTypeWorkPackage = "work_package"` to
  `internal/domain/models.go` (~L173-186), plus any new relationship kinds in
  the `Rel*` consts (~L188-199).

### 2. Strategic index extraction
- Add a `work_package` case to `internal/index/extract.go`:
  - `ExtractArtifactFields` (~L39 switch) — index id, title, track, status,
    risk_class, lifecycle.
  - `ExtractRelationships` (~L131) — emit edges from the work package to its
    target value-model paths, definition ids, and KR ids.
- Update `internal/embedded/field_manifest.go` so the
  `TestDecomposerFieldsMatchSchemas` reconciliation passes.

### 3. Footprint derivation
- Compute footprint = unique(`value_model_paths` ∪ `definition_ids`) from a
  committed work-package payload; expose it for the orchestrator (via the index
  and/or an MCP tool). KR ids excluded from the footprint by design.

### 4. Status state-machine + events
- Enforce the allowed transitions of `status` on work-package mutations
  (`domain/strategy/service.go` Stage/CommitBatch path); reject illegal
  transitions.
- Emit each transition to the activity stream
  (`domain/activity/service.go`) — add `work_package.*` event-type constants —
  so connected systems can subscribe via the existing SSE mechanism. This
  augments, not replaces, the AIM heartbeat / post-commit pipeline
  (`internal/pipeline/postcommit.go`).

### 5. MCP tools
- Add tools (mirroring `list_features` / `create_feature` patterns in
  `internal/mcpserver/server.go`):
  - `list_work_packages` (filter by track / status)
  - `get_work_package`
  - `create_work_package` / `approve_work_package` / `transition_work_package`
  - `get_work_package_footprint`
- Register tool→category mappings in
  `internal/mcpserver/tool_filter.go`; update tool-count/name assertions in
  `internal/mcpserver/server_test.go`.

### 6. Export/ingest paths
- Add `work_package` to `domain/strategy/export.go`
  (`artifactTypeToDirPath` ~L28, `artifactKeyToFilename` ~L77) so work packages
  round-trip to `work_packages/wp-*.yaml`.

## Open Question — graph decomposition vs. frozen epf-cli

The canonical graph decomposer lives in `apps/epf-cli/pkg/decompose/`, which
strategy-server imports — but epf-cli is **frozen** per repo instructions. Two
options, to be decided during implementation:

- **(A)** Add a `decomposeWorkPackages` to `pkg/decompose` (requires an explicit
  exception to the freeze, since it's a `pkg/` consumed by strategy-server).
- **(B)** Keep graph decomposition strategy-server-local via
  `internal/index/extract.go` only, and defer full graph-object decomposition.

Recommendation: **(B)** for this change (index-level adoption is enough for the
orchestrator's footprint + status needs); revisit (A) if work packages need to
appear as first-class nodes in the semantic graph.

## Impact

- Affected specs: `strategy-orchestration` (extended — server-side requirements)
- Affected code: `internal/embedded/`, `internal/domain/models.go`,
  `internal/index/extract.go`, `domain/strategy/{service,export}.go`,
  `domain/activity/service.go`, `internal/pipeline/postcommit.go`,
  `internal/mcpserver/{server,tool_filter,server_test}.go`.
- DB: status-transition enforcement uses existing `strategy_mutations`; new
  activity event types use existing `strategy_activities`. No new table expected.
- Depends on: canonical-epf#21 (done, v2.28.0), epf-cli work_package support
  (done, v0.47.0).

## Non-Goals

- **Wave scheduling / scorecard.** Those live in `apps/orchestrator`.
- **Executing tasks.** Substrate-owned (coding agent / 21st / sequence).
- **Per-track posture.** Unified for now.
- **A task model on the work package.** Tasks stay substrate-owned.
- **Modifying frozen epf-cli** beyond the decompose decision above.
