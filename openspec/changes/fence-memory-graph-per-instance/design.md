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
| `key` is at most 128 characters | `domain/graph/dto.go`, `CreateGraphObjectRequest.Key` (`max=128`) | A full 36-character UUID prefix risks overflowing long decomposed keys. Keep the 8-character prefix used since `4572524`, and make it collision-free in Postgres. The limit is not enforced on the upsert path of Memory v0.87 (keys of 129–146 characters were stored intact), but Memory is updated independently of this server, so it is treated as binding. Prefixed keys over 128 exist in real instances (8 of 2,129 in `docs/EPF/_instances/emergent`, 13 of 606 in the pilot-shaped instance), so they are shortened (see Decision 1). |
| Upsert replaces `labels` and `properties` (no merge) | `domain/graph/service.go:1030` `CreateOrUpdate` | Labels and properties written by an ingest are exactly what the object carries afterwards. |
| An upsert whose properties, status and labels are unchanged is a no-op: no new version, no re-embed | `service.go` ~1185–1200 (content-hash probe) | Re-ingesting unchanged content is cheap **as long as nothing per-ingest is written onto objects**. |
| Small numeric properties are part of the embedding text | `pkg/embeddingtext/embeddingtext.go:121` | A per-ingest generation number in `properties` would create a new version and re-embed every object on every ingest (the 13 GB bloat fixed in `4572524`, plus embedding cost). Generation must not live on objects. |
| `/api/graph/search` accepts `labels`, matched with **overlap** (`labels && …`, i.e. OR), plus `namespace`, `types`, `status`, `branchId` | `domain/graph/dto.go:514` `HybridSearchRequest`; `repository.go:2160` | Search can pre-filter by owner on the server with exactly one label, `instance:<uuid>`. Never pass two labels expecting AND. |
| `ListObjects` accepts `label` / `labels` (same overlap semantics) | `handler.go` `ListObjects` | Ingest GC, contradiction detection and lifecycle can list one instance server-side. |
| Single-object delete cascades to all live relationships of the object; bulk-action delete does not | `service.go:1536` `Delete` | Purge and GC use single deletes (#87 F5). |
| Creating a branch writes the branch row and its lineage; it does not copy objects | `domain/branches/service.go:55` `Create`, `repository.go:3588` | A scenario branch is not a project-sized copy (an earlier draft assumed it was). |
| `POST /api/graph/branches/:targetBranchId/merge` takes the **target** in the path; the body has `source_branch_id` and `execute` (default false). There is no `dry_run` field | `routes.go:80`, `dto.go:883`, `service.go:4538` | See risk 4: today's client call is a dry-run merge of a branch into itself. |

## Decision 1: Ownership stamp and key format

Every object the server writes gets:

- **Key** `<prefix>/<original key>` for both layers, where `<prefix>` is the
  first 8 hex characters of the instance UUID, as decomposed keys already use
  (`domain/ingest/service.go:889`). Artifact-layer keys, unprefixed today
  (`:413`, `:493`), gain the same prefix.
- **Key length.** A scoped key never exceeds 128 bytes. One that would is
  `<prefix>/<start of the key>~<first 16 hex characters of SHA-256 of the whole
  key>`, cut at a character boundary: deterministic, distinct for distinct keys,
  and not reversible. For those objects the writer also stores the original in
  property `source_key` (`ingest.IsShortened` tells it when), and readers that
  need the original key use that property, because `UnscopedKey` reports false
  for a shortened key. Callers that pass a key in still pass the original;
  `ScopedKey` maps it to the same shortened key on every read.
- **Collision-free prefix.** Migration 045 adds a unique index on
  `left(id::text, 8)` over `strategy_instances` (all rows, deleted included,
  since purge can lag). Instance creation retries with a new UUID on a unique
  violation. If existing instances collide, the migration fails loudly; that is
  intended.
- **Properties** `instance_id` (full UUID). Constant per object, so it never
  causes version churn after the first write.
- **Labels** `layer:artifact` / `layer:decomposed` plus `instance:<uuid>`.
- **Integrity stamp** (from `add-instance-content-integrity`) on **both layers**:
  property `integrity_class` (and `integrity_ref` when set) and label
  `integrity:<class>`, present only when the source artifact is classified
  `canonical_reference`, `unmodified_template` or `packaged_default`. Authored
  content carries neither. A decomposed object takes the class of the artifact it
  was derived from, which the ingest already holds as the artifact row. The
  upsert replaces properties and labels (see the facts above), so an artifact
  that stops being a template, because the user edited it, loses the stamp on
  its next ingest. Today only the artifact layer is stamped
  (`integrityMetadata` in `domain/ingest/service.go`); the rewrite must not drop
  that and must extend it to the decomposed layer.

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

**Schema (migration 045).**

- `strategy_instances.memory_generation BIGINT NOT NULL DEFAULT 0`: increments
  on every successful ingest; 0 means never ingested under this scheme, and
  `HasManifest` is `memory_generation >= 1`. Used for observability and
  ordering, not stored on objects. (An instance whose artifacts were all removed
  has generation >= 1 and a valid, empty manifest.)
- `strategy_instances.memory_dirty_since TIMESTAMPTZ NULL`: oldest unprocessed
  change; the heartbeat uses it to find stale work.
- `strategy_instances.memory_change_seq BIGINT NOT NULL DEFAULT 0`: incremented
  by every change. An ingest clears the dirty flag only if the sequence is
  unchanged since the ingest started. A timestamp cannot do this job: once set,
  `COALESCE(memory_dirty_since, now())` never changes, so a change that arrives
  mid-ingest would be indistinguishable from the one being processed.
- `memory_projection(instance_id UUID, kind TEXT CHECK (kind IN ('object','relationship')), key TEXT, PRIMARY KEY (instance_id, kind, key))`.
  For objects `key` is the scoped Memory key. For relationships it is
  `<type>|<from scoped key>|<to scoped key>`. About 7.7k + 10.7k rows for the
  largest instance seen (`4572524`).

**Full ingest of instance X:**

1. Take a per-instance Postgres session advisory lock on a dedicated connection
   (`db.Conn`; works across Cloud Run replicas and the CLI). Ingests of X are
   serialised; different instances run in parallel. Closing a `sql.Conn` returns
   it to the pool and does **not** end the session, so the helper must call
   `pg_advisory_unlock` explicitly and, if that fails, discard the connection
   (return `driver.ErrBadConn` from `conn.Raw`) instead of pooling it with the
   lock still held. The lock holds one of the 25 pool connections for the
   duration of an ingest, which is acceptable with 2 workers. After taking the
   lock, re-check: if the instance is not dirty, has `memory_generation >= 1`
   and its content hash matches, another replica already ingested it; release
   and return. (After the upgrade every replica's startup sweep enqueues every
   instance; this keeps the second and third replica from repeating the work.)
2. Read `memory_change_seq` as `seq0`. Export the instance and compute the new
   manifest deterministically from the export (both layers, all
   relationships).
3. Upsert every object and relationship in the new manifest. Unchanged objects
   are no-ops in Memory.
4. If any write failed: stop without touching the manifest. Keep the instance
   dirty, release the lock. Retry happens via Decision 4.
5. In one transaction: replace X's `memory_projection` rows with the new
   manifest, `memory_generation += 1`, `memory_content_hash`, counts, and clear
   `memory_dirty_since` (set to NULL) **only if** `memory_change_seq` still
   equals `seq0` (`UPDATE … WHERE id = ? AND memory_change_seq = ?`). A change
   that arrived mid-ingest bumped the sequence and keeps the instance dirty.
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

**Not ready.** An instance with `memory_generation = 0` (never ingested under
this scheme, including every instance right after upgrade) returns an empty
result with a `graph_not_ready` hint from every semantic read, never an error
and never other data. An instance that has been ingested but has no artifacts
has generation >= 1 and returns an empty result without the hint.

**Cost.** One full ingest per change burst (coalesced, Decision 4). Unchanged
objects cost a content-hash probe in Memory and no new version or embedding.
The manifest replace is about 18k rows in one transaction for the largest
instance. Measure in task 8.3.

## Decision 3: One scoped read path

`domain/semantic` gets a private `scope` helper that every Memory read uses. It
depends on a narrow `ManifestSource` interface (implemented in
`domain/ingest`), so the semantic service stays free of `*bun.DB`:

- `HasManifest(ctx, X)` (`memory_generation >= 1`), `Visible(ctx, X, keys) (set, error)` for objects and
  `VisibleRelationships(ctx, X, tuples) (set, error)` for relationship tuples, each as one
  `key = ANY(?)` query per read;
- filters objects and relationships by the visibility rule;
- counts dropped items and logs them at debug level, so leftover data shows up
  in operations.

Per read:

- **`SearchStrategy`**: send `labels: ["instance:<X>"]` (one label only, since
  matching is OR). Over-fetch `limit × 2` (cap 100) to absorb stale same-instance
  hits until GC runs, filter, trim to `limit`. Results gain `instance_id`,
  `layer`, `source_artifact`. **Framework hits stay excluded**: the scoped
  search keeps dropping hits whose `integrity_class` is a framework class, and
  keeps reporting how many it dropped, as `SearchStrategyScoped` does today.
  Memory's label filter can only include (a hit matching any label), never
  exclude, so this is a filter in the server on the property after the
  over-fetch, not a query option. Without it, replacing `SearchStrategyScoped`
  would silently bring canonical definitions and templates back into answers.
- **`GetNeighbors`**: scope the caller's key, return not-found for an invisible
  root, filter the expansion.
- **`DetectContradictions`**: `ListObjects(label = instance:<X>)`, keep
  `layer:artifact` in the server, filter.
- **Lifecycle `enrichWithSemantics`** (`internal/mcpserver/lifecycle.go:154`):
  becomes a semantic-service method that lists by instance label and resolves
  the North Star by scoped key.
- **Settings page counts** (`internal/handler/handler_settings.go:207`): per-
  instance counts from the instance row; the project-wide count goes.
- **Scenarios**: every scenario operation first checks that the branch belongs
  to the instance (risk 4). Branch reads use the same helper but filter by
  label `instance:<X>` and `properties.instance_id` only: the manifest describes
  `main`, not a branch. Branch names keep the instance UUID so purge can find
  them.

**Ripple is a reader too.** `domain/ripple` calls `Search`, `GetObjectByKey` and
`Expand` on the shared project from six places (`semantic.go:90,280,391`,
`vertical.go:90`, `propagation.go:281`, `tension.go:186`) and matches results by
exact key (`r.Object.Key == artifactKey`). Callers are `internal/pipeline/postcommit.go`,
`internal/mcpserver/register_ripple_tools.go` and `domain/ripple/convergence.go`.
Two consequences: (1) it reads other instances' data today, and (2) once keys
carry the instance prefix every one of those matches fails silently and the
classification falls back to text. Ripple therefore reads through
`semantic.ScopedGraph(instanceID)`, a facade that takes and returns **unscoped**
keys, applies the scope helper, and exposes only the operations ripple needs
(`Search`, `ObjectByKey`, `Expand`). `domain/ripple` depends on a small
interface satisfied by that facade, not on `*memory.Client`. No package is
exempt from the architecture test.

**Enforcement.** An architecture test fails if any package other than
`domain/semantic`, `domain/ingest` and the sweep calls a read method on
`internal/memory`. The memory client's `SearchRequest` gains `Labels`; the test
also asserts every `Search` call sets exactly one `instance:` label.

## Decision 4: One trigger, coalesced and durable

Every function that writes `strategy_artifacts` or `strategy_relationships`
calls one `markChanged(instanceID)` step per operation, **after** its Postgres
write has been committed, and then `Notifier.InstanceChanged(ctx, instanceID)`.
`markChanged` is a single statement:

```sql
UPDATE strategy_instances
SET memory_dirty_since = COALESCE(memory_dirty_since, now()),
    memory_change_seq  = memory_change_seq + 1
WHERE id = ?
```

Writers that already run in a transaction (`ReimportArtifacts`,
`version.Restore`) execute it inside that transaction. `CommitBatch` and
`CommitAuto` do **not** run in a transaction today: every statement autocommits
(`domain/strategy/service.go:344`, `:410`). This change does not wrap them; they
call `markChanged` right after the derive loop. A crash between the write and
`markChanged` loses the mark, and the startup sweep catches it, because it
compares the artifact content hash with `memory_content_hash`
(`EnqueueAllInstances`).

The mark must come **after** the write, never before. An ingest that read the
sequence before a not-yet-committed write would otherwise clear the dirty flag
over that write.

Call sites, traced in the code at `b38526a0` (task 1.2, done):

| Path | What it writes | Today | After |
|---|---|---|---|
| `strategy.CommitBatch` (`:344`), `CommitAuto` (`:410`) | artifacts and relationships via `deriveIndex`, no transaction | callers call `EnqueueBatch` (`internal/mcpserver/server.go:1244`, `internal/pipeline/postcommit.go`, `domain/ripple/convergence.go:293`) | `markChanged` in the domain methods; caller calls removed |
| `strategy.BackfillIndex` (`:632`) | via `deriveIndex` | nothing. Called after imports by `cmd_import.go:123`, `domain/sync/import.go:600` (GitHub and web import) and `internal/handler/handler_fire_definitions.go:129` (definition install) | `markChanged` once at the end; this one hook covers all three callers |
| `strategy.commitAlignedValueModel` (`align.go:204`; AIM `stepAlignPortfolio`, consistency) | via `deriveIndex` | nothing | `markChanged` |
| `instance.ReimportArtifacts` (`:233`) | deletes artifacts, relationships and mutations in a transaction, inserts mutations | nothing (#96 G1) | `markChanged` in the transaction; the `BackfillIndex` that follows marks again |
| `version.Restore` (`:474`) | deletes and re-inserts artifacts and relationships in a transaction, directly (not via `deriveIndex`) | nothing (#99 N2) | `markChanged` in the transaction |
| `evidence.Service.Ingest` (`:118`), `Update` (`:354`), `MarkProcessed` (`:439`), `Link` (`:370`) | artifacts or relationships directly, no transaction | `Ingest` calls `EnqueueBatch`; the other three nothing | `markChanged` in all four |
| `instance.ImportInstance` (`:152`) | the instance and its mutations; **no** artifacts | nothing | no hook of its own; every caller that imports payloads runs `BackfillIndex` |
| `instance.DeleteInstance` (`:371`), `workspace.DeleteWorkspace` (`:172`) | soft delete only (`deleted_at`); artifact rows stay | nothing (#87 F1) | purge (Decision 5) |
| `pack.InstallPack`, `app.InstallApp` | `installed_skills`, `strategy_apps` only | n/a | none needed |
| `Stage`, `DiscardBatch`, skill executor, AIM drafts, `add_relationship` | staged mutations only | n/a | none; they reach artifacts through `CommitBatch` |

Two gaps found while tracing. They are in scope because I3 cannot hold without
them:

- `scaffold_instance` (`internal/mcpserver/server.go:996`) seeds mutations
  through `ImportInstance` and never calls `BackfillIndex`. A scaffolded
  instance therefore has no `strategy_artifacts` rows, and there is nothing to
  ingest. It calls `BackfillIndex` after this change.
- `internal/handler/handler_aim_agent.go:314` commits mutations with raw status
  updates and no index derivation when `strategySvc == nil`. Task 4.8 checks
  whether that branch can be reached in a running server and removes it if not.

The ingest service coalesces: one in-flight job per instance plus a "dirty
again" bit, re-run once after the current job. A full channel no longer loses
work, because the dirty flag lives in Postgres: the heartbeat
(`RepairMemoryDrift`) re-enqueues every active instance with
`memory_dirty_since` older than one heartbeat interval, and the startup sweep
re-enqueues every active instance that is dirty, has a NULL content hash, or
has no manifest. The heartbeat runs every 5 minutes by default
(`HEARTBEAT_INTERVAL=300`), so a lost job converges within two intervals.

The incremental `ingestBatch` path, `upsertGraphObject` and `deleteGraphObject`
(which resolves by an unscoped key and can delete another instance's object,
#99 N4) are removed.

## Decision 5: Deletion, sweep and migration

**Delete.** `DeleteInstance` keeps soft-deleting in Postgres and enqueues a
purge. `workspace.DeleteWorkspace` soft-deletes the workspace's instances the
same way and enqueues a purge for each of them. Under the instance lock it deletes every object with label
`instance:<uuid>` (single deletes cascade edges), every object in the
instance's manifest, and every branch named `scenario-<uuid>-*`, then deletes
the manifest rows and records the outcome on the row. The `delete_instance`
tool text stops promising synchronous deletion. Fix `delete_reason` → `reason`
(#87 F5).

**Startup sweep and drift repair** add `deleted_at IS NULL` to their raw
queries (#87 F2).

**Orphan sweep.** CLI `strategy-server memory sweep [--apply]`, calling
`ingest.Service.SweepOrphans`. It pages through every object in the project and
classifies:

- `no_owner`: no `instance_id` property and no `instance:` label, or the two
  name different instances (ingest never writes that);
- `unknown_owner`: owner is a deleted or nonexistent instance, or not a UUID.
  Archived instances keep their data and count as owners;
- `legacy_key`: owned by a live instance, key does not start with the owner's
  `<prefix>/`;
- `not_in_manifest`: owned by a live instance with `memory_generation >= 1`,
  correctly keyed, but not in its manifest.

It reports counts and a few example keys per class and, with `apply`, deletes
them with single deletes, one at a time. A failed delete is counted and the
sweep carries on; running it again retries. A delete that finds the object
already gone counts as `already_gone`. Instances whose lock is held (ingest in
progress) or that have no manifest yet are skipped and listed, so the sweep can
never delete the only copy of an instance that has not been re-ingested. Dry
run is the default.

**No MCP tool.** The first design also had an `admin` MCP tool. It is dropped:
the sweep reads the whole project across every organisation, and the server has
only org-level admin checks, so any tenant's `org_admin` could run a
project-wide delete and read other tenants' instance ids and object keys. The CLI
runs on the server's host like `token --mint`; the operator is whoever controls
the deployment. If a platform-operator role is added later, the tool can come
back behind it.

**The sweep assumes a project dedicated to strategy-server.** Anything in the
project that no instance accounts for is an orphan by definition. Pointing it at
a project that also holds other data deletes that data on `--apply`; the CLI
prints a warning, and the dry run is the default for that reason.

**Migration 045:** the columns and the `memory_projection` table from Decision 2,
the prefix unique index from Decision 1, and `memory_content_hash = NULL` on
active instances so the startup sweep re-ingests them.

**Upgrade runbook** (goes into `docs/DEPLOYMENT.md` and the PR description):

1. Deploy. The startup sweep ingests every active instance under the new
   scheme. Until an instance's first ingest completes, its semantic reads
   return `graph_not_ready`.
2. Check each instance reports `memory_generation >= 1` and no
   `memory_dirty_since` (SQL on `strategy_instances`, or `memory_generation` in
   the `get_instance` result; `get_sync_status` is the GitHub sync).
3. Run the sweep as a dry run, check the counts, then run it with `--apply`.

## Decision 6: Content contract

Requirement text in the spec, plus tool descriptions:

- `search_strategy`: discovery over the instance's own content; for
  authoritative values use the structured tools (`get_product_vision`,
  `get_roadmap`, `list_features`, …).
- `get_template`: an authoring template, never the instance's strategy.

## Measurements (task 8.3)

Real Memory v0.87.4 (`memory-passthrough`), an empty project, a scratch
Postgres database, and the largest local instance (175 artifacts, 5.7 MB of
YAML, imported with `strategy-server import`). Measured on an 8 GiB laptop with
other containers running, so read them as orders of magnitude.

| Measurement | Result |
|---|---|
| Objects / relationships in Memory | 2250 / 3416 (175 artifact objects, 2075 decomposed) |
| First full ingest, empty Memory | about 43 s |
| Unchanged re-ingest | about 10-15 s, **0 of 2250 object versions changed** (3 runs) |
| Of which: upserting 2250 unchanged objects | 10.0-11.3 s |
| Manifest replace | 113-174 ms |
| GC pass (nothing to remove) | 346-403 ms |
| Edit of one field in one artifact | exactly 1 object version changed (`north_star`) |
| `health_check` through the MCP (reads `GraphStats`) | 0.37-0.49 s, 3 calls |
| `detect_contradictions` (175 `ObjectEdges` calls) | 1.15-1.55 s, 2 calls |
| `search_strategy`, auto mode | 0.04-0.19 s, 3 calls |
| Postgres `memory_projection` rows | 5666 (2250 objects + 3416 relationships) |

What this says:

- The no-op claim holds at scale: an unchanged ingest creates no versions and
  therefore no embedding work. It is not free. Each unchanged object is still one
  upsert round trip, so an unchanged ingest of this instance costs 10-15 s of
  wall clock. This is acceptable for a change-triggered ingest. If it ever
  matters, skip the upsert for objects whose content hash is unchanged since the
  last ingest; not needed for the pilot.
- `health_check` (which calls `GraphStats`) stays under half a second here.
  Node and edge counts come from the manifest, but `GraphStats` still lists the
  instance's objects once (about 12 pages of 200 at this size) to take its
  orphan sample, so its cost grows with instance size. It is not free of paging.
  `detect_contradictions` calls `ObjectEdges` once per artifact object (175 here)
  and took 1.2-1.6 s. At 10x the artifacts that would be 10-15 s; not a problem
  for the pilot, worth knowing.
- **Dropped job converges.** The instance was dirtied (generation 16), the server
  was killed with `kill -9` 4 s into the ingest, and the instance stayed dirty. On
  restart the startup sweep re-queued it, the ingest completed in 16 s,
  generation 17, dirty flag cleared, and no object was lost or duplicated
  (2250 before and after). A server that stays up re-queues a dirty instance on
  the heartbeat after `dirtyGrace` (one minute).
- Memory restarted twice while the scale server was up (cause not investigated).
  Each time the drift check detected the new start time, re-queued the instance,
  and the ingest completed with the same counts. This was not a controlled test.

Found while measuring, not part of this change: `epfimport.ScanDirectory` reads
files in map order, and `READY/05_roadmap_recipe.yaml` and
`AIM/cycles/cycle-1/05_roadmap_recipe.yaml` both become the artifact
`roadmap_recipe`. Which one wins differs from run to run, so two imports of the
same directory produced different roadmaps (first run: older AIM cycle, second:
READY). The ingest itself is deterministic given the stored artifacts; the
nondeterminism is in the import. Removing the AIM copy made five consecutive
imports identical. Tracked as a separate issue.

## Verification on real data (task 8.2, partial)

Real Memory v0.87.4 (`memory-passthrough`, port 3012), a fresh Postgres database
migrated to 046, and six instances imported from the GitHub checkouts (Emergent,
Farmforce, Papertrail, Sandakers, 21st, Huma) into one empty project:
11,405 objects and 16,803 relationships.

| Check | Result |
|---|---|
| Every object has exactly one `instance:` label, equal to its `instance_id` property, a key with its own prefix, and an entry in its manifest | 11,405 of 11,405, 0 violations |
| Relationships whose ends belong to different instances | 0 of 16,803 |
| Manifest entries without a Memory object | 0 |
| `search_strategy`, every instance asked for every instance's name, auto and semantic | 72 searches; every hit carries the queried instance's `instance_id`; the queried instance returned hits in all six, so the probe is not vacuous |
| `get_neighbors` with a key that exists only in another instance | 27 probes, 27 empty |
| `get_neighbors("north_star")`, a key all six instances share | each instance answers with its own neighbours |
| `delete_instance` on an instance with 2,664 objects and 2,755 relationships | purge recorded after 19 s; exactly its objects and relationships removed; 0 other objects added, removed or versioned; manifest cleared |
| Sweep dry run on the real data | 0 in every class |
| Sweep with one planted orphan per class | dry run reports 1/1/1/1 and deletes nothing; apply deletes exactly those 4 (0 failed); 0 real objects removed or versioned; a second apply finds 0 |

Not done yet: scaffold a new instance, import again with an artifact removed,
restore a version, and walk the #99 acceptance criteria by hand.

Found while doing it, none caused by this change:

- **A failed ingest left the fence intact.** Memory's own Postgres was
  OOM-killed mid-ingest (the Docker VM had 4 GiB), 165 of 1,093 relationship
  writes got 401, and the ingest returned an error before touching the manifest.
  The instance stayed at generation 0 and dirty; its 1,213 objects were in Memory
  but invisible, and a retry converged.
- **A project-wide read through a proxy that ignores `X-Project-ID`** (the nginx
  in front of Memory on 3002 answers from the default project) sent an import to
  the wrong project. The fence does not help here: it keys on the instance, not
  the project. The upgrade runbook must say to point strategy-server at Memory
  directly or at a proxy that honours the header.
- **Importer issues:** nondeterministic file order (#119) and nested instance
  directories imported into the parent (#120; 132 of 326 artifacts in one repo).
- **`read_with` on decomposed search hits can name an artifact that does not
  exist** (the exporter drops sub-folders and doubles the `value_model_` prefix).
  The fix for the exporter is on `fix/export-preserve-artifact-paths`
  (`1d7c7590`), which is not in `fence/slice-2`; I did not test it.
- **Concurrency:** bulk upserts and cascade deletes at 8 and 4 workers pushed a
  4 GiB Docker VM into the OOM killer three times. At 2 workers the same imports
  peaked at 1.7 GiB and nothing was killed. The 8 is hard-coded.

## Risks and open questions

1. **Memory version (resolved).** The facts above were verified at v0.88.1
   (`c0589c1`). Checked back through the tags: the `labels` field on the hybrid
   search request is present in v0.35.74, and the `labels && …` overlap filter
   is present in the repository layer in v0.80.0. The upsert no-op for
   unchanged properties ("No change - return existing") is present in
   v0.35.74. The content-hash probe that makes that comparison cheap arrived in
   **v0.85.0**. Earlier versions work but are slower. **Minimum: v0.85.0.**
   strategy-server logs the Memory version at startup (task 2.1) and the
   runbook states the minimum. docker-compose no longer contains a Memory
   service; local development uses a standalone Memory installed by
   `scripts/dev-setup.sh`.
2. **Search hit quality under debris.** Foreign data is excluded server-side by
   label. Stale same-instance hits (removed artifacts) still consume slots
   until GC; the over-fetch absorbs normal amounts and the sweep removes the
   rest.
3. **Relationship GC resolution (decided).** `memory.Client` already has
   `DeleteRelationship(id)` (`internal/memory/relationships.go:58`, currently
   unused) and `ObjectEdges(objectID)`, which returns flat relationships with
   `id`, type, `src_id` and `dst_id`. GC groups the removed tuples by source
   object, calls `ObjectEdges` once per source object, matches `(type, dst_id)`
   and deletes by ID. Edges of deleted objects are removed by the cascade of
   the single delete, so only edges between surviving objects need this.
   Object IDs and keys are resolved from the ingest's own key index or
   `GetObjectByKey`.
4. **Scenarios (resolved by code trace; the original assumption was wrong).**
   - Creating a branch does not copy objects (facts table).
   - `evaluate_scenario`, `commit_scenario` and `discard_scenario` take a
     `scenario_id` and check access only to the `instance_id` in the request.
     They never check that the branch belongs to that instance. A caller with
     access to instance A can evaluate, merge or discard instance B's scenario
     by ID. **This is an isolation hole and is in scope.**
   - The client calls `POST /api/graph/branches/{scenarioID}/merge` with
     `{source_branch_id, dry_run}`. Memory treats the path parameter as the
     *target* branch and reads `execute` (default false); it ignores `dry_run`.
     So today `commit_scenario` is a dry-run merge of the branch into itself and
     never changes `main`. It therefore cannot write foreign objects into
     `main`, and gating it is not needed. The tool description promises a
     staging batch and the response puts the merge summary in `batch_id`; both
     are wrong and out of scope here.
   - **Decision.** (a) Every scenario operation requires the branch name to
     start with `scenario-<instanceUUID>-`, checked through `GetBranch`; the
     prefix is 46 characters and survives the 100-character truncation in
     `RunScenario`. Otherwise respond as for a non-existent scenario. (b) Branch
     reads are scoped as described in Decision 3. (c) A test pins that
     `commit_scenario` never sends `execute: true`. (d) Follow-up issue: making
     commit real must merge only the instance's own objects, because Memory's
     merge acts on the whole branch.
5. **Deployment posture.** The production deploy workflow runs in a
   Memory-degraded posture by default: a placeholder `EPF_MEMORY_TOKEN`
   (`.github/workflows/strategy-server-deploy.yaml:121`). This change only has an
   effect where Memory is configured. Confirm that the pilot deployment has a
   real Memory token and a Memory at v0.85.0 or later before the upgrade.
