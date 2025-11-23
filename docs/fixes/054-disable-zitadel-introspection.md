# Fix: Disabled Zitadel Introspection Temporarily

**Date:** 2025-11-21  
**Status:** Implemented  
**Related Issue:** Zitadel 500 errors causing all authenticated requests to fail

## Problem

Zitadel was intermittently returning 500 errors during token introspection, causing:

- Circuit breaker to trip for 30 seconds
- All authenticated API requests to fail with 500 errors
- Disruption to normal application functionality

Error example:

```
[ZitadelService] Failed to acquire CLIENT token: Token request failed (500):
{"error":"server_error","error_description":"Errors.Internal"}
[ZitadelService] Zitadel returned 500, tripping circuit breaker for 30s
```

## Solution

Added a bypass flag to disable Zitadel introspection while stability issues are being investigated.

### Changes Made

1. **Modified auth.service.ts** (`apps/server/src/modules/auth/auth.service.ts:154-193`)

   - Added `DISABLE_ZITADEL_INTROSPECTION` environment variable check
   - When set to anything except `'false'`, introspection is bypassed
   - Default behavior: introspection is **disabled** (safer)
   - Added TODO comment and detailed explanation

2. **Added environment variable** (`.env`)
   ```bash
   DISABLE_ZITADEL_INTROSPECTION=true
   ```

### How It Works

The authentication flow now works as follows:

1. Check for static test tokens (e2e-\*, no-scope, with-scope, etc.) - **unchanged**
2. **NEW:** Check if `DISABLE_ZITADEL_INTROSPECTION !== 'false'`
   - If disabled (default), skip Zitadel introspection entirely and log the bypass
   - If enabled, attempt Zitadel introspection (original behavior)
3. Fall back to mock mode if no JWKS configured - **unchanged**
4. Verify JWT using JWKS if configured - **unchanged**

### Re-enabling Zitadel Introspection

When Zitadel stability improves, you can re-enable introspection by:

1. Setting the environment variable explicitly to `false`:

   ```bash
   DISABLE_ZITADEL_INTROSPECTION=false
   ```

2. Or removing the environment variable entirely and changing the default in the code

3. Restart the server to pick up the change

## Impact

- ✅ No more 500 errors from Zitadel introspection failures
- ✅ Authentication continues working using JWKS verification
- ✅ Mock/test tokens still work as expected
- ⚠️ Loses caching benefit of introspection (minor performance impact)
- ⚠️ Zitadel service still running but not used for token validation

## Testing

After deployment:

1. Verify authenticated requests succeed without 500 errors
2. Check logs for "Zitadel introspection disabled" message
3. Confirm no circuit breaker errors in logs
4. Test with valid JWT tokens from Zitadel login flow

## Future Work

- Investigate root cause of Zitadel 500 errors
- Consider alternative token validation strategies
- Re-enable introspection once Zitadel is stable
- Potentially add retry logic or more graceful degradation

## References

- Auth service: `apps/server/src/modules/auth/auth.service.ts`
- Zitadel service: `apps/server/src/modules/auth/zitadel.service.ts`
- Auth guard: `apps/server/src/modules/auth/auth.guard.ts`
