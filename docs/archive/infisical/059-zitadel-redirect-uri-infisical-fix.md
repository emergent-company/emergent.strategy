# Fix: Zitadel Redirect URI Configuration from Infisical

**Date:** 2025-11-23
**Status:** In Progress
**Priority:** High

## Problem

Zitadel OAuth redirect URI is misconfigured, causing authentication errors:
```json
{
  "error": "invalid_request",
  "error_description": "The requested redirect_uri is missing in the client configuration."
}
```

### Root Cause

The bootstrap script now loads configuration from Infisical (`env: local`), but the Zitadel configuration in Infisical is set for production domains instead of local development:

- **ZITADEL_DOMAIN**: `zitadel.dev.emergent-company.ai` (production)
- **VITE_ZITADEL_ISSUER**: `https://zitadel.dev.emergent-company.ai` (production)
- **Derived URLs**:
  - Admin redirect: `https://admin.localhost/auth/callback` (wrong!)
  - Server redirect: `https://api.localhost/auth/callback` (wrong!)

**Should be** (for local development):
- ZITADEL_DOMAIN: `localhost:8200`
- VITE_ZITADEL_ISSUER: `http://localhost:8200`
- Admin redirect: `http://localhost:5176/auth/callback` ✓
- Server redirect: `http://localhost:3002/auth/callback` ✓

## Solution

### 1. Update Infisical Secrets for Local Environment

Update the following secrets in Infisical (`env: local`, `path: /docker`):

```bash
# Infisical local environment - Docker secrets
ZITADEL_DOMAIN=localhost:8200
ZITADEL_EXTERNALDOMAIN=localhost
VITE_ZITADEL_ISSUER=http://localhost:8200
ZITADEL_EXTERNALSECURE=false
ZITADEL_EXTERNALPORT=8200
ZITADEL_TLS_ENABLED=false
```

### 2. Bootstrap Script Changes (Already Implemented)

✅ Updated `scripts/bootstrap-zitadel-fully-automated.sh` to:
- Load all configuration from Infisical instead of `.env`
- Derive redirect URIs from `ADMIN_PORT` and `SERVER_PORT`
- Use `VITE_ZITADEL_ISSUER` as the authoritative Zitadel URL
- Build proper local URLs: `http://localhost:{PORT}/auth/callback`

### 3. Re-run Bootstrap

After updating Infisical:
```bash
./scripts/bootstrap-zitadel-fully-automated.sh provision
```

This will:
1. Load correct local configuration from Infisical
2. Update OAuth app redirect URIs to use `localhost` ports
3. Recreate service accounts and users if needed

## Verification

After fix:
1. Check configuration:
   ```bash
   ./scripts/bootstrap-zitadel-fully-automated.sh status
   ```

2. Verify redirect URIs in output show localhost:
   ```
   Admin Redirect URI: http://localhost:5176/auth/callback
   Server Redirect URI: http://localhost:3002/auth/callback
   ```

3. Test authentication in admin app

## Files Modified

- `scripts/bootstrap-zitadel-fully-automated.sh`:
  - Lines 55-73: Load from Infisical instead of `.env`
  - Lines 125-145: Derive URLs from Infisical variables
  - Lines 28-45: Updated help documentation

## Next Steps

1. **Manual**: Update Infisical secrets (see Solution #1 above)
2. **Automated**: Re-run bootstrap script
3. **Verify**: Test OAuth login flow
4. **Document**: Update deployment docs with Infisical requirements

## Environment-Specific Configuration

### Local Development (`env: local`)
- ZITADEL_DOMAIN: `localhost:8200`
- VITE_ZITADEL_ISSUER: `http://localhost:8200`
- ADMIN_PORT: `5176`
- SERVER_PORT: `3002`

### Production (`env: production`)
- ZITADEL_DOMAIN: `zitadel.dev.emergent-company.ai`
- VITE_ZITADEL_ISSUER: `https://zitadel.dev.emergent-company.ai`
- ADMIN_APP_URL: `https://admin.emergent-company.ai`
- SERVER_APP_URL: `https://api.emergent-company.ai`

## Related Issues

- Infisical migration (2025-11-23)
- Zitadel bootstrap automation
- OAuth/OIDC redirect URI configuration
