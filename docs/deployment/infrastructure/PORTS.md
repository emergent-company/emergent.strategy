# Port Configuration Reference

This document lists all development ports used by the Spec Server project.

## Active Services

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| **PostgreSQL** | 5432 | TCP | Main database (spec_pg) |
| **Zitadel API** | 8100 | HTTP | OIDC provider API endpoint |
| **Zitadel Login v2** | 8101 | HTTP | Zitadel web UI for authentication |
| **NestJS Backend** | 3001 | HTTP | Main API server |
| **Admin Frontend (Vite)** | 5175 | HTTP | React admin dashboard |

## Port History

### Migration 2025-01-09

**Changed:** Zitadel ports moved from 8080/3000 to 8100/8101

**Reason:** Avoid conflicts with common development services
- Port 8080 is heavily used by various dev servers and proxies
- Port 3000 is the default for many Node.js/React apps
- Moving to 8100+ range reduces likelihood of conflicts

**Files Updated:**
- `docker/docker-compose.yml` - Port mappings
- `docker/zitadel.env` - Login v2 base URIs
- `apps/admin/.env` - Vite Zitadel issuer
- `apps/server/.env` - Backend auth configuration
- `.env` (root) - Shared environment variables
- `RUNBOOK.md` - Documentation
- `apps/admin/README.md` - Admin app guide

## Port Usage Guidelines

### Reserved Ranges
- **5000-5999**: Frontend dev servers (Vite, webpack-dev-server, etc.)
- **3000-3999**: Backend API servers (NestJS, Express, etc.)
- **8000-8999**: Infrastructure services (auth, monitoring, proxies)

### Adding New Services
When adding a new service to docker-compose.yml or starting a dev server:

1. Check current port usage: `lsof -iTCP -sTCP:LISTEN -P`
2. Choose a port in the appropriate range
3. Document it in this file
4. Update relevant .env files and documentation

### Common Port Conflicts

If you see "port already in use" errors:

```bash
# Find what's using a port
lsof -ti:8100

# Kill process if needed
kill $(lsof -ti:8100)

# Or restart Docker services
cd docker && docker compose down && docker compose up -d
```

## Environment Variable Reference

### Zitadel Configuration

All Zitadel-related variables should use ports 8100/8101:

```bash
# API/OIDC Issuer
ZITADEL_ISSUER=http://localhost:8100
AUTH_ISSUER=http://localhost:8100
AUTH_JWKS_URI=http://localhost:8100/oauth/v2/keys
VITE_ZITADEL_ISSUER=http://localhost:8100

# Login v2 UI
ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_BASEURI=http://localhost:8101/ui/v2/login
ZITADEL_OIDC_DEFAULTLOGINURLV2=http://localhost:8101/ui/v2/login/login?authRequest=
ZITADEL_OIDC_DEFAULTLOGOUTURLV2=http://localhost:8101/ui/v2/login/logout?post_logout_redirect=
```

### Quick Access URLs

```bash
# Zitadel OIDC configuration
open http://localhost:8100/.well-known/openid-configuration

# Zitadel Login UI
open http://localhost:8101/ui/v2/login

# Admin dashboard
open http://localhost:5175

# Backend API health check
curl http://localhost:3001/health

# PostgreSQL connection
psql -h localhost -p 5432 -U spec -d spec
```

## Troubleshooting

### Service Won't Start
1. Check if port is already in use: `lsof -ti:<port>`
2. Review docker-compose logs: `docker compose -f docker/docker-compose.yml logs <service>`
3. Ensure all .env files have consistent port configuration

### Auth Not Working
1. Verify Zitadel is running on 8100/8101: `curl http://localhost:8100/debug/ready`
2. Check browser console for CORS or connection errors
3. Confirm .env files match this document's configuration

### Database Connection Issues
1. Verify PostgreSQL is running: `docker compose -f docker/docker-compose.yml ps`
2. Test connection: `psql -h localhost -p 5432 -U spec -d spec -c "SELECT 1"`
3. Check logs: `docker compose -f docker/docker-compose.yml logs db`
