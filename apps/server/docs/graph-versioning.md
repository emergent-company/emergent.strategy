# Graph Versioning & Soft Delete Semantics

Status: Draft (Internal)
Last Updated: 2025-09-25
Owner: Backend Graph Module

## Overview
The graph subsystem uses **append-only versioned rows** for both Objects and Relationships. Every logical entity is identified by a stable `canonical_id` and a monotonically increasing `version` integer. Mutations never update rows in place; instead they append a new head version. This enables auditability, optimistic concurrency, and reversible soft deletes.

## Core Concepts
| Term | Meaning |
|------|---------|
| canonical_id | Stable logical identity shared by all versions of an object/relationship |
| version | Integer sequence (1,2,3,...) ordered strictly ASC per canonical_id |
| head | Row with the greatest `version` for a canonical_id |
| supersedes_id | (Optional) Back-reference to the immediate prior version row id (used for restore provenance) |
| tombstone | Head row whose `deleted_at` is non-null (soft deleted) |

## Lifecycle Operations
### Create Object / Relationship
Inserts version = 1 (or next max+1 if re-creating after purge in future) with `deleted_at = NULL`.

### Update (Patch)
1. Acquire advisory lock on logical identity (object: `obj|canonical_id`; relationship: `rel|<org>|<type>|<src>|<dst>` when creating).  
2. Read current head; reject if it is soft deleted for patch (must restore first).  
3. Insert new row with `version = head.version + 1`, copying forward immutable fields, merging updated props.

### Soft Delete
1. Lock canonical_id.  
2. Insert new row `version = head.version + 1` with same identifying fields and `deleted_at = NOW()`.  
3. Do NOT modify prior live row (append-only).  
Result: head becomes a tombstone and entity disappears from all “active” queries.

### Restore
1. Lock canonical_id.  
2. Fetch head; require `deleted_at IS NOT NULL`.  
3. Find previous live version (`SELECT ... WHERE deleted_at IS NULL ORDER BY version DESC LIMIT 1`).  
4. Insert restored row copying previous live data, `version = head.version + 1`, `deleted_at = NULL`, `supersedes_id = head.id` (records which tombstone was replaced).  

### Double Delete / Invalid Restore
- Deleting when head already tombstoned → `already_deleted` error.
- Restoring when head not deleted → `not_deleted` error.
- Restoring if no prior live version (should not happen for current flows) → `no_prior_live_version`.

## Query Pattern (Critical Rule)
> Always select the head first (including tombstones) then filter out deleted heads externally.

Incorrect (old):
```sql
SELECT DISTINCT ON (canonical_id) *
FROM kb.graph_objects
WHERE deleted_at IS NULL
ORDER BY canonical_id, version DESC;
```
This wrongly resurfaces an older live version after a delete because the tombstone is excluded before DISTINCT ON grouping.

Correct (current):
```sql
SELECT * FROM (
  SELECT DISTINCT ON (canonical_id) *
  FROM kb.graph_objects
  ORDER BY canonical_id, version DESC
) heads
WHERE heads.deleted_at IS NULL;
```
This ensures that if the head is a tombstone, the entire canonical entity is excluded (not replaced by stale history).

The same pattern applies to relationships (search, edge listing, traversal expansion).

## Indexing
To make head selection efficient:
```sql
-- Objects
CREATE INDEX IF NOT EXISTS idx_graph_objects_canonical_version_desc
  ON kb.graph_objects (canonical_id, version DESC);

-- Relationships
CREATE INDEX IF NOT EXISTS idx_graph_relationships_canonical_version_desc
  ON kb.graph_relationships (canonical_id, version DESC);
```
These composite indexes allow the DISTINCT ON or a window function to read the head with an index-only scan in most cases.

## Concurrency Control
PostgreSQL advisory locks prevent race conditions on head advancement:
- Objects: `pg_advisory_xact_lock(hashtext('graph_obj|' || canonical_id))`.
- Relationships (during delete/restore/update): `pg_advisory_xact_lock(hashtext('graph_rel|' || canonical_id))`.

Locks are taken inside the same transaction performing the insert, ensuring atomic visibility of the new head.

## Pitfalls & Anti-Patterns
| Issue | Consequence | Resolution |
|-------|-------------|-----------|
| Filtering `deleted_at IS NULL` before DISTINCT ON | Deleted entities reappear using stale version | Use head-first then outer filter |
| Updating rows in place | Breaks audit trail & race safety | Always append new version |
| Forgetting index on (canonical_id, version DESC) | Full scans / poor pagination | Add composite index |
| Not locking during version increment | Write skew producing duplicate head candidates | Use advisory lock key |
| Relying on historical row id for current state | Stale reads post new version | Always re-select head when needed |

## Future Extensions
- Hard delete maintenance job to purge historical versions older than retention window (careful: must re-gapless? No—gaps acceptable, only monotonic requirement remains).
- Temporal queries: add `AS OF` semantics using `valid_from/valid_to` (already present placeholders on relationships) to reconstruct past snapshots.
- Event sourcing bridge: emit domain events on version append for streaming consumers.

## Testing Strategy
E2E tests (`tests/e2e/graph.soft-delete.e2e.spec.ts`) cover:
- Object delete hides from search; restore shows again.
- Relationship delete hides from edges; restore shows again.
- Double delete & invalid restore error paths.

Additions recommended:
- History listing shows tombstone + restored versions in order.
- Traversal excludes deleted edges & nodes consistently.

## Summary
The head-first selection pattern is the linchpin ensuring correctness of soft deletes in a versioned, append-only graph. All future queries introducing filtering/grouping by canonical identity MUST follow this documented pattern to avoid data resurrection bugs.
