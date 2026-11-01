# Change: Act as an authoritative source for emergent.memory

Tracking: emergent-company/emergent.memory#2376 (RFC: Memory as a subsystem of
source systems). Builds on `fence-memory-graph-per-instance`. Implements D5–D7
of `decide-strategy-source-of-truth` on the Memory side.

## Why

strategy-server is the system of record for strategy data: PostgreSQL holds the
mutation ledger and its invariants, and the Memory graph is a derived
projection of it. `fence-memory-graph-per-instance` makes that projection
isolated and exact. It does not yet define the **contract** between
strategy-server as a source and Memory as a subsystem that enriches source data.

That contract matters for three reasons found in the code:

- **Memory-derived results feed decisions without a freshness check.** Ripple's
  change classification (`domain/ripple/semantic.go`) searches Memory with the
  *new* content and treats the score against the artifact's indexed object as
  "similarity to the old content". It never checks that the indexed object
  actually holds the content Postgres had before the change. If the projection
  is behind or ahead, the score is wrong, and that score selects the authority
  tier (autonomous, gated, escalated).
- **Adopted insight loses its origin.** Drift, tension and clustering signals
  come from Memory's embeddings. When a user or the autonomous path commits a
  fix for such a signal, the mutation does not record that the change
  originated from Memory-derived analysis, or against which projection. Memory
  can later observe the adopted content and treat it as independent
  confirmation of its own earlier inference.
- **Memory's own knowledge is invisible or indistinguishable.** Memory
  generates data of its own (extraction, inferred relationships, agent
  consolidation). The fence makes reads fail closed on anything
  strategy-server did not write, which is correct for isolation, but there is
  no defined way to use Memory synthesis that is anchored in an instance's own
  data, labelled as synthesis rather than strategy.

The RFC in emergent.memory#2376 proposes that sources own truth, Memory owns
synthesis, and sources may adopt synthesis through their own write path. This
change implements strategy-server's side of that model, using what exists
today, and states how it moves onto native Memory support if and when the
memory team provides it.

## What Changes

- **Source role, stated as a requirement.** Structured reads from PostgreSQL
  are authoritative; Memory is never read back as a source for writes.
  strategy-server writes only objects it owns and never modifies objects it
  did not write.
- **Per-object source revision.** Every artifact-layer and decomposed object
  carries `properties.source_revision`: a hash of the canonical payload it was
  projected from. It changes only when content changes, so it creates no extra
  Memory versions and no re-embedding. Readers, including Memory-side agents,
  can tell which revision of the source an object represents.
- **Source descriptor on every projection.** Objects carry
  `properties.source` (`strategy-server`), `properties.source_schema` (the
  canonical ontology version) and `properties.layer` (`definition` or
  `runtime`), so Memory and its agents can tell source data from synthesis
  without knowing EPF. The schema itself reaches Memory as the pack
  `adopt-canonical-ontology` generates from the ontology.
- **Guessed edges are synthesis.** Relations whose ontology provenance is
  `inferred` or `embedding` are returned as `class: synthesized` and never
  count toward ripple's autonomous tier, until
  `adopt-explicit-strategy-references` replaces the text heuristics.
- **Revision-bound use of Memory results in ripple.** Change classification
  uses the Memory score only when the indexed object's `source_revision`
  matches the pre-change payload. Otherwise it falls back to text
  classification and never grants the autonomous tier.
- **Adoption records origin.** When a batch resolves a signal whose evidence
  came from Memory, the mutation's `batch_metadata` records the signal, the
  analyzer method, the Memory object keys and scores, and the source revisions
  the analysis used.
- **Dismissed Memory-derived signals stay dismissed** for the same
  source/target pair until either artifact's source revision changes.
- **Opt-in synthesized reads.** Semantic tools may return Memory synthesis
  only when explicitly requested, only when every source object it is anchored
  to is owned by the instance and in its current projection, and always
  labelled `class: synthesized`. Default reads stay fail-closed and return only
  source data.
- **Forward path.** If Memory adopts native source registration, per-object
  source provenance and atomic changesets (emergent.memory#2376), the server
  moves its projection onto them and retires the duplicated local mechanisms.
  This change does not depend on that.

## Impact

- Affected specs: `strategy-semantic` (added requirements), `strategy-ripple`
  (added requirements).
- Affected code: `domain/ingest` (source descriptor and revision on writes),
  `domain/semantic` (result classes, opt-in synthesis inside the scoped read
  helper), `domain/ripple` (`semantic.go` revision check; signal resolution
  origin; dismissal suppression), `internal/memory` (object properties),
  `internal/mcpserver` (semantic tool parameter and result fields).
- Depends on: `fence-memory-graph-per-instance` slice 2 (prefixed keys and the
  scoped read helper). Requirements here assume that helper exists.
- No migration is required for Postgres: origin is stored in the existing
  `strategy_mutations.batch_metadata` and `ripple_signals.metadata` columns.
- Memory: one full re-ingest per instance to stamp `source_revision`, which the
  fence upgrade already forces. Objects receive one new version; content and
  embeddings are unchanged.
- Out of scope: Memory-side changes (owned by the memory team via
  emergent.memory#2376); pushing adoption decisions to Memory before Memory
  has an API for them; changes to `epf-cli`.
