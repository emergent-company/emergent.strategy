# Investigation: Origin of gemini-1.5-flash-002 Model Name

**Date:** 2025-01-21  
**Status:** RESOLVED  
**Investigation Tool:** Enhanced test script with variable tracking

## Problem

Test script was using `gemini-1.5-flash-002` model, which doesn't exist, causing chat API test failures. However, the actual application was configured with `gemini-2.5-flash-lite` which works correctly.

## Investigation Process

Enhanced `scripts/test-vertex-ai-credentials.mjs` to track environment variable sources through multiple phases:

1. **Phase 0:** Shell environment variables
2. **Phase 1:** Root folder configuration (.env, .env.local)
3. **Phase 2:** Server configuration (apps/server/.env, apps/server/.env.local)
4. **Phase 3:** Final summary with source tracking

## Findings

### Variable Loading Sequence

The script revealed the following loading sequence:

```
PHASE 0: Shell Environment
  VERTEX_AI_MODEL=gemini-1.5-flash-002 (from shell)

PHASE 1: Root Configuration
  No changes (root .env files don't override shell variables)

PHASE 2: Server Configuration (apps/server/.env)
  VERTEX_AI_MODEL changed:
    Before: gemini-1.5-flash-002
    After:  gemini-2.5-flash-lite ✅

PHASE 3: Final Configuration
  VERTEX_AI_MODEL=gemini-2.5-flash-lite
  Source: shell (but overridden by server config)
```

### Root Cause

**The `gemini-1.5-flash-002` model name came from the USER'S SHELL ENVIRONMENT**, not from any .env file in the repository.

The sequence was:
1. Shell environment exports `VERTEX_AI_MODEL=gemini-1.5-flash-002`
2. Root .env files loaded but didn't override (dotenv defaults to not overriding existing vars)
3. Server .env file loaded with `override: true` → changed to `gemini-2.5-flash-lite`
4. Test script now uses correct model

### Why Previous Test Failed

The original test script used `import 'dotenv/config'` which:
- Loads root .env files automatically
- Does NOT override existing environment variables
- Does NOT load server-specific .env files
- Had fallback defaults that masked configuration issues

So the shell environment variable persisted through the test, never being overridden.

## Solution

Enhanced the test script to:
1. **Track variable sources** - shows where each variable comes from
2. **Load in phases** - mimics actual server behavior:
   - Root config first (no override)
   - Server config second (with override)
3. **Show changes** - displays what changed at each phase
4. **No fallbacks** - matches strict app behavior

## Test Results

After fix, all tests pass:

```
✅ Credentials: PASS
✅ Embeddings API: PASS (text-embedding-004, europe-north1, 768-dim)
✅ Chat/LLM API: PASS (gemini-2.5-flash-lite, europe-central2, 481ms)
```

## Lessons Learned

1. **Shell environment matters** - Variables exported in shell take precedence unless explicitly overridden
2. **dotenv behavior** - Default behavior is to NOT override existing variables
3. **Server loading differs** - Server loads with `override: true` for server-specific configs
4. **Test scripts must match app** - Fallbacks in tests hide real configuration issues
5. **Variable tracking is critical** - Without tracking sources, debugging config issues is nearly impossible

## Related Files

- `scripts/test-vertex-ai-credentials.mjs` - Enhanced with 3-phase loading and tracking
- `apps/server/.env` - Contains `VERTEX_AI_MODEL=gemini-2.5-flash-lite` ✅
- `apps/server/.env.example` - Was incorrectly changed to `gemini-1.5-flash` (needs revert)

## Next Steps

1. ✅ Test script enhanced with variable tracking
2. ⏳ Revert incorrect changes to `.env.example`
3. ⏳ Update bug report 055 (model name is actually correct)
4. ✅ User can clean up shell environment if needed (`unset VERTEX_AI_MODEL`)

## Answer to User's Question

**Q: What is the source of the gemini-1.5-flash-002 model?**

**A: It came from your shell environment.** You (or a script) exported `VERTEX_AI_MODEL=gemini-1.5-flash-002` in your terminal session. The original test script didn't override it because dotenv's default behavior is to preserve existing environment variables. The actual application correctly overrides this with `gemini-2.5-flash-lite` from `apps/server/.env`.
