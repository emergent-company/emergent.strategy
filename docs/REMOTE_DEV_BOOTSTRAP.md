# Remote Dev Environment Bootstrap Guide

This guide explains how to bootstrap the remote dev Zitadel instance using the same approach as local development - all configuration done remotely via API calls.

## Prerequisites

1. **Wildcard DNS Configuration (Required)**
   - Configure at your DNS provider: `*.dev.emergent-company.ai → 94.130.12.194`
   - OR wildcard CNAME: `*.dev.emergent-company.ai CNAME kucharz.net`
   - Wait 5-60 minutes for DNS propagation
   - Verify: `nslookup zitadel.dev.emergent-company.ai` should return `94.130.12.194`

2. **SSH Access to Remote Server**
   - Host: `root@94.130.12.194`
   - Test: `ssh root@94.130.12.194 'echo "Connection OK"'`

3. **Local Tools**
   - `jq` (install: `brew install jq`)
   - `curl`
   - `ssh`

## Quick Start

### Option 1: Remote Bootstrap (Recommended)

This script configures Zitadel remotely via Management API without SSH:

```bash
# Run from your local machine
./scripts/bootstrap-remote-zitadel.sh
```

**What it does:**
- ✅ Checks Zitadel accessibility (via domain or IP fallback)
- ✅ Retrieves the auto-generated bootstrap PAT
- ✅ Creates organization: "Spec Organization Dev"
- ✅ Creates project: "Spec Server Dev"
- ✅ Saves IDs to `secrets-dev/config.env`
- ✅ Generates summary with next steps

**Output:**
```
secrets-dev/
├── config.env              # Environment variables
└── BOOTSTRAP_SUMMARY.md    # Complete summary with next steps
```

### Option 2: Full Bootstrap on Server

For complete setup including applications and users:

```bash
# SSH to server and run full bootstrap
ssh root@94.130.12.194
cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai bash scripts/bootstrap-zitadel-fully-automated.sh provision
```

## Configuration Flow

### 1. DNS First
```bash
# Verify DNS is configured
nslookup zitadel.dev.emergent-company.ai
# Should return: 94.130.12.194

nslookup login.zitadel.dev.emergent-company.ai
# Should return: 94.130.12.194

nslookup db.dev.emergent-company.ai
# Should return: 94.130.12.194
```

### 2. Run Remote Bootstrap
```bash
./scripts/bootstrap-remote-zitadel.sh
```

### 3. Update Coolify Environment
After bootstrap completes, add these environment variables to your Coolify deployment:

```bash
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai
ZITADEL_ORG_ID=<from bootstrap output>
ZITADEL_PROJECT_ID=<from bootstrap output>
```

### 4. Restart Services
```bash
# Via Coolify UI or SSH
ssh root@94.130.12.194
cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4
docker compose restart
```

## Manual Configuration (Alternative)

If you prefer to configure manually via Zitadel console:

1. **Access Console:**
   ```
   http://94.130.12.194:8100
   # Or https://zitadel.dev.emergent-company.ai once DNS configured
   ```

2. **Login with PAT:**
   ```bash
   # Get the PAT
   ssh root@94.130.12.194 'cat /data/coolify/applications/nw0wokswsooooo4g0c0ggok4/secrets/bootstrap/pat.txt'
   ```

3. **Create Organization:**
   - Name: "Spec Organization Dev"
   - Save the Organization ID

4. **Create Project:**
   - Name: "Spec Server Dev"
   - Enable role assertions and checks
   - Save the Project ID

5. **Create OAuth OIDC Application:**
   - Name: "Spec Server OAuth Dev"
   - Grant types: Authorization Code, Refresh Token
   - Redirect URI: `http://localhost:5175/auth/callback`
   - Save Client ID and Secret

6. **Create Service Accounts:**
   - CLIENT account: For token introspection (minimal permissions)
   - API account: For management operations (ORG_OWNER role)
   - Generate JWT keys for each
   - Save JSON key files

## Service URLs

Once DNS is configured:

| Service | URL | Description |
|---------|-----|-------------|
| Zitadel Console | https://zitadel.dev.emergent-company.ai | Admin interface |
| Zitadel API | https://zitadel.dev.emergent-company.ai | Management API |
| Login UI | https://login.zitadel.dev.emergent-company.ai | Login interface |
| PostgreSQL | db.dev.emergent-company.ai:5432 | Database |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Local Machine                                  │
│  ├── scripts/bootstrap-remote-zitadel.sh        │
│  │   └── Calls Management API remotely          │
│  └── secrets-dev/                               │
│      ├── config.env    (IDs for Coolify)        │
│      └── BOOTSTRAP_SUMMARY.md                   │
└─────────────────────────────────────────────────┘
                    │
                    │ HTTPS/API Calls
                    ↓
┌─────────────────────────────────────────────────┐
│  Remote Server (94.130.12.194)                  │
│  ├── Zitadel (port 8100)                        │
│  │   ├── Management API                         │
│  │   ├── Auth API                               │
│  │   └── secrets/bootstrap/pat.txt              │
│  ├── Login UI (port 8101)                       │
│  │   └── Waits for PAT file                     │
│  └── PostgreSQL (port 5432)                     │
└─────────────────────────────────────────────────┘
```

**Key Principles:**
- ✅ All configuration via remote API calls
- ✅ No direct file manipulation on server (except reading PAT)
- ✅ Replicates local Docker setup methodology
- ✅ External access enables remote configuration
- ✅ PAT generated automatically by Zitadel machine user

## Verification

After bootstrap, verify everything works:

```bash
# Run service verification script
./scripts/verify-dev-services.sh

# Expected output:
# ✅ DNS Resolution: All domains resolve
# ✅ PostgreSQL: Port 5432 accessible
# ✅ Zitadel API: Port 8100 accessible, health check OK
# ✅ Login UI: Port 8101 accessible
```

## Troubleshooting

### DNS Not Resolving
```bash
# Check current DNS configuration
nslookup zitadel.dev.emergent-company.ai

# If NXDOMAIN:
# 1. Configure wildcard at DNS provider: *.dev.emergent-company.ai A 94.130.12.194
# 2. Wait for propagation (5-60 minutes)
# 3. Clear DNS cache: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

### Bootstrap PAT Not Found
```bash
# Check if PAT file exists
ssh root@94.130.12.194 'ls -la /data/coolify/applications/nw0wokswsooooo4g0c0ggok4/secrets/bootstrap/'

# Check Zitadel logs for PAT generation
ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker compose logs zitadel | grep -i pat'

# Verify machine user configuration
ssh root@94.130.12.194 'cat /data/coolify/applications/nw0wokswsooooo4g0c0ggok4/zitadel.env | grep MACHINE'
```

### Zitadel Not Accessible
```bash
# Check container status
ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker compose ps'

# Check Zitadel logs
ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker compose logs zitadel'

# Test health endpoint
curl http://94.130.12.194:8100/debug/healthz
```

### Login UI Not Healthy
```bash
# Check if PAT file exists
ssh root@94.130.12.194 'ls -la /data/coolify/applications/nw0wokswsooooo4g0c0ggok4/secrets/bootstrap/pat.txt'

# Copy PAT to login location if needed
ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && cp secrets/bootstrap/pat.txt login-client.pat'

# Restart login container
ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker compose restart login'
```

## Next Steps After Bootstrap

1. **Update Coolify Environment**
   - Add `ZITADEL_ORG_ID` and `ZITADEL_PROJECT_ID` from bootstrap output
   - Restart containers

2. **Create OAuth Applications**
   - Manually in Zitadel console
   - OR run full bootstrap script on server

3. **Generate Service Accounts**
   - Run `scripts/setup-zitadel-service-accounts.sh` remotely
   - Or create manually in Zitadel console

4. **Deploy Application Services**
   - Update application environment with Zitadel credentials
   - Test authentication flow end-to-end

5. **Enable HTTPS**
   - Once DNS is configured and stable
   - Update all URLs from `http://` to `https://`
   - Configure SSL certificates (Coolify can auto-provision Let's Encrypt)

## Security Notes

- Bootstrap PAT has full admin access - rotate after setup complete
- Service accounts should use principle of least privilege
- CLIENT account: minimal permissions (introspection only)
- API account: elevated permissions (management operations)
- Secure storage for all credentials and keys
- Enable MFA for human user accounts

## Related Documentation

- `docs/setup/ZITADEL_SETUP_GUIDE.md` - Comprehensive Zitadel setup guide
- `scripts/setup-zitadel-service-accounts.sh` - Service account creation
- `scripts/bootstrap-zitadel-fully-automated.sh` - Full bootstrap with users and apps
- `scripts/verify-dev-services.sh` - Service verification script
- `docs/EXTERNAL_DATABASE_ACCESS.md` - PostgreSQL external access

## Support

If issues persist:
1. Check service logs on remote server
2. Verify DNS propagation: https://dnschecker.org
3. Test with IP address fallback: http://94.130.12.194:8100
4. Review Zitadel documentation: https://zitadel.com/docs
