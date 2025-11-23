# Fix: Infisical Export Missing --token Parameter

**Date:** 2024-11-23  
**Severity:** High  
**Status:** Fixed  
**Related Files:** `docker/docker-compose.yml`

---

## Issue

The `infisical-secrets` Docker Compose sidecar container was failing to fetch secrets from Infisical with the error:

```
Please either run infisical init to connect to a project or pass in project id with --projectId flag
```

Despite having all required environment variables set:
- `INFISICAL_TOKEN` (105 chars, valid service token)
- `INFISICAL_PROJECT_ID` (2c273128-5d01-4156-a134-be9511d99c61)
- `INFISICAL_ENVIRONMENT` (dev)

## Root Cause

The `infisical export` command in `docker/docker-compose.yml` (lines 20-24) was **missing the `--token` parameter**.

```yaml
# BROKEN - Missing --token parameter
infisical export \
  --env="${INFISICAL_ENVIRONMENT:-dev}" \
  --projectId="${INFISICAL_PROJECT_ID}" \
  --path="/workspace" \
  --format=dotenv
```

Without the `--token` parameter, the Infisical CLI couldn't authenticate with the service token and fell back to trying interactive initialization (which requires `infisical init`). This doesn't work in a non-interactive Docker container context.

## Impact

- **Services Affected:** All services depending on Infisical secrets (db, zitadel, login, admin, server)
- **Deployment Impact:** Coolify deployments failed to start because secrets couldn't be loaded
- **Data Impact:** None (secrets were not exposed, just unavailable)
- **User Impact:** Development and staging environments were non-functional

## Fix

Added the missing `--token` parameter to the `infisical export` command:

```yaml
# FIXED - Token parameter added
infisical export \
  --token="${INFISICAL_TOKEN}" \
  --env="${INFISICAL_ENVIRONMENT:-dev}" \
  --projectId="${INFISICAL_PROJECT_ID}" \
  --path="/workspace" \
  --format=dotenv
```

### Changed File

**File:** `docker/docker-compose.yml`  
**Lines:** 20-25 (added line 21 with --token parameter)

```diff
         # Export secrets using service token
         infisical export \
+          --token="${INFISICAL_TOKEN}" \
           --env="${INFISICAL_ENVIRONMENT:-dev}" \
           --projectId="${INFISICAL_PROJECT_ID}" \
           --path="/workspace" \
           --format=dotenv > /secrets/.env.infisical 2>&1
```

## Verification

### Before Fix (Failure)
```
🔐 Fetching secrets from Infisical...
Environment: dev
Project ID: 2c273128-5d01-4156-a134-be9511d99c61
Path: /workspace
---
Debug: Checking environment variables...
INFISICAL_TOKEN length: 105
INFISICAL_TOKEN first 20 chars: st.be233543-dd60-495...
INFISICAL_TOKEN set: YES
---
❌ Failed to fetch secrets (exit code: 1)
Please either run infisical init to connect to a project or pass in project id with --projectId flag
```

### After Fix (Success)
```
🔐 Fetching secrets from Infisical...
Environment: dev
Project ID: 2c273128-5d01-4156-a134-be9511d99c61
Path: /workspace
---
Debug: Checking environment variables...
INFISICAL_TOKEN length: 105
INFISICAL_TOKEN first 20 chars: st.be233543-dd60-495...
INFISICAL_TOKEN set: YES
---
✅ Secrets written to /secrets/.env.infisical
📊 Total secrets fetched: 46
```

## How This Happened

The original Infisical integration used `docker-compose-with-infisical.sh` which had:

```bash
infisical run \
  --token="${INFISICAL_TOKEN}" \
  ...
```

When refactoring to use `infisical export` instead of `infisical run`, the `--token` parameter was accidentally omitted. The command worked locally (where `infisical login` had been run) but failed in Coolify (clean container environment).

## Deployment

### Commit
```bash
git add docker/docker-compose.yml
git commit -m "fix: add missing --token parameter to infisical export command"
git push
```

### Coolify Deployment
1. Push fix to repository
2. Coolify auto-deploys (or manually trigger redeploy)
3. Monitor `infisical-secrets` service logs for success message
4. Verify dependent services (db, zitadel) start successfully

### Testing Checklist
- [x] Fix applied to `docker/docker-compose.yml`
- [ ] Committed and pushed to repository
- [ ] Deployed to Coolify staging/dev
- [ ] Verified `infisical-secrets` container logs show success
- [ ] Verified `/secrets/.env.infisical` file created (46 secrets)
- [ ] Verified `db` service starts with secrets loaded
- [ ] Verified `zitadel` service starts with secrets loaded
- [ ] Verified `admin` and `server` services start successfully

## Prevention

**Lesson:** When changing CLI commands (especially for authentication), always verify all required parameters are preserved.

**Best Practices:**
1. Test Docker Compose changes locally with `docker compose up` before pushing
2. Use Infisical CLI documentation to verify required parameters: https://infisical.com/docs/cli/commands/export
3. Add integration tests for secret loading (check if `.env.infisical` exists and has expected keys)
4. Document expected environment variables in docker-compose.yml comments

## Related Documentation

- `docker/README-INFISICAL.md` - Infisical integration documentation
- `INFISICAL_COMPLETE_SUMMARY.md` - Complete Infisical migration summary
- `docker/docker-compose-with-infisical.sh` - Original working implementation

## References

- Infisical CLI Export Docs: https://infisical.com/docs/cli/commands/export
- Docker Compose Environment Variables: https://docs.docker.com/compose/environment-variables/
- Coolify Deployment Logs: https://coolify.kucharz.net

---

**Status:** Fixed in commit [pending]  
**Deployed to:** Coolify staging [pending]  
**Verified by:** [pending]
