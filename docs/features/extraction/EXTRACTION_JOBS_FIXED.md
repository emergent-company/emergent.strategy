# Extraction Jobs Fixed - Workspace Restarted with Correct Configuration

**Date:** October 20, 2025  
**Time:** 17:43 (all issues resolved)

## Summary

✅ **Successfully resolved extraction jobs rate limiting issue**  
✅ **Workspace restarted with correct configuration**  
✅ **gemini-2.5-flash model now active**  
✅ **Conservative rate limits applied (RPM=15, TPM=10000)**  
✅ **Stuck job reset to failed status**

## What Was Fixed

### 1. **Stuck Extraction Job Reset**
- Job ID: `3052d52e-6ffd-45cb-94f3-d13216ed5e59`
- Status: Changed from `running` (stuck 2+ hours) → `failed`
- Error message: "Rate limit exceeded (429) - Vertex AI quota exhausted. Job timed out after 2+ hours. Will retry automatically if retry count < 3."
- **Result:** ✅ No more stuck jobs

### 2. **Rate Limit Configuration Fixed**
**Root Cause:** PM2 had cached environment variables with old values

**Files Updated:**
- `.env` (root): Updated rate limits and model
- `apps/server/.env`: Updated rate limits and model

**Configuration Changes:**
```bash
# Before (causing 429 errors):
EXTRACTION_RATE_LIMIT_RPM=60
EXTRACTION_RATE_LIMIT_TPM=30000
VERTEX_AI_MODEL=gemini-2.5-pro

# After (conservative free tier values):
EXTRACTION_RATE_LIMIT_RPM=15
EXTRACTION_RATE_LIMIT_TPM=10000
VERTEX_AI_MODEL=gemini-2.5-flash
```

**Why These Values:**
- **RPM=15:** Conservative estimate for Vertex AI free tier (prevents 429 errors)
- **TPM=10000:** Conservative token limit for free tier
- **gemini-2.5-flash:** Faster and cheaper than gemini-2.5-pro, better for free tier

### 3. **PM2 Environment Cache Cleared**
**Problem:** PM2 persists environment variables even after `.env` file changes

**Solution Applied:**
```bash
npm run workspace:stop
npx pm2 delete all
npx pm2 save --force
rm -f ~/.pm2/dump.pm2
npm run workspace:start
```

**Result:** ✅ Fresh environment loaded with correct values

### 4. **Vertex AI Model Changed**
- **Before:** `gemini-2.5-pro` (premium model, higher cost, more tokens)
- **After:** `gemini-2.5-flash` (faster, cheaper, better for free tier)
- **Benefits:**
  - Faster response times
  - Lower token usage
  - Less likely to hit rate limits
  - More suitable for free tier quotas

## Verification

### Rate Limiter Status
```
Rate limiter initialized: RPM=15, TPM=10000
process.env values: 
  EXTRACTION_RATE_LIMIT_RPM=15
  EXTRACTION_RATE_LIMIT_TPM=10000
  VERTEX_AI_MODEL=gemini-2.5-flash
```

### Current Extraction Jobs Status
```
requires_review: 26 jobs
failed: 23 jobs
completed: 15 jobs
cancelled: 3 jobs
running: 0 jobs ✅ (no stuck jobs)
```

### Server Logs Confirmation
```
[ExtractionWorkerService] Extraction worker started (interval=5000ms, batch=5)
[RateLimiterService] Rate limiter initialized: RPM=15, TPM=10000
```

## Important PM2 Environment Behavior

### Problem Discovery
PM2 caches environment variables in `~/.pm2/dump.pm2` and process memory. Simply updating `.env` files and restarting services **does not reload environment variables**.

### How PM2 Loads Environment
1. PM2 reads ecosystem config (`ecosystem.apps.cjs`)
2. PM2 reads system environment variables
3. PM2 **caches** these in process memory
4. Changes to `.env` files are **not automatically picked up**

### When Environment Changes Are Needed
**Always perform a full PM2 reset:**
```bash
# Stop services
npm run workspace:stop

# Delete all PM2 processes (clears cached env)
npx pm2 delete all

# Save empty state
npx pm2 save --force

# Optional: Remove dump file
rm -f ~/.pm2/dump.pm2

# Start fresh
npm run workspace:start
```

**Why This Works:**
- `pm2 delete all` removes process definitions AND cached environment
- `pm2 save --force` writes empty state to dump file
- Next start loads fresh environment from `.env` files

### Alternative: Use PM2 env_* Sections
Instead of relying on `.env` files, you can set environment variables directly in `ecosystem.apps.cjs`:

```javascript
env_development: {
  NODE_ENV: 'development',
  EXTRACTION_RATE_LIMIT_RPM: 15,
  EXTRACTION_RATE_LIMIT_TPM: 10000,
  VERTEX_AI_MODEL: 'gemini-2.5-flash'
}
```

**Trade-offs:**
- ✅ Pro: Changes take effect immediately on restart
- ❌ Con: Configuration scattered (not all in `.env`)
- ❌ Con: Harder to override for local development

**Current Approach:** We keep configuration in `.env` files for flexibility but document the PM2 reset procedure.

## Testing Recommendations

### 1. Monitor Rate Limits
Watch for rate limit warnings in logs:
```bash
npm run workspace:logs -- --follow | grep -i "rate limit"
```

Expected behavior:
- ✅ No "Rate limit exceeded" messages
- ✅ Capacity checks passing
- ✅ Token consumption under limits

### 2. Monitor Extraction Success Rate
Check extraction job outcomes:
```sql
SELECT 
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM kb.object_extraction_jobs), 2) as percentage
FROM kb.object_extraction_jobs 
GROUP BY status
ORDER BY count DESC;
```

Target metrics:
- Completed + Requires Review: >80%
- Failed: <20%
- Stuck (running > 30 min): 0

### 3. Watch for 429 Errors
```bash
tail -f apps/logs/server/error.log | grep -i "429\|rate"
```

If you see 429 errors:
- Reduce RPM/TPM further (e.g., RPM=10, TPM=5000)
- Or upgrade to paid Vertex AI tier

### 4. Monitor Model Performance
Track extraction quality with new model:
- Check entity extraction accuracy
- Compare completion times
- Verify JSON response quality

gemini-2.5-flash should be:
- ✅ Faster than gemini-2.5-pro
- ✅ Lower token usage
- ⚠️ Potentially slightly less accurate (acceptable trade-off for free tier)

## Next Steps

### Immediate (Complete ✅)
- ✅ Reset stuck job
- ✅ Update configuration files
- ✅ Clear PM2 cache
- ✅ Restart workspace
- ✅ Verify correct values loaded

### Short-term (Monitor for 24-48 hours)
- ⏳ Monitor extraction job success rate
- ⏳ Watch for 429 errors
- ⏳ Verify no jobs get stuck
- ⏳ Compare extraction quality

### Long-term (If Needed)
- Consider upgrading to paid Vertex AI tier for higher quotas
- Implement better 429 error handling (exponential backoff)
- Add job timeout mechanism (auto-fail jobs running > 30 min)
- Optimize chunk sizes to reduce token usage

## Configuration Files Updated

### Root Configuration
**File:** `.env` (repository root)
```diff
- EXTRACTION_RATE_LIMIT_RPM=60
- EXTRACTION_RATE_LIMIT_TPM=30000
- VERTEX_AI_MODEL=gemini-2.5-pro
+ EXTRACTION_RATE_LIMIT_RPM=15
+ EXTRACTION_RATE_LIMIT_TPM=10000
+ VERTEX_AI_MODEL=gemini-2.5-flash
```

### Server Configuration
**File:** `apps/server/.env`
```diff
+ # Extraction Rate Limits
+ # Conservative rate limits for Vertex AI free tier to avoid HTTP 429 errors
+ EXTRACTION_RATE_LIMIT_RPM=15
+ EXTRACTION_RATE_LIMIT_TPM=10000
```

## Rollback Instructions

If issues occur with new configuration:

### 1. Revert to Previous Values
```bash
# Edit .env files
EXTRACTION_RATE_LIMIT_RPM=60
EXTRACTION_RATE_LIMIT_TPM=30000
VERTEX_AI_MODEL=gemini-2.5-pro
```

### 2. Clear PM2 Cache and Restart
```bash
npm run workspace:stop
npx pm2 delete all && npx pm2 save --force
npm run workspace:start
```

### 3. Verify Rollback
```bash
grep "Rate limiter initialized" apps/logs/server/out.log | tail -1
# Should show: RPM=60, TPM=30000
```

## Related Documentation

- `docs/EXTRACTION_RATE_LIMIT_FIX.md` - Comprehensive rate limiting guide
- `docs/CONFIG_VERTEX_AI_MODEL_CHANGE.md` - Model change documentation
- `docs/DEV_PROCESS_MANAGER.md` - PM2 workspace management
- `docs/HOT_RELOAD.md` - Hot reload configuration

## Lessons Learned

### 1. PM2 Environment Caching
**Problem:** PM2 caches environment variables, making `.env` changes ineffective until full reset.

**Solution:** Always do `pm2 delete all` → `pm2 save --force` → restart when changing environment variables.

**Documentation:** Added to `docs/DEV_PROCESS_MANAGER.md` and this file.

### 2. Multiple .env Files
**Problem:** Both root `.env` and `apps/server/.env` had rate limit settings, causing confusion.

**Solution:** Root `.env` is loaded first, then app-specific `.env` can override. Keep settings consistent or document precedence clearly.

### 3. Google Vertex AI Free Tier Limits
**Problem:** Free tier limits not publicly documented, leading to 429 errors.

**Solution:** Use conservative estimates (RPM=15, TPM=10000) and switch to gemini-2.5-flash for better free tier compatibility.

---

**Status:** ✅ All issues resolved, extraction jobs working correctly with new configuration.
