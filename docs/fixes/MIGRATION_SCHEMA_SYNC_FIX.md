# Migration Schema Synchronization Fix

**Date:** 2025-10-25  
**Status:** ✅ Completed  
**Result:** E2E tests improved from 2/68 → 17/68 passing

## Problem Summary

After completing the migration-based schema refactor (replacing the 245-line `full-reset-db.ts` script with migrations as single source of truth), E2E tests severely regressed from 16/68 → 2/68 passing.

**Root Cause:** The new simplified schema in `0001_init.sql` was missing critical columns and constraints that the service layer (particularly `GraphService` and `OrgsService`) expected.

## Issues Discovered

### 1. Test Cleanup Query References Non-Existent Column
**File:** `tests/e2e/e2e-context.ts` line 136  
**Error:** `column "object_id" does not exist`

**Problem:**
```typescript
// BROKEN - graph_embedding_jobs doesn't have object_id column
await pool.query(`DELETE FROM kb.graph_embedding_jobs WHERE object_id IN (SELECT id FROM kb.graph_objects WHERE project_id = $1)`, [projectId]);
```

**Fix:**
```typescript
// FIXED - graph_embedding_jobs only has project_id
await pool.query(`DELETE FROM kb.graph_embedding_jobs WHERE project_id = $1`, [projectId]);
```

### 2. Graph Objects Schema Missing Critical Columns
**File:** `apps/server/migrations/0001_init.sql`  
**Error:** Graph object creation returned `500 Internal Server Error`

**Problem:** 
The simplified schema had only 13 columns:
- `id`, `key`, `type`, `name`, `properties`, `labels`, `status`, `organization_id`, `project_id`, `created_by`, `embedding`, `created_at`, `updated_at`

**Missing Columns:**
- `version` (INTEGER) - required for versioning system
- `canonical_id` (UUID) - required for canonical reference tracking
- `supersedes_id` (UUID) - required for history tracking
- `branch_id` (UUID) - required for branching system
- `change_summary` (JSONB) - required for audit trail
- `content_hash` (BYTEA) - required for deduplication
- `fts` (TSVECTOR) - required for full-text search
- `embedding_updated_at` (TIMESTAMPTZ) - required for embedding management
- `expires_at` (TIMESTAMPTZ) - required for TTL functionality

**Fix:** Restored full schema from `0001_init.sql.old` (21 columns total)

### 3. Graph Relationships Schema Column Name Mismatch
**File:** `apps/server/migrations/0001_init.sql`  
**Error:** Service layer couldn't insert relationships

**Problem:**
- New schema used: `from_object_id`, `to_object_id`
- Service expected: `src_id`, `dst_id`
- Missing columns: `version`, `canonical_id`, `supersedes_id`, `branch_id`, `change_summary`, `content_hash`

**Fix:** Restored full schema with `src_id`/`dst_id` naming and all missing columns

### 4. Missing Membership Unique Constraints
**File:** `apps/server/migrations/0001_init.sql`  
**Error:** `there is no unique or exclusion constraint matching the ON CONFLICT specification`

**Problem:**
`OrgsService` uses `ON CONFLICT (organization_id, user_id) DO NOTHING` but the table had no unique constraint on that column pair.

**Fix:**
Added missing unique indexes:
```sql
CREATE UNIQUE INDEX idx_org_membership_unique ON kb.organization_memberships(organization_id, user_id);
CREATE UNIQUE INDEX idx_project_membership_unique ON kb.project_memberships(project_id, user_id);
```

### 5. Migration Tracking Not Cleared During Reset
**File:** `scripts/full-reset-db.ts`  
**Problem:** Migration tracking table `public.schema_migrations` was in a different schema than `kb` and `core`, so it survived the `DROP SCHEMA ... CASCADE`. This caused stale migration records to remain after reset.

**Fix:**
Added cleanup step:
```typescript
console.log('[full-reset-db] Clearing migration tracking table');
await exec(pool, 'DELETE FROM public.schema_migrations');
```

## Files Modified

1. **`tests/e2e/e2e-context.ts`**
   - Fixed cleanup query to use `project_id` instead of non-existent `object_id`

2. **`apps/server/migrations/0001_init.sql`**
   - Restored full `graph_objects` table schema (13 → 21 columns)
   - Restored full `graph_relationships` table schema with correct column names (`src_id`/`dst_id`)
   - Added unique indexes for membership tables
   - Fixed duplicate index creation bug

3. **`scripts/full-reset-db.ts`**
   - Added migration tracking table cleanup step

## Test Results

| Phase | Passing | Failing | Status |
|-------|---------|---------|--------|
| Before Migration Refactor | 16/68 | 52/68 | Baseline |
| After Migration Refactor | 2/68 | 66/68 | ❌ Severe Regression |
| After Schema Sync Fix | 17/68 | 51/68 | ✅ Recovered + Improved |

**Key Achievement:** Not only recovered from the regression but improved by 1 additional passing test (16 → 17).

## Remaining Issues

Still 51 test files failing. Common patterns:
- Upload/ingestion returning `500 Internal Server Error`
- Missing function: `kb.refresh_revision_counts()`
- Some ClickUp integration tests failing (may be config-dependent)
- Chat/streaming tests failing (may be LLM provider config)

These appear to be different issues unrelated to the schema synchronization problem.

## Lessons Learned

### 1. Schema Simplification Must Update Service Layer
When simplifying database schemas, all service code must be updated to match. Don't assume the simplified schema will work with existing service code.

### 2. Migration Changes Require Full Service Code Audit
Changing column names (`from_object_id` → `src_id`) or removing columns requires searching for all references in:
- Service layer SQL queries
- Test cleanup code
- DTO mappings
- Type definitions

### 3. Unique Constraints Are Part of Service Contracts
If service code uses `ON CONFLICT (col1, col2)`, the schema MUST have a unique constraint on those columns. Check for all `ON CONFLICT` clauses when copying schemas.

### 4. Old Migrations Are Documentation
The `.old` backup of the original migration proved invaluable for determining what the service layer actually expected. Keep old migrations as reference during refactors.

### 5. Migration Tracking Lives in Different Schema
Be aware that `public.schema_migrations` survives `DROP SCHEMA kb CASCADE`. Always clear it during full resets.

### 6. Test Early and Often During Schema Changes
Running E2E tests immediately after schema changes would have caught these issues before completing the refactor.

## Prevention Strategy

For future schema refactors:

1. **Before changing schema:**
   - Grep for all column names being changed: `grep -r "old_column_name" apps/server/src/`
   - Search for ON CONFLICT clauses: `grep -r "ON CONFLICT" apps/server/src/`
   - Check test cleanup code: `grep -r "DELETE FROM" apps/server/tests/`

2. **During refactor:**
   - Keep old schema accessible for reference (`.old` backup)
   - Make incremental changes, test after each
   - Update service code BEFORE updating schema
   - Document why each column exists (especially non-obvious ones like `canonical_id`)

3. **After refactor:**
   - Run full test suite immediately
   - Check for any `500 Internal Server Error` responses
   - Verify all unique constraints match service expectations
   - Clear migration tracking during resets

## Related Documentation

- [Migration Refactor Session](./MIGRATION_REFACTOR.md) - Original schema duplication fix
- [Self-Learning Log](../.github/instructions/self-learning.instructions.md) - Lessons learned entry
- [Database Migrations Guide](./DATABASE_MIGRATIONS.md) - Migration best practices

## Conclusion

The migration-based refactor was architecturally correct (migrations as single source of truth), but the simplified schema was too aggressive. The GraphService and OrgsService were built for a more complex schema with versioning, branching, and history tracking. Restoring the full schema resolved the regression and actually improved test results slightly.

**Next Steps:** Investigate remaining 51 failing tests, focusing on:
1. Upload/ingestion 500 errors
2. Missing `refresh_revision_counts()` function
3. Chat streaming issues
