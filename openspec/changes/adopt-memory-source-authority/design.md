# Design: Act as an authoritative source for emergent.memory

Line references: strategy-server at `main` @ `fd922a7`; emergent.memory at
`main` as of 2026-11-01.

## Model

Three classes of data, each with one owner:

| Class | Owner | Written by | In Memory |
|---|---|---|---|
| Source | strategy-server (Postgres ledger) | `domain/ingest` only | Artifact and decomposed layers, stamped by the fence |
| Synthesized | Memory | Memory extraction, inference, agents | Objects that link to source objects; never written by strategy-server |
| Adopted | strategy-server | The normal mutation path (`commit_batch`, autonomous ripple) | Comes back as source data on the next ingest; origin kept in Postgres |

strategy-server is a subsystem client on the write side (it pushes, Memory
indexes and enriches) and a peer on the read side (it may consult synthesis,
but decides itself what becomes strategy).

## Goals

| # | Invariant |
|---|---|
| S1 Source authority | No code path writes Postgres strategy data from a Memory read. Memory results only rank, suggest or classify. |
| S2 Write ownership | strategy-server writes and deletes only objects it owns (fence I1). It never updates an object it did not write. |
| S3 Revision visibility | Every source object in Memory carries the content revision it represents. |
| S4 Revision-bound decisions | A Memory-derived value that influences an authority decision is used only if it was computed against the expected source revision. |
| S5 Origin | Every mutation that resolves a Memory-derived signal records that origin. |
| S6 Labelled synthesis | Synthesis is returned only on request, only when anchored entirely in the caller's instance projection, and always labelled. |

## Decisions

### D1 — `source_revision` is a content hash, not a mutation id

`strategy_artifacts.mutation_id` changes on import, restore and re-commit even
when the payload is identical. Writing it onto objects would create a Memory
version per ingest, which the fence explicitly avoids. A hash of the canonical
payload (sorted-key JSON, sha256, first 16 hex chars) changes only when content
changes. The ingest service already computes canonical payload text for
`memory_content_hash`; the per-object hash reuses it.

Decomposed objects carry the revision of the artifact they were decomposed
from, plus their own content hash, so a reader can tie them to their parent.

When `adopt-git-release-model` lands (`decide-strategy-source-of-truth` D4),
the projection is of a release, and `source_revision` becomes the release
commit plus this content hash. The content hash stays the part that decides
whether an object is rewritten.

**Risk:** Memory may re-embed when any property changes, not only text
content. Task 1.1 verifies emergent.memory's embedding trigger before the
property is added. If it re-embeds on property changes, the one-time cost is
paid during the fence's forced re-ingest, and steady state is still unchanged
because the hash only moves with content.

### D2 — Source descriptor as properties; schema pack generated from the ontology

*Amended to align with `decide-strategy-source-of-truth` D5 and
`adopt-canonical-ontology`. An earlier draft said strategy-server should not
install a schema pack; that is reversed.*

The source pushes its schema as well as its data. `adopt-canonical-ontology`
generates the Memory schema pack from the canonical ontology registry and
installs or verifies it on startup. A schema pack is data in Memory, so this
does not make Memory EPF-aware; it lets Memory and its agents know what the
source's types and relations mean.

In addition, each object carries:

- `properties.source = "strategy-server"`;
- `properties.source_schema` = the ontology version the pack was generated
  from (the registry's `ontology_version`), so a reader can match an object to
  the pack that describes it;
- `properties.layer` = the type's layer from the registry (`definition` or
  `runtime`; strategy-server never writes `synthesis`).

Until `adopt-canonical-ontology` lands, `source_schema` holds the embedded EPF
schema version and `layer` is omitted. When Memory gains native source-owned
schema (emergent.memory#2376, open question 3), the pack is registered against
the source instead of the project.

### D2b — Synthesis is classified by provenance

The ontology records how each relation is established (`explicit`,
`containment`, `derived`, `inferred`, `embedding`). Under
`decide-strategy-source-of-truth` D7, `inferred` and `embedding` relations are
synthesis even when strategy-server's decomposer produces them today. Until
`adopt-explicit-strategy-references` removes the text heuristics, edges with
those provenances are returned with `class: synthesized` in semantic results,
not `source`, and never count as structural evidence for ripple's autonomous
tier.

### D3 — Ripple classification checks the revision before trusting the score

`SemanticAnalyzer.ClassifyChange` (`domain/ripple/semantic.go:61`, search at ~:89) searches with
the new text and finds the artifact's object by key. It assumes that object
holds the old content. The change:

1. Compute the expected revision from the pre-change payload.
2. Find the artifact's object through the scoped read helper (fence D3), not
   unscoped `Search`.
3. If `properties.source_revision` differs from the expected revision, or the
   object is absent, use `classifyByTextFallback` and cap the tier at
   `gated`.
4. Record `method`, `memory_key`, `score`, `expected_revision` and
   `observed_revision` in the classification result, so it can be stored with
   the batch.

Capping at `gated` keeps the autonomous path exclusive to classifications
that are provably computed against the right state.

### D4 — Origin in existing JSONB columns

No new tables. When a signal is created by a Memory-backed analyzer, its
`ripple_signals.metadata` gains an `origin` object:

```json
{
  "origin": {
    "kind": "memory_analysis",
    "analyzer": "drift|tension|clustering|vertical_alignment|change_classification",
    "memory_objects": [{"key": "...", "score": 0.81, "source_revision": "..."}],
    "projection_generation": 0
  }
}
```

This is the shared origin shape from `decide-strategy-source-of-truth` D6
(kind, producer, inputs and their revisions); suggestions, AIM
recommendations and git imports use the same shape with their own `kind`.
`projection_generation` is the fence's `memory_generation` once slice 2 ships
(0 until then). When a batch resolves signals, `strategy_mutations.batch_metadata`
gets `adopted_from: [{signal_id, origin}]`. This lets a later analysis exclude
content that was itself adopted from Memory when it looks for independent
corroboration, and it gives the memory team the data they need if they build
a feedback API.

### D5 — Dismissal suppression keyed on revisions

A dismissed Memory-derived signal stores the source revisions of its source
and target artifacts. A new signal of the same type for the same pair is not
raised while both revisions are unchanged. Structural signals are unaffected.

### D6 — Opt-in synthesis inside the scoped read helper

The fence's scoped read helper returns only owned, in-projection objects.
This change adds an explicit `include_synthesized` option to it (default
`false`). With the option set, the helper may also return objects that:

- are not owned by strategy-server (no `source = strategy-server`), and
- relate only to objects that pass the instance ownership and projection
  checks, by relationships whose every endpoint passes those checks or is the
  synthesized object itself.

Any synthesized object that touches an object outside the instance's
projection is excluded. Results carry `class: "source" | "synthesized"`.
The architecture test from the fence still forbids reading Memory outside the
helper, so this is the only way synthesis reaches a client.

MCP: `search_strategy` and `get_neighbors` gain an optional
`include_synthesized` boolean. Tool descriptions state that synthesized items
are Memory's inference, not strategy, and must not be presented as the
organisation's decisions.

### D7 — Forward path onto native Memory support

If emergent.memory implements the RFC (source registration, per-object
source provenance, atomic per-source changesets, synthesis lineage), the
server will:

- write `source`, `source_revision` and `source_schema` into Memory's native
  fields instead of properties;
- replace the manifest swap with Memory's atomic changeset or generation swap;
- forward signal dismissals and adoptions to Memory's feedback API.

That migration is a separate change. Nothing in this change blocks it, and
nothing here requires it.

## Alternatives considered

- **Make Memory the system of record for strategy.** Rejected: moves EPF
  invariants, validation and the mutation ledger into a generic graph that has
  no atomic multi-object update, and couples Memory to EPF.
- **Let Memory pull from a strategy-server feed.** Rejected as the primary
  path: the server knows when and why content changed; push from the owner is
  more timely and keeps semantics with the domain. Reconciliation (the fence's
  drift repair) remains as the safety net.
- **Exclude synthesis permanently.** Simplest and safe, but discards the value
  Memory adds across domains. Opt-in with anchoring keeps isolation.

## Risks

1. **Embedding cost on property change** — see D1; verified in task 1.1.
2. **Anchoring check cost** — synthesized results require relationship
   lookups per result. Bounded by the existing result limit; measured in task
   4.4.
3. **Synthesis that spans instances** — excluded by D6; covered by a test with
   a synthesized object linked to two instances.
4. **Fence slice 2 slips** — revision stamping (section 1) and origin
   recording (section 3) do not depend on it and can ship first. Revision
   checks through the scoped helper (section 2) and opt-in synthesis
   (section 4) wait for slice 2.
