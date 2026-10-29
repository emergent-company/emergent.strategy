# Tasks: Read stored references instead of guessing links

Precondition: `adopt-canonical-ontology` merged; epf-canonical
`unify-reference-identity` on a branch with fixtures. Baseline first:
`cd apps/strategy-server && go test ./...` with Postgres up; record what
passes. Write each test before the code it covers.

Order: 1, then 2-5 in parallel, then 6. 7 closes the change.

## 1. Embedded content

- [ ] 1.1 `task sync-embedded` against the canonical 3.0.0 branch (schemas,
      templates, ontology 2.0.0). Pin the commit in the PR description.
- [ ] 1.2 Update test instances under `internal/decompose/testdata` to 3.0.0
      with the canonical migration; keep one 2.x fixture for import tests.

## 2. Decomposer

- [ ] 2.1 Generic reader for `carried_by` fields (ID list and single ID) driven
      by the registry; edges with `provenance: explicit`.
- [ ] 2.2 Remove edge creation from the six `add*Edges` functions in
      `decompose_crossrefs.go` and the keyword part of
      `addTrendInformsInsightEdges`.
- [ ] 2.3 Exact value-model resolution; remove `normalizeVMCPath` use from the
      decomposer.
- [ ] 2.4 `SwotOpportunity` split; update presentation overlay and property map.
- [ ] 2.5 Tests: stored links produce edges; keyword overlap alone does not;
      unresolved IDs are skipped with a warning.

## 3. Link suggestions

- [ ] 3.1 `domain/linksuggest`: port the matching rules unchanged; return
      suggestions; filter stored and rejected links. Table tests reuse the old
      crossref test cases.
- [ ] 3.2 Store rejections per instance (migration + bun model).
- [ ] 3.3 MCP tools `list_link_suggestions` (read),
      `accept_link_suggestion` and `reject_link_suggestion` (write; accept
      stages a mutation). Access map entries.
- [ ] 3.4 Web UI: suggestions beside reference pickers; i18n keys.

## 4. Write path

- [ ] 4.1 Reference validation after schema validation, batch-aware; new error
      code with field, value and valid IDs.
- [ ] 4.2 ID assignment for list entities without `id`; assigned IDs in the
      stage response.
- [ ] 4.3 Web UI reference pickers for the reference fields (ID plus readable
      name).
- [ ] 4.4 Update write-tool descriptions to the 3.0.0 reference form.

## 5. Import migration

- [ ] 5.1 Port the canonical migration to Go (`domain/instance/migratev3`);
      `epfvaluemodel` cross-convention matching is used only here.
- [ ] 5.2 Fixture parity test against the canonical fixtures.
- [ ] 5.3 Wire into GitHub import, instance import and the local repo source;
      store original and migrated payloads as two versions.
- [ ] 5.4 Store the report; MCP tool and web page to read it; load suggestions.

## 6. Re-ingest

- [ ] 6.1 Trigger full re-ingest after migration (scoped per instance once
      `fence-memory-graph-per-instance` lands).
- [ ] 6.2 Regenerate the Memory pack (`task ontology:pack`) for ontology 2.0.0.

## 7. Verification

- [ ] 7.1 `go test ./...` and `task lint` pass; compare with baseline.
- [ ] 7.2 Import a real 2.x instance copy into a local server; record dropped
      guessed edges, suggestions offered, unresolved references, and the change
      in equilibrium score.
- [ ] 7.3 Confirm with epf-canonical that its release gate (section 6 of
      `unify-reference-identity`) is met.
