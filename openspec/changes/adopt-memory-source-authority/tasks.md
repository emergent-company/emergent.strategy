# Tasks: Act as an authoritative source for emergent.memory

Record the baseline first: `cd apps/strategy-server && go test ./...` with
Postgres up (`task dev-deps`). Expected: all packages pass.

Write each test in section 5 before the code it covers, and see it fail. Tests
use the mocked Memory server from `phase2d_test.go`; extend it where it cannot
express properties or relationships between foreign and owned objects.

Sections 1 and 3 can ship before `fence-memory-graph-per-instance` slice 2.
Sections 2 and 4 depend on its scoped read helper.

## 1. Source descriptor and revision on writes

- [ ] 1.1 Verify in emergent.memory source whether a property-only change on
      `PUT /api/graph/objects/upsert` triggers re-embedding; record the answer
      and commit hash in design.md risk 1.
- [ ] 1.2 Add a canonical payload hash helper in `domain/ingest` (sorted-key
      JSON, sha256, 16 hex chars), reusing the text already built for
      `memory_content_hash`.
- [ ] 1.3 Stamp `properties.source`, `properties.source_schema` (ontology
      version; EPF schema version until `adopt-canonical-ontology` lands),
      `properties.layer` (from the registry, once available) and
      `properties.source_revision` on every artifact-layer object.
- [ ] 1.4 Stamp the same on decomposed objects, with `source_revision` taken
      from the parent artifact and `properties.content_revision` for the
      decomposed object's own content.
- [ ] 1.5 Confirm `strategy-server import --reingest` uses the same path
      (fence removes the private writer; assert it here).

## 2. Revision-bound ripple classification

- [ ] 2.1 Route the artifact lookup in `SemanticAnalyzer.ClassifyChange` through the scoped
      read helper.
- [ ] 2.2 Compare the indexed object's `source_revision` with the hash of the
      pre-change payload; on mismatch or absence, use text fallback and cap the
      authority tier at `gated`.
- [ ] 2.3 Extend `SemanticChangeResult` with `memory_key`,
      `expected_revision` and `observed_revision`; store them with the batch.

## 3. Origin and dismissal

- [ ] 3.0 Use the shared origin shape from `decide-strategy-source-of-truth`
      D6 (kind, producer, inputs with revisions); coordinate the Go type with
      the suggestion service in `adopt-explicit-strategy-references`.

- [ ] 3.1 Add `origin` to `ripple_signals.metadata` for signals produced by
      drift, tension, clustering, vertical alignment and change classification.
- [ ] 3.2 When a batch resolves signals, write `adopted_from` entries into
      `strategy_mutations.batch_metadata`.
- [ ] 3.3 On `dismiss_signal` for a Memory-derived signal, store the source
      and target revisions; suppress new signals of the same type for the same
      pair while both revisions are unchanged.
- [ ] 3.4 Expose `origin` in `list_signals` results.

## 4. Opt-in synthesized reads

- [ ] 4.1 Add `include_synthesized` to the scoped read helper (default false)
      with the anchoring rule from design D6.
- [ ] 4.2 Add `class` to semantic results (`source` | `synthesized`).
- [ ] 4.3 Add the optional `include_synthesized` parameter to
      `search_strategy` and `get_neighbors`; update tool descriptions (i18n
      keys, no hard-coded strings).
- [ ] 4.4 Measure added latency for anchoring checks at the default result
      limit; record it in design.md risk 2.

- [ ] 4.5 Classify edges with ontology provenance `inferred` or `embedding`
      as `class: synthesized` in semantic results, and exclude them from the
      evidence ripple uses to grant the autonomous tier.

## 5. Tests

- [ ] 5.1 Ingest stamps `source`, `source_schema`, `source_revision` on
      artifact and decomposed objects.
- [ ] 5.2 Re-ingest without content change leaves `source_revision` unchanged
      and creates no new object version.
- [ ] 5.3 Re-commit with identical payload but a new mutation id leaves
      `source_revision` unchanged.
- [ ] 5.4 Classification with matching revision uses the Memory score.
- [ ] 5.5 Classification with a stale indexed revision falls back to text and
      never returns the autonomous tier.
- [ ] 5.6 Classification with the object missing falls back and caps at
      `gated`.
- [ ] 5.7 A Memory-derived signal stores `origin`; a structural signal does
      not.
- [ ] 5.8 Resolving a Memory-derived signal through `commit_batch` records
      `adopted_from` on the mutation.
- [ ] 5.9 A dismissed drift signal is not re-raised for the same pair while
      revisions are unchanged, and is raised again after either artifact
      changes.
- [ ] 5.10 Default search returns no object without `source =
      strategy-server`, even if it links to owned objects.
- [ ] 5.11 With `include_synthesized`, a synthesized object linked only to the
      instance's projected objects is returned with `class: synthesized`.
- [ ] 5.12 With `include_synthesized`, a synthesized object linked to another
      instance's object is not returned.
- [ ] 5.13 A keyword-inferred edge is returned with `class: synthesized`
      and does not make a change eligible for the autonomous tier.
- [ ] 5.14 No code path writes Postgres strategy data from a Memory read
      (architecture test alongside the fence's read-helper test).

## 6. Documentation

- [ ] 6.1 Update `apps/strategy-server/AGENTS.md` with the source / synthesized
      / adopted model and the meaning of `class` in results.
- [ ] 6.2 Link emergent.memory#2376 from the semantic engine docs as the
      upstream contract this change anticipates.
