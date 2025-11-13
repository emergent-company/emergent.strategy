# Extraction Jobs Rate Limiting Issue - Fix Documentation

**Date:** October 20, 2025  
**Issue:** Extraction jobs stuck due to Google Vertex AI rate limiting (HTTP 429)

## Problem Summary

Extraction jobs are hitting Google Vertex AI's API rate limits, causing:
1. Jobs stuck in "running" status for hours
2. HTTP 429 "Too Many Requests" errors
3. No automatic recovery from stuck state

## Root Causes

1. **Missing Rate Limit Configuration**
   - `.env` file is missing `EXTRACTION_RATE_LIMIT_RPM` and `EXTRACTION_RATE_LIMIT_TPM` settings
   - System using default values that may exceed Vertex AI quotas

2. **Vertex AI Free Tier Limits**
   - Free tier has strict quotas (requests per minute, tokens per minute)
   - When exceeded, API returns HTTP 429 errors

3. **Job Not Marked as Failed**
   - Job ID `3052d52e-6ffd-45cb-94f3-d13216ed5e59` stuck in "running" status
   - Started: 15:25:58, still running at 17:24+ (2+ hours)
   - Worker encountered 429 error but job status not updated

## Error Log Evidence

```
2025-10-20 17:20:20: ClientError: [VertexAI.ClientError]: got status: 429 Too Many Requests
{"error":{"code":429,"message":"Resource exhausted. Please try again later."}}

2025-10-20 17:20:20: [VertexAIProvider] src/modules/extraction-jobs/llm/vertex-ai.provider.ts:155 
- Failed to extract Feature from chunk 1/1
```

## Immediate Fixes

### 1. Reset Stuck Job (Manual SQL)

Connect to database and run:

```sql
UPDATE kb.object_extraction_jobs 
SET 
    status = 'failed',
    completed_at = NOW(),
    error_message = 'Rate limit exceeded (429) - Vertex AI quota exhausted. Job timed out after 2+ hours. Will retry automatically if retry count < 3.'
WHERE id = '3052d52e-6ffd-45cb-94f3-d13216ed5e59';
```

### 2. Add Rate Limit Configuration

Add to `apps/server/.env`:

```bash
# Extraction Rate Limits (adjust based on Vertex AI tier)
# Free tier: ~15 RPM, ~10000 TPM (conservative estimates)
# Paid tier: Higher limits based on quota
EXTRACTION_RATE_LIMIT_RPM=15
EXTRACTION_RATE_LIMIT_TPM=10000
```

**Why these values?**
- Google Vertex AI free tier limits are **not publicly documented** for Gemini models
- These are **conservative estimates** based on:
  - General Google API free tier patterns (~15-60 RPM)
  - Token limits typically 10k-30k TPM for free tier
- Set conservatively to avoid 429 errors
- Can increase if you have paid tier

### 3. Restart Workspace

After adding configuration:

```bash
npm run workspace:stop
npm run workspace:start
```

Or using Nx:

```bash
nx run workspace-cli:workspace:stop
nx run workspace-cli:workspace:start
```

## Long-Term Solutions

### Option A: Upgrade to Paid Vertex AI Tier

**Benefits:**
- Higher rate limits
- More predictable quotas
- Better for production use

**How to:**
1. Go to Google Cloud Console: https://console.cloud.google.com
2. Navigate to: Vertex AI → Generative AI → Quotas
3. Enable billing for project `spec-server-dev`
4. Request quota increase if needed
5. Update `.env` with higher limits:
   ```bash
   EXTRACTION_RATE_LIMIT_RPM=60
   EXTRACTION_RATE_LIMIT_TPM=30000
   ```

### Option B: Implement Better Error Handling

The current system has rate limiting but doesn't handle 429 errors from Vertex AI properly. Enhancement needed:

**File:** `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts`

**Current behavior:**
- Catches error, logs it, continues with next chunk
- Job never marked as failed
- Stuck in "running" state

**Needed improvements:**
1. **Detect 429 errors specifically:**
   ```typescript
   catch (error) {
       if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
           // Mark job for retry, don't continue processing
           throw new RateLimitExceededError('Vertex AI rate limit hit', error);
       }
       // ... existing error handling
   }
   ```

2. **Add exponential backoff for retries:**
   - First retry: 1 minute delay
   - Second retry: 5 minutes delay  
   - Third retry: 15 minutes delay

3. **Job timeout mechanism:**
   - If job running > 30 minutes, mark as failed
   - Worker should check job age and timeout stuck jobs

### Option C: Optimize Token Usage

**gemini-2.5-flash vs gemini-2.5-pro:**
- ✅ We already switched to `gemini-2.5-flash` (faster, cheaper)
- Flash model uses fewer tokens per request
- Should help stay under rate limits

**Additional optimizations:**
- Reduce chunk size if documents are large
- Batch smaller extractions together
- Skip redundant type extractions

## Verification Steps

After implementing fixes:

### 1. Check Rate Limiter Status
```bash
# View logs for rate limiter activity
npm run workspace:logs -- --follow | grep -i "rate"
```

### 2. Monitor Extraction Progress
```bash
# Watch extraction worker logs
npm run workspace:logs -- --follow | grep -i "extraction\|vertex"
```

### 3. Query Job Status
```sql
SELECT 
    id, 
    status, 
    created_at, 
    started_at,
    completed_at,
    error_message,
    EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) / 60 as duration_minutes
FROM kb.object_extraction_jobs 
WHERE status IN ('running', 'pending')
ORDER BY created_at DESC 
LIMIT 10;
```

### 4. Check for 429 Errors
```bash
tail -50 apps/logs/server/error.log | grep -i "429\|rate"
```

## Configuration Reference

### Current Settings (after fixes)

**PM2 Config:** `tools/workspace-cli/pm2/ecosystem.apps.cjs`
- ✅ No hardcoded Vertex AI settings (uses .env)

**Environment:** `apps/server/.env`
```bash
# Vertex AI Configuration
VERTEX_AI_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash

# Rate Limits (FREE TIER - Conservative)
EXTRACTION_RATE_LIMIT_RPM=15    # Requests per minute
EXTRACTION_RATE_LIMIT_TPM=10000 # Tokens per minute
```

### Upgrading to Paid Tier

If you enable billing and get higher quotas, update `.env`:

```bash
# Rate Limits (PAID TIER)
EXTRACTION_RATE_LIMIT_RPM=60    # Or higher based on your quota
EXTRACTION_RATE_LIMIT_TPM=30000 # Or higher based on your quota
```

## Rate Limiter Implementation

The system has a sophisticated rate limiter:

**File:** `apps/server/src/modules/extraction-jobs/rate-limiter.service.ts`

**Features:**
- ✅ Token bucket algorithm
- ✅ Dual limits: RPM (requests per minute) and TPM (tokens per minute)
- ✅ Automatic refill over time
- ✅ Wait for capacity with timeout
- ✅ Actual vs estimated token adjustment

**How it works:**
1. Before each LLM call, check if capacity available
2. If not, wait up to 60 seconds for capacity
3. If still no capacity, mark job for retry
4. After LLM call, report actual token usage
5. Adjust bucket based on actual vs estimated

## Retry Logic

**Max Retries:** 3 attempts  
**Current Retry Count Check:**
```typescript
private async willRetryJob(jobId: string): Promise<boolean> {
    const retryCount = await this.getJobRetryCount(jobId);
    const maxRetries = 3;
    return retryCount < maxRetries;
}
```

**Job Status Flow:**
```
pending → running → [429 error] → failed (retry_count=1) → 
pending → running → [429 error] → failed (retry_count=2) → 
pending → running → [success] → requires_review
```

## Monitoring and Alerts

### Key Metrics to Watch

1. **Job Stuck Duration**
   - Alert if job in "running" > 30 minutes
   - Automatic timeout needed

2. **Failure Rate**
   - Alert if >50% of jobs failing with 429 errors
   - Indicates quota too low

3. **Retry Count**
   - Alert if jobs hitting max retries (3)
   - Indicates persistent quota issues

4. **Rate Limiter Capacity**
   - Monitor `rateLimiter.getStatus()` in logs
   - Track when capacity is exhausted

## FAQ

**Q: How do I know if I'm on free or paid tier?**  
A: Check Google Cloud Console → Billing. If no billing account linked, you're on free tier.

**Q: Can I just increase the rate limits in .env to avoid 429s?**  
A: No! The .env limits control **local rate limiting**. You still need actual Vertex AI quota. Set .env limits **below** your actual quota to avoid 429s.

**Q: Why conservative values (15 RPM, 10k TPM)?**  
A: Google doesn't document free tier limits. These values are safe estimates that won't exhaust quota quickly.

**Q: What happens if I set limits too high?**  
A: You'll still get 429 errors from Vertex AI. The local rate limiter will just consume capacity faster than Vertex AI allows.

**Q: Should I restart after changing .env?**  
A: Yes! NestJS reads .env at startup. Use `npm run workspace:stop && npm run workspace:start`.

## Related Files

- `apps/server/.env` - Configuration
- `apps/server/.env.example` - Configuration template
- `tools/workspace-cli/pm2/ecosystem.apps.cjs` - PM2 process config
- `apps/server/src/modules/extraction-jobs/rate-limiter.service.ts` - Rate limiter
- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts` - Worker
- `apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts` - Vertex AI client

## Next Steps

1. ✅ Document issue (this file)
2. ⏳ Reset stuck job manually
3. ⏳ Add rate limit config to `.env`
4. ⏳ Restart workspace
5. ⏳ Monitor for 24 hours
6. ⏳ Consider upgrading to paid tier if needed
7. ⏳ Implement better 429 error handling (future enhancement)

---

**Status:** Fix documented, awaiting manual intervention to reset stuck job and add configuration.
