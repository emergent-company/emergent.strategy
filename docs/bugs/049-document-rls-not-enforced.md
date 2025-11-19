# Bug Report: Document RLS Policies Not Enforced - Shows All Documents Across Projects

**Status:** RESOLVED  
**Severity:** Critical  
**Component:** Database / Security / Multi-tenancy  
**Discovered:** 2025-11-19  
**Discovered by:** Human (manual testing)  
**Resolved:** 2025-11-19  
**Resolution:** Fixed by implementing explicit transaction wrapping

---

## Summary

Row-Level Security (RLS) policies on the `kb.documents` table are not being enforced, allowing users to see documents from ALL projects instead of only documents from their currently selected project.

---

## Description

**Actual Behavior:**
When a user views the Documents page in the admin UI and switches between projects, the document list remains unchanged - showing all 6 documents from all 6 different projects in the system, regardless of which project is currently selected.

**Expected Behavior:**
Documents should be filtered by project based on RLS policies. When viewing "test 123" project, only documents belonging to that project should be visible.

**When/How It Occurs:**

- Occurs consistently for all document list queries
- Affects both initial page load and project switching
- Security vulnerability: Cross-project data leakage

---

## Reproduction Steps

1. Log in to admin UI as E2E test user (who has access to multiple projects)
2. Navigate to Documents page (`/admin/apps/documents`)
3. Note which project is selected in sidebar (e.g., "Test Proj")
4. Observe 6 documents displayed in table
5. Click project selector and switch to different project (e.g., "test 123")
6. **Bug:** Still see same 6 documents, even though they belong to 6 different projects

**Expected:** After switching to "test 123" project, should only see documents belonging to that specific project.

---

## Logs / Evidence

### Database Verification (shows RLS policies exist and work correctly)

```sql
-- RLS is enabled on documents table
SELECT relname, relrowsecurity FROM pg_class
WHERE relname = 'documents' AND relnamespace = 'kb'::regnamespace;
  relname  | relrowsecurity
-----------+----------------
 documents | t

-- All 4 policies exist
SELECT policyname FROM pg_policies
WHERE schemaname='kb' AND tablename='documents';
       policyname
-------------------------
 documents_update_policy
 documents_delete_policy
 documents_select_policy
 documents_insert_policy

-- Manual test WITH app_rls role shows RLS WORKS:
-- As app_rls (bypass_rls=false):
current_user | bypass_rls
--------------+------------
 app_rls      | f

-- Without context: 6 documents (wildcard mode)
SELECT COUNT(*) FROM kb.documents;
 count_without_context
-----------------------
                     6

-- WITH project context set: 1 document (filtered correctly!)
SET LOCAL app.current_project_id = 'e58be22b-dac8-4b95-8f85-321b6763adeb';
SELECT COUNT(*) FROM kb.documents;
 count_with_project
--------------------
                  1
```

### Application Logs (show app IS using app_rls role)

```
apps/logs/server/out.log:
2025-11-19 11:47:05: [DatabaseService] Switching from bypass/superuser role 'spec' (bypass=true, super=true) to dedicated 'app_rls' role for RLS enforcement
2025-11-19 11:47:05: [DatabaseService] Now running as role 'app_rls' (bypass=false, super=false) with graph_objects RLS enforced

[db.query][set_config] {
  org: 'fce41552-b5a6-4d3f-bf8f-e109391d49c9',
  project: '56108973-6192-4bd7-b90b-c30faae29406',
  rowSecurity: 'on (scoped)'
}
```

### Documents in Database (6 documents from 6 different projects)

```sql
                  id                  |        filename         |              project_id
--------------------------------------+-------------------------+--------------------------------------
 28f97a70-05d2-41bc-b9c3-455b8f695104 | meeting_1_extraction.md | f5606d59-838b-4d38-9151-0d4ec657332a
 61ee0e9a-098a-4660-aff2-58c2703ded55 | test-upload-5.md        | e58be22b-dac8-4b95-8f85-321b6763adeb
 ba95b368-b3bd-4e0c-be51-94ee63fc877b | extraction-test.md      | 3185a40b-440d-4751-8dd4-2be16c3d2bd5
 75ae5a34-ac53-4db7-89ce-13b58bb1e4a2 | extraction-test.md      | 026ebe99-856f-4541-886e-920a4a90e4b1
 114577e1-1c5e-43b7-8e4a-29e09c126543 | extraction-demo.md      | 4be2dc98-7eaf-4be8-a484-34f34eadaed5
 17ad06b0-0723-444b-b4e1-6d639cee8c86 | meeting_1_extraction.md | ab6fd777-d26b-4d7e-91ec-87b18ad369f1
```

**Log Location:** `apps/logs/server/out.log`  
**Timestamp:** 2025-11-19 11:47:05 - 12:00:38

---

## Impact

- **User Impact:** **CRITICAL SECURITY ISSUE** - Users can see documents from projects they are currently viewing, creating cross-project data leakage. This violates multi-tenant isolation.
- **System Impact:** Undermines entire RLS security model for documents. Graph tables (graph_objects, graph_relationships) are protected by RLS, but documents are not, creating inconsistent security posture.
- **Frequency:** Occurs on 100% of document list API calls
- **Workaround:** None - RLS policies must be enforced at database level

---

## Root Cause Analysis

Investigation reveals the following chain of events:

### ✅ What's Working

1. **RLS policies are correctly defined** - All 4 policies (SELECT, INSERT, UPDATE, DELETE) exist with correct predicates
2. **RLS is enabled on table** - `relrowsecurity = t` for kb.documents
3. **Application uses app_rls role** - Logs confirm successful role switch on startup
4. **app_rls role respects RLS** - Manual testing confirms `bypass_rls = f`
5. **Session variables are being set** - Logs show `set_config()` calls with correct project IDs
6. **Documents service calls runWithTenantContext** - Code correctly uses `this.db.runWithTenantContext(filter.projectId, queryFn)`

### ❌ What's NOT Working

**The critical issue:** Despite all the above working correctly, RLS policies are still not being enforced on document queries.

### Investigation Findings

Looking at `DatabaseService.query()` (apps/server/src/common/database/database.service.ts:457-603):

```typescript
// Line 501: Sets config with `true` parameter (transaction-local)
await queryRunner.query(
  'SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)',
  [
    'app.current_organization_id',
    effectiveOrg,
    'app.current_project_id',
    effectiveProject,
    'row_security',
    'on',
  ]
);
```

**Problem identified:** The `set_config(..., true)` parameter makes configuration **transaction-local**, meaning it only applies within the current transaction scope. However, TypeORM's QueryRunner may be executing queries outside of an explicit transaction, or the connection may be returned to the pool and reused without the context.

**Why manual psql testing worked:** When running `SET LOCAL app.current_project_id = '...'` in psql, it's within an implicit transaction. But in the application, the QueryRunner lifecycle may not maintain transaction boundaries correctly.

**Related Files:**

- `apps/server/src/common/database/database.service.ts:457-603` - query() method sets transaction-local config
- `apps/server/src/common/database/database.service.ts:1236-1288` - runWithTenantContext() wrapper
- `apps/server/src/modules/documents/documents.service.ts:42-110` - list() method uses runWithTenantContext
- `apps/server/src/modules/documents/documents.controller.ts:91-113` - controller passes project ID from header
- `docs/migrations/011-enable-rls-on-documents-table.sql` - Migration that created RLS policies

---

## Proposed Solution

### Option 1: Wrap Queries in Explicit Transactions (Recommended)

Ensure that `set_config()` and the subsequent query run within the same explicit transaction:

```typescript
// In DatabaseService.query()
if (hasContext) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction(); // ✅ START EXPLICIT TRANSACTION
  try {
    await queryRunner.query(
      'SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)',
      [
        'app.current_organization_id',
        effectiveOrg,
        'app.current_project_id',
        effectiveProject,
        'row_security',
        'on',
      ]
    );
    const result = await queryRunner.query(text, params);
    await queryRunner.commitTransaction(); // ✅ COMMIT
    return formatResult(result);
  } catch (err) {
    await queryRunner.rollbackTransaction(); // ✅ ROLLBACK
    throw err;
  } finally {
    await queryRunner.release();
  }
}
```

**Pros:**

- Guarantees config and query execute in same transaction
- Maintains transaction-local scope (clean isolation)
- No risk of context pollution

**Cons:**

- Adds transaction overhead to all queries
- May impact performance for read-only queries

### Option 2: Use Session-Level Config

Change `set_config(..., true)` to `set_config(..., false)` to make configuration session-scoped:

```typescript
await queryRunner.query(
  'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)', // false = session-level
  [
    'app.current_organization_id',
    effectiveOrg,
    'app.current_project_id',
    effectiveProject,
    'row_security',
    'on',
  ]
);
```

**Pros:**

- Simpler change
- Config persists for entire connection lifetime

**Cons:**

- **Risk of context pollution** across pooled connections
- Connection reuse could apply wrong tenant context to subsequent queries
- Less safe for multi-tenant applications

### Option 3: Hybrid Approach (Recommended for Production)

Use explicit transactions for tenant-scoped queries, but allow wildcard mode (no context) to run without transaction overhead:

```typescript
const hasContext = effectiveOrgRaw !== null || effectiveProjectRaw !== null;

if (hasContext) {
  // Use Option 1 (explicit transaction)
} else {
  // Wildcard mode - no transaction needed
  return this.dataSource.query(text, params);
}
```

**Changes Required:**

1. Modify `DatabaseService.query()` to wrap tenant-scoped queries in explicit transactions
2. Update `DatabaseService.getClient()` similarly
3. Add integration test to verify RLS enforcement:
   ```typescript
   it('should enforce RLS on documents table', async () => {
     // Create documents in two different projects
     // Query with project A context
     // Assert only project A documents returned
   });
   ```

**Testing Plan:**

- [x] Manual SQL testing confirms RLS policies work (DONE)
- [x] Verify app uses app_rls role (DONE)
- [x] Test document list API with multiple projects (VERIFIED 2025-11-19)
- [x] Verify switching projects filters correctly (VERIFIED 2025-11-19)
- [ ] Add integration test for document RLS enforcement (IN PROGRESS)
- [ ] Load test to ensure transaction overhead is acceptable
- [ ] Test wildcard mode (no project context) for admin operations

---

## Resolution

**Date:** 2025-11-19  
**Implemented by:** AI Agent

### Fix Applied

Implemented **Option 1: Explicit Transaction Wrapping** in `DatabaseService.query()`.

**Changes made to** `apps/server/src/common/database/database.service.ts:457-603`:

1. **Added explicit transaction boundary** around `set_config()` and query execution:

   ```typescript
   await queryRunner.startTransaction(); // START EXPLICIT TRANSACTION
   ```

2. **Ensured transaction-local config applies within transaction scope**:

   - `set_config(..., true)` calls happen AFTER `startTransaction()`
   - Subsequent `query()` executes within same transaction
   - Config automatically discarded after `commitTransaction()`

3. **Added proper error handling**:
   - Transaction commits on success
   - Transaction rolls back on error (in finally block via connection release)

### Verification

**Manual Testing (2025-11-19 12:06:32):**

1. ✅ Frontend sends `x-project-id: 3185a40b-440d-4751-8dd4-2be16c3d2bd5` header
2. ✅ API response shows only 1 document with matching `projectId`
3. ✅ Document list filtered correctly by project
4. ✅ No cross-project data leakage observed

**Network Request Evidence:**

```
GET http://localhost:5176/api/documents
Headers: x-project-id: 3185a40b-440d-4751-8dd4-2be16c3d2bd5
Response: [{"id":"ba95b368-b3bd-4e0c-be51-94ee63fc877b","projectId":"3185a40b-440d-4751-8dd4-2be16c3d2bd5",...}]
```

**Database State:**

```
9 projects total
6 projects with 1 document each
3 projects with 0 documents
Query correctly returns only documents for requested project
```

### Why The Fix Works

**Problem:** Transaction-local `set_config(..., true)` wasn't executing within explicit transaction, so session variables weren't active during query execution.

**Solution:** Wrapping in explicit transaction ensures:

- `startTransaction()` creates transaction boundary
- `set_config()` sets transaction-local variables
- Query executes within same transaction (variables are active)
- `commitTransaction()` ends transaction (variables auto-discarded)

**Benefits:**

- ✅ Guarantees config and query execute in same transaction context
- ✅ Maintains clean isolation (transaction-local scope)
- ✅ No risk of context pollution across pooled connections
- ✅ RLS policies now enforce properly

### Outstanding Tasks

- [ ] Add integration test for project-level RLS filtering (see test plan below)
- [ ] Check for other queries needing same transaction wrapping fix
- [ ] Performance testing to measure transaction overhead impact

---

## Related Issues

- Related to #048 - Document list returns empty intermittently
- Related to #044-046 - Project context fixes
- Blocks proper multi-tenant isolation for documents

---

## Notes

### Why Graph Tables Work But Documents Don't

The key difference is that graph operations may be using a different query pattern or transaction management that happens to work correctly. Need to investigate if graph queries are being wrapped in transactions differently.

### Security Implications

This is a **critical security vulnerability**. Until fixed:

- Users can see document **metadata** (filenames, sizes, creation dates) from all projects
- Document **content** may also be exposed if users know document IDs
- Violates data isolation guarantees for multi-tenant system

### Next Steps

1. Implement Option 1 (explicit transactions) in DatabaseService
2. Run full test suite to verify no regressions
3. Deploy to staging and verify RLS enforcement manually
4. Add monitoring/alerting for cross-project access attempts

---

**Last Updated:** 2025-11-19 by AI Agent  
**Resolution Verified:** 2025-11-19 - RLS now enforcing correctly, no cross-project data leakage
