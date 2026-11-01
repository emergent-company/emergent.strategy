# Change: Load the graph type contract from the canonical ontology

strategy-server stops being the definition of EPF's entity and relationship
model and becomes its reference implementation: the decomposer's types come
from canonical `ontology/epf_ontology.yaml`, and every edge records how it was
established.

Depends on: epf-canonical `add-strategy-ontology` (released as a MINOR
version). Related: `fence-memory-graph-per-instance` (touches ingest, not the
type contract), `retire-epf-cli` (epf-cli is not changed here).
Follow-up: `adopt-explicit-strategy-references`.
Frame: implements D2 (canonical EPF defines the language) and D7 (layer
classification) of `decide-strategy-source-of-truth`.

## Why

The graph type contract exists in three hand-maintained copies that already
disagree:

| Copy | Object types | Relation types |
|---|---|---|
| `apps/strategy-server/internal/decompose/schema.go` | 35 | 30 |
| `apps/epf-cli/internal/decompose/schema.go` | 35 (identical) | 30 |
| `.memory/blueprints/epf-engine/packs/epf-engine.json` | 33 | 27 |

The Memory blueprint pack is missing `InteractionContext`, `NavigationGuard`,
`guards`, `navigation_transition` and `realizes`, which the decomposer emits.
strategy-server does not install a schema itself (`InstallSchema` has no
callers; only epf-cli's `reconcile.go` uses `GenerateTemplatePack`), so which
types Memory accepts depends on which copy was applied last.

`schema.go` says it is "the schema source of truth", so the meaning of EPF is
defined in this binary. Canonical EPF now has a registry for that
(`add-strategy-ontology`), seeded from this file.

Separately, six relation types are created by keyword and name matching in
`decompose_crossrefs.go` but carry `edge_source: structural`, the same label as
an edge read from an ID field. Neighborhood reads, contradiction detection and
ripple cannot tell a guess from a stored link.

## What Changes

- **Sync.** `scripts/sync-embedded.sh` copies `ontology/` from canonical;
  `internal/embedded` exposes the registry.
- **Type contract from the registry.** `decompose.ObjectTypes()` and
  `RelationshipTypes()` are built from the embedded registry. Icons, colours and
  labels stay in Go as a presentation overlay keyed by type name. The
  hand-written type lists are deleted after a parity test passes.
- **Conformance.** A test decomposes the test instances and fails if any
  object or edge type, or any edge's endpoint types, is not declared in the
  registry.
- **One Memory schema.** A task generates the blueprint pack from the registry
  (`GenerateTemplatePack`), and a test fails when the committed pack differs.
  strategy-server installs or verifies the pack on startup when Memory is
  configured.
- **Layer.** The registry's `layer` (definition, runtime, synthesis; added by
  epf-canonical `add-strategy-ontology`) is part of the loaded type contract,
  so ingest can stamp it on projected objects (`adopt-memory-source-authority`)
  and tools can tell runtime and synthesis types from definitions.
- **Edge provenance.** Every edge gets a `provenance` property from the
  registry (`explicit`, `containment`, `derived`, `inferred`, `embedding`).
  `edge_source` and weights are unchanged, so propagation behaves as before.
  Graph neighborhood and contradiction results include provenance.

## Non-Goals

- Changing epf-cli. It is frozen and keeps its own `schema.go` until removal.
- Changing which edges are produced or their weights. Same graph, now labelled.
- Reading new reference fields (`adopt-explicit-strategy-references`).

## Impact

- **Affected specs:** `strategy-semantic` (added requirements).
- **Code:** `scripts/sync-embedded.sh`, `internal/embedded/`,
  `internal/decompose/schema.go` and the edge-building functions,
  `domain/semantic` (neighborhood and contradiction responses), startup wiring
  for schema install/verify, `Taskfile.yml`.
- **Repo:** `.memory/blueprints/epf-engine/packs/epf-engine.json` becomes
  generated.
- **Behaviour:** Memory gains the five missing navigation types. No edge,
  weight or ripple score changes. MCP responses gain a `provenance` field
  (additive).
