# Coolify Manual Environment Variable Configuration

## Problem

The Coolify API does not allow setting `is_buildtime` and `is_runtime` flags during variable creation. By default, Coolify creates ALL variables with BOTH flags enabled, which causes Docker build failures because:

1. **Too many build args**: Docker receives 29+ build arguments instead of just 4 (VITE_*)
2. **Wrong NODE_ENV**: If NODE_ENV is passed at build time, it prevents devDependencies installation

## Solution

Manually configure each variable in the Coolify UI to set the correct flags.

## Required Configuration

### Runtime-Only Variables (Uncheck "Available at Buildtime")

Go to: https://kucharz.net/application/t4cok0o4cwwoo8o0ccs8ogkg/environment-variables

For each of these variables, **UNCHECK "Available at Buildtime"** and keep "Available at Runtime" **CHECKED**:

- [ ] POSTGRES_HOST
- [ ] POSTGRES_PORT
- [ ] POSTGRES_USER
- [ ] POSTGRES_PASSWORD
- [ ] POSTGRES_DB
- [ ] ZITADEL_DOMAIN
- [ ] ZITADEL_ISSUER
- [ ] ZITADEL_INTROSPECTION_URL
- [ ] ZITADEL_ORG_NAME
- [ ] ZITADEL_ADMIN_USERNAME
- [ ] ZITADEL_ADMIN_PASSWORD
- [ ] ZITADEL_ADMIN_FIRSTNAME
- [ ] ZITADEL_ADMIN_LASTNAME
- [ ] ZITADEL_MASTERKEY
- [ ] ZITADEL_CLIENT_ID
- [ ] ZITADEL_CLIENT_SECRET
- [ ] ZITADEL_MAIN_ORG_ID
- [ ] PORT
- [ ] DB_AUTOINIT
- [ ] GOOGLE_API_KEY
- [ ] EMBEDDING_DIMENSION
- [ ] INTEGRATION_ENCRYPTION_KEY
- [ ] CORS_ORIGIN
- [ ] ORGS_DEMO_SEED
- [ ] CHAT_ENABLE_MCP

**Plus manually add:**
- [ ] NODE_ENV (value: `production`) - Runtime Only!

### Build & Runtime Variables (Keep both checked)

These variables should have **BOTH** "Available at Buildtime" and "Available at Runtime" **CHECKED**:

- [ ] VITE_API_URL
- [ ] VITE_ZITADEL_ISSUER
- [ ] VITE_ZITADEL_CLIENT_ID
- [ ] VITE_APP_ENV

## Why This Matters

### Admin App Dockerfile

The `apps/admin/Dockerfile` explicitly sets `ENV NODE_ENV=development` for the build stage (line 13), so it needs devDependencies to build. If NODE_ENV=production is passed as a build arg, it will be ignored by the explicit ENV, but having too many build args can cause other issues.

The Dockerfile only expects 4 build arguments:
```dockerfile
ARG VITE_API_URL
ARG VITE_ZITADEL_ISSUER
ARG VITE_ZITADEL_CLIENT_ID
ARG VITE_APP_ENV=production
```

Passing 29+ build arguments (all the runtime variables) is unnecessary and can cause build failures.

## Quick Check Script

After manual configuration, verify with:

```bash
COOLIFY_APP_UUID=$(grep ^COOLIFY_APP_UUID .env.staging | cut -d= -f2)
COOLIFY_API_TOKEN=$(grep ^COOLIFY_API_TOKEN .env.staging | cut -d= -f2)

# Should only show VITE_* variables
curl -s "https://kucharz.net/api/v1/applications/${COOLIFY_APP_UUID}/envs" \
  -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" | \
  jq -r '.[] | select(.is_buildtime == true) | .key' | sort | uniq
```

Expected output:
```
VITE_API_URL
VITE_APP_ENV
VITE_ZITADEL_CLIENT_ID
VITE_ZITADEL_ISSUER
```

## Automation Limitation

Unfortunately, the Coolify v1 API does not support:
- Setting `is_buildtime` or `is_runtime` flags during POST creation
- PATCH updates to modify these flags on existing variables
- Bulk updates

This means manual configuration in the UI is the only option until Coolify adds API support for flag management.

## After Configuration

Once all variables are configured correctly:

1. Trigger a new deployment in Coolify
2. The build should succeed because only 4 build args (VITE_*) are passed
3. Runtime variables will be available to the application after deployment

## Related Documentation

- `docs/COOLIFY_DEPLOYMENT.md` - Full deployment guide
- `scripts/update-coolify-env.sh` - Automated variable value updates
- `scripts/cleanup-coolify-env.sh` - Reset all variables
