# Design: Load the graph type contract from the canonical ontology

## Context

- `internal/decompose/schema.go` builds `[]ObjectTypeDef` and `[]RelTypeDef`
  in code. `ObjectTypeNames`, `GenerateTemplatePack` and `GenerateAskContext`
  derive from them.
- Edge properties are set inline in each `add*Edges` function
  (`weight`, `edge_source`, sometimes `confidence` or `strength`).
- `internal/embedded` uses `go:embed` over directories written by
  `scripts/sync-embedded.sh`; the embedded content must never be hand-edited.
- The canonical registry (epf-canonical `add-strategy-ontology`) declares per
  type: name, description, group, phase, inertia tier, sources, identity; per
  relation: name, description, from, to, cardinality, class, provenance,
  `carried_by`. It has no presentation fields.

## Decisions

### D1. Registry is loaded at init, overlay is Go

`internal/embedded` gets `//go:embed ontology/*.yaml` and an `Ontology()`
accessor that parses once and panics on a malformed embedded file (it is
validated in canonical CI, so a parse failure is a build defect, caught by a
test).

`decompose` keeps `ObjectTypeDef` and `RelTypeDef` and fills them from the
registry. A Go map `presentation[typeName] = {Label, Icon, Color}` supplies UI
fields. A test fails if a registry type has no overlay entry or an overlay
entry has no registry type.

`ObjectTypeDef.Properties` are not in the registry (canonical keeps properties
in the JSON Schemas). They stay in Go, keyed by type name, with the same
two-way completeness test.

### D2. Parity before deletion

Task order: load the registry beside the existing lists, assert that names,
descriptions, inertia tiers, endpoints and edge sources are equal, then delete
the literal lists. If canonical and Go differ, canonical is fixed (PATCH), not
the test.

### D3. Provenance is a new edge property, not a new edge_source

`edge_source` drives existing behaviour (weights, the semantic/causal split,
`GenerateAskContext` skipping semantic edges). Changing it from `structural` to
`inferred` for the six guessed relations would change ripple results. Adding
`provenance` changes nothing that reads the graph today, and gives
`adopt-explicit-strategy-references` and future weighting a field to use.

The edge-building helper looks up the relation's provenance in the registry,
so individual `add*Edges` functions do not set it by hand. Embedding and
evidence edges written outside the decomposer (`domain/evidence`,
`register_evidence_tools.go`) use the same helper.

### D4. Memory schema

`task ontology:pack` writes the blueprint pack from `GenerateTemplatePack()`.
A test regenerates it in memory and compares with the committed file.

On startup with Memory configured, the server lists installed schemas. If the
EPF pack is absent it installs it; if a different version is installed it logs
a warning and continues (it does not overwrite, because the project may be
shared — see `fence-memory-graph-per-instance`). Open question 1.

### D5. Reads

Graph neighborhood and contradiction responses add `provenance` per edge when
the stored edge has it; older edges without it report `unknown` until re-ingest.

## Risks

- **Load order.** Registry parse moves from compile time to init. Covered by a
  test that loads the embedded registry.
- **Drift during the transition.** Until the Go lists are deleted there are two
  definitions; D2 keeps the window to one change.

## Open Questions

1. Install on startup, or only verify and leave installation to the
   blueprint workflow? Proposed: install only when absent.
2. Should the `ask` context include provenance so answers can say "inferred"?
   Proposed: yes, one line per relation.
