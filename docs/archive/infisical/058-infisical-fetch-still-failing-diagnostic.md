# Diagnostic: Infisical Fetch Still Failing After Token Fix

**Date:** 2024-11-23  
**Severity:** High  
**Status:** Investigating  
**Related:** docs/fixes/057-infisical-missing-token-parameter.md

---

## Current Situation

After adding the `--token` parameter fix (commit `51e4f73`), the Infisical export is still failing with exit code 1. 

**Current Error:**
```
❌ Failed to fetch secrets (exit code: 1)
Debug: Token length = 105
INFISICAL_TOKEN=st.be233543-dd60-495a-9dfd-ef2c0da6024c...
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61
INFISICAL_ENVIRONMENT=dev
```

**Problem:** We're not seeing the actual error message from Infisical CLI because stderr was being redirected to stdout.

## Debugging Steps Applied

### Step 1: Add Error Output Capture (commit `d8a240a`)

Modified docker-compose.yml to capture stderr separately:

```bash
ERROR_OUTPUT=$(mktemp)
infisical export ... 2> $ERROR_OUTPUT

if [ $EXIT_CODE -ne 0 ]; then
  echo "Error output from Infisical CLI:"
  cat $ERROR_OUTPUT
fi
```

**Expected Result:** Next deployment will show the actual Infisical CLI error message.

## Potential Root Causes (To Investigate)

### 1. Token Permissions Issue

**Hypothesis:** Service token doesn't have permission to access `/workspace` folder.

**How to Check:**
1. Go to Infisical UI: https://infiscal.kucharz.net
2. Navigate to Project Settings → Service Tokens
3. Find token starting with `st.be233543...`
4. Verify:
   - Status: Active (not expired)
   - Environment: `dev` is included
   - Path: `/workspace` is accessible
   - Permissions: Read access enabled

**If This Is The Issue:**
- Update token permissions to include `/workspace` path
- Or create new token with correct permissions

---

### 2. Token Expiration

**Hypothesis:** The service token has expired.

**How to Check:**
1. Infisical UI → Project Settings → Service Tokens
2. Check "Created" and "Expires" dates for token

**If This Is The Issue:**
- Generate new service token
- Update `INFISICAL_TOKEN` in Coolify environment variables
- Redeploy

---

### 3. Environment Name Mismatch

**Hypothesis:** Environment is named something other than "dev".

**How to Check:**
1. Infisical UI → Environments tab
2. Look for available environment names
3. Common names: `dev`, `development`, `staging`, `production`

**If This Is The Issue:**
- Update `INFISICAL_ENVIRONMENT` in Coolify to match actual environment name
- Redeploy

---

### 4. Project ID Mismatch

**Hypothesis:** Project ID `2c273128-5d01-4156-a134-be9511d99c61` is incorrect.

**How to Check:**
1. Infisical UI → Project Settings → General
2. Copy the actual Project ID
3. Compare with current value

**If This Is The Issue:**
- Update `INFISICAL_PROJECT_ID` in Coolify environment variables
- Redeploy

---

### 5. Path Does Not Exist

**Hypothesis:** `/workspace` folder doesn't exist in the Infisical project.

**How to Check:**
1. Infisical UI → Secrets tab
2. Look for folder structure
3. Verify `/workspace` folder exists

**If This Is The Issue:**
- Create `/workspace` folder in Infisical
- Or update `--path` parameter to match existing folder structure

---

### 6. CLI Version Incompatibility

**Hypothesis:** `infisical/cli:latest` has a breaking change.

**How to Check:**
- Review Infisical CLI changelog: https://github.com/Infisical/infisical/releases

**If This Is The Issue:**
- Pin to known working version: `infisical/cli:0.43.30`
- Update docker-compose.yml:
  ```yaml
  infisical-secrets:
    image: infisical/cli:0.43.30  # Pin to specific version
  ```

---

### 7. Network Connectivity

**Hypothesis:** Container can't reach Infisical server (https://infiscal.kucharz.net).

**How to Check:**
```bash
# SSH to Coolify server
ssh root@kucharz.net

# Test connectivity from inside container
docker exec $(docker ps -q -f name=infisical-secrets) \
  wget -O- --timeout=5 https://infiscal.kucharz.net/api/status
```

**If This Is The Issue:**
- Check firewall rules
- Verify DNS resolution
- Check if Infisical server is running

---

### 8. API URL Configuration

**Hypothesis:** Infisical CLI is trying to connect to wrong API endpoint.

**How to Check:**
- Infisical CLI uses `INFISICAL_API_URL` env var (defaults to cloud: https://app.infisical.com)
- For self-hosted: must set `INFISICAL_API_URL=https://infiscal.kucharz.net`

**If This Is The Issue:**
Add to docker-compose.yml:
```yaml
infisical-secrets:
  environment:
    - INFISICAL_API_URL=https://infiscal.kucharz.net
    - INFISICAL_TOKEN=${INFISICAL_TOKEN}
    - INFISICAL_ENVIRONMENT=${INFISICAL_ENVIRONMENT:-dev}
    - INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}
```

---

## Next Steps

### 1. Wait for New Deployment (commit `d8a240a`)

Once Coolify redeploys with error capture, check logs for actual error message.

### 2. Match Error to Root Cause

Compare the error message with the hypotheses above to identify the issue.

### 3. Apply Fix

Based on identified root cause, apply the appropriate fix from the sections above.

### 4. Verify

After fix is applied, verify success:
```
✅ Secrets written to /secrets/.env.infisical
📊 Total secrets fetched: 46
```

---

## Most Likely Causes (Ranked)

Based on typical issues with self-hosted Infisical:

1. **Missing INFISICAL_API_URL** (90% confidence)
   - Self-hosted Infisical requires explicit API URL
   - CLI defaults to Infisical Cloud (app.infisical.com)
   - Need to set: `INFISICAL_API_URL=https://infiscal.kucharz.net`

2. **Token Permissions** (60% confidence)
   - Token might not have access to `/workspace` folder
   - Check token scopes in Infisical UI

3. **Token Expiration** (30% confidence)
   - Less likely but possible if token is old

4. **Environment Name** (20% confidence)
   - Might be `development` instead of `dev`

---

## Temporary Workaround

If you need to get services running ASAP while debugging:

1. Create `.env.infisical` manually with all secrets
2. Mount it directly in docker-compose.yml:
   ```yaml
   db:
     env_file:
       - /path/to/.env.infisical
   ```
3. This bypasses the infisical-secrets sidecar entirely

---

## Status Updates

**2024-11-23 17:31:** Initial diagnosis - token parameter was missing  
**2024-11-23 17:32:** Token parameter added but still failing  
**2024-11-23 17:33:** Error capture added to see actual CLI error message  
**[PENDING]:** Waiting for new deployment logs with error output  

---

## Related Files

- `docker/docker-compose.yml` - Service configuration
- `docker/README-INFISICAL.md` - Infisical integration docs
- `docs/fixes/057-infisical-missing-token-parameter.md` - Initial fix attempt
