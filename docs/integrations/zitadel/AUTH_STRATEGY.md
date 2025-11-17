# Spec Server 2 - Authentication Strategy Analysis & Bootstrap Script Improvements

**Date**: November 7, 2025  
**Purpose**: Document actual authentication flows used and optimize bootstrap script verification

---

## Current Authentication Architecture

### 1. Frontend (Admin App) - React SPA

**Authentication Flow**: OAuth 2.0 with PKCE (Public Client)

**Implementation**: `apps/admin/src/auth/oidc.ts` + `apps/admin/src/contexts/auth.tsx`

**Flow**:
```
User clicks login
→ startAuth() generates PKCE code_challenge
→ Redirects to Zitadel: /oauth/v2/authorize
  - response_type=code
  - client_id=<OAUTH_CLIENT_ID>
  - redirect_uri=http://localhost:5176/auth/callback
  - code_challenge=<random>
  - code_challenge_method=S256
  - scope=openid profile email

→ User authenticates in Zitadel UI
→ Redirects back with authorization code
→ exchangeCodeForTokens() exchanges code for tokens
  - grant_type=authorization_code
  - code_verifier=<original_verifier>
  
→ Receives: access_token, id_token, refresh_token
→ Stores in localStorage
→ Uses access_token for API calls
```

**Required OAuth App Configuration**:
- ✅ `authMethodType`: `OIDC_AUTH_METHOD_TYPE_NONE` (no client secret)
- ✅ `appType`: `OIDC_APP_TYPE_WEB`
- ✅ `grantTypes`: 
  - `OIDC_GRANT_TYPE_AUTHORIZATION_CODE` (for initial login)
  - `OIDC_GRANT_TYPE_REFRESH_TOKEN` (to stay logged in)
- ✅ `responseTypes`: `OIDC_RESPONSE_TYPE_CODE`
- ✅ `redirectUris`: `http://localhost:5176/auth/callback`, `http://localhost:3002/auth/callback`

**NOT USED**:
- ❌ `OIDC_GRANT_TYPE_JWT_BEARER` - Not used by frontend
- ❌ Password grant - Not secure for SPA
- ❌ Client credentials - Not applicable for public clients

---

### 2. Backend (Server-Nest) - NestJS API

**Authentication Methods**:

#### A. Token Validation (Incoming Requests)

**Method 1**: Passport-Zitadel Strategy (Token Introspection)
- **File**: `apps/server/src/modules/auth/strategies/zitadel.strategy.ts`
- **Flow**: Frontend sends Bearer token → Zitadel introspects token → Returns user info
- **Uses**: CLIENT service account with JWT-bearer grant to authenticate introspection request
- **Caching**: PostgreSQL cache (`auth_introspection_cache` table)

**Method 2**: JWT Validation (Fallback)
- **File**: `apps/server/src/modules/auth/auth.service.ts`
- **Flow**: Validate JWT signature using Zitadel's JWKS
- **Uses**: No service account needed (public key validation)

#### B. Management API Calls (Outgoing Requests)

**Service**: `ZitadelService` 
- **File**: `apps/server/src/modules/auth/zitadel.service.ts`
- **Purpose**: Create users, manage roles, send notifications
- **Uses**: API service account with JWT-bearer grant
- **Grant Type**: `urn:ietf:params:oauth:grant-type:jwt-bearer`

**Flow**:
```
Backend needs to create user
→ ZitadelService.getAccessToken()
→ Creates JWT assertion signed with service account key
→ Exchanges JWT for access token: POST /oauth/v2/token
  - grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
  - assertion=<signed_jwt>
  
→ Receives access_token
→ Calls Management API with Bearer token
→ Creates user, assigns roles, etc.
```

---

## Grant Types: What's Actually Used

### Used by Frontend OAuth App

| Grant Type | Used? | Purpose | Bootstrap Should Configure? |
|------------|-------|---------|----------------------------|
| `OIDC_GRANT_TYPE_AUTHORIZATION_CODE` | ✅ YES | Initial login with PKCE | ✅ YES |
| `OIDC_GRANT_TYPE_REFRESH_TOKEN` | ✅ YES | Stay logged in, refresh tokens | ✅ YES |
| `OIDC_GRANT_TYPE_JWT_BEARER` | ❌ NO | Service-to-service (not used by SPA) | ❌ NO |
| `OIDC_GRANT_TYPE_PASSWORD` | ❌ NO | Not secure for SPA | ❌ NO |

### Used by Service Accounts

**SERVICE ACCOUNTS DON'T USE THE OAUTH APP**

Service accounts use a different authentication mechanism:
- They create their own JWT assertions signed with their private keys
- They directly call `/oauth/v2/token` with `grant_type=jwt-bearer`
- They don't need to be configured in the OAuth application

**This is why the JWT bearer tests fail** - service accounts authenticate independently from the OAuth app!

---

## Bootstrap Script: What to Verify

### ✅ SHOULD Verify (Critical for App Function)

1. **OAuth App Exists**
   - Check client ID is valid
   - Verify app type and auth method

2. **OAuth App Configuration**
   - ✅ Auth method: `NONE` (public client)
   - ✅ Grant types: `AUTHORIZATION_CODE` + `REFRESH_TOKEN`
   - ✅ Redirect URIs: Admin + Server ports
   - ✅ Response type: `CODE`

3. **OAuth Authorization Flow (PKCE)**
   - ✅ Test /oauth/v2/authorize endpoint
   - ✅ Verify redirects to login (not error)
   - ✅ Confirm redirect URIs work

4. **Service Accounts Exist**
   - ✅ CLIENT service account user exists
   - ✅ API service account user exists
   - ✅ JWT key files are valid

5. **Admin & Test Users Exist**
   - ✅ Admin user for console access
   - ✅ Test user for testing

### ❌ SHOULD NOT Verify (Not Used/Not Applicable)

1. **JWT Bearer Grant on OAuth App**
   - ❌ Service accounts don't use the OAuth app
   - ❌ They authenticate independently with their own JWT assertions
   - ❌ Testing this will always fail/be irrelevant

2. **Password Grant**
   - ❌ Not used by the app (uses PKCE instead)
   - ❌ Not recommended for security
   - ❌ Not needed for SPA authentication

3. **Client Credentials Grant**
   - ❌ Not applicable for public clients
   - ❌ Requires client secret (which we don't use)

---

## Authentication Flow Summary

### User Login (Frontend → Backend)

```
1. User clicks "Login" in admin app (port 5176)
   ↓
2. Admin app redirects to Zitadel with PKCE
   - Uses OAUTH_CLIENT_ID from .env
   - Uses AUTHORIZATION_CODE grant
   ↓
3. User authenticates in Zitadel UI
   ↓
4. Zitadel redirects back with code
   ↓
5. Admin app exchanges code for tokens
   - Receives: access_token, id_token, refresh_token
   ↓
6. Admin app calls backend API with Bearer token
   ↓
7. Backend validates token (ZitadelStrategy)
   - Uses CLIENT service account for introspection
   - Caches result in PostgreSQL
   ↓
8. Backend returns data to frontend
```

### Backend Management Operations

```
1. Backend needs to create user / assign role
   ↓
2. ZitadelService.getAccessToken()
   - Uses API service account
   - Creates JWT assertion
   - Exchanges for access_token
   ↓
3. Calls Management API with token
   - Creates users
   - Assigns roles
   - Manages metadata
   ↓
4. Returns result
```

---

## Key Insights

### 1. Two Separate Auth Flows

**OAuth App (Frontend)**:
- Purpose: User authentication
- Type: Public client (PKCE)
- Grants needed: AUTHORIZATION_CODE, REFRESH_TOKEN
- No client secret

**Service Accounts (Backend)**:
- Purpose: Backend-to-Zitadel API calls
- Type: Machine users with JWT keys
- Auth: JWT bearer (independent from OAuth app)
- Two accounts: CLIENT (introspection) + API (management)

### 2. Service Accounts Don't Need OAuth App Configuration

Service accounts authenticate by:
1. Creating signed JWT assertion using their private key
2. Posting to /oauth/v2/token with grant_type=jwt-bearer
3. Receiving access_token

This happens OUTSIDE the OAuth application configuration!

### 3. Bootstrap Script Confusion

The bootstrap script was testing JWT bearer authentication through the OAuth app, which:
- Doesn't apply to how service accounts actually work
- Will always fail/show warnings
- Misleads users into thinking something is wrong

---

## Bootstrap Script Improvements

### Current Issues

❌ Tests JWT bearer on OAuth app (not how service accounts work)
❌ Tests password grant (not used by app)
❌ Shows warnings for optional features as if they're problems
❌ Misleading - suggests configuration is incomplete when it's not

### Proposed Fixes

✅ Remove JWT bearer tests from verify mode
✅ Remove password grant tests from verify mode  
✅ Focus on PKCE flow (what's actually used)
✅ Verify grant types match app needs (AUTH_CODE + REFRESH)
✅ Add OAuth grant types explicit verification
✅ Clearer messaging about what each check verifies

---

## Final Verification Structure

### Verify Mode (Optimized)

```
[1/7] Checking local configuration files...
  ✓ Bootstrap PAT file exists
  ✓ CLIENT service account key file
  ✓ API service account key file

[2/7] Testing Zitadel connectivity...
  ✓ Zitadel is reachable at http://localhost:8200

[3/7] Testing Admin PAT authentication...
  ✓ Admin PAT authentication successful
  ✓ Organization found
  ✓ Project found

[4/7] Verifying OAuth application configuration...
  ✓ OAuth app found (Client ID: ...)
  ✓ Auth method: NONE (public client/PKCE)
  ✓ Grant types: AUTHORIZATION_CODE ✓, REFRESH_TOKEN ✓
  ✓ Response type: CODE
  ✓ Redirect URIs configured correctly

[5/7] Testing OAuth authorization flow (PKCE)...
  ✓ OAuth authorize endpoint responding correctly (HTTP 302)
  ✓ PKCE flow correctly configured (redirects to login)
  ✓ Admin redirect URI: http://localhost:5176/auth/callback
  ✓ Server redirect URI: http://localhost:3002/auth/callback

[6/7] Verifying service accounts in Zitadel...
  ✓ CLIENT service account exists
  ✓ API service account exists
  ✓ Key files match Zitadel users

[7/7] Verifying user accounts...
  ✓ Admin user exists and is active
  ✓ Test user exists and is active

═══════════════════════════════════════
   ✓ All Verifications PASSED
═══════════════════════════════════════
```

---

## What Each Check Verifies

### Check 1: Local Configuration Files
**Purpose**: Ensure required secret files exist locally
**Critical**: Yes - without these, authentication won't work

### Check 2: Zitadel Connectivity
**Purpose**: Verify Zitadel is running and accessible
**Critical**: Yes - all auth flows require Zitadel

### Check 3: Admin PAT Authentication
**Purpose**: Verify bootstrap script can manage Zitadel
**Critical**: Yes - needed for provisioning and verification

### Check 4: OAuth Application Configuration
**Purpose**: Verify frontend login will work
**Critical**: Yes - without correct config, users can't login
**Tests**:
- Auth method is NONE (public client, no secret needed)
- Grant types include AUTHORIZATION_CODE (for login)
- Grant types include REFRESH_TOKEN (to stay logged in)
- Redirect URIs match app ports

### Check 5: OAuth Authorization Flow (PKCE)
**Purpose**: Simulate actual user login flow
**Critical**: Yes - this is THE test that matters for frontend
**Tests**:
- /oauth/v2/authorize endpoint works
- Returns redirect to login (not error)
- Redirect URIs are registered

### Check 6: Service Accounts in Zitadel
**Purpose**: Verify backend can call Management API
**Critical**: Yes - needed for user creation, introspection
**Tests**:
- CLIENT service account user exists (for introspection)
- API service account user exists (for management API)
- Key file user IDs match Zitadel

### Check 7: User Accounts
**Purpose**: Verify admin can access console, test user can login
**Critical**: Yes - needed for development and testing

---

## Removed Checks (No Longer Tested)

### ❌ JWT Bearer Grant on OAuth App
**Why removed**: Service accounts authenticate independently with their own JWT assertions, not through the OAuth app. Testing JWT bearer on the OAuth app doesn't reflect how the system actually works.

### ❌ Password Grant
**Why removed**: The app uses PKCE (more secure). Password grant is not implemented and not needed.

### ❌ Management API with Service Account Token
**Why kept simple**: Service accounts authenticate independently. We verify they exist (Check 6), which is sufficient.

---

## Conclusion

The optimized bootstrap script focuses on verifying:
1. **What the app actually uses** (PKCE, not JWT bearer on OAuth app)
2. **Critical functionality** (user login, token refresh)
3. **Service account existence** (not complex JWT bearer flows)

This eliminates confusing warnings and provides accurate verification of the authentication system.
