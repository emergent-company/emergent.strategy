# Fix: Extraction Job Status Constraint Mismatch

**Date**: 2025-10-05  
**Status**: ✅ Fixed  
**Impact**: High - Prevented extraction jobs from being created with 'requires_review' status

## Problem

When creating extraction jobs, the system was failing with error:
```
new row for relation "object_extraction_jobs" violates check constraint "object_extraction_jobs_status_check"
```

## Root Cause

There was a mismatch between the TypeScript enum and the database check constraint:

**TypeScript Enum** (`ExtractionJobStatus`):
```typescript
export enum ExtractionJobStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    REQUIRES_REVIEW = 'requires_review',  // ✅ Included
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}
```

**Database Check Constraint** (BEFORE):
```sql
CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
-- ❌ Missing 'requires_review'
```

When the extraction system tried to create or update a job with status `'requires_review'`, the database rejected it because the constraint didn't allow that value.

## Solution

### 1. Updated Database Schema

**File**: `apps/server/src/common/database/database.service.ts`

Changed the check constraint to include `'requires_review'`:

```sql
-- ✅ AFTER
CHECK (status IN ('pending', 'running', 'completed', 'requires_review', 'failed', 'cancelled'))
```

### 2. Created Migration SQL

**File**: `docs/migrations/010-add-requires-review-status.sql`

This migration:
1. Drops the old constraint
2. Adds new constraint with `'requires_review'` included

```sql
BEGIN;

ALTER TABLE kb.object_extraction_jobs 
DROP CONSTRAINT IF EXISTS object_extraction_jobs_status_check;

ALTER TABLE kb.object_extraction_jobs
ADD CONSTRAINT object_extraction_jobs_status_check 
CHECK (status IN ('pending', 'running', 'completed', 'requires_review', 'failed', 'cancelled'));

COMMIT;
```

### 3. Backend Restarted

Backend restarted to apply the schema changes (PID 3157+).

## When Does 'requires_review' Status Get Used?

The `'requires_review'` status is set when:
- Extraction is configured with `require_review: true` option
- Extraction completes successfully but requires human verification before objects are created
- Low confidence extractions that need manual approval

## Impact

**Before Fix**:
- ❌ Couldn't create extraction jobs with `require_review` enabled
- ❌ System would crash with constraint violation error
- ❌ UI would show generic error message

**After Fix**:
- ✅ Extraction jobs can use all status values
- ✅ Review workflow can function properly
- ✅ Jobs can transition through all intended states

## Testing

To verify the fix works:

1. **Create extraction job with review required**:
   - Go to Documents page
   - Click "Extract Objects"
   - Enable "Require Review" toggle
   - Start extraction
   - Verify job is created successfully

2. **Check database**:
   ```sql
   -- Verify constraint includes 'requires_review'
   SELECT conname, pg_get_constraintdef(oid) 
   FROM pg_constraint 
   WHERE conname = 'object_extraction_jobs_status_check';
   
   -- Should show:
   -- CHECK (status IN ('pending', 'running', 'completed', 'requires_review', 'failed', 'cancelled'))
   ```

3. **Test status transitions**:
   ```sql
   -- This should now work without errors:
   UPDATE kb.object_extraction_jobs 
   SET status = 'requires_review' 
   WHERE id = '<some-job-id>';
   ```

## Related Files

- `apps/server/src/common/database/database.service.ts` - Schema definition
- `apps/server/src/modules/extraction-jobs/dto/extraction-job.dto.ts` - TypeScript enum
- `docs/migrations/010-add-requires-review-status.sql` - Migration SQL

## Prevention

To prevent similar issues in the future:

1. **Always sync enum and constraint**: When adding new status values to TypeScript enum, immediately update database constraint
2. **Add integration tests**: Test all enum values can be inserted into database
3. **Database migration**: Create migration SQL for constraint changes
4. **Code review**: Check both TypeScript enums and SQL constraints match

## Status

✅ **Fixed and deployed**
- Schema updated
- Backend restarted
- Migration SQL created for reference
- Ready for testing

---

**Next Time**: When adding new enum values, remember to:
1. Update TypeScript enum
2. Update database check constraint
3. Create migration SQL
4. Restart backend
5. Test all enum values work
