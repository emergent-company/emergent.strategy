# Extraction Progress Tracking Issues

## Problem Report (October 18, 2025)

User reported that when extraction jobs run, the progress indicators show but don't update:

- Estimated completion: "Collecting data..."
- Throughput: "Calculating..."
- Items remaining: 0
- Success rate: "TBD"
- Processing Progress: 0% (0 / 0)

## Root Causes

### Issue 1: Missing Progress Tracking Database Columns

The frontend and backend code expect these columns in `kb.object_extraction_jobs`:
- `total_items`
- `processed_items`
- `successful_items`
- `failed_items`

**Current Schema**: These columns DO NOT EXIST in the database table.

**Impact**: Frontend shows `0 / 0` for all progress metrics because it's reading undefined/null values.

**Evidence**:
```sql
-- Actual table structure (missing progress columns)
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'kb' AND table_name = 'object_extraction_jobs';
-- Result: Has objects_created, relationships_created, suggestions_created
-- Missing: total_items, processed_items, successful_items, failed_items
```

**Backend Code References** (apps/server/src/modules/extraction-jobs/):
- `extraction-job.service.ts` lines 292-303: `updateJob()` method sets these fields
- `extraction-worker.service.ts` lines 520-548: `updateProgress()` method called during processing
- `extraction-job.service.ts` lines 620-648: `updateProgress()` implementation

**Frontend Code References**:
- `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx` lines 146-152:
  ```typescript
  const progress = job.total_items > 0 ? (job.processed_items / job.total_items) * 100 : 0;
  const remainingItems = Math.max(job.total_items - job.processed_items, 0);
  const successRate = job.processed_items > 0 ? (job.successful_items / job.processed_items) * 100 : null;
  const throughputPerMinute = elapsedSeconds && elapsedSeconds > 0 ? (job.processed_items / elapsedSeconds) * 60 : null;
  const estimatedSecondsRemaining = throughputPerMinute && throughputPerMinute > 0 ? (remainingItems / throughputPerMinute) * 60 : null;
  ```

### Issue 2: Graph Object Creation Failing (BLOCKER)

**Error**: All extracted entities failed with:
```
null value in column "key" of relation "graph_objects" violates not-null constraint
```

**Root Cause**: The extraction worker passes `key: entity.business_key || undefined` but:
1. LLM returns `business_key: null` for most entities
2. The `graph_objects.key` column is NOT NULL
3. Result: Database rejects the insert

**Example Extraction Result**:
```json
{
  "type_name": "Location",
  "name": "Sweden",
  "description": "A country mentioned...",
  "business_key": null,  // ← This is the problem
  "properties": {
    "country": "Sweden"
  },
  "confidence": 1.0
}
```

**Failure Stats from Recent Job** (ID: 905e457b-e2e9-44f3-b7ed-cce801305822):
- Entities extracted: 5 (Sweden, Norway, Latvia, Denmark, England)
- Objects created: 0
- All failed: 5/5
- Error: "null value in column 'key' violates not-null constraint"

## Solutions Applied

### ✅ Issue 2 Fixed: Key Generation (October 18, 2025)

**File**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

**Changes**:
1. Added `generateKeyFromName()` private method (lines 1373-1405):
   - Normalizes entity name (lowercase, alphanumeric + hyphens)
   - Adds type prefix to avoid cross-type collisions
   - Appends MD5 hash suffix for uniqueness
   - Respects 128-character max length

2. Updated object creation logic (line 677):
   ```typescript
   // Before:
   key: entity.business_key || undefined

   // After:
   const objectKey = entity.business_key || this.generateKeyFromName(entity.name, entity.type_name);
   ```

**Examples**:
- Input: `name="Sweden"`, `type="Location"` → Key: `location-sweden-abc12345`
- Input: `name="John Doe"`, `type="Person"` → Key: `person-john-doe-def67890`

**Testing**: User should re-run extraction on the same document. All entities should now be created successfully.

### ⏳ Issue 1 Pending: Progress Tracking Database Migration

**Status**: NOT YET IMPLEMENTED (requires migration)

**Proposed Solution**:

1. **Create Migration**:
   ```sql
   -- Add progress tracking columns to kb.object_extraction_jobs
   ALTER TABLE kb.object_extraction_jobs
   ADD COLUMN total_items INTEGER DEFAULT 0,
   ADD COLUMN processed_items INTEGER DEFAULT 0,
   ADD COLUMN successful_items INTEGER DEFAULT 0,
   ADD COLUMN failed_items INTEGER DEFAULT 0;
   
   -- Add indexes for performance
   CREATE INDEX idx_extraction_jobs_progress ON kb.object_extraction_jobs(status, processed_items, total_items);
   ```

2. **Update Worker Logic**:
   - Initialize `total_items` when LLM returns entities (line 554 in extraction-worker.service.ts)
   - Increment `processed_items` after each entity (line 527)
   - Track `successful_items` vs `failed_items` based on outcome

3. **Current Workaround**:
   - Job status (pending/running/completed/failed) still works
   - `objects_created` count shows final result
   - Timeline in debug_info shows detailed progress

**Priority**: LOW - Not a blocker, just UX degradation
- Users can still see job status and completion
- Debug timeline provides detailed progress information
- Consider implementing in Phase 3 of extraction system

## Verification Steps

### Test Issue 2 Fix (Key Generation)

1. Navigate to extraction jobs page
2. Select a document with text content
3. Choose entity types (e.g., Location, Person)
4. Start extraction
5. Wait for completion (~15 seconds)
6. **Expected**: Objects created > 0
7. **Expected**: Navigate to Objects page and see extracted entities
8. **Expected**: Entity keys follow pattern `{type}-{normalized-name}-{hash}`

### Test Issue 1 (After Migration)

1. Start an extraction job
2. Open job detail page
3. **Expected**: Progress bar updates from 0% → 100%
4. **Expected**: "Processing Progress" shows accurate counts (e.g., "5 / 10")
5. **Expected**: Throughput shows items/min (e.g., "2.5 items/min")
6. **Expected**: Estimated completion shows time remaining (e.g., "30s")
7. **Expected**: Success rate shows percentage (e.g., "80%")

## Related Files

### Backend
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Worker logic, key generation
- `apps/server/src/modules/extraction-jobs/extraction-job.service.ts` - Job management, progress updates
- `apps/server/src/modules/graph/graph.service.ts` - Object creation (requires non-null key)

### Frontend
- `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx` - Progress UI calculations

### Database
- `kb.object_extraction_jobs` - Job tracking table (missing progress columns)
- `kb.graph_objects` - Stored entities (key column is NOT NULL)

## Prevention

### For Future Extraction Features

1. **Always provide fallback values** for required database columns
2. **Test with NULL/missing fields** from LLM responses
3. **Validate schema changes** - ensure DB matches code expectations
4. **Add progress tracking** when implementing long-running async operations
5. **Document column requirements** in service layer (e.g., "key is required, will be generated if missing")

### For Database Schema Changes

1. When adding progress tracking columns, ensure:
   - Default values are provided
   - Existing jobs don't break
   - Indexes are added for performance
   - Frontend/backend code is updated in sync

2. When making columns NOT NULL:
   - Ensure all code paths provide values
   - Add fallback/generation logic
   - Test with edge cases (null, undefined, empty string)

## Notes

- The extraction system successfully extracts entities from documents
- LLM quality is good (5 entities found from meeting notes)
- The issue was purely infrastructure (missing key values, missing progress columns)
- Fix is backward compatible - existing logic still works, just handles null business_key now
