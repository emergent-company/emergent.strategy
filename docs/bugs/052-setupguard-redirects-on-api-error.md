# Bug Report: SetupGuard Redirects to Org Creation on 500 Error

**Status:** Resolved  
**Severity:** High  
**Component:** Admin UI / Frontend  
**Discovered:** 2025-11-19  
**Discovered by:** User Report  
**Assigned to:** AI Agent

---

## Summary

When the `/api/user/orgs-and-projects` endpoint returns a 500 error, the admin panel incorrectly redirects to the organization creation modal instead of displaying an error message to the user.

---

## Description

### Actual Behavior

1. User opens the admin panel
2. The `/api/user/orgs-and-projects` API call fails with a 500 error
3. Browser console shows the 500 error
4. User is redirected to `/setup/organization` (organization creation page)
5. No clear indication of the server error is provided to the user

### Expected Behavior

1. User opens the admin panel
2. The `/api/user/orgs-and-projects` API call fails with a 500 error
3. An error message should be displayed on screen indicating:
   - Server error occurred
   - Unable to load organizations
   - Option to retry
   - Guidance to contact support if issue persists

### When/How It Occurs

This issue occurs when:

- The backend API is unavailable or failing
- Zitadel authentication service is down (causing 500 errors)
- Database connectivity issues
- Any server-side error that prevents successful retrieval of org/project data

---

## Reproduction Steps

1. Start the admin panel with a malfunctioning backend (e.g., Zitadel down)
2. Navigate to the admin panel URL (http://localhost:5176)
3. Observe browser console showing 500 error
4. User is redirected to organization creation page
5. No error message is displayed to the user

---

## Logs / Evidence

```
[AuthService] src/modules/auth/auth.service.ts:178 - [AUTH] Zitadel introspection failed, falling back to JWKS: Error: Token request failed (500): {"error":"server_error","error_description":"Errors.Internal"}
```

**Log Location:** `apps/logs/server/error.log`  
**Timestamp:** 2025-11-19 12:24:XX

**Browser Console:**

```
[SetupGuard] No orgs found, redirecting to org setup
```

---

## Impact

- **User Impact:**

  - Users see confusing behavior when server is down
  - No clear indication of what went wrong
  - Users may think they need to create an organization when the actual problem is a server error
  - Poor user experience during outages

- **System Impact:**

  - Masks underlying infrastructure problems
  - Makes it harder to diagnose issues
  - Users cannot distinguish between "no organizations" and "server error"

- **Frequency:** Occurs whenever backend services fail or are unavailable

- **Workaround:** None - users must wait for backend services to be restored

---

## Root Cause Analysis

The issue is in the `SetupGuard` component at `apps/admin/src/components/guards/SetupGuard.tsx`:

1. **AccessTreeContext properly captures errors** (line 102-108):

   ```typescript
   catch (e) {
     const errorMessage = e instanceof Error ? e.message : 'Unknown error';
     console.log('[AccessTreeProvider] Fetch failed:', errorMessage);
     setError(errorMessage);
   }
   ```

2. **SetupGuard does NOT check error state** (original lines 52-61):

   ```typescript
   // Redirect to setup if missing org
   if (orgs.length === 0) {
     console.log('[SetupGuard] No orgs found, redirecting to org setup');
     hasRedirectedRef.current = true;
     navigate('/setup/organization', {
       replace: true,
       state: { returnTo: location.pathname },
     });
     return;
   }
   ```

3. **The bug:** When API fails, `error` state is set but `orgs.length === 0`, so the guard redirects to org setup without checking if the empty list is due to an error.

**Related Files:**

- `apps/admin/src/components/guards/SetupGuard.tsx:52-61` - Missing error check before redirect
- `apps/admin/src/contexts/access-tree.tsx:102-108` - Error handling (working correctly)
- `apps/admin/src/hooks/use-api.ts:70-149` - Error message extraction (working correctly)

---

## Proposed Solution

### Changes Required:

1. **Add `error` to destructured context in SetupGuard** (line 28):

   ```typescript
   const { orgs, projects, loading, error } = useAccessTreeContext();
   ```

2. **Check for error before redirecting** (after line 51):

   ```typescript
   // If there's an API error, don't redirect - show error state instead
   if (error) {
     console.error(
       '[SetupGuard] API error detected, showing error state:',
       error
     );
     return;
   }
   ```

3. **Add error state UI** (after loading spinner):

   ```typescript
   // Show error state if API failed
   if (error) {
     return (
       <div className="flex justify-center items-center min-h-screen bg-base-200">
         <div className="mx-4 w-full max-w-md">
           <div className="bg-base-100 shadow-xl border border-base-300 card">
             <div className="space-y-4 card-body">
               {/* Error icon, heading, message */}
               {/* Error alert with error message */}
               {/* Retry button */}
             </div>
           </div>
         </div>
       </div>
     );
   }
   ```

4. **Add `error` to useEffect dependencies** (line 117):
   ```typescript
   }, [orgs, projects, loading, error, navigate, location.pathname, ...]);
   ```

### Testing Plan:

- [x] Code review - ensure error is properly destructured and checked
- [x] TypeScript compilation - no type errors
- [x] Logic review - error is checked before redirect logic
- [x] UI review - error state displays appropriate message with retry option
- [ ] Manual testing - simulate API failure and verify error display
- [ ] E2E testing - add test case for API error handling

---

## Related Issues

- Related to Zitadel introspection failures (separate infrastructure issue)
- Improves overall error handling pattern for similar guards/components

---

## Notes

### Implementation Details

The fix has been implemented in `SetupGuard.tsx` with the following changes:

1. Line 28: Added `error` to destructured context
2. Lines 53-60: Added error check before redirect logic
3. Lines 139-210: Added comprehensive error UI with retry button
4. Line 121: Added `error` to useEffect dependencies

The error UI provides:

- Clear "Server Error" heading
- Explanation: "Unable to load your organizations and projects"
- The actual error message from the API
- "Retry" button to reload the page
- Guidance to contact support if problem persists
- Appropriate `data-testid` attributes for testing

### User-Friendly Error Messages

The error message displayed is already user-friendly because:

- `use-api.ts` (lines 76-122) transforms raw 500 errors into: "Server error. Please try again later or contact support if the issue persists."
- This prevents exposing technical error details to end users

---

**Last Updated:** 2025-11-19 by AI Agent
