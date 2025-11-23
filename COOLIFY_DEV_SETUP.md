# Coolify Dev Environment Setup Guide

Complete guide for setting up the Spec Server development environment on Coolify with Zitadel authentication.

## Prerequisites

- Server with Docker and Coolify installed
- DNS configured (wildcard `*.dev.emergent-company.ai` → server IP)
- SSH access to server

## 1. Initial Docker Compose Configuration

### Important Coolify Path Quirk

Coolify's docker-compose generation creates unusual paths with `./` in volume mounts:
```yaml
# Coolify generates:
/data/coolify/applications/<app-id>./secrets/bootstrap:/machinekey

# Note the ./ between app-id and /secrets - this is a Coolify quirk!
```

When accessing files on the server, use the path WITH the `./`:
```bash
/data/coolify/applications/nw0wokswsooooo4g0c0ggok4./secrets/bootstrap/pat.txt
```

### Database Service Configuration

The database should be configured with:

1. **Port Exposure**: Make PostgreSQL accessible externally
```yaml
ports:
  - ${POSTGRES_PORT:-5432}:5432
```

2. **Firewall Rules**: Open required ports on the server
```bash
ufw allow 5432/tcp  # PostgreSQL
ufw allow 8100/tcp  # Zitadel API
```

To apply firewall rules:
```bash
ssh root@<SERVER_IP> 'bash -s' < scripts/setup-dev-firewall.sh
```

### Zitadel Service Configuration

1. **Network Mode**: Login UI shares Zitadel's network
```yaml
login:
  network_mode: service:zitadel
```

2. **PAT File Location**: Login container needs PAT in Docker volume
```yaml
volumes:
  - nw0wokswsooooo4g0c0ggok4_:/current-dir:delegated
```

The PAT file must be copied to the Docker volume:
```bash
# PAT auto-generated at:
/data/coolify/applications/<app-id>./secrets/bootstrap/pat.txt

# Copy to Docker volume for login container:
cp /data/coolify/applications/<app-id>./secrets/bootstrap/pat.txt \
   /var/lib/docker/volumes/<volume-name>_/_data/login-client.pat

# Restart login container:
docker compose restart login
```

## 2. DNS Configuration

Set up wildcard DNS record:
```
*.dev.emergent-company.ai → <SERVER_IP>
```

This creates:
- `zitadel.dev.emergent-company.ai` → Zitadel API
- `login.zitadel.dev.emergent-company.ai` → Login UI
- `db.dev.emergent-company.ai` → PostgreSQL

Verify DNS:
```bash
./scripts/verify-dev-services.sh
```

## 3. Remote Bootstrap (Zitadel Configuration)

Bootstrap Zitadel remotely via Management API (no direct server file access needed):

```bash
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai \
  ./scripts/bootstrap-remote-zitadel.sh
```

This script:
1. Retrieves auto-generated PAT from server
2. Creates organization via API
3. Creates project via API
4. Saves configuration to `secrets-dev/config.env`

### Important Notes:

- **Domain Required**: Zitadel requires domain-based access (not IP) due to `ExternalDomain` config
- **PAT Location**: Auto-generated at `/data/coolify/applications/<app-id>./secrets/bootstrap/pat.txt`
- **Coolify Path**: Note the `./` quirk in the path

## 4. Login Container Setup

After bootstrap, provision the login container:

```bash
# Copy PAT to Docker volume
ssh root@<SERVER_IP> 'cp /data/coolify/applications/<app-id>./secrets/bootstrap/pat.txt \
  /var/lib/docker/volumes/<volume-name>_/_data/login-client.pat'

# Restart login container
ssh root@<SERVER_IP> 'cd /data/coolify/applications/<app-id> && docker compose restart login'

# Wait 20-30 seconds for health check
ssh root@<SERVER_IP> 'cd /data/coolify/applications/<app-id> && docker compose ps login'
```

## 5. Coolify Environment Variables

After bootstrap, add these to Coolify deployment:

```bash
ZITADEL_ORG_ID=<org-id-from-bootstrap>
ZITADEL_PROJECT_ID=<project-id-from-bootstrap>
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai
ZITADEL_URL=http://zitadel.dev.emergent-company.ai:8100
```

Values are saved in `secrets-dev/config.env` after bootstrap.

## 6. External Database Access

### Connection Details
- **Host**: `<SERVER_IP>` or `db.dev.emergent-company.ai`
- **Port**: `5432`
- **Username**: `spec`
- **Password**: `spec`
- **Database**: `zitadel`

### Connection String
```
postgresql://spec:spec@<SERVER_IP>:5432/zitadel
```

### Test Connection
```bash
PGPASSWORD=spec psql -h <SERVER_IP> -U spec -d zitadel -c "SELECT version();"
```

See `secrets-dev/DATABASE_CONNECTION.md` for detailed connection guide.

## 7. Firewall Setup

Run on remote server:
```bash
# Via SSH
ssh root@<SERVER_IP> 'bash -s' < scripts/setup-dev-firewall.sh

# Or directly on server
bash scripts/setup-dev-firewall.sh
```

Opens ports:
- 5432/tcp (PostgreSQL)
- 8100/tcp (Zitadel API)

## 8. Verification

Run complete verification:
```bash
./scripts/verify-dev-services.sh
```

Should show:
- ✅ DNS resolution for all domains
- ✅ PostgreSQL port 5432 accessible
- ✅ Zitadel API port 8100 accessible
- ✅ All containers healthy

## Troubleshooting

### Login Container Unhealthy

Check if PAT file is present:
```bash
ssh root@<SERVER_IP> 'docker exec <login-container> ls -la /current-dir/'
```

If missing, copy PAT to Docker volume (see step 4).

### Database Connection Refused

Verify firewall rules:
```bash
ssh root@<SERVER_IP> 'ufw status | grep 5432'
```

If not present, run firewall setup script.

### Zitadel API 404 Errors

Ensure using domain (not IP) for API calls:
```bash
# ❌ Wrong
curl http://<SERVER_IP>:8100/management/v1/orgs

# ✅ Correct
curl http://zitadel.dev.emergent-company.ai:8100/management/v1/orgs
```

## Quick Reference

```bash
# Verify all services
./scripts/verify-dev-services.sh

# Bootstrap Zitadel remotely
ZITADEL_DOMAIN=zitadel.dev.emergent-company.ai ./scripts/bootstrap-remote-zitadel.sh

# Setup firewall (run on server)
ssh root@<SERVER_IP> 'bash -s' < scripts/setup-dev-firewall.sh

# Test database connection
PGPASSWORD=spec psql -h <SERVER_IP> -U spec -d zitadel

# Check container status
ssh root@<SERVER_IP> 'cd /data/coolify/applications/<app-id> && docker compose ps'

# View logs
ssh root@<SERVER_IP> 'cd /data/coolify/applications/<app-id> && docker compose logs -f'
```

## Files Generated

After setup, these files contain your configuration:

- `secrets-dev/config.env` - Org/Project IDs for Coolify
- `secrets-dev/BOOTSTRAP_SUMMARY.md` - Complete setup summary
- `secrets-dev/VERIFICATION_COMPLETE.md` - Service verification status
- `secrets-dev/DATABASE_CONNECTION.md` - Database connection guide

---

**Last Updated**: November 22, 2025
