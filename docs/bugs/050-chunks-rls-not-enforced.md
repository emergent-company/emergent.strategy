# Bug Report: Chunks RLS Policies Not Enforced - Cross-Project Data Leakage

**Status:** RESOLVED  
**Severity:** Critical  
**Component:** Database / Security / Multi-tenancy  
**Discovered:** 2025-11-19  
**Discovered by:** AI Agent (during investigation of bug #049)  
**Resolved:** 2025-11-19  
**Resolution:** Added RLS policies and migrated to tenant-scoped queries

---

## Summary

The `kb.chunks` table had no Row-Level Security (RLS) policies enabled, and the chunks controller didn't require the `x-project-id` header, allowing potential cross-project data leakage when querying chunks without a documentId filter.

---

## Description

**Actual Behavior:**

- `kb.chunks` table had NO RLS policies enabled (unlike kb.documents, kb.graph_objects, kb.graph_relationships)
- Chunks controller accepted requests without `x-project-id` header
- ChunksService used TypeORM QueryBuilder which bypasses RLS entirely
- When querying `/chunks` without documentId filter, chunks from all projects could be returned

**Expected Behavior:**

- All data tables should have RLS policies for multi-tenant isolation
- All controllers should require `x-project-id` header
- All queries should use `DatabaseService.query()` to respect RLS
- Chunks should be filtered by project via join to documents table

**When/How It Occurs:**

- Discovered during security audit after fixing bug #049 (document RLS)
- Found that only 3 of 34 tables had RLS enabled
- Chunks table was identified as vulnerable due to missing RLS and lack of project header requirement

---

## Reproduction Steps

### Before Fix:

1. Query chunks without documentId filter: `GET /chunks`
2. Observe chunks from multiple projects returned
3. No `x-project-id` header validation
4. ChunksService uses TypeORM which bypasses RLS

### Evidence of Vulnerability:

```sql
-- Chunks table had NO RLS enabled
SELECT relname, relrowsecurity FROM pg_class
WHERE relname = 'chunks' AND relnamespace = 'kb'::regnamespace;
  relname | relrowsecurity
----------+----------------
  chunks  | f              -- ❌ FALSE = NO RLS

-- No policies existed
SELECT COUNT(*) FROM pg_policies
WHERE schemaname='kb' AND tablename='chunks';
 count
-------
     0  -- ❌ NO POLICIES
```

**Controller Code (Before Fix):**

```typescript
// chunks.controller.ts - NO x-project-id requirement
list(
  @Query('documentId', new ParseUUIDPipe({ version: '4', optional: true }))
  documentId?: string,
  @Req() req?: any  // ❌ No project header validation
) {
  return this.chunks.list(documentId);  // ❌ No projectId passed
}
```

**Service Code (Before Fix):**

```typescript
// chunks.service.ts - TypeORM bypasses RLS
async list(documentId?: string) {
  const query = this.chunkRepository
    .createQueryBuilder('c')  // ❌ TypeORM bypasses RLS
    .leftJoinAndSelect('c.document', 'd');

  if (documentId) {
    query.where('c.documentId = :documentId', { documentId });
  }
  // ❌ No project filtering, no RLS enforcement
  return query.getMany();
}
```

---

## Logs / Evidence

### Database State (Before Fix)

```bash
# Check RLS status across all tables
psql spec_dev -c "
SELECT schemaname, tablename,
       (SELECT relrowsecurity FROM pg_class WHERE oid = (schemaname||'.'||tablename)::regclass) as rls_enabled,
       (SELECT COUNT(*) FROM pg_policies WHERE schemaname = t.schemaname AND tablename = t.tablename) as policy_count
FROM pg_tables t
WHERE schemaname = 'kb'
ORDER BY rls_enabled DESC, tablename;
"

# Results showed:
# ✅ kb.documents - RLS enabled, 4 policies
# ✅ kb.graph_objects - RLS enabled, 4 policies
# ✅ kb.graph_relationships - RLS enabled, 4 policies
# ❌ kb.chunks - RLS disabled, 0 policies
# ❌ 30 other tables - RLS disabled, 0 policies
```

**Log Location:** Investigation performed 2025-11-19  
**Timestamp:** 2025-11-19 12:15:00

---

## Impact

- **User Impact:** **CRITICAL SECURITY ISSUE** - Chunks from all projects could potentially be accessed by any authenticated user, violating multi-tenant isolation
- **System Impact:**
  - Inconsistent security model (documents protected, chunks not)
  - Undermines entire RLS architecture
  - Cross-project data leakage risk
- **Frequency:** Affects 100% of chunk queries without documentId filter
- **Workaround:** None - requires database-level RLS enforcement

---

## Root Cause Analysis

### Security Gap Identified

The chunks table was created without RLS policies, and the application code didn't enforce project-level filtering:

1. **Missing RLS policies** - `kb.chunks` had `relrowsecurity = false`
2. **TypeORM usage** - Service used QueryBuilder which bypasses RLS entirely
3. **No header validation** - Controller didn't require `x-project-id` header
4. **No project filtering** - No JOIN to documents table for project isolation

**Why This Happened:**

- Documents table received RLS policies in migration 011
- Chunks table was created earlier and not updated with RLS
- Service used TypeORM pattern instead of raw SQL with `DatabaseService.query()`
- Controller followed older pattern without header validation

**Related Files:**

- `apps/server/src/modules/chunks/chunks.controller.ts:47-60` - Controller (no header requirement)
- `apps/server/src/modules/chunks/chunks.service.ts:26-50` - Service (TypeORM usage)
- `apps/server/src/common/database/database.service.ts:488-530` - Tenant-scoped query wrapper
- `docs/migrations/012-enable-rls-on-chunks-table.sql` - NEW migration with RLS policies

---

## Proposed Solution

### Multi-Layered Security Fix

**Phase 1: Application-Level Protection**

1. ✅ Update controller to require `x-project-id` header
2. ✅ Migrate service from TypeORM to raw SQL with `DatabaseService.query()`
3. ✅ Add project filtering via JOIN to documents table

**Phase 2: Database-Level Protection**

4. ✅ Create RLS policies for chunks table (SELECT, INSERT, UPDATE, DELETE)
5. ✅ Enable RLS on chunks table
6. ✅ Apply migration to development and E2E databases

**Phase 3: Testing**

7. ✅ Add E2E test for cross-project isolation
8. ✅ Verify RLS enforcement with multiple projects
9. ✅ Test header validation

**Changes Required:**

1. ✅ Controller: Add `x-project-id` header validation and BadRequestException
2. ✅ Service: Replace TypeORM with `DatabaseService.query()` + `runWithTenantContext()`
3. ✅ Service: Add INNER JOIN to documents table for project filtering
4. ✅ Migration: Create 4 RLS policies (SELECT, INSERT, UPDATE, DELETE) via documents JOIN
5. ✅ Tests: Add `chunks.cross-project-isolation.e2e.spec.ts`

**Testing Plan:**

- [x] Create E2E test for chunks cross-project isolation
- [x] Test prevents accessing chunks from another project
- [x] Test RLS filters chunk list by project
- [x] Test rejects requests without x-project-id header
- [x] Apply migration to development database
- [x] Apply migration to E2E database
- [x] Run E2E tests - all passing

---

## Resolution

**Date:** 2025-11-19  
**Implemented by:** AI Agent  
**Action Plan:** `docs/plans/020-fix-chunks-rls-security.md`

### Fix Applied

Implemented **multi-layered security** approach with both application and database protections.

**Phase 1: Application Changes**

1. **Controller** (`apps/server/src/modules/chunks/chunks.controller.ts`):

   ```typescript
   list(
     @Query('documentId', new ParseUUIDPipe({ version: '4', optional: true }))
     documentId?: string,
     @Req() req?: any
   ) {
     const projectId = (req?.headers['x-project-id'] as string | undefined) || undefined;
     if (!projectId) {
       throw new BadRequestException({
         error: { code: 'bad-request', message: 'x-project-id header required' },
       });
     }
     return this.chunks.list(documentId, projectId);
   }
   ```

2. **Service** (`apps/server/src/modules/chunks/chunks.service.ts`):
   ```typescript
   async list(documentId?: string, projectId?: string): Promise<ChunkDto[]> {
     const queryFn = async () => {
       return await this.db.query(
         `SELECT c.id, c.document_id, c.chunk_index, c.text, c.embedding,
                 d.filename, d.source_url
          FROM kb.chunks c
          INNER JOIN kb.documents d ON c.document_id = d.id
          WHERE ($1::uuid IS NULL OR c.document_id = $1)
          ORDER BY c.created_at ASC, c.chunk_index ASC`,
         [documentId]
       );
     };

     const rows = await this.db.runWithTenantContext(projectId, queryFn);
     return rows.map((r: any) => this.mapRow(r));
   }
   ```

**Phase 2: Database Migration**

Created `docs/migrations/012-enable-rls-on-chunks-table.sql` with 4 policies:

```sql
-- Enable RLS on chunks table
ALTER TABLE kb.chunks ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Filter chunks via documents table JOIN
CREATE POLICY chunks_select_policy ON kb.chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM kb.documents d
      WHERE d.id = chunks.document_id
      AND d.project_id::text = current_setting('app.current_project_id', true)
    )
  );

-- INSERT policy: Verify parent document belongs to current project
CREATE POLICY chunks_insert_policy ON kb.chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM kb.documents d
      WHERE d.id = chunks.document_id
      AND d.project_id::text = current_setting('app.current_project_id', true)
    )
  );

-- UPDATE policy: Only update chunks in current project
CREATE POLICY chunks_update_policy ON kb.chunks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM kb.documents d
      WHERE d.id = chunks.document_id
      AND d.project_id::text = current_setting('app.current_project_id', true)
    )
  );

-- DELETE policy: Only delete chunks in current project
CREATE POLICY chunks_delete_policy ON kb.chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM kb.documents d
      WHERE d.id = chunks.document_id
      AND d.project_id::text = current_setting('app.current_project_id', true)
    )
  );
```

Applied to:

- ✅ Development database (port 5437)
- ✅ E2E database (port 5438)

**Phase 3: Tests**

Created `apps/server/tests/e2e/chunks.cross-project-isolation.e2e.spec.ts` with 3 tests:

1. ✅ Prevents accessing chunks from another project via x-project-id header
2. ✅ RLS filters chunk list by project when no documentId filter provided
3. ✅ Rejects requests without x-project-id header

All tests passing ✅

### Verification

**E2E Test Results (2025-11-19):**

```
✓ Chunks Cross-Project Isolation E2E > prevents accessing chunks from another project via x-project-id header
✓ Chunks Cross-Project Isolation E2E > RLS filters chunk list by project when no documentId filter provided
✓ Chunks Cross-Project Isolation E2E > rejects requests without x-project-id header

Test Files  1 passed (1)
Tests       3 passed (3)
Duration    2.57s
```

**Database Verification:**

```sql
-- RLS now enabled
SELECT relname, relrowsecurity FROM pg_class
WHERE relname = 'chunks' AND relnamespace = 'kb'::regnamespace;
  relname | relrowsecurity
----------+----------------
  chunks  | t              -- ✅ TRUE = RLS ENABLED

-- All 4 policies exist
SELECT policyname FROM pg_policies
WHERE schemaname='kb' AND tablename='chunks';
       policyname
-----------------------
 chunks_select_policy  -- ✅
 chunks_insert_policy  -- ✅
 chunks_update_policy  -- ✅
 chunks_delete_policy  -- ✅
```

**Application Logs (confirming RLS context):**

```
[db.query][set_config] {
  org: '0a9eaff0-02a8-4dff-9561-58b91e77988e',
  project: 'b298d5cc-4da1-4af1-af55-39db5e8ef3b3',
  rowSecurity: 'on (scoped)'
}

[db.query][execute] {
  text: 'SELECT c.id, c.document_id, ... FROM kb.chunks c INNER JOIN kb.documents d ON c.document_id = d.id ...',
  org: '0a9eaff0-02a8-4dff-9561-58b91e77988e',
  project: 'b298d5cc-4da1-4af1-af55-39db5e8ef3b3',
  rowSecurity: 'on (scoped)'
}
```

### Why The Fix Works

**Defense in Depth - Multiple Security Layers:**

1. **Application Layer** (Header Validation):

   - Controller rejects requests without `x-project-id` header
   - Prevents accidental queries without project context
   - Provides clear error message to API consumers

2. **Application Layer** (Query Pattern):

   - Service uses `DatabaseService.query()` which respects RLS
   - Explicit INNER JOIN to documents ensures relationship validation
   - Uses `runWithTenantContext()` for proper context management

3. **Database Layer** (RLS Policies):
   - Four policies enforce project isolation at database level
   - SELECT policy filters via documents table JOIN
   - INSERT/UPDATE/DELETE policies prevent cross-project modifications
   - Works even if application code has bugs

**Benefits:**

- ✅ Multiple independent security mechanisms (if one fails, others protect)
- ✅ Database-level enforcement cannot be bypassed by application bugs
- ✅ Clear error messages for missing headers
- ✅ Consistent with documents table security model
- ✅ E2E tests verify all layers working correctly

### Outstanding Tasks

**Immediate:**

- [x] Apply migration to development database
- [x] Apply migration to E2E database
- [x] Create E2E tests
- [x] Verify all tests pass
- [x] Update bug report with resolution
- [x] Update action plan with completion status

**Future Security Audit:**

- [ ] Audit remaining 30 tables without RLS
- [ ] Create comprehensive security plan for all tables
- [ ] Document which tables need project-level vs org-level isolation
- [ ] Add monitoring for RLS policy violations

---

## Related Issues

- Related to #049 - Document RLS not enforced (same root cause - transaction wrapping)
- Part of broader security audit of RLS implementation across all tables
- Identified during investigation that only 3 of 34 tables have RLS

---

## Notes

### Tables with RLS (Before This Fix)

1. ✅ `kb.documents` - 4 policies (migration 011)
2. ✅ `kb.graph_objects` - 4 policies
3. ✅ `kb.graph_relationships` - 4 policies

### Tables with RLS (After This Fix)

4. ✅ `kb.chunks` - 4 policies (migration 012) - **NEWLY PROTECTED**

### Remaining Security Work

31 tables still without RLS policies. Requires comprehensive audit to determine:

- Which tables need project-level isolation
- Which tables need organization-level isolation
- Which tables are global/shared (no isolation needed)

### Migration Pattern Established

This fix establishes a reusable pattern for adding RLS to tables that reference documents:

1. Add RLS policies with EXISTS subquery to documents table
2. Enable RLS on table
3. Migrate service from TypeORM to `DatabaseService.query()`
4. Add `x-project-id` header requirement to controller
5. Create E2E tests for cross-project isolation

This pattern can be applied to other tables (e.g., `kb.object_extraction_jobs`, `kb.chat_messages`).

---

**Last Updated:** 2025-11-19 by AI Agent  
**Resolution Verified:** 2025-11-19 - RLS enforced, E2E tests passing, no cross-project data leakage
