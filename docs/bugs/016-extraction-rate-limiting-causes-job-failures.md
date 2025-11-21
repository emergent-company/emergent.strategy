# Bug Report: Extraction Rate Limiting Causes Job Failures Instead of Queuing

**Status:** Open  
**Severity:** High  
**Component:** Extraction Jobs  
**Discovered:** 2025-11-20  
**Discovered by:** User Report  
**Assigned to:** Unassigned

---

## Summary

When processing large files with multiple extraction jobs, rate limiting causes jobs to fail instead of being queued for retry, leading to extraction stoppage and job failure accumulation.

---

## Description

The extraction worker currently dequeues a batch of jobs (default: 5) and processes them **sequentially**, checking rate limits before each LLM call. When rate limits are exceeded:

1. The `rateLimiter.waitForCapacity()` method waits up to 60 seconds for capacity
2. If capacity is not available within 60s, it throws an error: "Rate limit exceeded, job will retry later"
3. The job is marked as `FAILED` with this error
4. The job will only retry if it hasn't exceeded max retries (3 attempts)
5. Meanwhile, other pending jobs remain in the queue but are blocked by the sequential processing

**The core issue:** Jobs are **failed and stopped** rather than being **queued and delayed**. This is problematic because:

- Jobs that hit rate limits are marked as failures (counts against retry limit)
- No backoff or scheduling mechanism exists to space out retries
- Large files with high token counts can easily exceed TPM limits
- Sequential processing means one rate-limited job blocks the entire batch

**What should happen:**

- Jobs should remain in `pending` status when rate capacity is insufficient
- Jobs should be intelligently scheduled based on rate limit availability
- The system should implement a proper job queue with priority and scheduling
- Rate limiting should be applied at the **queue level**, not the **job level**

---

## Reproduction Steps

1. Upload a large document (e.g., Bible with multiple books)
2. Create extraction jobs for multiple documents
3. Observe that jobs are dequeued in batches of 5
4. When TPM/RPM limits are hit, jobs fail with "Rate limit exceeded"
5. Failed jobs are retried but may fail again if capacity is still unavailable
6. After 3 retries, jobs remain permanently failed

---

## Logs / Evidence

**Current Rate Limiting Implementation:**

From `apps/server/src/modules/extraction-jobs/rate-limiter.service.ts:127-150`:

```typescript
async waitForCapacity(
  estimatedTokens: number = 1000,
  maxWaitMs: number = 60000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (await this.tryConsume(estimatedTokens)) {
      return true;
    }

    // Calculate wait time until next refill
    const waitTime = Math.min(
      this.getTimeUntilRefill(),
      1000 // Check at least every second
    );

    this.logger.debug(`Rate limited, waiting ${waitTime}ms`);
    await this.sleep(waitTime);
  }

  this.logger.warn(`Rate limit wait timeout after ${maxWaitMs}ms`);
  return false; // Causes job to fail
}
```

**Sequential Processing:**

From `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:343-356`:

```typescript
async processBatch() {
  const batchSize = this.config.extractionWorkerBatchSize;
  const jobs = await this.jobService.dequeueJobs(batchSize);

  if (jobs.length === 0) {
    return;
  }

  this.logger.log(`Processing batch of ${jobs.length} extraction jobs`);

  for (const job of jobs) {
    await this.processJob(job); // Sequential - one at a time
  }
}
```

**Failure on Rate Limit:**

From `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:540-551`:

```typescript
const allowed = await this.rateLimiter.waitForCapacity(estimatedTokens, 60000);

if (!allowed) {
  const message = 'Rate limit exceeded, job will retry later';
  rateLimitStep('warning', {
    message,
  });
  throw new Error(message); // This causes job to be marked FAILED
}
```

**Log Location:** `apps/logs/server/out.log`  
**Recent Log Entry:**

```
2025-11-20 14:34:23: [ExtractionJobService] - [DEQUEUE] Found 0 jobs (rowCount=0)
```

---

## Impact

- **User Impact:**
  - Large file extractions fail completely
  - Users must manually retry failed jobs
  - Unclear feedback - jobs appear "failed" when they're just rate-limited
- **System Impact:**
  - Inefficient resource utilization (sequential processing)
  - Rate limit capacity wasted during idle periods
  - No intelligent scheduling or backoff
  - Jobs accumulate in failed state unnecessarily
- **Frequency:** Occurs reliably when processing large documents or multiple files with high token counts

- **Workaround:**
  - Reduce batch size (`EXTRACTION_WORKER_BATCH_SIZE`)
  - Increase rate limits (`EXTRACTION_RATE_LIMIT_RPM`, `EXTRACTION_RATE_LIMIT_TPM`)
  - Manually retry failed jobs through the API
  - Process fewer documents at a time

---

## Root Cause Analysis

The extraction worker was designed with a simple polling + sequential processing model, which doesn't account for:

1. **Rate limiting as a queueing constraint** - Rate limits should determine **when** jobs run, not **whether** they succeed
2. **Job scheduling** - No mechanism to delay jobs until rate capacity is available
3. **Batch optimization** - Sequential processing doesn't utilize available rate limit capacity efficiently
4. **Failure semantics** - Rate limit exhaustion is a temporary resource constraint, not a job failure

**Related Files:**

- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:343-356` - Sequential batch processing
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:540-551` - Rate limit failure handling
- `apps/server/src/modules/extraction-jobs/rate-limiter.service.ts:127-150` - Rate limit wait with timeout
- `apps/server/src/modules/extraction-jobs/extraction-job.service.ts:502-590` - Job dequeue logic
- `apps/server/src/common/config/config.schema.ts:170-171` - Default rate limits (60 RPM, 30000 TPM)

**Key Configuration:**

- `EXTRACTION_WORKER_BATCH_SIZE` = 5 (default)
- `EXTRACTION_WORKER_POLL_INTERVAL_MS` = 5000 (default)
- `EXTRACTION_RATE_LIMIT_RPM` = 60 (default)
- `EXTRACTION_RATE_LIMIT_TPM` = 30000 (default)

---

## Proposed Solution

### Option 1: Job Scheduling with Rate-Aware Queue (Recommended)

Implement a proper job scheduler that respects rate limits at the queue level:

1. **Add `scheduled_at` field** to `object_extraction_jobs` table

   - When rate limit is hit, set `scheduled_at = NOW() + delay` instead of failing
   - Keep job in `pending` status
   - Dequeue logic filters by `scheduled_at <= NOW()`

2. **Rate-aware scheduling**

   - Calculate estimated delay based on rate limiter state
   - Use exponential backoff for retries
   - Priority queue: jobs with earlier `scheduled_at` are processed first

3. **Remove rate limit failures**

   - Rate limit exhaustion should schedule, not fail
   - Only fail jobs on actual LLM errors or content issues

4. **Optimize batch processing**
   - Pre-filter jobs by rate limit capacity
   - Process only jobs that can fit within current rate limits
   - Defer others until next poll cycle

**Changes Required:**

1. Database migration to add `scheduled_at` column (TIMESTAMP, nullable)
2. Update `dequeueJobs()` to filter by `scheduled_at <= NOW()`
3. Modify rate limit handling to schedule instead of fail
4. Add scheduling logic to calculate appropriate delays
5. Update job status transitions (pending → scheduled → running)

**Testing Plan:**

- [ ] Unit tests for scheduling logic
- [ ] Integration tests with rate limiter
- [ ] E2E test: process 20 large documents, verify all complete without failures
- [ ] Verify jobs are scheduled with appropriate delays
- [ ] Verify no jobs are failed due to rate limits
- [ ] Load testing with concurrent extractions

### Option 2: Retry Queue with Backoff (Simpler)

Keep current failure model but improve retry mechanism:

1. Add exponential backoff for rate-limited failures
2. Don't count rate limit failures against retry limit
3. Implement separate retry queue with delays
4. Add job metadata to track rate limit vs. real failures

**Pros:** Simpler to implement  
**Cons:** Still treats rate limiting as failure, less efficient

---

## Related Issues

- Related to batch processing design
- Affects large document extraction workflows
- Impacts rate limit configuration and tuning

---

## Notes

**Current Behavior Summary:**

- Worker polls every 5s for pending jobs
- Dequeues batch of 5 jobs (default)
- Processes sequentially with rate limit check before each LLM call
- Waits up to 60s for rate capacity
- Fails job if capacity unavailable (counts as failure)
- Retries failed jobs (max 3 attempts)

**Design Considerations:**

- EmbeddingWorkerService has similar pattern - may need same fix
- Bull queue (mentioned in comments) was planned but not implemented
- Rate limiter uses token bucket algorithm (correct approach)
- Current rate limits: 60 RPM, 30000 TPM (may need tuning for large docs)

**User Feedback:**

> "I want you to investigate the rate limit regarding the extraction. I'm hitting it right now with bigger files. The rate limit is about not scheduling too much work in parallel, too many tasks for the model. They should be queued, not just rate-limited, and extraction stopped."

This clearly indicates the need for job scheduling/queuing rather than job failure on rate limit exhaustion.

---

**Last Updated:** 2025-11-20 by AI Agent
