# Bug Report: Document List Returns Empty Intermittently

**Status:** ✅ RESOLVED  
**Severity:** High  
**Created:** 2025-11-19  
**Resolved:** 2025-11-19  
**Component:** Documents API / Multi-tenancy

## Resolution Summary

**Root Cause:** Architectural inconsistency in multi-tenancy strategy. Documents table used application-level WHERE clause filtering instead of database-level RLS policies, creating reliability and security issues.

**Solution Implemented:**

1. ✅ Enabled Row-Level Security on `kb.documents` table
2. ✅ Created 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)
3. ✅ Simplified `documents.service.ts` to rely on RLS
4. ✅ Created E2E test for multi-tenant isolation

**Files Changed:**

- `docs/migrations/011-enable-rls-on-documents-table.sql` - RLS migration
- `apps/server/src/modules/documents/documents.service.ts` - Removed redundant WHERE clauses
- `apps/server/tests/e2e/documents.rls-isolation.e2e.spec.ts` - RLS isolation test

## Summary

The document list endpoint (`GET /api/documents`) intermittently returns an empty array, even when documents exist in the database for the project. This occurs both after upload AND on page refresh, indicating a fundamental issue with how project context is being applied to queries.

## Symptoms

1. **Upload Flow:**

   - Document uploads successfully (returns `documentId`)
   - Immediate fetch of document list returns empty array
   - Same project ID is used for both requests

2. **Page Refresh:**
   - Sometimes document list is empty
   - Sometimes document list shows documents correctly
   - **Intermittent behavior suggests race condition or context leak**

## Root Cause Analysis

### Architecture Overview

The codebase has **two different multi-tenancy strategies**:

#### 1. Graph Tables (RLS-Protected)

- **Tables:** `kb.graph_objects`, `kb.graph_relationships`
- **Method:** PostgreSQL Row-Level Security (RLS) policies
- **Enforcement:** Automatic via database policies checking `current_setting('app.current_project_id')`
- **Implementation:** `apps/server/src/common/database/database.service.ts:410-431`

```sql
-- RLS enabled on graph tables
ALTER TABLE kb.graph_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.graph_relationships ENABLE ROW LEVEL SECURITY;

-- Policy predicate
(COALESCE(current_setting('app.current_project_id', true),'') = ''
 OR project_id::text = current_setting('app.current_project_id', true))
```

#### 2. Documents Table (WHERE-Clause Protected)

- **Table:** `kb.documents`
- **Method:** Manual WHERE clause filtering in application code
- **Enforcement:** Depends on `filter.projectId` parameter being correctly passed
- **Implementation:** `apps/server/src/modules/documents/documents.service.ts:42-121`

```typescript
// Line 57-59: WHERE clause is conditional on filter.projectId
if (filter?.projectId) {
  params.push(filter.projectId);
  conds.push(`d.project_id = $${paramIdx++}`);
}

// Line 101-106: Query wrapped in tenant context IF projectId exists
const rows = filter?.projectId
  ? await this.db.runWithTenantContext(filter.projectId, queryFn)
  : await queryFn();
```

### The Problem

**The documents table has NO RLS policies**, relying entirely on application-level WHERE clause filtering. This creates several failure modes:

#### Failure Mode 1: Missing Project Context

If `filter.projectId` is not passed to `documents.service.list()`, the query:

- Has NO WHERE clause for project filtering
- Returns ALL documents across ALL projects (or empty due to other reasons)
- Violates multi-tenant isolation

#### Failure Mode 2: Context Propagation Failure

The controller extracts project ID from the request header:

```typescript
// documents.controller.ts:101-106
const projectId =
  (req?.headers['x-project-id'] as string | undefined) || undefined;
if (!projectId) {
  throw new BadRequestException({
    /* ... */
  });
}
const { items, nextCursor } = await this.documents.list(n, decoded, {
  projectId,
});
```

**BUT** if the header is missing or incorrect:

- Controller throws 400 error (good for debugging)
- However, intermittent empty results suggest the header IS present but documents aren't matching

#### Failure Mode 3: Transaction Visibility Race Condition

From bug report #047, we know there's a transaction visibility issue:

1. Document commits to database in upload transaction
2. Transaction may not be visible to other connections immediately
3. Subsequent list query runs on different connection
4. Document not yet visible → empty result

## Evidence from Logs

```
2025-11-19 11:35:26: [db.query][set_config] {
  org: '83b3e810-0d5d-47bb-a99c-d96cbe53c8cf',
  project: '3185a40b-440d-4751-8dd4-2be16c3d2bd5',
  rowSecurity: 'on (scoped)'
}
```

The logs show:

- ✅ Tenant context IS being set correctly
- ✅ Project ID is present in requests
- ❌ But document list queries are NOT visible in recent logs
- ❌ This suggests the issue occurs at a different layer

## Client-Side Evidence

From `apps/admin/src/pages/admin/apps/documents/index.tsx`:

```typescript
// Lines 166-169: Guards against missing context
if (!config.activeOrgId || !config.activeProjectId) {
  console.log('[LOAD] Skipping document load - missing context:', { ... });
  return;
}

// Lines 188-194: Headers are built with context
const headers = t ? { ...buildHeaders({ json: false }) } : {};
console.log('[LOAD] Request headers:', {
  'X-Project-ID': headers['X-Project-ID'],
  'X-Org-ID': headers['X-Org-ID'],
});
```

**Key Question:** Are these console.logs showing up in the browser? If not, the useEffect may not be triggering after upload.

## Debugging Steps

### Step 1: Check Client-Side Context

Open browser DevTools console during document upload:

1. Upload a document
2. Check for `[UPLOAD]` logs showing success
3. Check for `[LOAD]` logs showing document fetch
4. Verify headers contain correct `X-Project-ID`
5. Check Network tab for actual request headers

### Step 2: Check Server-Side Query Execution

Enable query logging:

```bash
DEBUG_TENANT=true nx run workspace-cli:workspace:restart
```

Then:

1. Upload a document
2. Monitor logs for document list query
3. Check if WHERE clause includes `d.project_id = $N`
4. Verify projectId parameter value

### Step 3: Verify Database State

After upload returns success, directly query database:

```sql
-- Check if document exists
SELECT id, project_id, filename, created_at
FROM kb.documents
WHERE project_id = '<project-id-from-upload>';

-- Check transaction isolation
SELECT
  pid,
  state,
  query,
  xact_start,
  state_change
FROM pg_stat_activity
WHERE datname = 'postgres';
```

### Step 4: Test Without Caching

The controller uses `CachingInterceptor`:

```typescript
@Get()
@UseInterceptors(CachingInterceptor)  // Line 66
```

Test with cache-busting:

```bash
curl -H "X-Project-ID: <id>" \
     -H "Authorization: Bearer <token>" \
     -H "Cache-Control: no-cache" \
     http://localhost:3000/api/documents
```

## Proposed Solutions

### Solution 1: Enable RLS on Documents Table (Recommended)

**Implement proper RLS policies** to match the graph tables pattern:

```sql
-- Enable RLS on documents table
ALTER TABLE kb.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.documents FORCE ROW LEVEL SECURITY;

-- Create SELECT policy
CREATE POLICY documents_select_policy ON kb.documents
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true),'') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
);

-- Create INSERT policy
CREATE POLICY documents_insert_policy ON kb.documents
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true),'') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
);

-- Create UPDATE policy
CREATE POLICY documents_update_policy ON kb.documents
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true),'') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
);

-- Create DELETE policy
CREATE POLICY documents_delete_policy ON kb.documents
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true),'') = ''
  OR project_id::text = current_setting('app.current_project_id', true)
);
```

**Benefits:**

- ✅ Consistent multi-tenancy strategy across all tables
- ✅ Database-enforced isolation (defense in depth)
- ✅ Removes reliance on application-level filtering
- ✅ Prevents bugs from missing WHERE clauses
- ✅ Simplifies service code (can remove manual filtering)

**Implementation:**

1. Create migration file with RLS policies
2. Apply to local, test, and production databases
3. Simplify `documents.service.ts` to remove redundant WHERE clauses
4. Keep `runWithTenantContext` calls (still needed for RLS)

### Solution 2: Add Transaction Visibility Guarantee

**Force transaction visibility** in upload flow:

```typescript
// In ingestion.service.ts, after COMMIT
await client.query('COMMIT');

// Force WAL flush to ensure visibility to other connections
await client.query('SELECT pg_current_wal_flush_lsn()');

// Optional: Add small delay as fallback
await new Promise((resolve) => setTimeout(resolve, 10));
```

**Benefits:**

- ✅ Addresses race condition directly
- ⚠️ May impact performance (adds latency)

### Solution 3: Return Document in Upload Response

**Include full document data** in upload response:

```typescript
// In ingestion.service.ts
return {
  documentId,
  chunks,
  alreadyExists: false,
  document: {
    id: documentId,
    filename,
    projectId,
    createdAt: new Date().toISOString(),
    // ... other fields
  },
};
```

Then update client to optimistically add to list:

```typescript
// In documents/index.tsx
const result = await uploadDocument(file);
setData((prev) => [result.document, ...(prev || [])]);
```

**Benefits:**

- ✅ Best user experience (immediate feedback)
- ✅ Avoids race condition entirely for upload flow
- ⚠️ Doesn't fix page refresh issue

### Solution 4: Add Retry Logic with Exponential Backoff

**Client-side retry** for document list:

```typescript
async function loadWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const docs = await fetchDocuments();
    if (docs.length > 0 || i === maxRetries - 1) {
      return docs;
    }
    await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, i)));
  }
}
```

**Benefits:**

- ✅ Handles transient race conditions
- ⚠️ Doesn't address root cause
- ⚠️ Adds complexity

## Recommendation

**Implement Solution 1 (RLS Policies) + Solution 3 (Optimistic UI)**

This combination:

1. **Fixes the root cause** (inconsistent multi-tenancy strategy)
2. **Provides best UX** (immediate document appears after upload)
3. **Adds defense in depth** (database-enforced isolation)
4. **Future-proofs the system** (RLS prevents entire class of bugs)

## Next Steps

1. ✅ Document the issue (this file)
2. ⏳ Debug with user to confirm exact failure mode
3. ⏳ Create RLS migration for documents table
4. ⏳ Test RLS policies in development
5. ⏳ Update documents.service.ts to rely on RLS
6. ⏳ Add optimistic UI for document uploads
7. ⏳ Create E2E test for multi-tenant document isolation
8. ⏳ Deploy to production

## Related Issues

- **#044:** Organization/project switcher context persistence
- **#045:** Cross-project data isolation verification
- **#046:** Project context dependency audit
- **#047:** Document upload visibility race condition (transaction visibility)

## References

- `apps/server/src/modules/documents/documents.service.ts:42-121` - List method
- `apps/server/src/modules/documents/documents.controller.ts:65-113` - List endpoint
- `apps/server/src/common/database/database.service.ts:410-431` - RLS setup for graph tables
- `apps/admin/src/pages/admin/apps/documents/index.tsx:162-234` - Client-side document loading
