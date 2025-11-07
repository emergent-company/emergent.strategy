# Zero-Touch Zitadel Bootstrap Guide

This guide shows how to use the fully automated Zitadel bootstrap system.

## Prerequisites

- Docker and Docker Compose installed
- `jq` installed for JSON parsing: `brew install jq` (macOS) or `apt-get install jq` (Linux)

## For Local Development

### Step 1: Start Zitadel with Automatic PAT Generation

```bash
docker-compose -f docker-compose.zitadel-local.yml up -d
```

**What this does:**
- Starts PostgreSQL database
- Starts Zitadel v2.64.1
- **Automatically creates** machine user `zitadel-admin-sa`
- **Automatically generates** PAT and writes to `secrets/bootstrap/pat.txt`
- Takes ~15 seconds

### Step 2: Run Bootstrap Script

```bash
./scripts/bootstrap-zitadel-fully-automated.sh
```

**What this does:**
- Reads PAT from `secrets/bootstrap/pat.txt` (NO prompts!)
- Creates/finds organization "Spec Organization"
- Creates/finds project "Spec Server"
- Creates CLIENT service account (for introspection)
- Creates API service account (for Management API)
- Generates JWT keys for both accounts
- Saves to:
  - `secrets/zitadel-client-service-account.json`
  - `secrets/zitadel-api-service-account.json`
- Takes ~15 seconds

### Step 3: Configure Your Server

The script outputs environment variables. Add them to your `.env`:

```bash
# Zitadel Configuration
ZITADEL_DOMAIN=localhost:8200
ZITADEL_ORG_ID=<org-id-from-output>
ZITADEL_PROJECT_ID=<project-id-from-output>

# CLIENT Service Account (for introspection)
ZITADEL_CLIENT_JWT_PATH=./secrets/zitadel-client-service-account.json

# API Service Account (for Management API)
ZITADEL_API_JWT_PATH=./secrets/zitadel-api-service-account.json
```

### Step 4: Start Your Server

```bash
nx run workspace-cli:workspace:start
```

### Step 5: Verify

Check logs for:
```
Dual service account mode active
  CLIENT account: <userId> (for introspection)
  API account: <userId> (for Management API)
```

## For Production

### Option A: Fresh Zitadel Instance (Recommended)

If you're setting up a new production Zitadel instance:

1. **Configure automatic PAT in production docker-compose:**

```yaml
environment:
  ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_USERNAME: zitadel-admin-sa
  ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_NAME: "Bootstrap Admin Service Account"
  ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINEKEY_TYPE: 1
  ZITADEL_FIRSTINSTANCE_PATPATH: /machinekey/pat.txt
  ZITADEL_FIRSTINSTANCE_ORG_MACHINE_PAT_EXPIRATIONDATE: "2030-12-31T23:59:59Z"

volumes:
  - ./secrets/bootstrap:/machinekey
```

2. **Start Zitadel** (creates PAT automatically)

3. **Copy PAT to local machine:**

```bash
scp production:/path/to/secrets/bootstrap/pat.txt secrets/bootstrap/
```

4. **Run bootstrap script:**

```bash
ZITADEL_DOMAIN=spec-zitadel.kucharz.net ./scripts/bootstrap-zitadel-fully-automated.sh
```

5. **Upload generated keys to production:**

```bash
scp secrets/zitadel-*-service-account.json production:/app/secrets/
ssh production "chmod 600 /app/secrets/zitadel-*.json"
```

### Option B: Existing Zitadel Instance

If Zitadel is already running in production:

1. **Create machine user in Zitadel UI:**
   - Login to https://spec-zitadel.kucharz.net
   - Go to Organization → Users
   - Click "+ New" → "Service User"
   - Name: `bootstrap-admin`
   - Grant admin permissions

2. **Generate PAT:**
   - In service user settings → Personal Access Tokens
   - Click "+ New Token"
   - Copy token

3. **Save PAT locally:**

```bash
echo "PASTE_TOKEN_HERE" > secrets/bootstrap/pat.txt
```

4. **Run bootstrap script:**

```bash
ZITADEL_DOMAIN=spec-zitadel.kucharz.net ./scripts/bootstrap-zitadel-fully-automated.sh
```

5. **Upload generated keys to production:**

```bash
scp secrets/zitadel-*-service-account.json production:/app/secrets/
ssh production "chmod 600 /app/secrets/zitadel-*.json"
```

## Customization

### Change Organization or Project Name

Set environment variables before running the script:

```bash
ORG_NAME="My Company" \
PROJECT_NAME="My Application" \
./scripts/bootstrap-zitadel-fully-automated.sh
```

### Use Different Domain

```bash
ZITADEL_DOMAIN=auth.example.com \
./scripts/bootstrap-zitadel-fully-automated.sh
```

### Specify Custom PAT File Location

Edit the script and change:
```bash
PAT_FILE="./secrets/bootstrap/pat.txt"
```

## Troubleshooting

### PAT File Not Created

**Symptom:** `secrets/bootstrap/pat.txt` doesn't exist after starting Zitadel

**Solutions:**
1. Check Zitadel logs:
   ```bash
   docker-compose -f docker-compose.zitadel-local.yml logs zitadel | grep -i "machine\|pat\|error"
   ```

2. Verify environment variables in docker-compose.yml

3. Check volume mount:
   ```bash
   docker inspect zitadel-local | grep machinekey
   ```

4. Restart Zitadel:
   ```bash
   docker-compose -f docker-compose.zitadel-local.yml restart zitadel
   ```

### Authentication Failed

**Symptom:** Script says "Authentication failed (HTTP 404)"

**Solutions:**
1. Wait for Zitadel to finish initialization (check `docker logs zitadel-local`)
2. Verify PAT has content: `cat secrets/bootstrap/pat.txt` (should be 72 characters)
3. Test PAT manually:
   ```bash
   PAT=$(cat secrets/bootstrap/pat.txt)
   curl -H "Authorization: Bearer $PAT" http://localhost:8200/admin/v1/orgs/_search
   ```

### Project Already Exists Error

**Symptom:** Script fails with "Project already exists"

**Solution:** This is normal! The script now checks for existing projects and uses them. Re-run the script.

### Wrong API Version

**Symptom:** Getting "Not Found" or "Method Not Allowed" errors

**Current API Usage:**
- Admin v1 for listing orgs: `/admin/v1/orgs/_search`
- v2 for creating orgs: `/v2/organizations`
- Management v1 for everything else: `/management/v1/*` (needs `x-zitadel-orgid` header)

## Security Notes

1. **PAT File:** Contains admin-level access token
   - Add `secrets/` to `.gitignore`
   - Never commit PAT files to git
   - PAT is only needed for bootstrap, can be deleted after

2. **Service Account Keys:** RSA private keys
   - Store securely (file permissions 600)
   - Rotate periodically
   - Never commit to git

3. **Production:** Use secrets management
   - Consider using HashiCorp Vault, AWS Secrets Manager, etc.
   - Mount secrets as Docker volumes
   - Ensure proper file permissions

## FAQ

**Q: Can I run the bootstrap script multiple times?**  
A: Yes! The script checks for existing resources and only creates what's missing. Safe to re-run.

**Q: What if I want to use different service account names?**  
A: Edit the script and change `CLIENT_NAME` and `API_NAME` variables.

**Q: Can I delete the admin PAT after bootstrap?**  
A: Yes! Once service account JWT keys are generated, the bootstrap PAT is no longer needed. Delete it from Zitadel UI for security.

**Q: How do I rotate the service account keys?**  
A: Run the bootstrap script again. It will generate new keys. Update your `.env` and restart the server.

**Q: Does this work with Zitadel Cloud?**  
A: The automatic PAT generation requires access to docker-compose configuration. For Zitadel Cloud, use Option B (manual PAT creation).

## Next Steps

After successful bootstrap:

1. ✅ Test introspection endpoint (should return 200, not 500)
2. ✅ Test user creation via Management API
3. ✅ Verify token caching is working
4. ✅ Monitor logs for "Dual service account mode active"
5. ✅ Check for zero introspection errors

## Support

For issues:
1. Check this troubleshooting guide
2. Review `docs/ZERO_TOUCH_AUTOMATION_SUCCESS.md` for technical details
3. Check Zitadel logs: `docker-compose logs zitadel`
4. Verify API responses manually with curl

## Summary

**Two commands, 30 seconds, zero manual steps:**

```bash
# 1. Start Zitadel
docker-compose -f docker-compose.zitadel-local.yml up -d

# 2. Bootstrap everything
./scripts/bootstrap-zitadel-fully-automated.sh
```

That's it! ✅
