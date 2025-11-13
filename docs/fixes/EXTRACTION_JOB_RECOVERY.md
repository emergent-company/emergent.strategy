# Extraction Job Recovery - Fix for Stuck Jobs

**Date**: 2025-10-05  
**Issue**: Extraction jobs stuck in "running" status after server restart  
**Job ID**: `7df65817-2c04-48b1-b95e-8788aaedca0a`

---

## 🔍 Problem Analysis

### Root Cause
The extraction worker had **no recovery mechanism** for jobs stuck in "running" status after a server restart:

1. **Normal flow**: Job status changes `pending` → `running` when dequeued
2. **Server crash/restart**: Worker process dies mid-execution
3. **On restart**: Worker only polls for `pending` jobs, ignoring stuck `running` jobs
4. **Result**: Jobs permanently stuck in `running` status

### Observed Behavior
```sql
SELECT id, status, started_at, 
       EXTRACT(EPOCH FROM (NOW() - started_at))::int as running_seconds 
FROM kb.object_extraction_jobs 
WHERE id = '7df65817-2c04-48b1-b95e-8788aaedca0a';

-- Result: Job stuck "running" for 2278 seconds (38 minutes)
```

---

## ✅ Solution Implemented

### 1. Automatic Recovery on Startup

Added `recoverOrphanedJobs()` method to `ExtractionWorkerService` that runs on module initialization:

```typescript
// apps/server/src/modules/extraction-jobs/extraction-worker.service.ts

async onModuleInit() {
    // ... existing checks ...
    
    // NEW: Recover orphaned jobs from previous server crash/restart
    await this.recoverOrphanedJobs();
    
    this.start();
}

private async recoverOrphanedJobs(): Promise<void> {
    const orphanThresholdMinutes = 5;
    
    // Reset stuck 'running' jobs back to 'pending'
    const result = await this.db.query(
        `UPDATE kb.object_extraction_jobs
         SET status = 'pending',
             error_message = COALESCE(error_message || E'\n\n', '') || 
                             'Job was interrupted by server restart and has been reset to pending.',
             updated_at = NOW()
         WHERE status = 'running'
           AND updated_at < NOW() - INTERVAL '${orphanThresholdMinutes} minutes'
         RETURNING id, source_type, started_at`,
        []
    );
    
    if (result.rowCount > 0) {
        this.logger.warn(`Recovered ${result.rowCount} orphaned jobs`);
    }
}
```

**Logic**:
- Finds all jobs with `status = 'running'`
- That haven't been updated in 5+ minutes (likely interrupted)
- Resets them to `pending` so they can be retried
- Logs which jobs were recovered

### 2. Manual Retry Endpoint

Added `retryJob()` method to `ExtractionJobService` and exposed via API:

```typescript
// Service method
async retryJob(jobId: string, projectId: string, orgId: string): Promise<ExtractionJobDto> {
    const job = await this.getJobById(jobId, projectId, orgId);
    
    // Can only retry running or failed jobs
    if (job.status !== 'running' && job.status !== 'failed') {
        throw new BadRequestException(`Cannot retry job with status: ${job.status}`);
    }
    
    return this.updateJob(jobId, projectId, orgId, {
        status: ExtractionJobStatus.PENDING,
        error_message: job.error_message
            ? `${job.error_message}\n\nJob was manually retried.`
            : 'Job was manually retried.',
    });
}
```

**API Endpoint**:
```
POST /extraction-jobs/:jobId/retry?project_id=xxx&org_id=yyy
```

---

## 🚀 How to Use

### Automatic Recovery (On Server Restart)

Jobs are automatically recovered when the server starts:

```bash
npm run dev

# Logs will show:
# [ExtractionWorkerService] Recovered 1 orphaned extraction job(s) from 'running' to 'pending': 7df65817-2c04-48b1-b95e-8788aaedca0a
# [ExtractionWorkerService]   - Job 7df65817-2c04-48b1-b95e-8788aaedca0a (document) was running since 2025-10-05T12:01:10.173Z
```

### Manual Recovery (API)

To manually retry a stuck job:

```bash
# Using curl
curl -X POST "http://localhost:3001/extraction-jobs/7df65817-2c04-48b1-b95e-8788aaedca0a/retry?project_id=YOUR_PROJECT_ID&org_id=YOUR_ORG_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Using the admin UI
# Navigate to: /admin/extraction-jobs/7df65817-2c04-48b1-b95e-8788aaedca0a
# Click "Retry Job" button
```

### Database Query (Manual SQL Recovery)

If you need to manually recover a specific job via SQL:

```sql
-- Reset specific job to pending
UPDATE kb.object_extraction_jobs
SET status = 'pending',
    error_message = COALESCE(error_message || E'\n\n', '') || 
                    'Job was manually reset to pending.',
    updated_at = NOW()
WHERE id = '7df65817-2c04-48b1-b95e-8788aaedca0a';

-- Check all stuck jobs
SELECT id, status, source_type, started_at,
       EXTRACT(EPOCH FROM (NOW() - started_at))::int as running_seconds,
       EXTRACT(EPOCH FROM (NOW() - updated_at))::int as inactive_seconds
FROM kb.object_extraction_jobs
WHERE status = 'running'
ORDER BY started_at;

-- Bulk recovery of all stuck jobs (5+ minutes inactive)
UPDATE kb.object_extraction_jobs
SET status = 'pending',
    error_message = COALESCE(error_message || E'\n\n', '') || 
                    'Job was interrupted and has been reset to pending.',
    updated_at = NOW()
WHERE status = 'running'
  AND updated_at < NOW() - INTERVAL '5 minutes'
RETURNING id, source_type;
```

---

## 🔧 Configuration

The orphan threshold is hardcoded to **5 minutes**. To adjust:

```typescript
// In extraction-worker.service.ts, recoverOrphanedJobs() method
const orphanThresholdMinutes = 5; // Change this value
```

**Recommended values**:
- **5 minutes** (current): Safe for most extraction jobs
- **10 minutes**: For slower LLM extractions
- **2 minutes**: For fast, simple extractions

---

## 📊 Monitoring

### Check for Orphaned Jobs

```sql
-- Jobs running longer than 10 minutes
SELECT id, status, source_type, 
       started_at,
       NOW() - started_at as running_duration,
       NOW() - updated_at as inactive_duration
FROM kb.object_extraction_jobs
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '10 minutes';

-- Count by status
SELECT status, COUNT(*) 
FROM kb.object_extraction_jobs 
GROUP BY status;
```

### Logs to Watch

```bash
# Successful recovery on startup
[ExtractionWorkerService] Recovered 1 orphaned extraction job(s)

# No orphaned jobs found
[ExtractionWorkerService] No orphaned extraction jobs found - all clear

# Failed recovery (non-fatal)
[ExtractionWorkerService] Failed to recover orphaned jobs: <error>
```

---

## 🐛 Edge Cases Handled

1. **Server restarts during job execution**: ✅ Auto-recovered on startup
2. **Multiple worker instances**: ✅ Uses `FOR UPDATE SKIP LOCKED` in dequeue
3. **Job legitimately taking long**: ✅ 5-minute threshold prevents premature recovery
4. **Recovery fails**: ✅ Non-fatal error, worker continues normally
5. **Manual retry of completed job**: ❌ Blocked by validation
6. **Manual retry of pending job**: ❌ Blocked by validation (already will be processed)

---

## 🔮 Future Improvements

1. **Heartbeat mechanism**: Jobs update `updated_at` periodically during execution
2. **Job timeout**: Hard limit on maximum job duration (e.g., 30 minutes)
3. **Retry limit**: Track retry count, fail after N retries
4. **Worker health check**: External watchdog to detect stuck workers
5. **Queue-based execution**: Bull/BullMQ for more robust job management
6. **Configurable threshold**: Make orphan threshold an environment variable

---

## 📝 Testing

### Test Automatic Recovery

```bash
# 1. Start a job
curl -X POST "http://localhost:3001/extraction-jobs" \
  -H "Content-Type: application/json" \
  -d '{"source_type":"document","project_id":"xxx","org_id":"yyy"}'

# 2. Manually set it to running
psql -d spec -c "UPDATE kb.object_extraction_jobs SET status = 'running', updated_at = NOW() - INTERVAL '10 minutes' WHERE id = 'JOB_ID';"

# 3. Restart server
npm run dev

# 4. Check logs for recovery message
# 5. Verify job is back to pending
psql -d spec -c "SELECT id, status FROM kb.object_extraction_jobs WHERE id = 'JOB_ID';"
```

### Test Manual Retry

```bash
# 1. Find a stuck job
psql -d spec -c "SELECT id FROM kb.object_extraction_jobs WHERE status = 'running' LIMIT 1;"

# 2. Call retry endpoint
curl -X POST "http://localhost:3001/extraction-jobs/JOB_ID/retry?project_id=xxx&org_id=yyy"

# 3. Verify status changed to pending
psql -d spec -c "SELECT status FROM kb.object_extraction_jobs WHERE id = 'JOB_ID';"
```

---

## 🎯 Immediate Action Required

To fix the currently stuck job `7df65817-2c04-48b1-b95e-8788aaedca0a`:

1. **Option A - Restart server** (automatic recovery):
   ```bash
   npm run dev
   ```

2. **Option B - Manual API retry**:
   ```bash
   curl -X POST "http://localhost:3001/extraction-jobs/7df65817-2c04-48b1-b95e-8788aaedca0a/retry?project_id=YOUR_PROJECT_ID&org_id=YOUR_ORG_ID"
   ```

3. **Option C - Direct SQL**:
   ```sql
   UPDATE kb.object_extraction_jobs
   SET status = 'pending',
       error_message = 'Job was interrupted by server restart and has been reset to pending.',
       updated_at = NOW()
   WHERE id = '7df65817-2c04-48b1-b95e-8788aaedca0a';
   ```

---

**Files Modified**:
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
- `apps/server/src/modules/extraction-jobs/extraction-job.service.ts`
- `apps/server/src/modules/extraction-jobs/extraction-job.controller.ts`
