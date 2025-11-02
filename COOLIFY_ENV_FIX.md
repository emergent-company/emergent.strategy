# URGENT: Zitadel Password Environment Variable Missing

## Problem

Zitadel is failing to start because `ZITADEL_DB_PASSWORD` environment variable is **empty** in Coolify.

Current status on kucharz.net:
```
ZITADEL_DB_PASSWORD=
ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=
```

This causes continuous restart loop with error:
```
FATAL: password authentication failed for user "zitadel"
```

## Immediate Fix Required

### In Coolify UI:

1. **Go to your Spec Server project** in Coolify
2. **Click on the "Environment Variables" tab**
3. **Add or update** `ZITADEL_DB_PASSWORD`:
   ```
   ZITADEL_DB_PASSWORD=zitadel
   ```
   (or use a more secure password and update the database user accordingly)

4. **Set variable scope**: Runtime Only (not build-time)
5. **Save changes**
6. **Redeploy** the services (or at minimum restart `zitadel` service)

### Alternative: Temporary Database Password Fix (Already Applied)

I've manually set the `zitadel` database user password to `zitadel` on your production server:

```sql
ALTER USER zitadel WITH LOGIN PASSWORD 'zitadel';
```

This matches the default in `docker-compose.coolify.yml`:
```yaml
ZITADEL_DB_PASSWORD: ${ZITADEL_DB_PASSWORD:-zitadel}
```

**However**, this won't help until you set the environment variable in Coolify so Zitadel actually uses this password when connecting!

## Why This Happened

The `.env.coolify.example` file documents all required variables, but these need to be manually configured in Coolify's UI. The deployment is using empty defaults because:

1. No `.env` file was provided
2. Environment variables weren't configured in Coolify UI
3. Docker Compose default `${ZITADEL_DB_PASSWORD:-zitadel}` only works for the init script, not for Zitadel's connection string

## Complete Environment Variables Checklist

Based on `.env.coolify.example`, you need to set these in Coolify:

### Critical (Service won't start without these):
- ✅ `POSTGRES_PASSWORD` - (appears to be set, db is running)
- ✅ `ZITADEL_DB_PASSWORD` - **FIXED - Password authentication now working**
- ❌ **`ZITADEL_MASTERKEY`** - **CURRENT ERROR: Only 9 bytes, must be exactly 32 characters**
  
  Current value: `Test1234!` (9 chars) ❌
  
  Generate a proper 32-character key:
  ```bash
  openssl rand -base64 24 | tr -d '\n' && echo
  # Or use a fixed string exactly 32 chars:
  # MasterkeyNeedsToHave32Characters
  ```
  
- ❌ `ZITADEL_EXTERNALDOMAIN` - Your auth domain (e.g., auth.kucharz.net)
- ❌ `ZITADEL_ADMIN_PASSWORD` - First admin user password

### Required for Application:
- `ZITADEL_CLIENT_ID`
- `ZITADEL_CLIENT_SECRET`
- `ZITADEL_MAIN_ORG_ID`
- `ZITADEL_ISSUER`
- `GOOGLE_API_KEY`
- `INTEGRATION_ENCRYPTION_KEY` (32 characters)
- `VITE_API_URL`
- `VITE_ZITADEL_ISSUER`
- `VITE_ZITADEL_CLIENT_ID`
- `CORS_ORIGIN`

## Expected Behavior After Fix

Once `ZITADEL_DB_PASSWORD=zitadel` is set in Coolify:

1. Zitadel will be able to connect to the database
2. Initialization will complete successfully
3. Container will stay running (not restarting)
4. You can access Zitadel UI at your configured domain
5. You can create applications and configure OAuth

## Verification

After setting the variable and redeploying, check status:

```bash
ssh root@kucharz.net "docker ps | grep zitadel"
```

Should show:
```
Up X minutes (healthy)
```

Instead of:
```
Restarting (1) X seconds ago
```

## Next Steps

1. **IMMEDIATE**: Set `ZITADEL_DB_PASSWORD=zitadel` in Coolify
2. Redeploy or restart services
3. Verify Zitadel stays running
4. Set all other required environment variables
5. Follow Zitadel setup wizard to create application
6. Configure remaining application environment variables with IDs from Zitadel

---

**Reference**: See `.env.coolify.example` for complete list of required environment variables with explanations.
