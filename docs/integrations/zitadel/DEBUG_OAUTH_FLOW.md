# Debug OAuth Flow - Step by Step Guide

## What We Added

I've added comprehensive debug logging throughout the OAuth flow:

### Frontend Logging (Browser Console)

1. **Login Initiation** (`oidc.ts`)
   - `[OIDC] startAuth called` - Shows issuer, clientId, redirectUri, scopes
   - `[OIDC] Code verifier stored in sessionStorage`
   - `[OIDC] Redirecting to authorization endpoint` - Shows full auth URL

2. **Callback Page** (`callback.tsx`)
   - `[AuthCallback] Page loaded, parsing callback params`
   - `[AuthCallback] Parsed params` - Shows if code present or error
   - `[AuthCallback] Calling handleCallback with code`
   - `[AuthCallback] handleCallback succeeded, navigating to /admin`
   - OR `[AuthCallback] handleCallback failed` - Shows error details

3. **Token Exchange** (`oidc.ts`)
   - `[OIDC] exchangeCodeForTokens called` - Shows code (first 20 chars)
   - `[OIDC] Code verifier retrieved from sessionStorage`
   - `[OIDC] Token exchange request` - Shows token endpoint
   - `[OIDC] Token exchange response` - Shows HTTP status
   - `[OIDC] Token exchange successful` - Shows token info
   - OR `[OIDC] Token exchange failed` - Shows status + Zitadel error detail

4. **Token Storage** (`auth.tsx`)
   - `[AuthContext] applyTokenResponse called` - Shows token presence
   - `[AuthContext] Parsed JWT claims` - Shows user info
   - `[AuthContext] State updated, saving to localStorage`
   - `[AuthContext] Successfully saved auth state to localStorage`
   - OR `[AuthContext] Failed to save to localStorage`

### Backend Logging (Server Logs)

The `AuthGuard` already logs:
- `[AuthGuard] Request to: <path>`
- `[AuthGuard] Missing Authorization header` (if no token)
- `[AuthGuard] Invalid Bearer format` (if malformed)
- `[AuthGuard] Token present, validating...` (with token length)
- `[AuthGuard] Token validation failed` (if invalid)
- `[AuthGuard] User validated` (with user ID, email, scopes)

## How to Debug

### Step 1: Open Browser Console

1. Open http://localhost:5176 in your browser
2. Press **F12** (or Cmd+Option+I on Mac)
3. Click **Console** tab
4. Clear existing logs (🚫 icon or Cmd+K)

### Step 2: Attempt Login

1. Click "Login" button
2. Watch Console for `[OIDC] startAuth called`
3. You'll be redirected to Zitadel
4. Log in with: **admin@dev.spec.local** / **AdminPassword123!**
5. After redirect back to localhost, watch Console carefully

### Step 3: Analyze Console Output

Look for the sequence:

```
✅ EXPECTED SUCCESS FLOW:
[AuthCallback] Page loaded, parsing callback params
[AuthCallback] Parsed params { hasCode: true, error: undefined }
[AuthCallback] Calling handleCallback with code
[OIDC] exchangeCodeForTokens called { code: "xxx...", issuer: "..." }
[OIDC] Code verifier retrieved from sessionStorage { hasVerifier: true }
[OIDC] Token exchange request { tokenEndpoint: "...", clientId: "..." }
[OIDC] Token exchange response { status: 200, ok: true }
[OIDC] Token exchange successful { hasAccessToken: true, hasIdToken: true, expiresIn: 43200 }
[AuthContext] applyTokenResponse called { hasAccessToken: true, hasIdToken: true, expiresIn: 43200 }
[AuthContext] Parsed JWT claims { sub: "...", email: "admin@dev.spec.local", name: "..." }
[AuthContext] State updated, saving to localStorage { key: "spec-server-auth" }
[AuthContext] Successfully saved auth state to localStorage
[AuthCallback] handleCallback succeeded, navigating to /admin
```

```
❌ IF TOKEN EXCHANGE FAILS:
[AuthCallback] Page loaded, parsing callback params
[AuthCallback] Parsed params { hasCode: true, error: undefined }
[AuthCallback] Calling handleCallback with code
[OIDC] exchangeCodeForTokens called { code: "xxx...", issuer: "..." }
[OIDC] Code verifier retrieved from sessionStorage { hasVerifier: true }
[OIDC] Token exchange request { tokenEndpoint: "...", clientId: "..." }
[OIDC] Token exchange response { status: 400, ok: false }  // ← PROBLEM!
[OIDC] Token exchange failed { 
  status: 400, 
  detail: { 
    error: "invalid_scope",  // ← ROOT CAUSE
    error_description: "Scope 'org:read' is not supported by this client" 
  } 
}
[AuthCallback] handleCallback failed { 
  error: Error: login_failed, 
  message: "login_failed" 
}
```

### Step 4: Check localStorage

After the flow completes, check if token was saved:

```javascript
// In Console tab, type:
localStorage.getItem('spec-server-auth')
```

**Expected if successful:**
```json
{
  "accessToken": "eyJ...",
  "idToken": "eyJ...",
  "expiresAt": 1732645678000,
  "user": {
    "sub": "348011770662617091",
    "email": "admin@dev.spec.local",
    "name": "Admin User"
  }
}
```

**If it returns `null`:**
- Token exchange failed
- Check Console for `[OIDC] Token exchange failed` error

### Step 5: Check Server Logs (If Needed)

Only if frontend shows successful token storage but you still get redirected:

```bash
# Follow server logs in real-time
tail -f apps/logs/server/out.log apps/logs/server/error.log
```

Look for:
- `[AuthGuard] Request to: /api/...` - Shows API calls
- `[AuthGuard] Token present, validating...` - Token being checked
- `[AuthGuard] User validated` - Success
- `[AuthGuard] Token validation failed` - Failure (shouldn't happen with SCOPES_DISABLED=1)

## Common Issues and Solutions

### Issue 1: `invalid_scope` Error

**Console shows:**
```
[OIDC] Token exchange failed { 
  status: 400, 
  detail: { 
    error: "invalid_scope",
    error_description: "Scope 'org:read' is not supported" 
  } 
}
```

**Solution:**
Temporarily remove custom scopes from `apps/admin/.env`:

```bash
# Change from:
VITE_ZITADEL_SCOPES='openid profile email org:read project:read documents:read chunks:read chat:use search:read'

# To minimal:
VITE_ZITADEL_SCOPES='openid profile email'
```

Restart admin:
```bash
npm run workspace:restart
```

### Issue 2: Missing `code_verifier`

**Console shows:**
```
[OIDC] Code verifier retrieved from sessionStorage { hasVerifier: false }
```

**Solution:**
- Clear sessionStorage and try again
- Check if you're using Private/Incognito mode (sessionStorage might be blocked)

### Issue 3: Token Saved But Still Redirected

**Console shows successful save, but you get redirected back to login**

**Check:**
1. Is token expired? Check `expiresAt` timestamp
2. Are you hitting API routes before localStorage is read?
3. Check server logs for `[AuthGuard] Token validation failed`

## Report Back

Please provide:

1. **Full Console output** (copy/paste the log sequence)
2. **localStorage value** (output of `localStorage.getItem('spec-server-auth')`)
3. **What you see on screen**:
   - A) Stuck on "Signing you in..." spinner?
   - B) Error alert "We could not complete sign-in"?
   - C) Immediate redirect back to main page?
   - D) Successfully reached /admin?

4. **If error in Console**: Copy the `[OIDC] Token exchange failed` detail object

This will tell us exactly where the OAuth flow is breaking!
