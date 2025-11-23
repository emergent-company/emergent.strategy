# Bug 055: Invalid Vertex AI Model Name (FALSE ALARM - RESOLVED)

**Date:** 2025-01-21  
**Original Status:** High Severity  
**Final Status:** CLOSED - Not a Bug  
**Resolution Date:** 2025-01-21  
**Component:** Configuration / Test Scripts

## Summary

This bug report was based on incorrect information. The configured model name `gemini-2.5-flash-lite` **IS VALID** and works correctly. The issue was in the test script, not the configuration.

## Original Claim (INCORRECT)

> ❌ "The model name `gemini-2.5-flash-lite` does not exist on Vertex AI"

This was **FALSE**. The user verified on Google's website that `gemini-2.5-flash-lite` is a valid model name.

## What Actually Happened

1. **Test script failed** with model `gemini-1.5-flash-002` (from shell environment)
2. **Incorrectly assumed** the configured model was invalid
3. **Made hasty changes** to `.env.example` without proper investigation
4. **Created this bug report** based on false assumptions

## Root Cause Analysis

The test script `scripts/test-vertex-ai-credentials.mjs` had issues:

1. Used `import 'dotenv/config'` which doesn't override shell variables
2. Didn't load server-specific `.env` files properly
3. Had fallback defaults that masked real configuration
4. Picked up `VERTEX_AI_MODEL=gemini-1.5-flash-002` from user's shell environment

## Investigation Results

After enhancing the test script with variable source tracking:

```
PHASE 0: Shell Environment
  VERTEX_AI_MODEL=gemini-1.5-flash-002 ❌ (from user's shell)

PHASE 1: Root Configuration
  No changes (dotenv doesn't override by default)

PHASE 2: Server Configuration
  VERTEX_AI_MODEL changed:
    Before: gemini-1.5-flash-002
    After:  gemini-2.5-flash-lite ✅ (correct value from apps/server/.env)

PHASE 3: Test Results
  ✅ All tests PASS with gemini-2.5-flash-lite
```

## Actual Solution

**No configuration changes needed.** Only test script improvements:

1. Enhanced test script to load environment in phases (root → server)
2. Added variable source tracking (shell, root, server)
3. Removed fallback defaults
4. Made server config override shell environment (matching app behavior)

## Test Results After Fix

```
✅ Credentials: PASS
✅ Embeddings API: PASS (text-embedding-004, 768-dim, 551ms)
✅ Chat/LLM API: PASS (gemini-2.5-flash-lite, 481ms) ✅
```

**The model `gemini-2.5-flash-lite` works perfectly.**

## Files Modified (Reverted)

- `apps/server/.env.example` - Reverted incorrect change from `gemini-2.5-flash-lite` → `gemini-1.5-flash`

## Files Modified (Correctly)

- `scripts/test-vertex-ai-credentials.mjs` - Enhanced with 3-phase loading and source tracking

## Lessons Learned

1. **Investigate thoroughly before making changes** - Don't assume based on errors alone
2. **Test scripts must match app behavior** - Environment loading is critical
3. **Shell environment can interfere** - Track variable sources to debug properly
4. **Verify claims with authoritative sources** - User confirmed model exists on Google's site
5. **Don't rush to "fix" things** - Take time to understand the real issue

## Prevention

- ✅ Test script now properly mimics server environment loading
- ✅ Variable source tracking helps debug configuration issues
- ✅ No fallback defaults that mask real problems
- ✅ Clear documentation of environment loading phases

## References

- **Full Investigation:** `docs/fixes/056-vertex-ai-model-configuration-investigation.md`
- **Enhanced Test Script:** `scripts/test-vertex-ai-credentials.mjs`
- **Vertex AI Models:** User verified `gemini-2.5-flash-lite` exists on Google's website

## Apology Note

This bug report wasted time by:

- Making incorrect assumptions about model availability
- Changing configuration files unnecessarily
- Creating investigation overhead

The correct approach would have been:

1. Check where the failing model name came from (shell environment)
2. Verify actual configuration in server .env files
3. Test with correct environment loading
4. Only then make changes if truly needed

**Closing this as "Not a Bug" - Configuration was correct all along.**
