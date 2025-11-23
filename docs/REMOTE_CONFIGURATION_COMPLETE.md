# Remote Development Configuration - Complete ✅

**Date:** 2025-01-23  
**Status:** Fully Configured and Verified

---

## Summary

Your local development environment is now configured to use remote services (PostgreSQL and Zitadel) running on `dev.emergent-company.ai`. This allows you to develop locally without running Docker dependencies, connecting directly to the production-like infrastructure.

## What Was Configured

### 1. Environment Files

**Root `.env.local`:**
- Remote database connection: `94.130.12.194:5432`
- Remote Zitadel: `zitadel.dev.emergent-company.ai:8100`
- Skip Docker dependencies flag: `SKIP_DOCKER_DEPS=true`
- LangSmith tracing preserved

**Server `.env.local`:**
- Full database URL: `postgresql://spec:spec@94.130.12.194:5432/zitadel`
- Zitadel issuer and domain
- Organization ID: `347883699234147332`
- Project ID: `347883699653577732`
- Service account placeholders (needs configuration)

### Workspace CLI Enhancements

**Modified Files:**
- `tools/workspace-cli/src/commands/start-service.ts`
  - Added `SKIP_DOCKER_DEPS` detection
  - Shows remote services info on start
  - Skips Docker dependencies when flag is true

- `tools/workspace-cli/src/commands/restart-service.ts`
  - Added `SKIP_DOCKER_DEPS` detection
  - Shows remote services info on restart
  - Skips Docker dependencies when flag is true

- `tools/workspace-cli/src/commands/stop-service.ts`
  - Added `SKIP_DOCKER_DEPS` detection
  - Shows helpful message when skipping dependencies
  - Prevents attempting to stop Docker when in remote mode

- `tools/workspace-cli/src/commands/status.ts`
  - Shows remote services configuration
  - Displays connection details in status output
  - Includes org/project IDs

### 3. Verification Script

**Created:** `scripts/verify-remote-services.sh`
- Tests DNS resolution
- Checks PostgreSQL connectivity
- Verifies Zitadel API access
- Validates environment configuration
- Provides troubleshooting guidance

### 4. Documentation

**Created:** `docs/REMOTE_DEVELOPMENT.md`
- Complete setup guide
- Environment variables explained
- Workspace CLI commands
- Troubleshooting section
- Security notes

---

## Verified Configuration ✅

```
✅ DNS Resolution
   • zitadel.dev.emergent-company.ai → 94.130.12.194
   • db.dev.emergent-company.ai → 94.130.12.194

✅ Network Connectivity
   • PostgreSQL port 5432: Reachable
   • Zitadel API port 8100: Reachable

✅ HTTP Services
   • Zitadel health endpoint: HTTP 200

✅ Database Connection
   • postgresql://spec:spec@94.130.12.194:5432/zitadel: Connected

✅ Environment Configuration
   • POSTGRES_HOST: 94.130.12.194 ✓
   • ZITADEL_DOMAIN: zitadel.dev.emergent-company.ai ✓
   • ZITADEL_ORG_ID: 347883699234147332 ✓
   • ZITADEL_PROJECT_ID: 347883699653577732 ✓
   • SKIP_DOCKER_DEPS: true ✓
```

---

## How to Use

### Start Local Application (Connected to Remote)

```bash
# 1. Verify remote services are accessible
./scripts/verify-remote-services.sh

# 2. Start local services (skips Docker automatically)
nx run workspace-cli:workspace:start

# 3. Check status (shows remote connection info)
nx run workspace-cli:workspace:status
```

**Expected Output:**
```
🌐 Remote mode: Skipping local Docker dependencies
   Using remote services:
   • Database: 94.130.12.194:5432
   • Zitadel: zitadel.dev.emergent-company.ai

🚀 Starting services [admin, server] with profile development
∙ Starting admin...
  ✓ Started admin (PID 12345)
∙ Starting server...
  ✓ Started server (PID 12346)
  ⏳ Checking health... ✓ Healthy (45ms)

✅ Start command complete
```

### Status Command Output

```bash
nx run workspace-cli:workspace:status
```

**Shows:**
```
📊 Workspace Status (profile: development)

🌐 Remote Services Mode:
────────────────────────────────────────────────────────────────────────────────
  Database:  94.130.12.194:5432/zitadel
  Zitadel:   zitadel.dev.emergent-company.ai:8100
  Org ID:    347883699234147332
  Project:   347883699653577732

🚀 Services:
────────────────────────────────────────────────────────────────────────────────
Name            Status       PID      Ports           Uptime      
────────────────────────────────────────────────────────────────────────────────
admin           🟢 online    12345    5175            2m 34s      
server          🟢 online    12346    3001            2m 32s      
```

### Access Points

- **Local Admin UI:** http://localhost:5175
- **Local API:** http://localhost:3001
- **Remote Zitadel Console:** http://zitadel.dev.emergent-company.ai:8100/ui/console
- **Remote Database:** `PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel`

---

## Required Next Steps

### 1. Configure Service Accounts

You need to update service account credentials in `apps/server/.env.local`:

**Option A: Create new service accounts**
```bash
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai \
./scripts/setup-zitadel-service-accounts.sh
```

Then copy the JWT tokens to `.env.local`:
- `ZITADEL_CLIENT_JWT` (for token introspection)
- `ZITADEL_API_JWT` (for Management API)

**Option B: Use existing service accounts**
If service accounts already exist in `secrets-dev/service-accounts.json`:
- Copy the JWT values to `apps/server/.env.local`

### 2. Configure Google API Key (Optional)

For AI features (embeddings, chat):
```bash
# Add to apps/server/.env.local
GOOGLE_API_KEY=your_google_api_key_here
```

### 3. Create OAuth Application (Required for Login)

1. Access Zitadel Console: http://zitadel.dev.emergent-company.ai:8100/ui/console
2. Navigate to your project (ID: 347883699653577732)
3. Create new OIDC application:
   - Name: "Spec Server Dev"
   - Redirect URIs:
     - `http://localhost:5175/api/auth/callback/zitadel`
     - `http://localhost:3001/auth/callback`
   - Post-logout URI: `http://localhost:5175`
   - Grant types: Authorization Code, Refresh Token
4. Save client ID and secret to environment

---

## Workspace CLI Reference

### Commands

```bash
# Start services (skips Docker when SKIP_DOCKER_DEPS=true)
nx run workspace-cli:workspace:start

# Stop services (skips Docker dependencies in remote mode)
nx run workspace-cli:workspace:stop

# Restart services (skips Docker dependencies in remote mode)
nx run workspace-cli:workspace:restart

# Check status (shows remote info)
nx run workspace-cli:workspace:status

# View logs
nx run workspace-cli:workspace:logs

# Tail specific service
nx run workspace-cli:workspace:logs -- --service=server

# Follow logs in real-time
nx run workspace-cli:workspace:logs -- --follow
```

### Environment Detection

The workspace CLI automatically detects remote mode by checking `SKIP_DOCKER_DEPS`:

```typescript
// In start-service.ts, restart-service.ts, stop-service.ts
const skipDockerDeps = process.env.SKIP_DOCKER_DEPS === 'true';
if (skipDockerDeps) {
  process.stdout.write('🌐 Remote mode: Skipping local Docker dependencies\n');
  // ... shows remote service info
}
```

All commands that interact with dependencies (start, stop, restart) now respect this flag.

---

## Troubleshooting

### Cannot Connect to Database

**Error:** `connection refused on 94.130.12.194:5432`

**Solutions:**
1. Verify remote services: `./scripts/verify-remote-services.sh`
2. Check firewall on server: `ssh root@94.130.12.194 'ufw status | grep 5432'`
3. Test direct connection: `PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel -c "SELECT 1"`

### Cannot Connect to Zitadel

**Error:** `connection refused on zitadel.dev.emergent-company.ai:8100`

**Solutions:**
1. Test health endpoint: `curl http://zitadel.dev.emergent-company.ai:8100/debug/ready`
2. Check DNS: `dig +short zitadel.dev.emergent-company.ai`
3. Verify firewall: `ssh root@94.130.12.194 'ufw status | grep 8100'`

### Service Account Errors

**Error:** `401 Unauthorized` when server starts

**Solutions:**
1. Verify credentials in `apps/server/.env.local` match service accounts
2. Check service accounts exist in Zitadel Console
3. Re-run: `./scripts/setup-zitadel-service-accounts.sh`
4. Ensure `ZITADEL_ORG_ID` and `ZITADEL_PROJECT_ID` are correct

### Local Services Won't Start

**Error:** `Cannot connect to database` during startup

**Solutions:**
1. Check environment loaded: `grep DATABASE_URL apps/server/.env.local`
2. Verify remote connectivity: `./scripts/verify-remote-services.sh`
3. Check logs: `nx run workspace-cli:workspace:logs -- --service=server`
4. Restart with verbose logging: `DEBUG=* nx run workspace-cli:workspace:start`

---

## Switching Between Local and Remote

### Switch to Remote Mode (Current Setup)

```bash
# Already configured in .env.local
SKIP_DOCKER_DEPS=true
POSTGRES_HOST=94.130.12.194
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai
```

Start services:
```bash
nx run workspace-cli:workspace:start
```

### Switch to Local Mode (Docker Dependencies)

1. **Update `.env.local`:**
   ```bash
   # Comment out or remove remote config
   SKIP_DOCKER_DEPS=false  # or remove line
   POSTGRES_HOST=localhost
   ZITADEL_DOMAIN=localhost
   ```

2. **Start Docker dependencies:**
   ```bash
   nx run workspace-cli:workspace:deps:start
   ```

3. **Start services:**
   ```bash
   nx run workspace-cli:workspace:start
   ```

---

## Security Notes

### Current Configuration (Development)

⚠️ **Not Production-Ready:**
- Database password: "spec" (default)
- No SSL/TLS encryption
- Ports publicly accessible
- No IP whitelisting

### Production Recommendations

1. **Change Passwords:**
   ```bash
   # On remote server
   ALTER USER spec WITH PASSWORD 'secure_random_password';
   ```

2. **Enable SSL/TLS:**
   - Configure PostgreSQL for SSL connections
   - Update connection string: `?sslmode=require`

3. **Use SSH Tunneling:**
   ```bash
   # Forward remote PostgreSQL to local port
   ssh -L 5432:localhost:5432 root@94.130.12.194 -N
   
   # Then connect to localhost:5432
   DATABASE_URL=postgresql://spec:spec@localhost:5432/zitadel
   ```

4. **Firewall IP Whitelist:**
   ```bash
   # On remote server
   ufw delete allow 5432/tcp
   ufw allow from YOUR_IP_ADDRESS to any port 5432
   ```

5. **Rotate Service Account Keys:**
   - Generate new service accounts monthly
   - Store credentials in secure vault (1Password, etc.)

---

## Files Reference

### Configuration Files
- `.env.local` - Root environment (remote mode enabled)
- `apps/server/.env.local` - Server secrets (needs service accounts)
- `.env.remote` - Template for remote configuration

### Scripts
- `scripts/verify-remote-services.sh` - Connectivity verification
- `scripts/setup-zitadel-service-accounts.sh` - Create service accounts

### Documentation
- `docs/REMOTE_DEVELOPMENT.md` - Complete setup guide
- `secrets-dev/DATABASE_CONNECTION.md` - Database access guide
- `COOLIFY_DEV_SETUP.md` - Remote server setup
- `secrets-dev/config.env` - Zitadel IDs reference

### Workspace CLI
- `tools/workspace-cli/src/commands/start-service.ts` - Remote mode detection
- `tools/workspace-cli/src/commands/status.ts` - Remote status display

---

## What's Next

### Immediate (Required for Login)
1. ✅ Remote services verified
2. ✅ Environment configured
3. ⏳ Service accounts setup (pending)
4. ⏳ OAuth application created (pending)

### Soon (Application Features)
5. Configure Google API key for AI features
6. Test authentication flow
7. Run database migrations if needed
8. Deploy admin UI assets

### Later (Production)
9. Enable SSL/TLS
10. Change default passwords
11. Configure monitoring/alerting
12. Setup backup automation

---

## Support Resources

- **Remote Services Verification:** `./scripts/verify-remote-services.sh`
- **Workspace Status:** `nx run workspace-cli:workspace:status`
- **Service Logs:** `nx run workspace-cli:workspace:logs`
- **Remote Server Logs:** `ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker-compose logs'`
- **Database Console:** `PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel`
- **Zitadel Console:** http://zitadel.dev.emergent-company.ai:8100/ui/console

---

## Summary

✅ **Fully Configured:**
- Local app connects to remote PostgreSQL (94.130.12.194:5432)
- Local app uses remote Zitadel (zitadel.dev.emergent-company.ai:8100)
- Workspace CLI skips Docker dependencies automatically
- Status command shows remote connection details
- Verification script confirms all services accessible

⏳ **Pending:**
- Service account JWT configuration
- OAuth application creation
- Google API key (for AI features)

🎯 **Ready to Develop:**
- Start services: `nx run workspace-cli:workspace:start`
- Access admin: http://localhost:5175
- Access API: http://localhost:3001
- All data stored on remote infrastructure

🔒 **Security:**
- Development environment only
- Follow production recommendations before deploying
- Rotate credentials regularly
- Consider SSH tunneling for enhanced security

---

**Configuration Complete!** 🎉

You can now run `nx run workspace-cli:workspace:start` to launch your local application connected to remote services.
