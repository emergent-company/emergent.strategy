# Tasks: Work Package Server Adoption (#47)

> Depends on: canonical-epf#21 (done, v2.28.0) and epf-cli work_package support
> (done, v0.47.0). Run `task dev-deps` (Postgres) and record a test baseline
> before starting.

## 1. Embedded schema + type registry

- [x] 1.1 `task sync-embedded` to bring embedded canonical to 2.28.0 (verify `internal/embedded/VERSION`)
- [x] 1.2 Add `work_package` to `internal/embedded/validator.go` `artifactTypeToSchema`
- [x] 1.3 Add a `work_package` `payloadSignatures` entry for auto-detection
- [x] 1.4 Add `ArtifactTypeWorkPackage = "work_package"` to `internal/domain/models.go`
- [x] 1.5 Add any new relationship kinds (`Rel*`) for WP → value-path / definition / KR edges
- [x] 1.6 Update `internal/embedded/field_manifest.go`; `TestDecomposerFieldsMatchSchemas` green

## 2. Strategic index extraction

- [x] 2.1 Add `work_package` case to `ExtractArtifactFields` (`internal/index/extract.go`)
- [x] 2.2 Add `work_package` case to `ExtractRelationships` (edges to value paths, definitions, KRs)
- [x] 2.3 Unit tests in `internal/index/extract_test.go` (pure-function, no DB)

## 3. Footprint derivation

- [x] 3.1 Compute footprint = unique(value_model_paths ∪ definition_ids); exclude KR ids
- [x] 3.2 Expose footprint (index column and/or MCP tool)
- [x] 3.3 Test: footprint union + KR exclusion

## 4. Status state-machine + events

- [x] 4.1 Enforce allowed transitions: proposed → approved → scheduled → executing → done; cancelled terminal from any non-terminal
- [x] 4.2 Reject illegal transitions with a structured error
- [x] 4.3 Add `work_package.*` event-type constants in `domain/activity/service.go`
- [x] 4.4 Emit a transition event on each committed status change (subscribable via SSE)
- [x] 4.5 Tests: legal transitions accepted, illegal rejected, event emitted

## 5. MCP tools

- [x] 5.1 `list_work_packages` (filter by track / status)
- [x] 5.2 `get_work_package`
- [x] 5.3 `create_work_package` / `approve_work_package` / `transition_work_package`
- [x] 5.4 `get_work_package_footprint`
- [x] 5.5 Register tool→category mappings in `internal/mcpserver/tool_filter.go`
- [x] 5.6 Update tool-count/name assertions in `internal/mcpserver/server_test.go`
- [x] 5.7 MCP integration tests (in-process client) for each tool

## 6. Export/ingest round-trip

- [x] 6.1 Add `work_package` to `export.go` `artifactTypeToDirPath` + `artifactKeyToFilename`
- [x] 6.2 Test: a created WP exports to `work_packages/wp-*.yaml` and re-ingests

## 7. Decomposition decision (see proposal Open Question)

- [x] 7.1 Decide (A) extend frozen `pkg/decompose` vs (B) index-level only
- [x] 7.2 If (B): document that WPs are index/relationship objects, not graph nodes (this change)
- [x] 7.3 If (A): add `decomposeWorkPackages` + register in `DecomposeInstance` (separate, with freeze exception)

## 8. Verification

- [x] 8.1 `go test ./...` green (Postgres up); compare to baseline
- [x] 8.2 `task lint` clean of all real findings (104 → 20 advisory-only gocognit/gocyclo on large pre-existing domain funcs, designated non-blocking by config)
- [x] 8.3 Live check: created → committed → listed (track filter) → footprint correct (KR excluded) → illegal transition rejected → approved → scheduled → cancelled via MCP; `work_package.transitioned` events observed via list_activities (verified against running server, emergent instance)
- [x] 8.4 `openspec validate add-work-package-server-adoption --strict` passes
- [x] 8.5 Close emergent.strategy#47 (closed COMPLETED via commit b20524af + summary comment)
