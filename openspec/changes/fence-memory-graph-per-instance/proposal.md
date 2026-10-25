# Change: Fence the Memory graph per instance

Tracking: #99 (umbrella), #100 (first slice), #87, #96.

## Why

strategy-server keeps every strategy instance in **one** emergent.memory
project (`EPF_MEMORY_PROJECT` is server-wide). Isolation and freshness inside
that project are not enforced anywhere:

- **Reads are unscoped.** `SearchStrategy`, `GetNeighbors`,
  `DetectContradictions` and lifecycle detection read the whole project after
  `assertInstanceAccess` has passed for one instance (#87 F3, #99 N6). On a
  shared server this exposes one organisation's strategy to another.
- **Ownership is stamped inconsistently.** Artifact-layer keys are not
  prefixed, so instances sharing a key overwrite each other (#87 F4). The CLI
  import writes decomposed objects with neither prefix nor `instance_id`
  (#99 N1). `epf-cli ingest` writes the same kind of unowned objects (#99 N8).
- **The graph is not a projection of Postgres.** GitHub import, instance
  import and `restore_version` change Postgres without triggering ingest
  (#96 G1, #99 N2). Incremental ingest never updates the decomposed layer
  (#99 N3). Full re-ingest only upserts, so removed content stays searchable
  forever (#96 G2). Instance deletion never purges (#87 F1), and deleted
  instances are re-ingested at startup (#87 F2). The ingest queue drops jobs
  when full and loses them on restart (#99 N5).
- **Results carry no provenance**, so a client cannot tell what it got
  (#99 N7).

A pilot deployment hit this in practice: `search_strategy` returned scaffold
placeholders next to the instance's real values and OKRs, and an AI client
told a user that the real roadmap objectives were "Example" placeholders. The
pilot's management team starts using the strategy on 3 November, which sets
the deadline for this change.

There is no template-fallback design behind those placeholders. They are
leftovers. This change also states that explicitly.

## What Changes

- **Ownership stamp on every write.** All objects and relationships the server
  writes carry the instance's key prefix (8 characters, made collision-free in
  Postgres), `properties.instance_id` and the label `instance:<uuid>`. The CLI
  import uses the same ingest path as the server (its private decomposed
  writer is removed).
- **Projection manifest.** Postgres records which keys make up each instance's
  current projection. A full ingest, serialised per instance, writes the whole
  projection, and only after every write succeeded replaces the manifest and
  garbage-collects what fell out. Reads return only manifest members, so stale
  objects become invisible as soon as an ingest succeeds, even if garbage
  collection fails. Nothing per-ingest is written onto objects, so unchanged
  content creates no new Memory versions and no re-embedding.
- **Fail-closed reads.** Every Memory read goes through one scoped read helper
  in `domain/semantic`: server-side filter on the `instance:<uuid>` label
  (supported by `/api/graph/search` and object listing), then ownership and
  manifest checks in the server. Objects without verifiable ownership are never
  returned, whoever wrote them. An architecture test keeps other packages from
  reading Memory directly.
- **One durable trigger.** Every change to an instance's artifacts in Postgres
  marks the instance `memory_dirty_since` and notifies the ingest service. The
  incremental per-batch path is removed in favour of a coalesced, fenced full
  ingest per instance. The heartbeat re-enqueues dirty instances, so a dropped
  or lost job converges without restart.
- **Lifecycle.** Instance deletion purges the instance's objects, relationships
  and scenario branches. Deleted instances are excluded from the startup sweep
  and drift repair.
- **Orphan sweep.** A dry-run-by-default admin tool and CLI command remove
  objects with no owner, an unknown or deleted owner, a position outside their
  owner's manifest, or a legacy key format. This cleans existing deployments.
- **Provenance.** Semantic results include `instance_id`, `layer` and
  `source_artifact`.
- **Content contract.** No template fallback: placeholders are never served as
  strategy, and structured reads are authoritative. Tool descriptions say so.

**BREAKING (operational):** artifact-layer keys gain the instance prefix and
all objects gain the instance label. On upgrade a migration forces a full
re-ingest of every instance. Until an instance's first ingest under the new
scheme completes, its semantic reads return no results (fail closed) with a
hint. Operators then run the orphan sweep once to remove legacy objects. The
deployment's emergent.memory must support `labels` on `/api/graph/search`
(verified in v0.88.1; minimum version determined in the tasks).

## Impact

- Affected spec: `strategy-semantic` (ingestion, search, neighbourhood,
  contradictions; new isolation, consistency, purge and content-contract
  requirements).
- Affected code: `domain/ingest`, `domain/semantic`, `domain/instance`,
  `domain/version`, `domain/strategy`, `domain/sync`, `domain/evidence`,
  `domain/ripple`, `domain/heartbeat`, `internal/mcpserver` (semantic tools,
  lifecycle, new admin tool), `internal/handler` (settings counts, delete),
  `internal/pipeline`, `internal/memory`, `cmd_import.go`, `cmd_serve.go`, one
  migration.
- Out of scope, tracked in #99: durable queue on DBOS (D4 beyond the dirty
  flag), a Memory project per org (D1b), `epf-cli` changes beyond
  documentation.
- Memory facts this change relies on were verified in the emergent.memory
  source at `c0589c1` (v0.88.1); see design.md.
