# Infisical Docker Integration - Troubleshooting

## Error: "No valid login session found, triggering login flow"

### Symptoms

```
🔐 Fetching secrets from Infisical...
✅ Secrets written to /secrets/.env.infisical
2025-11-23T10:54:51Z INF No valid login session found, triggering login flow
error: ^D
Unable to parse domain url
Failed to automatically trigger login flow. Please run [infisical login] manually to login.
```

### Root Cause

The Infisical CLI is trying to use **interactive login** instead of the service token. This happens when:

1. The token format is incorrect
2. The token is not being passed as an environment variable correctly
3. The token doesn't have access to the requested path

### Solution

#### 1. Verify Token Format

**Correct format:**

```bash
INFISICAL_TOKEN=st.dev.abc123def456...  # Starts with st.<env>.
```

**Incorrect formats:**

- ❌ Personal access token (different prefix)
- ❌ Missing `st.` prefix
- ❌ Truncated or partial token

#### 2. Check Token in Deployment Environment

In your deployment environment variables, verify:

```bash
# Should be a complete service token
INFISICAL_TOKEN=st.dev.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
INFISICAL_ENVIRONMENT=dev
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
```

#### 3. Verify Token Has Correct Permissions

In Infisical UI:

1. Go to **Settings** → **Service Tokens**
2. Find your token
3. Verify:
   - ✅ Environment: `dev` (matches `INFISICAL_ENVIRONMENT`)
   - ✅ Path: `/` or `/workspace` (has access to required folder)
   - ✅ Status: Active (not expired or revoked)

#### 4. Generate New Token if Needed

If token is invalid:

1. Go to https://infiscal.kucharz.net
2. Navigate to **Settings** → **Service Tokens**
3. Click **Create Service Token**
4. Configure:
   - **Name:** `docker-dev`
   - **Environment:** `dev`
   - **Path:** `/` (root access)
   - **Expiration:** Never (or set appropriate duration)
   - **Permissions:** Read-only
5. Copy the token immediately (shown only once!)
6. Update in deployment environment variables

## Verifying the Fix

### 1. Check Logs

After deploying with new token:

```bash
docker compose logs infisical-secrets
```

**Expected output:**

```
🔐 Fetching secrets from Infisical...
Environment: dev
Project ID: 2c273128-5d01-4156-a134-be9511d99c61
Path: /workspace
✅ Secrets written to /secrets/.env.infisical
📊 Total secrets fetched: 46
```

### 2. Verify Secrets File

```bash
docker compose exec infisical-secrets cat /secrets/.env.infisical
```

**Should show:**

```
POSTGRES_USER=spec
POSTGRES_PASSWORD=...
POSTGRES_DB=spec
ZITADEL_EXTERNALDOMAIN=...
# ... 46 total secrets
```

### 3. Check File Not Empty

```bash
docker compose exec infisical-secrets wc -l /secrets/.env.infisical
```

**Should show:** `46 /secrets/.env.infisical`

### 4. Verify Services Have Secrets

```bash
# Check database service
docker compose exec db env | grep POSTGRES_USER

# Check Zitadel service
docker compose exec zitadel env | grep ZITADEL_EXTERNALDOMAIN
```

**Should show actual values from Infisical, not defaults**

## Common Issues

### Issue 1: Token Expired

**Error:** `401 Unauthorized` or similar auth error

**Solution:**

1. Check token expiration in Infisical UI
2. Generate new token
3. Update in deployment environment
4. Restart deployment

### Issue 2: Wrong Environment

**Error:** Secrets file empty or has wrong values

**Solution:**

1. Verify `INFISICAL_ENVIRONMENT` matches token's environment
2. Check token was created for `dev` (not `staging` or `production`)
3. Restart deployment

### Issue 3: Token Lacks Permissions

**Error:** `403 Forbidden` or secrets file empty

**Solution:**

1. Check token has access to `/workspace` folder
2. Verify token has at least read permissions
3. If needed, create new token with proper permissions

### Issue 4: Container Restarts Repeatedly

**Symptom:** `infisical-secrets` service keeps restarting

**Cause:** Healthcheck failing because file is empty or missing

**Debug:**

```bash
# Check exit code
docker compose ps infisical-secrets

# Check logs for error messages
docker compose logs infisical-secrets --tail=50

# Check if file exists but is empty
docker compose exec infisical-secrets ls -lh /secrets/.env.infisical
```

**Solution:** Fix token issue, then restart

## Debug Mode

To see more verbose output from Infisical CLI:

```bash
# Add to docker-compose.yml temporarily
environment:
  - INFISICAL_TOKEN=${INFISICAL_TOKEN}
  - INFISICAL_ENVIRONMENT=${INFISICAL_ENVIRONMENT:-dev}
  - INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}
  - INFISICAL_LOG_LEVEL=debug  # Add this line
```

Then check logs:

```bash
docker compose logs infisical-secrets
```

## Manual Testing

Test Infisical authentication locally:

```bash
# Install Infisical CLI
brew install infisical/get-cli/infisical

# Export secrets manually
export INFISICAL_TOKEN="st.dev.your-token-here"
infisical export \
  --env=dev \
  --projectId=2c273128-5d01-4156-a134-be9511d99c61 \
  --path=/workspace \
  --format=dotenv
```

**Should output all 46 secrets without errors**

## Getting Help

If issues persist:

1. **Check Infisical Status:** https://status.infisical.com
2. **Infisical Docs:** https://infisical.com/docs
3. **Project Logs:** Include full `docker compose logs infisical-secrets` output
4. **Token Info:** Share token permissions (NOT the token itself!)
5. **Environment:** Confirm all 3 env vars are set correctly

## Quick Fix Summary

**Most common fix:**

1. Generate new service token in Infisical UI
2. Verify it starts with `st.dev.`
3. Copy complete token (don't truncate)
4. Update `INFISICAL_TOKEN` in deployment environment
5. Restart deployment
6. Check logs for success message

---

**Updated:** 2025-11-23 after fixing CLI authentication  
**Related:** `docker/README-INFISICAL.md`
