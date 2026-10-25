# Design: Fence the Memory graph per instance

Line references are against `main` @ `b38526a0`.

## Goals

The invariants from #99, all enforced by deterministic tests:

| # | Invariant |
|---|---|
| I1 Ownership | Every object and relationship the server writes carries its instance in key prefix, `properties.instance_id` and label `instance:<uuid>`. |
| I2 Fail-closed reads | Every Memory read returns only objects provably owned by the requested instance, whoever wrote the data. |
| I3 Exact projection | Visible objects for an active instance equal the projection of its current active Postgres artifacts. |
| I4 Single trigger | Every Postgres change to an instance's artifacts triggers reconciliation through one domain hook. |
| I5 Durability | Pending reconciliation survives restarts and dropped jobs. |
| I6 Lifecycle | Deleting an instance purges its graph data; deleted instances are never re-ingested. |
| I7 Provenance | Read results expose instance, layer and source artifact. |

## Non-goals

- A Memory project per org or per instance (#99 D1b). The shared project stays;
  isolation is enforced by I1 + I2.
- A durable queue on DBOS. I5 is met with a dirty flag in Postgres plus the
  existing heartbeat; the in-memory channel stays as the fast path.
- Server-side ownership filters on `/api/graph/search`. Not yet confirmed in
  the Memory API; reads post-filter. Swapping to a server-side filter later
  changes one helper.
- Changes to `epf-cli`.

## Decision 1: Ownership stamp and key format

Every object the server writes gets:

- **Key** `<instance-uuid>/<original key>`, for both layers. The full UUID
  replaces today's 8-character prefix on decomposed keys (`domain/ingest/service.go:889`)
  and adds a prefix to artifact keys, which have none today (`:413`, `:493`).
  Full UUIDs remove the collision risk of a short prefix, and since every key
  changes anyway, both layers can move to one format in one step.
- **Properties** `instance_id` (full UUID) and `memory_generation` (int64).
- **Labels** existing `layer:artifact` / `layer:decomposed` plus
  `instance:<uuid>`. The label lets ingest garbage-collect and contradiction
  detection list one instance with the existing `ListObjects(Label)` server-side
  filter (`internal/memory/objects.go:109`).

Relationships get `properties.instance_id` and `properties.memory_generation`.

Key construction lives in one function in `domain/ingest` (`ScopedKey(instanceID, key)`)
and its inverse (`UnscopedKey`). Nothing else builds Memory keys. Callers
that pass keys in, such as `get_neighbors(node_key)`, keep passing unscoped
keys; the semantic service scopes them.

**Why not rely on the key prefix alone for ownership?** Keys from other writers
(`epf-cli`, old versions) do not follow the format, and a key can be forged by
any writer to the project. Reads check `properties.instance_id` and the
generation; the prefix exists to prevent write collisions.

## Decision 2: Generation fencing

Postgres is the source of truth. The graph is a derived projection. The fence
makes the projection's visible state switch atomically per instance, without
deleting anything first.

**Schema.** `strategy_instances.memory_generation BIGINT NOT NULL DEFAULT 0`
(0 = never fenced-ingested) and `strategy_instances.memory_dirty_since TIMESTAMPTZ NULL`.

**Full ingest of instance X:**

1. Take a per-instance Postgres session advisory lock (`pg_advisory_lock` on a
   key derived from X), on a dedicated connection. Works across Cloud Run
   replicas and the CLI. Ingests of X are serialised; ingests of different
   instances run in parallel.
2. Read `current = memory_generation`, set `N = current + 1`. Read
   `memory_dirty_since` as `dirtyAt`.
3. Export the instance and write both layers, all objects stamped with
   generation N (Decision 1), relationships likewise. Upsert keeps stable
   keys, so objects that still exist are rewritten in place.
4. If any object or relationship write failed: stop. Do not advance. Log, keep
   the instance dirty, release the lock. (Retry happens via Decision 4.)
5. In one transaction: `memory_generation = N`, `memory_content_hash = <hash>`,
   counts, and clear `memory_dirty_since` **only if** it still equals
   `dirtyAt` (a change that arrived during the ingest keeps the instance dirty).
6. Garbage-collect: list `label = instance:<X>` and delete every object with
   `memory_generation < N`, plus relationships the same way. Single deletes,
   sequential, with retry (bulk delete does not cascade edges, #87 F5).
   GC failure is logged and left for the next ingest or the sweep; it never
   affects visibility.
7. Release the lock.

**Visibility rule:** an object is visible for instance X iff
`properties.instance_id == X` **and** `properties.memory_generation >= current(X)`.

Why `>=` and not `==`: a failed attempt N+1 has already rewritten some objects
in place with generation N+1 (step 3, before step 4 stops). With `==` those
objects would vanish until a retry succeeds. With `>=` they stay visible with
newer content, objects not yet rewritten stay visible at N, and stale objects
(< N) stay hidden. The only cost is that an artifact removed between N and a
failed N+1 remains visible until N+1 succeeds, which is bounded by Decision 4.

Why per-instance serialisation is required: two concurrent ingests could
interleave so that an older run re-stamps objects after a newer run advanced
the pointer, hiding them. The lock rules this out; generations are strictly
increasing per instance.

**Generation 0.** An instance that has never completed a fenced ingest has
`current = 0`. Every legacy object lacks `memory_generation` and is treated as
generation −1, so it is hidden. Semantic reads for such an instance return an
empty result with a hint (`graph_not_ready`), not an error and not leaked data.

**Cost.** A full ingest is about 7.7k objects and 10.7k relationships for the
largest instance seen (commit `4572524`). The incremental per-batch path is
removed (Decision 4); coalescing keeps this to one ingest per instance per
burst of changes. If this proves too slow, an incremental fenced path can be
added later without changing the visibility rule.

## Decision 3: One scoped read path

`domain/semantic` gets a private `scope` helper that every Memory read uses:

- needs `current(X)` from Postgres; the semantic service gets a narrow
  `GenerationSource` interface (implemented by the instance service), so it
  stays free of `*bun.DB`;
- filters objects by the visibility rule, and relationships by both endpoints
  being visible;
- counts dropped objects and logs them at debug level, so leftover data shows
  up in operations.

Per read:

- **`SearchStrategy`**: over-fetch (`limit × 4`, capped at 200), filter, trim
  to `limit`. Results gain `instance_id`, `layer`, `source_artifact`.
- **`GetNeighbors`**: scope the caller's key, verify the root is visible
  (else not found), filter the expansion.
- **`DetectContradictions`**: list by `instance:<uuid>` and `layer:artifact`,
  then filter.
- **Lifecycle `enrichWithSemantics`** (`internal/mcpserver/lifecycle.go:154`):
  moves behind a semantic-service method that lists by instance label and
  resolves the North Star by scoped key.
- **Settings page counts** (`internal/handler/handler_settings.go:207`): use the
  per-instance counts already stored on the instance row; drop the
  project-wide count.
- **Scenarios**: branch reads go through the same helper. Branch names keep
  the instance UUID so purge can find them.

**Enforcement.** An architecture test fails if any package other than
`domain/semantic`, `domain/ingest` and the purge/sweep code imports
`internal/memory` and calls a read method. This keeps I2 from eroding.

## Decision 4: One trigger, coalesced and durable

Domain services that change an instance's artifacts call a single notifier,
`ingest.Notifier.InstanceChanged(ctx, instanceID)`, **after** their
transaction commits, and set `memory_dirty_since = COALESCE(memory_dirty_since, now())`
**inside** it. Known call sites:

| Path | Today | After |
|---|---|---|
| `strategy.CommitBatch` / `CommitAuto` (MCP `commit_batch`, web, pipeline, ripple) | `EnqueueBatch` from callers (`internal/mcpserver/server.go:1244`, `internal/pipeline/postcommit.go`, `domain/ripple/convergence.go:293`) | hook in the domain methods; caller `EnqueueBatch` calls removed |
| `evidence.Ingest` (inserts artifacts directly, `domain/evidence/service.go:168`) | `EnqueueBatch` | hook |
| `instance.ReimportArtifacts` (GitHub import, CLI) | nothing (#96) | hook |
| `instance.ImportInstance` (web, MCP, CLI) | nothing (#99 N2) | hook |
| `version.Restore` (MCP, web) | nothing (#99 N2) | hook |
| `instance.DeleteInstance` | nothing (#87 F1) | purge hook (Decision 5) |
| canonical install, `scaffold_instance`, pack/app install | to trace (task 1.2) | hook if they write artifacts outside `CommitBatch` |

The ingest service coalesces: one in-flight job per instance plus a "dirty
again" bit. Notifications for an instance with a job in flight set the bit;
the worker re-runs once after the current job. A full channel no longer loses
work because the dirty flag is in Postgres: the heartbeat (`RepairMemoryDrift`)
re-enqueues every active instance with `memory_dirty_since` older than one
heartbeat interval, and the startup sweep does the same.

The incremental `ingestBatch` path, `deleteGraphObject` (which resolves by an
unscoped key and can delete another instance's object, #99 N4) and
`upsertGraphObject` are removed.

## Decision 5: Deletion, sweep and migration

**Delete.** `DeleteInstance` keeps soft-deleting in Postgres and enqueues a
purge: under the instance lock, delete every object and relationship with
label or property `instance:<uuid>`, and every branch named
`scenario-<uuid>-*`. Record the purge result on the row. The tool text stops
promising synchronous deletion. Fix the `delete_reason` → `reason` field
(#87 F5).

**Startup sweep and drift repair** add `deleted_at IS NULL` to their raw
queries (#87 F2).

**Orphan sweep.** New admin MCP tool `sweep_memory_orphans(apply=false)` and
CLI `strategy-server memory sweep [--apply]`, both calling one domain function.
It pages through every object in the project and classifies:

- `no_owner`: no `instance_id`;
- `unknown_owner`: `instance_id` not an active instance (deleted or absent);
- `stale`: owned, generation < current;
- `legacy_key`: key not in `<uuid>/…` format;

then reports counts per class and, with `apply`, deletes them under the same
retry rules. Instances with a fenced ingest in progress are skipped (lock
probe). Dry run is the default; the MCP tool is in the `admin` category and
write-gated.

**Migration 043:** add the two columns; set `memory_content_hash = NULL` on all
active instances so the startup sweep re-ingests them.

**Upgrade runbook** (goes into `docs/DEPLOYMENT.md` and the PR description):

1. Deploy. Startup sweep fence-ingests every active instance (generation 1).
   Until each finishes, its semantic reads return `graph_not_ready`.
2. Check each instance reports `memory_generation >= 1` (settings page, or
   `get_sync_status`).
3. Run the sweep dry-run, check counts, run it with `--apply`.

## Decision 6: Content contract

Requirement text in the spec, plus tool descriptions:

- `search_strategy`: discovery over the instance's own content; for
  authoritative values use the structured tools (`get_product_vision`,
  `get_roadmap`, `list_features`, …).
- `get_template`: an authoring template, never the instance's strategy.

## Risks and open questions

1. **Memory upsert semantics for labels and properties.** The design assumes an
   upsert replaces the object's labels and properties. If it merges, the
   `memory_generation` property is still overwritten (same key) and the
   instance label is still added, so the design holds; verify in task 2.1
   against the Memory version the pilot runs.
2. **Re-embedding cost.** Upserting an unchanged object may re-embed it. Full
   re-ingest already does this today; coalescing reduces how often. Measure in
   task 8.
3. **Search over-fetch on a project with much debris.** Until the sweep runs,
   foreign hits can crowd out owned ones. The cap of 200 bounds latency; the
   sweep removes the cause.
4. **Scenario branches** copy the whole project. Reads are filtered, but merge
   (`CommitScenario`) acts on the branch as a whole. Verify in task 4.6 that a
   merge cannot write foreign objects into main; if it can, gate
   `commit_scenario` until a follow-up.
