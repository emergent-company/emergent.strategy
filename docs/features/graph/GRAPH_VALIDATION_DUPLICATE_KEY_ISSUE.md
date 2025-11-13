# Graph Validation Duplicate Key Issue

## Problem

**Test:** "should validate graph objects against type schemas" in phase1.workflows.e2e.spec.ts  
**Error:** `duplicate key value violates unique constraint "idx_graph_objects_project_key"`  
**Status:** 500 Internal Server Error  
**Expected:** 200 OK

## Root Cause

The error references constraint `idx_graph_objects_project_key`, but this constraint **does not exist** in our migration files!

### Expected Constraint (from 0001_init.sql line 2081):
```sql
CREATE UNIQUE INDEX idx_graph_objects_head_identity_branch 
ON kb.graph_objects USING btree (project_id, branch_id, type, key) 
WHERE ((supersedes_id IS NULL) AND (deleted_at IS NULL) AND (key IS NOT NULL));
```

### Actual Constraint (from error):
```
constraint: 'idx_graph_objects_project_key'
```

## Diagnosis

1. ❌ The constraint name in the error doesn't match our migrations
2. ❌ Test database likely has stale schema from old migration
3. ✅ The INSERT query at line 540 in graph.service.ts looks correct
4. ✅ Versioning logic should prevent conflicts (new version has supersedes_id set)

## Test Scenario

```typescript
// Create object
POST /graph/objects { type: 'ValidatedObject', key: 'valid-object', ... }
// Returns 201, object created with id=XXX

// First PATCH (works)
PATCH /graph/objects/XXX { properties: { status: 'inactive' } }
// Returns 200, creates new version with id=YYY, supersedes_id=XXX

// Second PATCH (fails with duplicate key)
PATCH /graph/objects/YYY { properties: { count: 150 } }
// Returns 500, duplicate key error on 'idx_graph_objects_project_key'
```

## Why This Shouldn't Happen

When patching:
1. Acquires advisory lock on canonical_id
2. Checks if current version is still HEAD
3. Inserts new version with `supersedes_id = current.id`
4. The unique constraint has `WHERE supersedes_id IS NULL`
5. Therefore new version should NOT violate constraint

## Hypothesis

The test database has an **outdated unique constraint** that:
- Has different name (`idx_graph_objects_project_key` vs `idx_graph_objects_head_identity_branch`)
- Has different definition (possibly missing `WHERE supersedes_id IS NULL`)
- Was created by an old migration that's since been deleted

## Solution

### Immediate (Test Fix):
1. **Reset test database** to ensure clean schema
2. **Drop stale index** if it exists:
   ```sql
   DROP INDEX IF EXISTS kb.idx_graph_objects_project_key;
   ```

### Long-term (Process Fix):
1. ✅ Add migration system (already done - `apps/server/scripts/migrate.mjs`)
2. ✅ Track applied migrations in database (`kb.schema_migrations` table)
3. 🔲 Add test setup that ensures fresh database before test runs
4. 🔲 Document database reset procedure in test documentation
5. 🔲 Add schema validation in test bootstrap (compare DB schema with migrations)

## Files Affected

- `apps/server/src/modules/graph/graph.service.ts` (line 540 - INSERT query)
- `apps/server/tests/e2e/phase1.workflows.e2e.spec.ts` (line 516 - failing assertion)
- `apps/server/migrations/0001_init.sql` (line 2081 - correct index definition)

## Next Steps

1. Start fresh postgres container or reset test database
2. Run `nx run server:migrate` to apply latest schema
3. Verify index exists with correct name:
   ```sql
   SELECT indexname, indexdef 
   FROM pg_indexes 
   WHERE schemaname = 'kb' 
     AND tablename = 'graph_objects' 
     AND indexname LIKE '%idx_graph%';
   ```
4. Re-run workflow tests

## Related Issues

- Database schema drift between dev/test environments
- Need automated schema validation in test setup
- Migration system recently added but test databases not yet reset
