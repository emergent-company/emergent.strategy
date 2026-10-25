# Design: Fence the Memory graph per instance

Line references: strategy-server at `main` @ `b38526a0`; emergent.memory at
`main` @ `c0589c1` (v0.88.1).

## Goals

The invariants from #99, all enforced by deterministic tests:

| # | Invariant |
|---|---|
| I1 Ownership | Every object and relationship the server writes carries its instance in key prefix, `properties.instance_id` and (objects) label `instance:<uuid>`. |
| I2 Fail-closed reads | Every Memory read returns only data provably owned by the requested instance and in its current projection, whoever wrote the data. |
| I3 Exact projection | Visible objects and relationships for an active instance equal the projection of its current active Postgres artifacts. |
| I4 Single trigger | Every Postgres change to an instance's artifacts triggers reconciliation through one domain hook. |
| I5 Durability | Pending reconciliation survives restarts and dropped jobs. |
| I6 Lifecycle | Deleting an instance purges its graph data; deleted instances are never re-ingested. |
| I7 Provenance | Read results expose instance, layer and source artifact. |

## Non-goals

- A Memory project per org or per instance (#99 D1b). The shared project stays.
- A durable queue on DBOS. I5 is met with a dirty flag in Postgres plus the
  existing heartbeat; the in-memory channel stays as the fast path.
- Changes to `epf-cli`.

## Facts about emergent.memory this design relies on

Verified in the Memory source at `c0589c1`:

| Fact | Where | Consequence |
|---|---|---|
| Object identity on the main branch is unique on `(project_id, type, key)`, **regardless of namespace** | `migrations/00017_…upsert_unique_index.sql` (`IDX_graph_objects_upsert_main`), still in force; `00107` adds a *second* namespace index but does not relax the first | Namespace cannot isolate instances. Two instances must never write the same `(type, key)`; the key prefix stays. |
| `key` is at most 128 characters | `domain/graph/dto.go`, `CreateGraphObjectRequest.Key` (`max=128`) | A full 36-character UUID prefix risks overflowing long decomposed keys. Keep the 8-character prefix used since `4572524`, and make it collision-free in Postgres. |
| Upsert replaces `labels` and `properties` (no merge) | `domain/graph/service.go:1030` `CreateOrUpdate` | Labels and properties written by an ingest are exactly what the object carries afterwards. |
| An upsert whose properties, status and labels are unchanged is a no-op: no new version, no re-embed | `service.go` ~1185–1200 (content-hash probe) | Re-ingesting unchanged content is cheap **as long as nothing per-ingest is written onto objects**. |
| Small numeric properties are part of the embedding text | `pkg/embeddingtext/embeddingtext.go:121` | A per-ingest generation number in `properties` would create a new version and re-embed every object on every ingest (the 13 GB bloat fixed in `4572524`, plus embedding cost). Generation must not live on objects. |
| `/api/graph/search` accepts `labels`, matched with **overlap** (`labels && …`, i.e. OR), plus `namespace`, `types`, `status`, `branchId` | `domain/graph/dto.go:514` `HybridSearchRequest`; `repository.go:2160` | Search can pre-filter by owner on the server with exactly one label, `instance:<uuid>`. Never pass two labels expecting AND. |
| `ListObjects` accepts `label` / `labels` (same overlap semantics) | `handler.go` `ListObjects` | Ingest GC, contradiction detection and lifecycle can list one instance server-side. |
| Single-object delete cascades to all live relationships of the object; bulk-action delete does not | `service.go:1536` `Delete` | Purge and GC use single deletes (#87 F5). |

## Decision 1: Ownership stamp and key format

Every object the server writes gets:

- **Key** `<prefix>/<original key>` for both layers, where `<prefix>` is the
  first 8 hex characters of the instance UUID, as decomposed keys already use
  (`domain/ingest/service.go:889`). Artifact-layer keys, unprefixed today
  (`:413`, `:493`), gain the same prefix.
- **Collision-free prefix.** Migration 043 adds a unique index on
  `left(id::text, 8)` over `strategy_instances` (all rows, deleted included,
  since purge can lag). Instance creation retries with a new UUID on a unique
  violation. If existing instances collide, the migration fails loudly; that is
  intended.
- **Properties** `instance_id` (full UUID). Constant per object, so it never
  causes version churn after the first write.
- **Labels** `layer:artifact` / `layer:decomposed` plus `instance:<uuid>`.

Relationships get `properties.instance_id`.

Key construction lives in one place in `domain/ingest` (`ScopedKey(instanceID, key)`,
`UnscopedKey`). Callers that pass keys in, such as `get_neighbors(node_key)`,
keep passing unscoped keys; the semantic service scopes them.

**Why the prefix is not the ownership check.** Other writers (`epf-cli`, older
server versions) do not follow the format, and any writer to the project can
forge a key. The prefix only prevents write collisions. Reads decide ownership
from the `instance:<uuid>` label (server-side) and `properties.instance_id`
(checked again in the server), and freshness from the manifest (Decision 2).

## Decision 2: Projection manifest in Postgres

Postgres is the source of truth and the graph is a derived projection. Instead
of stamping a generation onto objects (which, per the facts above, would bloat
history and re-embed everything on every ingest), Postgres records **which
keys make up the current projection** of each instance. Visibility is
membership in that manifest.

**Schema (migration 043).**

- `strategy_instances.memory_generation BIGINT NOT NULL DEFAULT 0`: increments
  on every successful ingest; 0 means never ingested under this scheme. Used
  for observability and ordering, not stored on objects.
- `strategy_instances.memory_dirty_since TIMESTAMPTZ NULL`.
- `memory_projection(instance_id UUID, kind TEXT CHECK (kind IN ('object','relationship')), key TEXT, PRIMARY KEY (instance_id, kind, key))`.
  For objects `key` is the scoped Memory key. For relationships it is
  `<type>|<from scoped key>|<to scoped key>`. About 7.7k + 10.7k rows for the
  largest instance seen (`4572524`).

**Full ingest of instance X:**

1. Take a per-instance Postgres session advisory lock on a dedicated connection
   (works across Cloud Run replicas and the CLI). Ingests of X are serialised;
   different instances run in parallel.
2. Read `memory_dirty_since` as `dirtyAt`. Export the instance and compute the
   new manifest deterministically from the export (both layers, all
   relationships).
3. Upsert every object and relationship in the new manifest. Unchanged objects
   are no-ops in Memory.
4. If any write failed: stop without touching the manifest. Keep the instance
   dirty, release the lock. Retry happens via Decision 4.
5. In one transaction: replace X's `memory_projection` rows with the new
   manifest, `memory_generation += 1`, `memory_content_hash`, counts, and clear
   `memory_dirty_since` **only if** it still equals `dirtyAt` (a change that
   arrived mid-ingest keeps the instance dirty).
6. Garbage-collect, outside the transaction:
   - relationships in the old manifest but not the new one: resolve and delete;
   - objects in the old manifest but not the new one: single delete (cascades
     their edges);
   - safety net: `ListObjects(label = instance:<X>)` and delete any object whose
     key is not in the manifest.
   GC failure is logged and left for the next ingest or the sweep; it never
   affects visibility.
7. Release the lock.

**Visibility rule.** An object is visible for X iff it carries label
`instance:<X>`, `properties.instance_id == X`, and its key is in X's object
manifest. A relationship is visible iff both endpoints are visible and its
tuple is in X's relationship manifest.

**Failure behaviour.** If an ingest fails part-way, the old manifest stays in
force: objects added by the failed attempt stay invisible, objects removed in
Postgres stay visible, and objects rewritten in place show their newer content.
All three converge on the next successful ingest (Decision 4 bounds the
delay). No partially-built projection is ever visible.

**Empty manifest.** An instance with no manifest rows (never ingested under
this scheme, including every instance right after upgrade) returns an empty
result with a `graph_not_ready` hint from every semantic read, never an error
and never other data.

**Cost.** One full ingest per change burst (coalesced, Decision 4). Unchanged
objects cost a content-hash probe in Memory and no new version or embedding.
The manifest replace is about 18k rows in one transaction for the largest
instance. Measure in task 8.3.

## Decision 3: One scoped read path

`domain/semantic` gets a private `scope` helper that every Memory read uses. It
depends on a narrow `ManifestSource` interface (implemented in
`domain/ingest`), so the semantic service stays free of `*bun.DB`:

- `HasManifest(ctx, X)`, and `Visible(ctx, X, keys) (set, error)` as one
  `key = ANY(?)` query per read;
- filters objects and relationships by the visibility rule;
- counts dropped items and logs them at debug level, so leftover data shows up
  in operations.

Per read:

- **`SearchStrategy`**: send `labels: ["instance:<X>"]` (one label only, since
  matching is OR). Over-fetch `limit × 2` (cap 100) to absorb stale same-instance
  hits until GC runs, filter, trim to `limit`. Results gain `instance_id`,
  `layer`, `source_artifact`.
- **`GetNeighbors`**: scope the caller's key, return not-found for an invisible
  root, filter the expansion.
- **`DetectContradictions`**: `ListObjects(label = instance:<X>)`, keep
  `layer:artifact` in the server, filter.
- **Lifecycle `enrichWithSemantics`** (`internal/mcpserver/lifecycle.go:154`):
  becomes a semantic-service method that lists by instance label and resolves
  the North Star by scoped key.
- **Settings page counts** (`internal/handler/handler_settings.go:207`): per-
  instance counts from the instance row; the project-wide count goes.
- **Scenarios**: branch reads go through the same helper; branch names keep the
  instance UUID so purge can find them.

**Enforcement.** An architecture test fails if any package other than
`domain/semantic`, `domain/ingest` and the sweep calls a read method on
`internal/memory`. The memory client's `SearchRequest` gains `Labels`; the test
also asserts every `Search` call sets exactly one `instance:` label.

## Decision 4: One trigger, coalesced and durable

Domain services that change an instance's artifacts set
`memory_dirty_since = COALESCE(memory_dirty_since, now())` **inside** their
transaction and call `ingest.Notifier.InstanceChanged(ctx, instanceID)` **after**
commit. Known call sites:

| Path | Today | After |
|---|---|---|
| `strategy.CommitBatch` / `CommitAuto` (MCP `commit_batch`, web, pipeline, ripple) | `EnqueueBatch` from callers (`internal/mcpserver/server.go:1244`, `internal/pipeline/postcommit.go`, `domain/ripple/convergence.go:293`) | hook in the domain methods; caller calls removed |
| `evidence.Ingest` (inserts artifacts directly, `domain/evidence/service.go:168`) | `EnqueueBatch` | hook |
| `instance.ReimportArtifacts` (GitHub import, CLI) | nothing (#96) | hook |
| `instance.ImportInstance` (web, MCP, CLI) | nothing (#99 N2) | hook |
| `version.Restore` (MCP, web) | nothing (#99 N2) | hook |
| `instance.DeleteInstance` | nothing (#87 F1) | purge (Decision 5) |
| canonical install, `scaffold_instance`, pack/app install | to trace (task 1.2) | hook if they write artifacts outside `CommitBatch` |

The ingest service coalesces: one in-flight job per instance plus a "dirty
again" bit, re-run once after the current job. A full channel no longer loses
work, because the dirty flag lives in Postgres: the heartbeat
(`RepairMemoryDrift`) re-enqueues every active instance with
`memory_dirty_since` older than one heartbeat interval, and the startup sweep
re-enqueues every active instance that is dirty, has a NULL content hash, or
has no manifest.

The incremental `ingestBatch` path, `upsertGraphObject` and `deleteGraphObject`
(which resolves by an unscoped key and can delete another instance's object,
#99 N4) are removed.

## Decision 5: Deletion, sweep and migration

**Delete.** `DeleteInstance` keeps soft-deleting in Postgres and enqueues a
purge. Under the instance lock it deletes every object with label
`instance:<uuid>` (single deletes cascade edges), every object in the
instance's manifest, and every branch named `scenario-<uuid>-*`, then deletes
the manifest rows and records the outcome on the row. The `delete_instance`
tool text stops promising synchronous deletion. Fix `delete_reason` → `reason`
(#87 F5).

**Startup sweep and drift repair** add `deleted_at IS NULL` to their raw
queries (#87 F2).

**Orphan sweep.** New admin MCP tool `sweep_memory_orphans(apply=false)` and
CLI `strategy-server memory sweep [--apply]`, both calling one domain function.
It pages through every object in the project and classifies:

- `no_owner`: no `instance_id` and no `instance:` label;
- `unknown_owner`: owner is not an active instance (deleted or absent);
- `not_in_manifest`: owned by an active instance with a manifest, but not in it;
- `legacy_key`: key not in `<prefix>/…` format.

It reports counts per class and, with `apply`, deletes them with single
deletes and retry. Instances whose lock is held (ingest in progress) or that
have no manifest yet are skipped, so the sweep can never delete the only copy
of an instance that has not been re-ingested. Dry run is the default; the MCP
tool sits in the `admin` category and is write-gated.

**Migration 043:** the columns and the `memory_projection` table from Decision 2,
the prefix unique index from Decision 1, and `memory_content_hash = NULL` on
active instances so the startup sweep re-ingests them.

**Upgrade runbook** (goes into `docs/DEPLOYMENT.md` and the PR description):

1. Deploy. The startup sweep ingests every active instance under the new
   scheme. Until an instance's first ingest completes, its semantic reads
   return `graph_not_ready`.
2. Check each instance reports `memory_generation >= 1` (settings page or
   `get_sync_status`).
3. Run the sweep as a dry run, check the counts, then run it with `--apply`.

## Decision 6: Content contract

Requirement text in the spec, plus tool descriptions:

- `search_strategy`: discovery over the instance's own content; for
  authoritative values use the structured tools (`get_product_vision`,
  `get_roadmap`, `list_features`, …).
- `get_template`: an authoring template, never the instance's strategy.

## Risks and open questions

1. **Memory version in deployments.** Facts above are from Memory v0.88.1.
   The pilot must run a Memory version with `labels` on `/api/graph/search` and
   the content-hash no-op on upsert. Task 2.1 finds the minimum version and the
   runbook states it.
2. **Search hit quality under debris.** Foreign data is excluded server-side by
   label. Stale same-instance hits (removed artifacts) still consume slots
   until GC; the over-fetch absorbs normal amounts and the sweep removes the
   rest.
3. **Relationship GC resolution.** Deleting a removed relationship needs its
   Memory ID. Task 2.4 decides between resolving through `ObjectEdges` on the
   source object and a relationship upsert that returns the ID.
4. **Scenario branches** copy the whole project. Reads are filtered, but merge
   (`CommitScenario`) acts on the branch as a whole. Task 4.6 checks whether a
   merge can write foreign objects into main; if it can, `commit_scenario` is
   gated until a follow-up.
