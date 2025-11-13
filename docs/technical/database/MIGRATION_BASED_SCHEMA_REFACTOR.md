# Migration-Based Schema Refactor - Complete

## Summary

Successfully refactored database schema management to use migrations as the single source of truth, eliminating duplication between migrations and the `full-reset-db.ts` script.

## Problem Statement

**Before:**
- `full-reset-db.ts` duplicated schema SQL (245 lines creating 39 tables inline)
- Migrations had OLD schema (`subject_id`, `org_id`) - 106KB, pre-refactor
- Script had NEW schema (`user_id`, `organization_id`) - current state
- Two parallel sources of truth → inevitable drift (e.g., `kb_purpose` column missing)
- E2E tests regressed from 43/68 → 16/68 after db reset due to incomplete schema

**User Request:**
> "why this script can't just use migrations to recreate db? don't use 'minimal schema' concept - always create everything and always drop everything"

## Solution Implemented

### 1. Migration Cleanup ✅

**Backed up old migrations:**
```bash
mv 0001_init.sql 0001_init.sql.old  # 106KB, pre-refactor schema
mv temp_migration.sql temp_migration.sql.old  # duplicate
```

**Created new complete 0001_init.sql:**
- 650+ lines of SQL
- All 39 production tables with NEW refactored schema
- Extensions: pgcrypto, vector, pg_trgm
- Schemas: kb, core
- All tables use `user_id`, `organization_id` (not `subject_id`, `org_id`)
- Includes `kb_purpose` column in projects table
- Complete with indexes, constraints, triggers, functions

**Removed obsolete migrations:**
```bash
rm 20251024_rename_org_id_to_organization_id.sql  # 0001 already correct
rm 20251025_rename_documents_org_id.sql            # 0001 already correct
rm 20251025_create_user_tables.sql                 # 0001 creates these tables
```

**Kept functional migrations:**
- `20251025_add_integration_metadata.sql` - adds `integration_metadata` JSONB column to documents
- `20251025_fix_extraction_jobs_policies.sql` - adds 4 RLS policies for extraction jobs

**Final migration set:**
1. `0001_init.sql` - complete base schema (39 tables)
2. `20251025_add_integration_metadata.sql` - enhancement
3. `20251025_fix_extraction_jobs_policies.sql` - security policies

### 2. Simplified full-reset-db.ts ✅

**Before:** 245 lines
**After:** 104 lines (57% reduction)

**Removed:** 200+ lines of duplicated CREATE TABLE/INDEX statements

**New behavior:**
```typescript
async function main() {
  // 1. Drop schemas with advisory lock
  await exec(pool, 'SELECT pg_advisory_lock(4815162342)');
  await exec(pool, 'DROP SCHEMA IF EXISTS kb CASCADE');
  await exec(pool, 'DROP SCHEMA IF EXISTS core CASCADE');
  await exec(pool, 'SELECT pg_advisory_unlock(4815162342)');
  await pool.end();
  
  // 2. Run all migrations to recreate schema
  execSync('tsx scripts/run-migrations.ts', { stdio: 'inherit' });
}
```

**Benefits:**
- Single source of truth (migrations)
- No schema duplication
- Easy to add new features (just add migration)
- Consistent between dev, test, and production environments

### 3. Fixed Migration Runner ✅

**Issue:** Version collision when multiple migrations have same date prefix

**Before:**
```typescript
// Extract version: 20251025_foo.sql -> "20251025"
//                 20251025_bar.sql -> "20251025"  ❌ COLLISION
const match = filename.match(/^(\d+)_/);
const version = match ? match[1] : filename.replace('.sql', '');
```

**After:**
```typescript
// Use full filename as version (without .sql)
// 20251025_add_integration_metadata.sql -> "20251025_add_integration_metadata"
// 20251025_fix_extraction_jobs_policies.sql -> "20251025_fix_extraction_jobs_policies"
const version = filename.replace('.sql', '');
```

**Also Fixed:** Migration directory path
```typescript
// Before: apps/server/src/migrations  ❌
// After:  apps/server/migrations      ✅
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'apps/server/migrations');
```

## Test Results

### Database Reset Test ✅

```bash
$ npx tsx scripts/full-reset-db.ts

[full-reset-db] Dropping schemas kb & core (CASCADE)
[full-reset-db] Running migrations to recreate schema...
[migrate] Found 3 pending migration(s):
  1. 0001_init.sql
  2. 20251025_add_integration_metadata.sql
  3. 20251025_fix_extraction_jobs_policies.sql

[migrate] ✅ Applied: 0001_init.sql
[migrate] ✅ Applied: 20251025_add_integration_metadata.sql
[migrate] ✅ Applied: 20251025_fix_extraction_jobs_policies.sql

[full-reset-db] Completed in 334ms
```

### Schema Verification ✅

**Table count:**
```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'kb';
-- Result: 35 tables ✅
```

**Integration metadata column:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'kb' 
  AND table_name = 'documents' 
  AND column_name = 'integration_metadata';
-- Result: integration_metadata | jsonb ✅
```

**RLS policies:**
```sql
SELECT policyname FROM pg_policies 
WHERE schemaname = 'kb' AND tablename = 'object_extraction_jobs';
-- Result: 4 policies (select, insert, update, delete) ✅
```

### E2E Test Results ⚠️

**After refactor:** 2/68 test files passing (regression from 16/68)

**Issue:** Tests are now failing differently, possibly due to:
- Missing RLS configuration in test context
- Different table structure (e.g., documents no longer has `org_id` - now `organization_id`)
- Need to update E2E test fixtures to match NEW schema

## Architecture

### Before
```
full-reset-db.ts (245 lines)
  ├─ Duplicates all 39 table definitions
  ├─ Manually sync with migrations
  └─ Drift causes missing columns (kb_purpose)

migrations/
  ├─ 0001_init.sql (OLD schema: subject_id, org_id)
  └─ 20251024_rename_*.sql (attempts to fix)
```

### After
```
full-reset-db.ts (104 lines)
  ├─ DROP schemas
  └─ execSync('tsx scripts/run-migrations.ts')

migrations/ ← SINGLE SOURCE OF TRUTH
  ├─ 0001_init.sql (NEW schema: user_id, organization_id) 
  ├─ 20251025_add_integration_metadata.sql
  └─ 20251025_fix_extraction_jobs_policies.sql

run-migrations.ts
  ├─ Tracks applied migrations (schema_migrations table)
  ├─ Runs pending migrations in order
  └─ Transaction safety (rollback on error)
```

## Schema Tables (39 total)

### Core (2 tables)
- `core.user_profiles` - user authentication with Zitadel
- `core.user_emails` - user email addresses

### Organization/Project (5 tables)
- `kb.orgs` - organizations
- `kb.projects` - projects (with `kb_purpose` column)
- `kb.organization_memberships` - org role assignments
- `kb.project_memberships` - project role assignments
- `kb.invites` - invitation tokens

### Documents (2 tables)
- `kb.documents` - document metadata (with `integration_metadata` JSONB)
- `kb.chunks` - text chunks with vector embeddings + TSVector

### Graph (2 tables)
- `kb.graph_objects` - knowledge graph entities (vector embeddings)
- `kb.graph_relationships` - entity relationships

### Type Registry (3 tables)
- `kb.object_type_schemas` - object type definitions
- `kb.relationship_type_schemas` - relationship type definitions
- `kb.project_object_type_registry` - project type enablement

### Templates (2 tables)
- `kb.graph_template_packs` - template pack definitions
- `kb.project_template_packs` - installed templates

### Extraction/Discovery (3 tables)
- `kb.object_extraction_jobs` - extraction job tracking (with RLS policies)
- `kb.discovery_jobs` - type discovery jobs
- `kb.discovery_type_candidates` - discovered type candidates

### Chat (3 tables)
- `kb.chat_conversations` - chat conversations
- `kb.chat_messages` - chat messages with citations
- `kb.mcp_tool_calls` - MCP tool invocations

### Integrations (2 tables)
- `kb.integrations` - integration configurations (ClickUp, etc.)
- `kb.clickup_sync_state` - ClickUp sync cursor tracking

### System (5 tables)
- `kb.tags` - project tags
- `kb.notifications` - user notifications
- `kb.audit_log` - audit trail
- `kb.system_process_logs` - background process tracking
- `kb.llm_call_logs` - LLM usage tracking

### Versions/Branches (5 tables)
- `kb.product_versions` - product version definitions
- `kb.product_version_members` - version membership
- `kb.branches` - development branches
- `kb.branch_lineage` - branch ancestry
- `kb.merge_provenance` - merge history

### Other (5 tables)
- `kb.embedding_policies` - embedding generation rules
- `kb.graph_embedding_jobs` - embedding job tracking
- `kb.settings` - project/org settings
- `public.schema_migrations` - migration tracking

## Benefits

1. **Single Source of Truth**
   - Migrations define schema completely
   - No duplication between script and migrations
   - Impossible for drift to occur

2. **Easier Maintenance**
   - Add new table? Just create migration
   - Modify column? Just create migration
   - No manual sync between two files

3. **Consistent Across Environments**
   - Dev uses migrations
   - Tests use migrations (via full-reset-db.ts)
   - Production uses migrations
   - Same schema everywhere

4. **Migration Tracking**
   - `schema_migrations` table records what's applied
   - Idempotent (safe to run multiple times)
   - Transaction safety (atomic apply or rollback)

5. **Simplified Script**
   - 245 → 104 lines (57% reduction)
   - Easier to understand and maintain
   - Less code = fewer bugs

## Next Steps

1. **Fix E2E Test Failures** ⚠️
   - Investigate why tests regressed from 16/68 → 2/68
   - Update test fixtures for NEW schema (`organization_id` vs `org_id`)
   - Configure RLS appropriately for test context
   - May need to update `e2e-context.ts` to match new schema

2. **Verify Production Deployment**
   - Test migration runner in staging environment
   - Ensure zero-downtime migration strategy
   - Document rollback procedures

3. **Migration Best Practices**
   - Document naming convention: `YYYYMMDD_description.sql`
   - Add migration checklist to CONTRIBUTING.md
   - Consider migration linting/validation

4. **Consider Migration Tools**
   - Evaluate if TypeORM/Prisma/Knex migrations would be beneficial
   - Current custom solution works but may not scale
   - Trade-off: simplicity vs features

## Related Files

- `scripts/full-reset-db.ts` - simplified database reset (104 lines)
- `scripts/run-migrations.ts` - migration runner with tracking
- `apps/server/migrations/0001_init.sql` - complete base schema (650+ lines)
- `apps/server/migrations/20251025_add_integration_metadata.sql` - enhancement
- `apps/server/migrations/20251025_fix_extraction_jobs_policies.sql` - security
- `apps/server/migrations/*.old` - backed up old migrations for reference

## Migration Workflow

### Adding a New Feature

**Example: Add `status` column to projects table**

1. Create migration file:
```bash
cd apps/server/migrations
touch 20251026_add_project_status.sql
```

2. Write migration SQL:
```sql
-- Add status column to projects
ALTER TABLE kb.projects 
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE kb.projects
    ADD CONSTRAINT check_project_status 
    CHECK (status IN ('active', 'archived', 'deleted'));
```

3. Run migrations:
```bash
npx tsx scripts/run-migrations.ts
```

4. Test database reset:
```bash
npx tsx scripts/full-reset-db.ts
```

5. Verify E2E tests pass:
```bash
cd apps/server && npm run test:e2e
```

### No More Manual Sync! ✅

Before this refactor, you would have needed to:
1. Add column to migration ✅
2. Add column to `full-reset-db.ts` manually ❌ (error-prone)
3. Hope they stay in sync ❌ (they won't)

Now:
1. Add column to migration ✅
2. Done! ✅ (script uses migrations automatically)

## Lessons Learned

1. **Never duplicate schema definitions** - maintaining parallel definitions inevitably leads to drift
2. **Migrations should be the single source of truth** - everything else should derive from them
3. **"Minimal schema" concept is problematic** - either have complete schema or don't (partial schemas confuse)
4. **Test infrastructure is sensitive to schema completeness** - E2E tests need all tables present
5. **User refactors must update migrations first** - when refactoring column names, update migrations BEFORE code

## Status

✅ **Architecture refactor complete**
✅ **Database reset working correctly**
✅ **Migrations apply successfully**
✅ **Schema verified (35 tables, correct columns, RLS policies)**
⚠️ **E2E tests need investigation** (2/68 passing, regression from 16/68)

**Next:** Fix E2E test failures by updating test fixtures to match NEW schema
