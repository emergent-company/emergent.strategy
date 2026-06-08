# Tasks: Work Package Server Adoption (#47)

> Depends on: canonical-epf#21 (done, v2.28.0) and epf-cli work_package support
> (done, v0.47.0). Run `task dev-deps` (Postgres) and record a test baseline
> before starting.

## 1. Embedded schema + type registry

- [ ] 1.1 `task sync-embedded` to bring embedded canonical to 2.28.0 (verify `internal/embedded/VERSION`)
- [ ] 1.2 Add `work_package` to `internal/embedded/validator.go` `artifactTypeToSchema`
- [ ] 1.3 Add a `work_package` `payloadSignatures` entry for auto-detection
- [ ] 1.4 Add `ArtifactTypeWorkPackage = "work_package"` to `internal/domain/models.go`
- [ ] 1.5 Add any new relationship kinds (`Rel*`) for WP → value-path / definition / KR edges
- [ ] 1.6 Update `internal/embedded/field_manifest.go`; `TestDecomposerFieldsMatchSchemas` green

## 2. Strategic index extraction

- [ ] 2.1 Add `work_package` case to `ExtractArtifactFields` (`internal/index/extract.go`)
- [ ] 2.2 Add `work_package` case to `ExtractRelationships` (edges to value paths, definitions, KRs)
- [ ] 2.3 Unit tests in `internal/index/extract_test.go` (pure-function, no DB)

## 3. Footprint derivation

- [ ] 3.1 Compute footprint = unique(value_model_paths ∪ definition_ids); exclude KR ids
- [ ] 3.2 Expose footprint (index column and/or MCP tool)
- [ ] 3.3 Test: footprint union + KR exclusion

## 4. Status state-machine + events

- [ ] 4.1 Enforce allowed transitions: proposed → approved → scheduled → executing → done; cancelled terminal from any non-terminal
- [ ] 4.2 Reject illegal transitions with a structured error
- [ ] 4.3 Add `work_package.*` event-type constants in `domain/activity/service.go`
- [ ] 4.4 Emit a transition event on each committed status change (subscribable via SSE)
- [ ] 4.5 Tests: legal transitions accepted, illegal rejected, event emitted

## 5. MCP tools

- [ ] 5.1 `list_work_packages` (filter by track / status)
- [ ] 5.2 `get_work_package`
- [ ] 5.3 `create_work_package` / `approve_work_package` / `transition_work_package`
- [ ] 5.4 `get_work_package_footprint`
- [ ] 5.5 Register tool→category mappings in `internal/mcpserver/tool_filter.go`
- [ ] 5.6 Update tool-count/name assertions in `internal/mcpserver/server_test.go`
- [ ] 5.7 MCP integration tests (in-process client) for each tool

## 6. Export/ingest round-trip

- [ ] 6.1 Add `work_package` to `export.go` `artifactTypeToDirPath` + `artifactKeyToFilename`
- [ ] 6.2 Test: a created WP exports to `work_packages/wp-*.yaml` and re-ingests

## 7. Decomposition decision (see proposal Open Question)

- [ ] 7.1 Decide (A) extend frozen `pkg/decompose` vs (B) index-level only
- [ ] 7.2 If (B): document that WPs are index/relationship objects, not graph nodes (this change)
- [ ] 7.3 If (A): add `decomposeWorkPackages` + register in `DecomposeInstance` (separate, with freeze exception)

## 8. Verification

- [ ] 8.1 `go test ./...` green (Postgres up); compare to baseline
- [ ] 8.2 `task lint` clean
- [ ] 8.3 Live check: create → approve → schedule a WP via MCP; footprint correct; events observed
- [ ] 8.4 `openspec validate add-work-package-server-adoption --strict` passes
- [ ] 8.5 Close emergent.strategy#47
