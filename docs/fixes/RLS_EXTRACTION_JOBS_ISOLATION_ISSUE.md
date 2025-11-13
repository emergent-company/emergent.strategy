# RLS Extraction Jobs Isolation Issue

## Problem

**Test:** "should enforce project-level isolation for extraction jobs" in phase1.workflows.e2e.spec.ts  
**Expected:** 404 (job not found due to RLS filtering)  
**Actual:** 200 (job found despite wrong project_id in query)

## Test Scenario

```typescript
// 1. Create extraction job for ctx.projectId (real project)
POST /admin/extraction-jobs
{
  organization_id: ctx.orgId,
  project_id: ctx.projectId,  // e.g., "357005d5-c454-4b9d-826b-662e1054b0c2"
  source_type: 'manual',
  extraction_config: {}
}
// Returns 201, job.id = "abc-123"

// 2. Try to access job using WRONG project_id (should fail RLS)
GET /admin/extraction-jobs/abc-123?project_id=00000000-0000-0000-0000-000000000000&organization_id=${ctx.orgId}
// Expected: 404 (RLS filters out job from wrong project)
// Actual: 200 (job returned despite wrong project_id!)
```

## Root Cause

### Current RLS Policy (INCORRECT):

```sql
CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs 
    FOR SELECT 
    USING (
        project_id IN (
            SELECT p.id
            FROM kb.projects p
            JOIN kb.orgs o ON (p.organization_id = o.id)
            WHERE p.id = object_extraction_jobs.project_id
        )
    );
```

**Problem**: This policy only checks if `object_extraction_jobs.project_id` exists in `kb.projects`. It does NOT verify that the current session/user has access to that specific project!

**Why test fails:**
1. Job is created with `project_id = "357005d5..."` (real project that exists)
2. Query uses `project_id = "00000000..."` (fake project)
3. RLS policy checks: "Does `357005d5...` exist in kb.projects?" → YES
4. Policy allows access because the job's project exists, ignoring query parameter
5. Test gets 200 instead of 404

### What's Missing: Session Context

Proper RLS policies need to reference **session variables** set by the application:

```sql
-- CORRECT RLS pattern
CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs 
    FOR SELECT 
    USING (
        -- Check if job's project_id matches the session's project_id
        project_id = current_setting('rls.project_id', true)::uuid
        OR
        -- Or check if user has access via membership/permissions
        project_id IN (
            SELECT p.id
            FROM kb.projects p
            WHERE p.id = ANY(string_to_array(current_setting('rls.accessible_projects', true), ',')::uuid[])
        )
    );
```

## How Session Variables Should Work

### Application Layer (ExtractionJobService):

```typescript
async getExtractionJob(id: string, projectId: string, orgId: string) {
    // Set session variables BEFORE query
    await client.query(`SET LOCAL rls.project_id = $1`, [projectId]);
    await client.query(`SET LOCAL rls.organization_id = $1`, [orgId]);
    
    // Now query - RLS will filter based on session variables
    const result = await client.query(
        'SELECT * FROM kb.object_extraction_jobs WHERE id = $1',
        [id]
    );
    
    if (!result.rowCount) {
        throw new NotFoundException('extraction_job_not_found');
    }
    
    return result.rows[0];
}
```

### Database Layer (RLS Policy):

```sql
CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs 
    FOR SELECT 
    USING (
        -- Match session project_id
        project_id::text = current_setting('rls.project_id', true)
    );
```

## Why Type Registry Test Passes

The type registry test DOES pass with the same pattern. Let me check why:

```typescript
// Type registry test
GET /type-registry/${type.id}?project_id=00000000-0000-0000-0000-000000000000
// Returns 404 ✅ (correctly filtered by RLS)
```

This suggests type registry either:
1. Has proper RLS policies with session variables
2. Has application-level filtering that checks project_id
3. Uses different query pattern that happens to work

Let me check the type registry service implementation in a separate investigation.

## Comparison: Type Registry vs Extraction Jobs

### Type Registry (WORKS):
```typescript
// tests/e2e/phase1.workflows.e2e.spec.ts:1146
GET /type-registry/${type.id}?project_id=00000000-0000-0000-0000-000000000000
→ 404 ✅ (RLS working)
```

### Extraction Jobs (FAILS):
```typescript
// tests/e2e/phase1.workflows.e2e.spec.ts:1176  
GET /admin/extraction-jobs/${job.id}?project_id=00000000-0000-0000-0000-000000000000
→ 200 ❌ (RLS not working)
```

## Investigation Needed

1. ✅ Check type registry RLS policies - do they use session variables?
2. ✅ Check type registry service - does it set session variables?
3. ✅ Check extraction job service - does it set session variables?
4. 🔲 Determine correct RLS pattern for this codebase
5. 🔲 Update extraction job RLS policies
6. 🔲 Update extraction job service to set session variables

## Files to Investigate

- `apps/server/src/modules/type-registry/type-registry.service.ts` (how it handles RLS)
- `apps/server/src/modules/extraction-jobs/extraction-job.service.ts` (compare with type registry)
- `apps/server/migrations/0001_init.sql` (line 2865 - extraction_jobs_select_policy)
- `apps/server/migrations/20251025_fix_extraction_jobs_policies.sql` (attempted fix)

## Solutions

### Option 1: Add Session Variables to RLS Policies

**Pros:**
- True database-level isolation
- Consistent with RLS best practices
- Protects against SQL injection

**Cons:**
- Requires updating all services to set session variables
- More complex application code
- Performance overhead of SET LOCAL per request

### Option 2: Application-Level Filtering

**Pros:**
- Simpler implementation
- No session variable management
- Easier to debug

**Cons:**
- No database-level protection
- Vulnerable if service layer bypassed
- Not true RLS

### Option 3: Hybrid Approach (RECOMMENDED)

**Use RLS for existence checks + application-level project_id filtering:**

```typescript
// Service layer explicitly filters by project_id
async getExtractionJob(id: string, projectId: string) {
    const result = await this.db.query(
        `SELECT * FROM kb.object_extraction_jobs 
         WHERE id = $1 AND project_id = $2`,
        [id, projectId]
    );
    
    if (!result.rowCount) {
        throw new NotFoundException('extraction_job_not_found');
    }
    
    return result.rows[0];
}
```

**RLS policy remains simple existence check:**
```sql
-- Just ensure the project exists (prevents accessing deleted projects)
CREATE POLICY extraction_jobs_select_policy ON kb.object_extraction_jobs 
    FOR SELECT 
    USING (
        project_id IN (SELECT id FROM kb.projects WHERE deleted_at IS NULL)
    );
```

## Next Steps

1. Investigate type registry implementation to understand why it works
2. Decide on RLS strategy (session variables vs application filtering)
3. Update extraction job service to match chosen pattern
4. Update extraction job RLS policies if needed
5. Verify all RLS tests pass

## Related Issues

- Graph validation test also has database schema issues (stale constraint)
- Suggests test database may need complete reset
- Migration system recently added - may not have been applied to test DB

## Test Status

- Workflow tests: 10/14 passing (71% pass rate)
- This is 1 of 2 remaining workflow failures
- Overall tests: 189/270 passing (84.1% pass rate)
