# Tasks: Load the graph type contract from the canonical ontology

Precondition: epf-canonical with `ontology/` released. Baseline first:
`cd apps/strategy-server && go test ./...` with Postgres up
(`task dev-deps`); record what passes. Write each test before the code it
covers and see it fail. epf-cli is not touched.

## 1. Embed

- [ ] 1.1 `scripts/sync-embedded.sh`: copy `ontology/*.yaml`; update
      `MANIFEST.txt` and `integrity-manifest.json` handling.
- [ ] 1.2 `internal/embedded`: `go:embed ontology/*.yaml`, `Ontology()`
      accessor with typed structs; test that the embedded registry parses.
- [ ] 1.3 `task sync-embedded` against the released canonical tag; commit the
      synced content.

## 2. Type contract

- [ ] 2.1 Build `ObjectTypes()` / `RelationshipTypes()` from the registry plus
      a Go presentation overlay and a Go property map (design D1). Keep the old
      literal lists as `legacyObjectTypes()` for now.
- [ ] 2.2 Parity test: registry-built lists equal the legacy lists (names,
      descriptions, tiers, endpoints, edge sources). Fix differences in
      canonical, not in the test.
- [ ] 2.3 Overlay and property-map completeness tests (both directions).
- [ ] 2.4 Delete the legacy lists.

## 3. Conformance

- [ ] 3.1 Test: decompose `internal/decompose/testdata` and every instance
      fixture; every object type, edge type and endpoint pair is declared.
- [ ] 3.2 Same check as a debug assertion in the ingest path (log at warn,
      do not fail ingest).

## 4. Provenance

- [ ] 4.1 Single edge-construction helper that sets `provenance` from the
      registry; route all `add*Edges` functions through it.
- [ ] 4.2 Route evidence edges (`domain/evidence/service.go`,
      `internal/mcpserver/register_evidence_tools.go`) through it.
- [ ] 4.3 Test: for every relation, edges carry the registry provenance;
      `edge_source` and `weight` are unchanged from a recorded snapshot of the
      test-instance graph.
- [ ] 4.4 `domain/semantic`: neighborhood and contradiction responses include
      `provenance` (`unknown` when missing); MCP tool output schemas updated.

## 5. Memory schema

- [ ] 5.1 `task ontology:pack` writes
      `.memory/blueprints/epf-engine/packs/epf-engine.json` from
      `GenerateTemplatePack()`; regenerate and commit (adds the five navigation
      types).
- [ ] 5.2 Test comparing the committed pack with the generated one.
- [ ] 5.3 Startup: when Memory is configured, list installed schemas and install
      the pack if absent; warn on version mismatch (design D4, open question 1).

## 6. Docs and verification

- [ ] 6.1 Update the `schema.go` header comment, `AGENTS.md` semantic-engine
      section and `openspec/project.md`: canonical registry is the source of
      truth.
- [ ] 6.2 `go test ./...` and `task lint` pass; compare with baseline.
- [ ] 6.3 Re-ingest a test instance against a local Memory; confirm the
      navigation types are accepted and edges carry provenance.
