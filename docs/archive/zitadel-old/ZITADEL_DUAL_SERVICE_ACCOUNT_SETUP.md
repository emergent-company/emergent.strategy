# Zitadel Dual Service Account Setup Guide

## Overview

This guide walks through setting up the recommended dual service account architecture for Zitadel integration, which separates token introspection from Management API operations for improved security and performance.

## Architecture

### Dual Service Account Pattern

**CLIENT JWT Service Account:**
- **Purpose:** Token introspection only
- **Permissions:** Minimal (just introspection scope)
- **Usage:** High-frequency (every authenticated request)
- **Security:** Reduced blast radius if compromised

**API JWT Service Account:**
- **Purpose:** Management API operations (user creation, metadata updates)
- **Permissions:** Elevated (user management, project access)
- **Usage:** Low-frequency (administrative operations)
- **Security:** Isolated from high-traffic introspection

### Why This Matters

**Current Problem (Single Account):**
- Same credentials used for both introspection and Management API
- High-frequency introspection increases exposure
- Token caching conflicts between different operations
- Introspection 500 errors due to permission conflicts

**Solution (Dual Accounts):**
- Separate credentials with minimal permissions each
- Independent token caching for better performance
- Clear separation of concerns
- Reduced security risk

## Prerequisites

Before starting, gather the following information from your Zitadel instance:

1. **Admin Access Token**: Personal access token with admin privileges
   - Get from: Zitadel Console → Your Profile → Personal Access Tokens
   - Needs permission to create users and grant project access

2. **Domain**: Your Zitadel instance domain
   - Example: `my-instance.zitadel.cloud`

3. **Organization ID**: Your organization ID
   - Get from: Zitadel Console → Organization Settings → (copy ID from URL or settings)

4. **Project ID**: Your application project ID
   - Get from: Zitadel Console → Projects → Your Project → (copy ID from URL)

## Step 1: Run the Provisioning Script

The provisioning script automates creation of both service accounts:

```bash
cd /Users/mcj/code/spec-server-2

# Set required environment variables
export ZITADEL_DOMAIN="your-instance.zitadel.cloud"
export ZITADEL_ADMIN_TOKEN="your-admin-pat-token"
export ZITADEL_PROJECT_ID="123456789012345678"
export ZITADEL_ORG_ID="123456789012345678"

# Run the provisioning script
# This creates two JSON key files in the secrets/ directory
./scripts/setup-zitadel-service-accounts.sh secrets/
```

### What the Script Does

1. **Creates CLIENT service account** (`introspection-service`):
   - Machine user in your organization
   - Generates JWT key with 2026 expiration
   - Grants project introspection permission
   - Saves to `secrets/zitadel-client-service-account.json`

2. **Creates API service account** (`management-api-service`):
   - Machine user in your organization
   - Generates JWT key with 2026 expiration
   - Grants project management permissions
   - Saves to `secrets/zitadel-api-service-account.json`

3. **Provides instructions** for next steps

### Expected Output

```
✅ CLIENT Service Account Setup Complete!

Account Details:
  User ID: 987654321098765432
  Client ID: 987654321098765432@project-name
  Key ID: 123456789012345678
  Key saved to: secrets/zitadel-client-service-account.json

✅ API Service Account Setup Complete!

Account Details:
  User ID: 876543210987654321
  Client ID: 876543210987654321@project-name
  Key ID: 234567890123456789
  Key saved to: secrets/zitadel-api-service-account.json
```

## Step 2: Configure Environment Variables

You have two options for providing the service account keys:

### Option A: File-Based (Recommended for Production)

**For Coolify/Docker deployments:**

1. **Upload the JSON files to your server:**
   ```bash
   # Copy to your server's secrets directory
   scp secrets/zitadel-client-service-account.json user@server:/app/secrets/
   scp secrets/zitadel-api-service-account.json user@server:/app/secrets/
   ```

2. **Set environment variables to file paths:**
   ```env
   # In Coolify or .env file
   ZITADEL_DOMAIN=your-instance.zitadel.cloud
   ZITADEL_CLIENT_JWT_PATH=/app/secrets/zitadel-client-service-account.json
   ZITADEL_API_JWT_PATH=/app/secrets/zitadel-api-service-account.json
   ZITADEL_ORG_ID=123456789012345678
   ZITADEL_PROJECT_ID=123456789012345678
   ```

3. **Mount the secrets directory in docker-compose.yml** (already configured):
   ```yaml
   services:
     server:
       volumes:
         - ./secrets:/app/secrets:ro
   ```

### Option B: Inline JSON (For Testing/Development)

**For local development:**

1. **Set the JSON content directly as environment variables:**
   ```bash
   # Read the JSON files
   export ZITADEL_DOMAIN="your-instance.zitadel.cloud"
   export ZITADEL_CLIENT_JWT=$(cat secrets/zitadel-client-service-account.json)
   export ZITADEL_API_JWT=$(cat secrets/zitadel-api-service-account.json)
   export ZITADEL_ORG_ID="123456789012345678"
   export ZITADEL_PROJECT_ID="123456789012345678"
   ```

⚠️ **Note:** Coolify double-escapes JSON in environment variables. The code automatically handles this.

## Step 3: Verify Configuration

### Start the Server

```bash
# For local development
cd /Users/mcj/code/spec-server-2
docker-compose up --build

# For production (Coolify)
# Just push changes - Coolify will rebuild and redeploy
git add docker-compose.yml
git commit -m "Configure dual service account architecture"
git push
```

### Check Logs for Success

Look for these log messages on server startup:

```
[Nest] INFO [ZitadelService] ✅ CLIENT service account loaded (keyId: 123456789012345678)
[Nest] INFO [ZitadelService] ✅ API service account loaded (keyId: 234567890123456789)
[Nest] INFO [ZitadelService] ✅ Dual service account mode active
```

### Test Introspection

```bash
# Get a valid user token from your frontend
TOKEN="your-user-access-token"

# Test introspection endpoint
curl -X POST http://localhost:3002/auth/introspect \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Should return user info without 500 errors
```

### Test Management API

```bash
# Test user creation (requires valid auth token)
curl -X POST http://localhost:3002/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User"
  }'

# Should create user successfully
```

## Legacy Mode Fallback

If you don't set `ZITADEL_CLIENT_JWT` or `ZITADEL_API_JWT`, the system falls back to legacy single-account mode:

```
[Nest] WARN [ZitadelService] ⚠️  API service account not configured, using CLIENT account for Management API (not recommended)
```

This maintains backward compatibility but doesn't provide the security benefits of dual accounts.

## Troubleshooting

### "Failed to parse CLIENT Zitadel key"

**Cause:** JSON format issue or Coolify double-escaping

**Solution:**
- Verify JSON file is valid: `jq . secrets/zitadel-client-service-account.json`
- If using inline env vars on Coolify, the code handles escaping automatically
- Check logs for "trying to unescape" message (indicates auto-fix is working)

### "Invalid CLIENT key format: missing keyId or key"

**Cause:** JSON file is incomplete or corrupted

**Solution:**
- Re-run provisioning script
- Verify file contents have all required fields:
  ```json
  {
    "type": "serviceaccount",
    "keyId": "...",
    "key": "-----BEGIN RSA PRIVATE KEY-----\n...",
    "userId": "...",
    "clientId": "..."
  }
  ```

### "CLIENT service account key not configured"

**Cause:** Environment variables not set correctly

**Solution:**
- Verify `ZITADEL_CLIENT_JWT` or `ZITADEL_CLIENT_JWT_PATH` is set
- Check environment variable substitution in docker-compose.yml
- Restart server after updating environment

### Introspection still returns 500 errors

**Cause:** CLIENT service account doesn't have introspection permission

**Solution:**
- Verify in Zitadel Console:
  - Go to Projects → Your Project → Authorizations
  - Check `introspection-service` user has project grant
- Re-run provisioning script if grant is missing

### User creation fails with 403 Forbidden

**Cause:** API service account doesn't have management permissions

**Solution:**
- Verify in Zitadel Console:
  - Go to Projects → Your Project → Authorizations
  - Check `management-api-service` user has project grant with management permissions
- Re-run provisioning script if grant is missing

## Security Best Practices

1. **File Permissions:**
   ```bash
   chmod 600 secrets/*.json
   chmod 700 secrets/
   ```

2. **Never Commit Secrets:**
   ```bash
   # Verify secrets/ is in .gitignore
   grep -q "^secrets/" .gitignore || echo "secrets/" >> .gitignore
   ```

3. **Rotate Keys Regularly:**
   - Set calendar reminder before key expiration (check JSON `"expirationDate"`)
   - Re-run provisioning script to generate new keys
   - Update environment variables
   - Restart server

4. **Monitor Usage:**
   - Check logs for unusual activity
   - Set up alerts for authentication failures
   - Review Zitadel audit logs periodically

## Migration from Single Account

If you're currently using the old single-account setup:

1. **Run provisioning script** (creates new dual accounts)
2. **Update environment variables** (adds new CLIENT/API vars)
3. **Restart server** (loads new accounts)
4. **Verify both introspection and Management API work**
5. **Monitor for 24-48 hours**
6. **Remove old single-account variables** (optional cleanup):
   ```env
   # Can remove these after dual accounts working:
   # ZITADEL_ISSUER
   # ZITADEL_INTROSPECTION_URL
   # ZITADEL_CLIENT_ID
   # ZITADEL_CLIENT_SECRET
   ```

The system maintains backward compatibility, so you can keep old variables during migration.

## Reference

- **Provisioning Script:** `scripts/setup-zitadel-service-accounts.sh`
- **Service Implementation:** `apps/server-nest/src/modules/auth/zitadel.service.ts`
- **Configuration Types:** `apps/server-nest/src/modules/auth/auth.config.ts`
- **Docker Compose:** `docker-compose.yml`

## Support

If you encounter issues not covered here:

1. Check server logs: `docker-compose logs -f server`
2. Check Zitadel logs: `docker-compose logs -f zitadel`
3. Review Zitadel Console audit logs
4. Verify service account permissions in Zitadel Console

## Key Expiration Warning

⚠️ **IMPORTANT:** Service account keys expire on 2026-01-01 (as configured in provisioning script).

Before expiration:
1. Re-run provisioning script to generate new keys
2. Update environment variables with new key paths/content
3. Restart server to load new keys

Set a calendar reminder for **2025-12-15** to rotate keys before expiration.
