# Authentication Scopes Fix - Missing Permissions

## 🔍 Problem Diagnosis

### Issue

The `/api/orgs` endpoint (and likely all other protected endpoints) are returning:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Invalid or expired access token"
  }
}
```

### Root Cause

The frontend OIDC configuration is only requesting basic OpenID Connect scopes:

```typescript
scopes: 'openid profile email';
```

**These scopes do NOT include any application permissions!** The backend's `ScopesGuard` requires specific scopes like `org:read`, `project:read`, etc., but your tokens don't have them.

### Token Analysis

Your current ID token contains:

- ✅ Valid signature (RSA256)
- ✅ Not expired (12 hours remaining)
- ✅ Correct issuer: `https://spec-zitadel.kucharz.net`
- ❌ **NO scope claim** - This is the problem!

## ✅ The Fix

### Step 1: Configure Zitadel Application Scopes

In your Zitadel admin console (https://spec-zitadel.kucharz.net):

1. Go to **Projects** → Your Application
2. Click on your application (Client ID: `344995930577111044`)
3. Go to **Token Settings** or **Scopes** section
4. Enable/Add the following custom scopes:

```
org:read
org:project:create
org:project:delete
org:invite:create
project:read
project:invite:create
documents:read
documents:write
documents:delete
ingest:write
search:read
chunks:read
chat:use
chat:admin
graph:search:read
graph:search:debug
notifications:read
notifications:write
extraction:read
extraction:write
schema:read
data:read
data:write
mcp:admin
```

**Note**: In Zitadel, you may need to:

- Define these as **Project Roles** first
- Then grant them to users
- Or configure them as **Additional Scopes** in the application settings

### Step 2: Update Frontend Environment Variable

Set the `VITE_ZITADEL_SCOPES` environment variable in your production deployment to include all required scopes:

```bash
VITE_ZITADEL_SCOPES="openid profile email org:read org:project:create org:project:delete project:read documents:read documents:write documents:delete ingest:write search:read chunks:read chat:use graph:search:read notifications:read notifications:write extraction:read extraction:write schema:read data:read data:write"
```

**For Docker deployment**, add this to your environment variables.

**For local .env file** (`apps/admin/.env.local`):

```env
VITE_ZITADEL_SCOPES=openid profile email org:read org:project:create org:project:delete project:read documents:read documents:write documents:delete ingest:write search:read chunks:read chat:use graph:search:read notifications:read notifications:write extraction:read extraction:write schema:read data:read data:write
```

### Step 3: Redeploy Frontend

After updating the environment variable:

```bash
# Rebuild admin with new scopes
npm --prefix apps/admin run build

# Or in Docker, trigger a new deployment
```

### Step 4: Force Re-authentication

Users need to log out and log back in to get new tokens with the updated scopes:

1. Clear browser localStorage: `localStorage.removeItem('__nexus_auth_v1__')`
2. Navigate to `/auth/login`
3. Complete login flow
4. New tokens will include all requested scopes

## 🧪 Verification

### Check Token Scopes After Login

Create a test script to decode your new token:

```bash
# Save this as test-my-token-scopes.mjs
import { Buffer } from 'buffer';

const idToken = process.argv[2];
if (!idToken) {
  console.error('Usage: node test-my-token-scopes.mjs <id_token>');
  process.exit(1);
}

const [, payload] = idToken.split('.');
const json = Buffer.from(payload, 'base64url').toString('utf8');
const claims = JSON.parse(json);

console.log('Token Claims:');
console.log(JSON.stringify(claims, null, 2));

if (claims.scope) {
  console.log('\n✅ Scopes found:', claims.scope);
} else {
  console.log('\n❌ NO SCOPES in token!');
}
```

Run it:

```bash
node test-my-token-scopes.mjs "YOUR_NEW_ID_TOKEN"
```

### Test API Access

After getting new tokens with scopes:

```bash
# Test with new token
curl -X GET https://spec-server.kucharz.net/api/orgs \
  -H "Authorization: Bearer YOUR_NEW_ID_TOKEN" \
  -H "Content-Type: application/json"

# Expected: Should return org list, not unauthorized error
```

## 📋 Scope → Permission Mapping

| Scope                | Permission           | Used By                     |
| -------------------- | -------------------- | --------------------------- |
| `org:read`           | View organizations   | /api/orgs (GET)             |
| `org:project:create` | Create projects      | /api/projects (POST)        |
| `org:project:delete` | Delete projects      | /api/projects/:id (DELETE)  |
| `project:read`       | View projects        | /api/projects (GET)         |
| `documents:read`     | View documents       | /api/documents (GET)        |
| `documents:write`    | Create/edit docs     | /api/documents (POST/PATCH) |
| `documents:delete`   | Delete docs          | /api/documents/:id (DELETE) |
| `ingest:write`       | Trigger ingestion    | /api/ingest (POST)          |
| `search:read`        | Search documents     | /api/search (POST)          |
| `chunks:read`        | View document chunks | /api/chunks (GET)           |
| `chat:use`           | Use chat interface   | /api/chat (POST)            |
| `chat:admin`         | Manage conversations | /api/chat/:id (DELETE)      |
| `extraction:read`    | View extraction jobs | /api/extraction-jobs (GET)  |
| `extraction:write`   | Start extractions    | /api/extraction-jobs (POST) |
| `schema:read`        | View graph schema    | /api/type-registry (GET)    |
| `data:read`          | Query graph data     | MCP server queries          |
| `data:write`         | Modify graph data    | MCP server mutations        |

## 🔐 Security Notes

### Scope Minimalism

In production, you may want to grant users only the scopes they actually need rather than all scopes. Consider:

- **Admin users**: All scopes
- **Regular users**: `org:read`, `project:read`, `documents:read`, `documents:write`, `search:read`, `chat:use`
- **Read-only users**: `org:read`, `project:read`, `documents:read`, `search:read`

### Zitadel Authorization Configuration

You can configure scope grants per user/role in Zitadel:

1. Define **Project Roles** with associated scopes
2. Assign roles to users
3. Tokens will automatically include scopes based on user's roles

## 📚 Related Files

- Frontend scope config: `apps/admin/src/contexts/auth.tsx` (line 31)
- Backend scope definitions: `apps/server/src/modules/auth/auth.service.ts` (lines 20-48)
- Scope guard implementation: `apps/server/src/modules/auth/scopes.guard.ts`
- OIDC utilities: `apps/admin/src/auth/oidc.ts`

## 🐛 Troubleshooting

### "Scope not found" error in Zitadel

- You need to define custom scopes in Zitadel project settings first
- Or use Project Roles which automatically create associated scopes

### Token still has no scopes after fix

- Clear browser cache and localStorage
- Check Zitadel audit logs to see if scopes were actually granted
- Verify environment variable is set correctly (restart app after changing .env)

### Some scopes work but others don't

- Check that all scopes are defined in Zitadel
- Verify user has been granted the roles/scopes
- Check backend logs for which specific scope is missing

## 🎯 Next Steps

1. ✅ Add all scopes to Zitadel application
2. ✅ Update `VITE_ZITADEL_SCOPES` environment variable
3. ✅ Rebuild and redeploy frontend
4. ✅ Log out and log back in to get new tokens
5. ✅ Verify tokens include scopes
6. ✅ Test API endpoints work correctly

---

**Created**: 2025-11-03  
**Issue**: Missing application scopes in OIDC tokens  
**Impact**: All protected endpoints return 401 unauthorized  
**Resolution**: Configure comprehensive scope list in Zitadel + frontend env
