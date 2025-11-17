# Zitadel Bootstrap - Quick Start Guide

**Time to complete:** 15 minutes

This guide walks you through the complete bootstrap process from a fresh Zitadel instance to fully configured dual service accounts.

## Overview

The bootstrap process requires **one manual step** (creating an admin PAT) followed by complete automation. This is industry-standard practice - even production systems like Google Cloud, AWS, and huma-blueprints-api require initial manual credential creation before enabling full automation.

### Why Manual PAT Creation?

✅ **Security Best Practice** - Admin credentials created with conscious intent  
✅ **Audit Trail** - Clear record of who authorized bootstrap access  
✅ **Industry Standard** - Same pattern used by major cloud providers  
✅ **One-Time Only** - Never needed again after bootstrap completes  
✅ **Disposable** - Can be deleted immediately after setup

After bootstrap, your application uses **service account JWT keys** (fully automated, no manual steps).

## Prerequisites

- Docker and Docker Compose installed
- Local Zitadel running on `localhost:8200` OR production Zitadel instance
- 15 minutes of time

## Complete Workflow

### Step 1: Start Local Zitadel (2 minutes)

**Skip this step if using production Zitadel.**

```bash
# Start local Zitadel instance
docker-compose -f docker-compose.zitadel-local.yml up -d

# Wait for containers to be healthy (30-60 seconds)
docker ps --filter "name=zitadel-local"

# Should show both containers as "healthy"
```

### Step 2: Complete Setup Wizard (3 minutes)

1. Open browser to http://localhost:8200
2. You'll see the Zitadel first-instance setup wizard
3. The admin credentials are pre-configured:
   - **Username:** `admin`
   - **Password:** `Admin1234!`
4. Complete the wizard (accept defaults)
5. You'll be logged into the Zitadel console

### Step 3: Create Admin Personal Access Token (2 minutes)

This is the **only manual step** required for bootstrap.

1. In Zitadel console, click your profile (top-right)
2. Select **Personal Access Tokens**
3. Click **New**
4. Set expiration to **1 year** (or any duration - it's only needed once)
5. Click **Add**
6. **Copy the token** (you won't see it again!)

Example token format:
```
dEnwtb5gy3jRfFb5vK6HX0V...7NEqV1S5ioR8-iDFZcCVvJCB
```

### Step 4: Run Bootstrap Script (5 minutes - fully automated)

```bash
# Make script executable (if not already)
chmod +x scripts/bootstrap-zitadel.sh

# Run bootstrap
./scripts/bootstrap-zitadel.sh
```

The script will prompt you for:

**Prompt 1: Zitadel domain**
```
Enter Zitadel domain: localhost:8200
```
*(or `spec-zitadel.kucharz.net` for production)*

**Prompt 2: Admin PAT**
```
Enter Admin Personal Access Token: [paste token here]
```

**Prompt 3: Organization**
```
Available organizations:
  1. ZITADEL (335257975983849474)

Select organization number (or press Enter to create new): [Enter]
Enter new organization name: Spec Inc
```

**Prompt 4: Project name**
```
Enter project name (e.g., "Spec Server 2"): Knowledge Base Platform
```

**Prompt 5: Service account names** (accept defaults)
```
CLIENT account name [client-introspection-service]: [Enter]
API account name [api-management-service]: [Enter]
```

### Step 5: Bootstrap Magic ✨ (automatic)

The script now automatically:

1. ✅ Tests connection to Zitadel
2. ✅ Creates (or uses existing) organization
3. ✅ Creates project in organization
4. ✅ Creates CLIENT service account
5. ✅ Generates JWT key for CLIENT account
6. ✅ Saves key to `secrets/zitadel-client-service-account.json`
7. ✅ Creates API service account
8. ✅ Generates JWT key for API account
9. ✅ Grants ORG_OWNER role to API account
10. ✅ Saves key to `secrets/zitadel-api-service-account.json`
11. ✅ Outputs complete configuration

**Output example:**
```bash
════════════════════════════════════════════════════════════
   Bootstrap Complete! 🎉
════════════════════════════════════════════════════════════

Organization: Spec Inc
  ID: 335257975983849474

Project: Knowledge Base Platform
  ID: 335525123456789012

Service Accounts Created:
  ✓ CLIENT (introspection): 335525234567890123
  ✓ API (management):       335525345678901234

JSON Keys Saved:
  ✓ secrets/zitadel-client-service-account.json
  ✓ secrets/zitadel-api-service-account.json

════════════════════════════════════════════════════════════
   Configuration for .env
════════════════════════════════════════════════════════════

# Add these to your .env file:
ZITADEL_DOMAIN=localhost:8200
ZITADEL_ORG_ID=335257975983849474
ZITADEL_PROJECT_ID=335525123456789012
ZITADEL_CLIENT_JWT_PATH=/path/to/secrets/zitadel-client-service-account.json
ZITADEL_API_JWT_PATH=/path/to/secrets/zitadel-api-service-account.json
```

### Step 6: Update Environment Variables (2 minutes)

**For local development:**

```bash
# Edit .env file
nano .env

# Add the configuration from bootstrap output:
ZITADEL_DOMAIN=localhost:8200
ZITADEL_ORG_ID=335257975983849474
ZITADEL_PROJECT_ID=335525123456789012
ZITADEL_CLIENT_JWT_PATH=/Users/mcj/code/spec-server-2/secrets/zitadel-client-service-account.json
ZITADEL_API_JWT_PATH=/Users/mcj/code/spec-server-2/secrets/zitadel-api-service-account.json
```

**For production (Coolify):**

Use relative paths in production:
```bash
ZITADEL_DOMAIN=spec-zitadel.kucharz.net
ZITADEL_ORG_ID=<from-bootstrap>
ZITADEL_PROJECT_ID=<from-bootstrap>
ZITADEL_CLIENT_JWT_PATH=/app/secrets/zitadel-client-service-account.json
ZITADEL_API_JWT_PATH=/app/secrets/zitadel-api-service-account.json
```

### Step 7: Verify JSON Files (1 minute)

```bash
# Check that JSON files were created
ls -lh secrets/*.json

# Should show:
# -rw-r--r-- 1 user staff 1.2K Nov  6 14:30 zitadel-api-service-account.json
# -rw-r--r-- 1 user staff 1.2K Nov  6 14:30 zitadel-client-service-account.json

# Verify JSON structure (optional)
cat secrets/zitadel-client-service-account.json | jq .type
# Output: "serviceaccount"

cat secrets/zitadel-api-service-account.json | jq .type
# Output: "serviceaccount"
```

### Step 8: Test Server Startup (3 minutes)

```bash
# Start the server
nx run workspace-cli:workspace:start

# Watch logs for successful initialization
nx run workspace-cli:workspace:logs -- --service=server --follow
```

**Look for these success messages:**

```
[ZitadelService] ✅ CLIENT service account loaded (keyId: 335525234567890123) - for introspection
[ZitadelService] ✅ API service account loaded (keyId: 335525345678901234) - for Management API
[ZitadelService] Zitadel service initialized successfully
[ZitadelService] ✅ Dual service account mode active (recommended)
```

### Step 9: Test Introspection (2 minutes)

```bash
# Get a valid token from the admin UI
# Login at http://localhost:5175
# Open browser DevTools → Application → Local Storage
# Copy the access token

# Test introspection
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3001/api/orgs

# Should return 200 with org list (not 500 error)
```

## Success Criteria ✅

After completing all steps, you should have:

- ✅ Zitadel running and accessible
- ✅ Two JSON files in `secrets/` directory
- ✅ Server starts without errors
- ✅ Logs show "Dual service account mode active"
- ✅ Introspection works (no 500 errors)
- ✅ User creation works (Management API functional)

## What About the Admin PAT?

After bootstrap completes successfully:

1. ✅ **You can delete the admin PAT** - it's no longer needed
2. ✅ Your application uses **service account JWT keys** at runtime
3. ✅ Future deployments don't need the PAT (just copy JSON files)
4. ✅ Updating service accounts requires creating new keys (via bootstrap script)

The PAT was a **bootstrap credential** - like an SSH key you generate once to enable automation.

## Cleanup (optional)

To stop and remove local Zitadel:

```bash
# Stop containers
docker-compose -f docker-compose.zitadel-local.yml down

# Remove volumes (complete reset)
docker-compose -f docker-compose.zitadel-local.yml down -v

# Remove JSON files (if testing again)
rm secrets/zitadel-*.json
```

## Troubleshooting

### Bootstrap script fails with "connection refused"

**Cause:** Zitadel not ready yet

**Solution:** Wait 30 seconds and retry. Check container status:
```bash
docker ps --filter "name=zitadel-local"
# Both containers should show "healthy"
```

### Bootstrap script fails with "unauthorized"

**Cause:** Invalid or expired PAT

**Solution:** Create a new PAT in Zitadel console and try again.

### Server fails to start: "Failed to read service account key"

**Cause:** JSON file path incorrect in .env

**Solution:** Use absolute paths for local development:
```bash
ZITADEL_CLIENT_JWT_PATH=/Users/YOUR_USERNAME/code/spec-server-2/secrets/zitadel-client-service-account.json
```

### Introspection returns 500 errors

**Cause:** CLIENT service account lacks introspection permission

**Solution:** Re-run bootstrap script - it grants proper permissions automatically.

## Next Steps

- **Production Deployment:** Run bootstrap on `spec-zitadel.kucharz.net`
- **Upload JSON files** to production server
- **Update Coolify** environment variables
- **Monitor logs** for "Dual service account mode active"

## Related Documentation

- Full setup guide: `docs/ZITADEL_DUAL_SERVICE_ACCOUNT_SETUP.md`
- Environment variables: `docs/ZITADEL_ENV_VARS.md`
- Implementation details: `docs/DUAL_SERVICE_ACCOUNT_IMPLEMENTATION.md`
- Bootstrap script source: `scripts/bootstrap-zitadel.sh`

---

**Ready to proceed?** Start at Step 1 and follow each step in order. The process takes about 15 minutes total, with only one 2-minute manual step (creating the admin PAT).
