# Remote Development Environment - Quick Start

This guide explains how to configure your local development environment to use remote services (PostgreSQL and Zitadel) running on dev.emergent-company.ai.

## Overview

**Remote Services:**
- PostgreSQL: `94.130.12.194:5432` (database: zitadel)
- Zitadel API: `http://zitadel.dev.emergent-company.ai:8100`
- Zitadel Login: `http://login.zitadel.dev.emergent-company.ai:8100`

**Local Services:**
- Admin UI: `http://localhost:5175`
- API Server: `http://localhost:3001`

## Quick Setup

### 1. Verify Remote Services

Test connectivity to remote services:

```bash
./scripts/verify-remote-services.sh
```

This checks:
- PostgreSQL connection (port 5432)
- Zitadel API (port 8100)
- DNS resolution
- Service health endpoints

### 2. Configure Environment

Copy the remote environment template:

```bash
cp .env.remote .env
```

### 3. Update Service Account Credentials

The `.env` file contains placeholder service account credentials. You need to:

**Option A: Use existing service accounts** (if already created)
- Copy credentials from `secrets-dev/service-accounts.json`
- Update the following in `.env`:
  - `ZITADEL_CLIENT_SA_KEY_ID`
  - `ZITADEL_CLIENT_SA_KEY`
  - `ZITADEL_API_SA_KEY_ID`
  - `ZITADEL_API_SA_KEY`

**Option B: Create new service accounts**
- Run: `ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai ./scripts/setup-zitadel-service-accounts.sh`
- Follow the script output to update `.env`

### 4. Start Local Application

Start only the local application services (admin + server):

```bash
nx run workspace-cli:workspace:start
```

The workspace CLI will:
- Skip Docker dependencies (SKIP_DOCKER_DEPS=true)
- Use remote database connection
- Use remote Zitadel for authentication
- Start admin UI on port 5175
- Start API server on port 3001

### 5. Verify Application

Check service status:

```bash
nx run workspace-cli:workspace:status
```

Access the application:
- Admin UI: http://localhost:5175
- API Server: http://localhost:3001/health

## Environment Variables Explained

Key variables in `.env.remote`:

```bash
# Tells workspace CLI to skip local Docker services
SKIP_DOCKER_DEPS=true

# Remote database connection
DATABASE_URL=postgresql://spec:spec@94.130.12.194:5432/zitadel

# Remote Zitadel configuration
ZITADEL_URL=http://zitadel.dev.emergent-company.ai:8100
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai
ZITADEL_ORG_ID=347883699234147332
ZITADEL_PROJECT_ID=347883699653577732
```

## Workspace CLI Enhancements

The workspace CLI now supports remote mode:

### Commands

```bash
# Start local services only (skips Docker deps when SKIP_DOCKER_DEPS=true)
nx run workspace-cli:workspace:start

# Stop local services (skips Docker deps in remote mode)
nx run workspace-cli:workspace:stop

# Restart local services (skips Docker deps in remote mode)
nx run workspace-cli:workspace:restart

# Check status (shows remote connection info)
nx run workspace-cli:workspace:status

# View logs
nx run workspace-cli:workspace:logs
```

**Note:** All commands that interact with dependencies (start, stop, restart) automatically detect remote mode via the `SKIP_DOCKER_DEPS` environment variable and skip attempting to manage Docker containers.

### Status Output

When using remote services, `workspace:status` shows:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Workspace Status (Remote Mode)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remote Services:
  ✓ Database: 94.130.12.194:5432 (zitadel)
  ✓ Zitadel:  zitadel.dev.emergent-company.ai:8100
  ✓ Org:      347883699234147332
  ✓ Project:  347883699653577732

Local Services (PM2):
  admin (online) - http://localhost:5175
  server (online) - http://localhost:3001
```

## Database Access

### From Local Machine

Connect with psql:

```bash
PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel
```

Or use connection string:

```
postgresql://spec:spec@94.130.12.194:5432/zitadel
```

### From Application Code

The app automatically uses `DATABASE_URL` from `.env`:

```typescript
// apps/server/src/main.ts
// TypeORM connects using DATABASE_URL environment variable
```

## Troubleshooting

### Cannot Connect to PostgreSQL

**Symptoms:**
```
connection refused on 94.130.12.194:5432
```

**Solutions:**
1. Check firewall: `ssh root@94.130.12.194 'ufw status | grep 5432'`
2. Verify database is running: `./scripts/verify-remote-services.sh`
3. Test direct connection: `PGPASSWORD=spec psql -h 94.130.12.194 -U spec -d zitadel -c "SELECT 1"`

### Cannot Connect to Zitadel

**Symptoms:**
```
connection refused on zitadel.dev.emergent-company.ai:8100
```

**Solutions:**
1. Check firewall: `ssh root@94.130.12.194 'ufw status | grep 8100'`
2. Test Zitadel health: `curl http://zitadel.dev.emergent-company.ai:8100/debug/ready`
3. Verify DNS: `dig +short zitadel.dev.emergent-company.ai`

### Service Accounts Invalid

**Symptoms:**
```
401 Unauthorized when calling Zitadel API
```

**Solutions:**
1. Check credentials in `.env` match `secrets-dev/service-accounts.json`
2. Verify service accounts exist in Zitadel Console
3. Re-run service account setup: `./scripts/setup-zitadel-service-accounts.sh`

### Local App Won't Start

**Symptoms:**
```
Error: Cannot connect to database
```

**Solutions:**
1. Verify `.env` file exists: `ls -la .env`
2. Check environment loaded: `grep DATABASE_URL .env`
3. Test remote connectivity: `./scripts/verify-remote-services.sh`
4. Review logs: `nx run workspace-cli:workspace:logs`

## Switching Back to Local Dependencies

To use local Docker services instead of remote:

1. Remove or rename `.env`:
   ```bash
   mv .env .env.remote.backup
   ```

2. Start Docker dependencies:
   ```bash
   nx run workspace-cli:workspace:deps:start
   ```

3. Start application:
   ```bash
   nx run workspace-cli:workspace:start
   ```

## Security Notes

**For Development Use Only:**
- Remote database uses default password "spec"
- Ports 5432 and 8100 are publicly accessible
- No SSL/TLS encryption on connections

**Before Production:**
- Change all default passwords
- Enable SSL/TLS for PostgreSQL
- Use SSH tunneling for remote access
- Configure proper firewall rules (IP whitelist)
- Rotate service account credentials

## Files Reference

- `.env.remote` - Remote environment template
- `scripts/verify-remote-services.sh` - Connectivity test script
- `secrets-dev/config.env` - Zitadel org/project IDs
- `secrets-dev/DATABASE_CONNECTION.md` - Database connection guide
- `COOLIFY_DEV_SETUP.md` - Remote server setup documentation

## Next Steps

1. **Verify connectivity**: Run `./scripts/verify-remote-services.sh`
2. **Configure OAuth**: Create OAuth applications in Zitadel Console
3. **Test authentication**: Log in via admin UI
4. **Run migrations**: Apply any pending database migrations
5. **Develop features**: Start building with remote services backing

## Support

If you encounter issues not covered here, see:
- `COOLIFY_DEV_SETUP.md` - Server setup details
- `secrets-dev/DATABASE_CONNECTION.md` - Database troubleshooting
- Workspace CLI logs: `nx run workspace-cli:workspace:logs`
- Remote service logs: `ssh root@94.130.12.194 'cd /data/coolify/applications/nw0wokswsooooo4g0c0ggok4 && docker-compose logs'`
