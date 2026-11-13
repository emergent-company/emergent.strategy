# Design: Act as an authoritative source for emergent.memory

Line references: strategy-server at `main` @ `7d788ce` (fence slice 2
merged); emergent.memory at `main` @ `38eef93` (write attribution merged,
#2461).

**Revised 2026-11-03 after the memory team's design response**
(emergent.memory#2376, comment 6588710088). They accept source-authoritative
mode and sequence it as: (1) write attribution and contributions, (2)
credential scoping, (3) atomic changeset apply (#2462), (4) synthesis lineage,
(5) adoption feedback. Slice 1 has shipped. This design now keeps every
provenance field out of object properties and maps each part of this change
onto the slice that will carry it natively.

## Model

Three classes of data, each with one owner:

| Class | Owner | Written by | In Memory |
|---|---|---|---|
| Source | strategy-server (Postgres ledger) | `domain/ingest` only | Artifact and decomposed layers, stamped by the fence; `data_class = source` once slice 3 lets a source set it |
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
| S3 Revision visibility | For every projected object, the content revision it represents is recorded: in the projection manifest now, and as Memory's contribution `external_revision` once slice 3 ships. |
| S4 Revision-bound decisions | A Memory-derived value that influences an authority decision is used only if it was computed against the expected source revision. |
| S5 Origin | Every mutation that resolves a Memory-derived signal records that origin. |
| S6 Labelled synthesis | Synthesis is returned only on request, only when anchored entirely in the caller's instance projection, and always labelled. |

## Decisions

### D1 — Provenance never goes into object properties

Verified in emergent.memory `pkg/embeddingtext/embeddingtext.go` and
`domain/graph/repository.go:1671`, and confirmed by the memory team:

- `computeContentHash` hashes all properties, so any provenance property
  creates a new object version when it changes;
- the embedding text is built from all properties except a short skip list
  (`id`, `url`, `version`, `hash`, …). `source`, `source_schema`, `layer` and
  `source_revision` are not on it, so stamping them would mix
  "strategy-server", "definition" and version strings into every vector,
  degrading search quality for all objects, not only costing re-embeds.

So this change writes **no** provenance properties. (The fence's
`properties.instance_id` stays; it predates this change and is constant per
object.) Provenance lives in two places instead:

1. **Now: the projection manifest in Postgres.** `memory_projection` (fence,
   migration 045) gains `source_revision` (content hash, below) and
   `revision_seq` (the instance's `memory_change_seq` at the ingest that wrote
   it). The manifest is replaced only after every write of an ingest
   succeeded, so for any visible object it states exactly which revision
   Memory holds.
2. **Later: Memory's own columns and contributions.** When slice 3 ships,
   ingest pushes the projection as a changeset, and each object carries
   `data_class = source`, `owner_source_id`, and a contribution with
   `external_id` (the artifact key), `external_revision` (content hash) and
   `external_revision_seq` (`revision_seq`). That makes revisions visible to
   Memory-side readers, which the manifest cannot do.

### D2 — Revision and ordering

`source_revision` is a hash of the canonical payload (sorted-key JSON,
sha256, first 16 hex chars), reusing the text already built for
`memory_content_hash`. It changes only with content, not with mutation id,
import or restore. Decomposed objects record their parent artifact's
revision.

A hash detects change but not direction. Memory's slice 3 rejects a push
whose `external_revision_seq` is older than the stored one, so every push
needs a total order. `memory_change_seq` is monotonic per instance and is
already read at the start of each ingest; it is the sequence. When
`adopt-git-release-model` lands (`decide-strategy-source-of-truth` D4), the
release number takes its place and the revision becomes release commit plus
content hash.

### D2a — Schema pack and source registration

The source pushes its schema as well as its data. `adopt-canonical-ontology`
generates the Memory schema pack from the canonical ontology registry and
installs or verifies it on startup. A schema pack is data in Memory; it does
not make Memory EPF-aware. The ontology version and each type's layer are
known from the pack and the registry, so they are not repeated per object.

To own objects in Memory, strategy-server must be a row in `kb.sources`
(`owner_source_id` is a foreign key to it) and, from slice 2, write with a
credential scoped to that source. Today `kb.sources` holds pull connectors
(provider, config, cursor). The memory team's answer to open question 2 is to
converge on that registry. This change adds the task to register one source
per strategy-server deployment and Memory project, and asks the memory team
how a push source registers (no config, no cursor). One source per instance is
not needed: instances are already separated by the fence's key prefix and
label, and later by namespace.

### D2b — Synthesis is classified by provenance

The ontology records how each relation is established (`explicit`,
`containment`, `derived`, `inferred`, `embedding`). Under
`decide-strategy-source-of-truth` D7, `inferred` and `embedding` relations are
synthesis even when strategy-server's decomposer produces them today. Until
`adopt-explicit-strategy-references` removes the text heuristics, edges with
those provenances are returned with `class: synthesized` in semantic results,
not `source`, and never count as structural evidence for ripple's autonomous
tier. The classification is read from the registry at query time, not stored
on the edge.

### D3 — Ripple classification checks the revision before trusting the score

`SemanticAnalyzer.ClassifyChange` (`domain/ripple/semantic.go:61`, search at ~:89) searches with
the new text and finds the artifact's object by key. It assumes that object
holds the old content. The change:

1. Compute the expected revision from the pre-change payload.
2. Find the artifact's object through the scoped read helper (fence D3), not
   unscoped `Search`.
3. Look up the object's `source_revision` in the projection manifest (D1). If
   it differs from the expected revision, or the object is absent from the
   manifest or from Memory, use `classifyByTextFallback` and cap the tier at
   `gated`. Once slice 3 ships, the contribution's `external_revision` is read
   instead, so the check also holds for objects Memory merged.
4. Record `method`, `memory_key`, `score`, `expected_revision` and
   `observed_revision` in the classification result, so it can be stored with
   the batch.

Capping at `gated` keeps the autonomous path exclusive to classifications
that are provably computed against the right state.

### D4 — Origin in existing JSONB columns

No new tables for origin. When a signal is created by a Memory-backed analyzer, its
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
corroboration.

When Memory's adoption feedback ships (slice 5), Memory mints an opaque,
verifiable origin token for each synthesized item it hands out; a source
cannot fabricate one, so it cannot fake corroboration. Origins that come from
Memory synthesis then carry that token, and adoption decisions (accept,
reject, dismiss) are reported back with it through Memory's MCP tool or REST
endpoint. Locally computed origins (ripple's own analysis over embeddings,
link suggestions) keep the local shape.

### D5 — Dismissal suppression keyed on revisions

A dismissed Memory-derived signal stores the source revisions of its source
and target artifacts. A new signal of the same type for the same pair is not
raised while both revisions are unchanged. Structural signals are unaffected.

### D6 — Opt-in synthesis inside the scoped read helper

The fence's scoped read helper returns only owned, in-projection objects.
This change adds an explicit `include_synthesized` option to it (default
`false`). With the option set, the helper may also return objects that:

- are not owned by this instance (not in its manifest, no instance label),
  and
- are anchored only to objects that pass the instance ownership and projection
  checks.

"Anchored" is defined by relationships whose every endpoint passes those
checks or is the synthesized object itself. When Memory's synthesis lineage
ships (slice 4), anchoring moves to lineage rows, which point at specific
version rows and cannot be merged away the way relationships can, and a
synthesized object derived from a superseded version is reported as stale.
`data_class` is not used to tell owned from synthesized data until slice 3:
migration 00257 defaults it to `synthesized`, so today every strategy object
in Memory carries that value.

Any synthesized object that touches an object outside the instance's
projection is excluded. Results carry `class: "source" | "synthesized"`.
The architecture test from the fence still forbids reading Memory outside the
helper, so this is the only way synthesis reaches a client.

MCP: `search_strategy` and `get_neighbors` gain an optional
`include_synthesized` boolean. Tool descriptions state that synthesized items
are Memory's inference, not strategy, and must not be presented as the
organisation's decisions.

### D7 — Forward path onto Memory's slices

| Memory slice (#2376) | Status | What strategy-server does |
|---|---|---|
| 1. Write attribution (#2461) | Shipped | Nothing required. Our writes are stamped with the project key's credential. Note: `data_class` defaults to `synthesized` for our objects until slice 3. |
| 2. Credential scoping | Planned | Register as a source (D2a); use a source-scoped key. |
| 3. Atomic changeset apply (#2462) | Planned | Ingest pushes the projection as one changeset with `external_revision` and `external_revision_seq`; `data_class = source`. Retire the manifest swap and orphan GC in favour of Memory's `source_generation`; keep the manifest only as a revision cache if still useful. strategy-server offers to be the first integration. |
| 4. Synthesis lineage | Planned | Anchoring and staleness of synthesized results via lineage rows (D6). |
| 5. Adoption feedback | Planned | Report adoption decisions with Memory-minted origin tokens (D4). |

Each row is a separate follow-up change. Nothing in this change blocks them,
and nothing here requires them.

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

1. **Provenance in properties** — resolved: none is written (D1).
2. **Anchoring check cost** — synthesized results require relationship
   lookups per result. Bounded by the existing result limit; measured in task
   4.4.
3. **Synthesis that spans instances** — excluded by D6; covered by a test with
   a synthesized object linked to two instances.
4. **Interim mislabel** — until slice 3, Memory-side consumers that filter on
   `data_class = source` will not find strategy data. Raised with the memory
   team on #2376.
5. **Fence slice 2** — merged (#145); sections 2 and 4 are unblocked.
