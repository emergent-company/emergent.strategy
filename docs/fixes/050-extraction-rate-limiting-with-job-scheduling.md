# Fix: Extraction Rate Limiting with Job Scheduling

**Related Bug:** `docs/bugs/016-extraction-rate-limiting-causes-job-failures.md`  
**Date:** 2025-11-20  
**Status:** Implemented

---

## Summary

Implemented job scheduling for extraction jobs to handle rate limits gracefully. Instead of failing jobs when rate limits are hit, jobs are now scheduled for future execution with intelligent backoff delays.

---

## Changes Made

### 1. Database Migration

**File:** `docs/migrations/029-add-scheduled-at-to-extraction-jobs.sql`

- Added `scheduled_at` column (TIMESTAMPTZ, nullable) to `object_extraction_jobs` table
- Created index `idx_extraction_jobs_scheduled_dequeue` for efficient filtering
- `scheduled_at = NULL` means "process immediately"
- `scheduled_at = <future timestamp>` means "defer until this time"

### 2. Data Model Updates

**Files:**

- `apps/server/src/modules/extraction-jobs/dto/extraction-job.dto.ts`
- `apps/server/src/entities/object-extraction-job.entity.ts`
- `apps/server/src/modules/extraction-jobs/extraction-logger.service.ts`

**Changes:**

- Added `scheduled_at?: Date` field to `ExtractionJobDto`
- Added `scheduledAt` column to `ObjectExtractionJob` entity
- Added `'scheduling'` to `ExtractionLogOperationType` enum

### 3. Job Service Enhancements

**File:** `apps/server/src/modules/extraction-jobs/extraction-job.service.ts`

**New Methods:**

- `scheduleJob(jobId, delaySeconds, reason?)` - Schedule a job for future execution
- `resetJobToPending(jobId, delaySeconds?, reason?)` - Reset running job to pending with optional delay

**Modified Methods:**

- `dequeueJobs(batchSize)` - Now filters by `scheduled_at <= NOW()` and orders by scheduled time

**Query Changes:**

```sql
-- Before
WHERE status = 'pending'
ORDER BY created_at ASC

-- After
WHERE status = 'pending'
  AND (scheduled_at IS NULL OR scheduled_at <= NOW())
ORDER BY
  COALESCE(scheduled_at, created_at) ASC,
  created_at ASC
```

###4. Worker Rate Limit Handling

**File:** `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

**New Methods:**

- `calculateRateLimitDelay(estimatedTokens, rateLimiterStatus)` - Calculate backoff delay with exponential backoff and jitter

**Behavioral Changes:**

**Before (Failed on Rate Limit):**

```typescript
const allowed = await this.rateLimiter.waitForCapacity(estimatedTokens, 60000);
if (!allowed) {
  throw new Error('Rate limit exceeded, job will retry later');
  // Job marked as FAILED, counts against retry limit
}
```

**After (Schedule on Rate Limit):**

```typescript
const allowed = await this.rateLimiter.tryConsume(estimatedTokens);
if (!allowed) {
  const delaySeconds = this.calculateRateLimitDelay(...);
  await this.jobService.resetJobToPending(job.id, delaySeconds, reason);
  // Job scheduled for later, does NOT count as failure
  return; // Exit gracefully
}
```

**Delay Calculation Algorithm:**

1. Calculate token/request deficit
2. Determine base delay (fraction of 60s refill period)
3. Apply exponential backoff based on capacity usage (up to 3x)
4. Add jitter (±20%) to prevent thundering herd
5. Cap at 5 minutes maximum

### 5. Logging Enhancements

**New Log Events:**

- `rate_limit_check` - Records rate limit status check
- `rate_limit_schedule` - Records job scheduling due to rate limits

**Example Log Entry:**

```json
{
  "operation_type": "scheduling",
  "operation_name": "rate_limit_schedule",
  "status": "completed",
  "input_data": {
    "estimated_tokens": 25000,
    "available_tokens": 5000,
    "available_requests": 30
  },
  "output_data": {
    "delay_seconds": 48,
    "scheduled_at": "2025-11-20T15:30:48.000Z"
  }
}
```

---

## Benefits

### Before This Fix

❌ Jobs failed when rate limits were hit  
❌ Failed jobs counted against retry limit (max 3 attempts)  
❌ Sequential processing blocked entire batch  
❌ No intelligent backoff or scheduling  
❌ Large files could not be processed reliably

### After This Fix

✅ Jobs scheduled instead of failed  
✅ No retry limit consumption for rate-limited jobs  
✅ Intelligent exponential backoff with jitter  
✅ Jobs automatically retry when capacity available  
✅ Large files processed reliably over time

---

## Usage Examples

### Automatic Scheduling

When worker encounters rate limit:

```
[ExtractionWorkerService] Job abc123 scheduled for 45s delay due to rate limits
[ExtractionJobService] Job abc123 reset to pending (scheduled for 2025-11-20T15:30:45Z, 45s delay): Rate limit: need 25000 tokens, have 5000
```

Job will be picked up in next dequeue cycle after scheduled time.

### Manual Job Inspection

Check if job is scheduled:

```sql
SELECT id, status, scheduled_at, created_at
FROM kb.object_extraction_jobs
WHERE status = 'pending';
```

Jobs with `scheduled_at > NOW()` are waiting for rate capacity.

### Configuration Tuning

Adjust rate limits based on your LLM provider quotas:

```bash
# .env
EXTRACTION_RATE_LIMIT_RPM=60      # Requests per minute
EXTRACTION_RATE_LIMIT_TPM=30000   # Tokens per minute
```

---

## Testing

### Unit Tests Required

- [ ] Test `scheduleJob()` sets correct timestamp
- [ ] Test `resetJobToPending()` resets job state correctly
- [ ] Test `dequeueJobs()` filters by scheduled_at
- [ ] Test `calculateRateLimitDelay()` produces reasonable delays
- [ ] Test rate limit scheduling doesn't increment retry count

### Integration Tests Required

- [ ] Test job is scheduled when rate limit hit
- [ ] Test scheduled job is dequeued after delay
- [ ] Test multiple jobs scheduled with different delays
- [ ] Test jitter prevents thundering herd

### E2E Tests Required

- [ ] Process 20 large documents, verify all complete without failures
- [ ] Verify jobs automatically retry after scheduling
- [ ] Verify no jobs permanently failed due to rate limits

---

## Migration Path

### Applying the Migration

```bash
# Connect to database
psql $DATABASE_URL

# Run migration
\i docs/migrations/029-add-scheduled-at-to-extraction-jobs.sql

# Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'object_extraction_jobs'
AND column_name = 'scheduled_at';
```

### Backward Compatibility

- ✅ Existing jobs (with `scheduled_at = NULL`) processed immediately
- ✅ No data migration required
- ✅ Falls back gracefully if column doesn't exist (service continues to work)

### Rollback Procedure

If issues occur:

```sql
-- Drop the column
ALTER TABLE kb.object_extraction_jobs DROP COLUMN IF EXISTS scheduled_at;

-- Drop the index
DROP INDEX IF EXISTS kb.idx_extraction_jobs_scheduled_dequeue;
```

Then revert code changes and redeploy.

---

## Performance Considerations

### Query Performance

- Added composite index on `(status, scheduled_at)` for efficient dequeue
- WHERE clause uses index-friendly pattern
- No full table scans

### Worker Behavior

- Non-blocking rate limit check (`tryConsume` instead of `waitForCapacity`)
- Graceful exit when rate limited (no exception thrown)
- Continues processing next job in batch

### Rate Limit Distribution

- Exponential backoff prevents queue flooding
- Jitter (±20%) spreads retry times
- Cap at 5 minutes prevents excessive delays

---

## Future Enhancements

1. **Priority Queue:** Allow high-priority jobs to jump ahead
2. **Rate Limit Pooling:** Share rate limits across multiple workers
3. **Dynamic Rate Limits:** Adjust based on provider feedback
4. **Metrics Dashboard:** Visualize scheduled vs. running jobs
5. **Bulk Scheduling API:** Schedule multiple jobs in single transaction

---

## Related Documentation

- Bug Report: `docs/bugs/016-extraction-rate-limiting-causes-job-failures.md`
- Migration: `docs/migrations/029-add-scheduled-at-to-extraction-jobs.sql`
- Rate Limiter: `apps/server/src/modules/extraction-jobs/rate-limiter.service.ts`
- Worker Service: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`

---

**Implemented by:** AI Agent  
**Date:** 2025-11-20
