# Verification Results: Fix Duplicate Access Tree API Calls

## Test Date

November 17, 2025

## Issue Summary

The landing page was making 2 duplicate calls to `/api/user/orgs-and-projects` even when the user was not authenticated.

### Root Causes Identified

1. **React StrictMode Double Render**: In development mode, React 18's StrictMode runs effects twice to detect side effects
2. **Missing Authentication Check**: AccessTreeProvider was fetching data on mount regardless of auth state

## Fix Implementation

### Changes Made to `apps/admin/src/contexts/access-tree.tsx`

1. **Added imports:**

   ```typescript
   import { useRef } from 'react';
   import { useAuth } from '@/contexts/useAuth';
   ```

2. **Added authentication and StrictMode guards:**

   ```typescript
   // Prevent double-fetch in React StrictMode (development only)
   const hasFetchedRef = useRef(false);

   // Get auth state to only fetch when authenticated
   const { isAuthenticated } = useAuth();

   // Fetch once on provider mount, only if authenticated
   useEffect(() => {
     // Skip if already fetched (StrictMode guard)
     if (hasFetchedRef.current) {
       console.log(
         '[AccessTreeProvider] Skipping duplicate fetch (StrictMode)'
       );
       return;
     }

     // Skip if not authenticated
     if (!isAuthenticated) {
       console.log('[AccessTreeProvider] Skipping fetch (not authenticated)');
       setLoading(false);
       return;
     }

     hasFetchedRef.current = true;
     refresh().catch(() => void 0);
   }, [refresh, isAuthenticated]);
   ```

## Verification via Playwright MCP

### Test Setup

- **URL**: http://localhost:5175 (landing page)
- **Auth State**: Not authenticated (no tokens in localStorage)
- **Browser**: Chromium via Playwright MCP

### Test Results

#### Console Output

```
[LOG] [Error Logger] Enabled. View logs with: window.__errorLogs.getLogs()
[LOG] [AccessTreeProvider] Skipping fetch (not authenticated)
[LOG] [AccessTreeProvider] Skipping fetch (not authenticated)
```

**Analysis:**

- ✅ Two console logs show that BOTH StrictMode renders skipped the fetch
- ✅ The reason given is "not authenticated" which is correct
- ✅ No error messages or failed API calls

#### Network Requests

**Total Requests Analyzed**: 137 requests
**API calls to `/api/user/orgs-and-projects`**: **0** ✅

The network log shows:

- All requests are for static assets (JS, CSS, images, fonts)
- No API calls to `/api/user/orgs-and-projects`
- No failed requests (all 200 OK)

#### Visual Confirmation

Landing page loaded successfully with no authentication errors.

## Expected Behavior Changes

### Before Fix

| Scenario               | API Calls | Result                           |
| ---------------------- | --------- | -------------------------------- |
| Landing page (no auth) | 2         | Both fail with 401 Unauthorized  |
| After login            | 2         | Both succeed, but duplicate data |

### After Fix

| Scenario               | API Calls | Result                                                               |
| ---------------------- | --------- | -------------------------------------------------------------------- |
| Landing page (no auth) | 0         | ✅ No calls made, console shows "Skipping fetch (not authenticated)" |
| After login            | 1         | ✅ Single call made (StrictMode duplicate prevented)                 |

## Performance Impact

### Network Traffic Reduction

- **Before**: 2 unnecessary API calls on landing page (both fail)
- **After**: 0 API calls on landing page
- **Savings**: 100% reduction in unnecessary traffic

### Development Experience

- Clear console logging explains why fetches are skipped
- StrictMode guard prevents confusion about "double renders"
- Auth check prevents 401 errors in browser console

## Next Steps

- [x] Test authenticated flow (login and verify single API call)
- [x] Update design.md with authentication check documentation
- [ ] Consider removing verbose console logs in production build
- [ ] Monitor production metrics after deployment

## Conclusion

✅ **Fix Verified Successfully**

The duplicate API calls issue has been resolved. The landing page no longer makes any calls to `/api/user/orgs-and-projects` when the user is not authenticated, and the StrictMode guard ensures only one call is made even in development mode when authenticated.

## Authenticated Flow Verification (November 17, 2025)

### Test Setup

- **URL**: http://localhost:5176/ (landing page → navigated to home)
- **Auth State**: Authenticated user with valid token
- **Browser**: Chrome via DevTools MCP

### Test Results

#### Console Output (Authenticated User)

```
[LOG] [AccessTreeProvider] refresh() called
[LOG] [AccessTreeProvider] Fetching from: /api/user/orgs-and-projects
[LOG] [AccessTreeProvider] Skipping duplicate fetch (StrictMode)
[LOG] [AccessTreeProvider] Response: 1 orgs
```

**Analysis:**

- ✅ **First render**: Fetch was initiated (`refresh() called`, `Fetching from: /api/user/orgs-and-projects`)
- ✅ **Second render (StrictMode)**: Duplicate was prevented (`Skipping duplicate fetch (StrictMode)`)
- ✅ **Success response**: Access tree data loaded successfully (`Response: 1 orgs`)
- ✅ Only 1 actual API call made

#### Network Requests (Authenticated)

**Total API calls to `/api/user/orgs-and-projects`**: **1** ✅

The network log shows:

- Single GET request to `/api/user/orgs-and-projects`
- Response: 304 Not Modified (cached, but still only 1 request)
- No duplicate calls despite StrictMode double-render

## Summary of All Test Scenarios

| Scenario                       | Auth State     | API Calls | Result                                                     |
| ------------------------------ | -------------- | --------- | ---------------------------------------------------------- |
| Landing page (no auth)         | Not auth'd     | 0         | ✅ No calls, console: "Skipping fetch (not authenticated)" |
| After login (fresh load)       | Authenticated  | 1         | ✅ Single call, StrictMode duplicate prevented             |
| StrictMode double render       | Authenticated  | 1         | ✅ Second render skipped via `hasFetchedRef` guard         |
| **Previous behavior (before)** | **Not auth'd** | **2**     | ❌ Both failed with 401 Unauthorized                       |
| **Previous behavior (before)** | **Auth'd**     | **2**     | ❌ Both succeeded, duplicate data fetch                    |

## Verification Complete

Both remaining tasks have been completed:

- ✅ **Task 7.5**: Test landing page after login - verify single API call is made
- ✅ **Task 7.6**: Update design.md to document the auth check and StrictMode guard

The fix successfully reduces API calls from 2 to 1 in all scenarios and eliminates unnecessary calls when not authenticated.
