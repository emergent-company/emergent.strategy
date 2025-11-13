# Atomic CTE Inserts & Cascade Deletion Strategy

This service enforces strong referential integrity and deterministic HTTP semantics for organization/project scoped resources (documents, ingestion, chat, search) via two complementary patterns:

## 1. Database-Level Cascades

`projects.org_id` has `ON DELETE CASCADE`. Deleting an organization removes all its projects, and through those projects all dependent rows (documents, chunks, conversations, etc.) are removed via their own FK chains.

Benefits:
- Single authoritative delete (no application fan-out loops)
- Fast, set-based execution inside the database
- Eliminates partial failure windows during multi-step explicit cleanup

## 2. Atomic Guarded Inserts (CTE Pattern)

To avoid race conditions where an org/project might be deleted **between** an application layer existence check and the subsequent insert, write paths use a single `WITH ... INSERT ... SELECT` CTE. Example (documents / ingestion simplified):

```sql
WITH target AS (
  SELECT p.id AS project_id
  FROM kb.projects p
  WHERE p.id = $1
  LIMIT 1
)
INSERT INTO kb.documents (id, project_id, org_id, source, checksum, created_at)
SELECT gen_random_uuid(), project_id, $2, $3, $4, now()
FROM target
RETURNING id;
```

Application logic:
1. Execute the CTE.
2. If `rowCount === 0`, respond `400 Bad Request` (`project_not_found_or_deleted`).
3. Otherwise return the created entity.

Advantages:
- Zero FK 23503 surfacing to clients (deterministic 4xx instead of 500)
- Removes timing window between validation and insert
- Keeps code simpler (no try/catch error code translation required)

## 3. Early Validation for Network Operations

In ingestion URL flows we perform an *early* project/org existence check **before** outbound network fetches. This avoids wasted latency if the project was just deleted. Only after the guarded insert passes do we proceed with heavy work (chunking, embedding, etc.).

## 4. Error Semantics
- Missing / deleted project => 400
- Duplicate content decisions handled idempotently (dedup returns existing representation)
- No reliance on global exception filter for FK errors; domain code prevents them deterministically

## 5. Testing Approach

### Build & OpenAPI

Commands:

- `npm run build` (root) cleans then builds server and admin.
- `npm --prefix apps/server-nest run build` cleans then compiles server only.
- `npm --prefix apps/server-nest run gen:openapi` builds then outputs `openapi.json` & `openapi.yaml` in `apps/server-nest/`.
- `npm run clean` (root) removes server and admin build artifacts.

Notes:

- Legacy `dist-openapi/` output and spec copy into the removed legacy server folder were eliminated to reduce noise.
- If you encounter schema drift, regenerate spec via `gen:openapi` before diffing (`npm run spec:diff`).
## 6. When Adding New Write Paths
1. Identify required parent keys (orgId, projectId)
2. Express insert as guarded CTE referencing *only* parent table(s)
3. After execution, if no row inserted -> 400
4. Avoid separate pre-flight `SELECT` unless it's an inexpensive *fast-fail* before expensive work
5. Add E2E covering deletion race (create parent, delete, attempt child create)

---
*This document supplements the main README to clarify the invariant patterns ensuring consistency and deterministic errors around cascading deletes.*
