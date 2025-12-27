# Deployment Guide

## Overview

This guide explains how to deploy the Spec Server application using Docker Compose. The deployment is fully portable with **zero host path dependencies** - you only need Docker, docker-compose, and environment variables.

## Architecture

The application consists of:

- **PostgreSQL** (with pgvector extension) - Database
- **Zitadel** - Identity Provider (OAuth/OIDC)
- **Zitadel Login UI** - Custom login interface
- **NestJS Server** - Backend API
- **React Admin** - Frontend UI

## Prerequisites

1. **Docker** and **docker-compose** installed
2. **Infisical credentials** (optional but recommended) OR direct environment variables
3. **Domain names** configured (for production)

## Deployment Flow

The deployment follows a **three-phase bootstrap pattern**:

### Phase 1: Start Services (Zero Configuration)

```bash
# Use docker-compose.dev.yml for local development
docker-compose -f docker-compose.dev.yml up -d

# Use docker-compose.staging.yml for production/staging
docker-compose -f docker-compose.staging.yml up -d
```

**What happens automatically:**

- ✅ PostgreSQL starts and creates extensions (vector, pgcrypto)
- ✅ PostgreSQL creates Zitadel database and user
- ✅ Zitadel starts and creates bootstrap PAT (Personal Access Token)
- ✅ Server starts and runs database migrations (`DB_AUTOINIT=true`)
- ✅ Admin UI starts and serves frontend
- ⚠️ Server cannot authenticate with Zitadel yet (no service account)
- ⚠️ Users cannot login yet (no OAuth app configured)

### Phase 2: Bootstrap Configuration

```bash
# Wait for Zitadel to be fully ready
docker-compose exec zitadel /app/zitadel ready

# Run bootstrap script to configure Zitadel
./scripts/bootstrap-zitadel-fully-automated.sh provision
```

**What the bootstrap script does:**

1. Reads PAT from Zitadel container (auto-generated in Phase 1)
2. Creates organization and project in Zitadel
3. Creates OAuth application for frontend authentication
4. Creates two service accounts:
   - **CLIENT** - For token introspection (validates user tokens)
   - **API** - For Management API calls (user/org management)
5. Generates JWT keys for service accounts
6. Saves service account keys to `./secrets/` directory
7. Prints environment variables to configure

### Phase 3: Update Configuration and Restart

**Option A: Using Infisical (Recommended)**

```bash
# Store service account in Infisical
infisical secrets set ZITADEL_CLIENT_JWT "$(cat ./secrets/zitadel-client-service-account.json)"
infisical secrets set ZITADEL_FRONTEND_CLIENT_ID "<oauth-client-id-from-bootstrap>"
infisical secrets set ZITADEL_SERVICE_CLIENT_ID "<service-account-id>"
infisical secrets set ZITADEL_MAIN_ORG_ID "<org-id>"
infisical secrets set ZITADEL_PROJECT_ID "<project-id>"

# Restart services to load new secrets
docker-compose restart server admin
```

**Option B: Using Direct Environment Variables**

Add to `.env` or deployment environment:

```bash
ZITADEL_CLIENT_JWT={"userId":"...","keyId":"...","key":"..."}
ZITADEL_FRONTEND_CLIENT_ID=<oauth-client-id>
ZITADEL_SERVICE_CLIENT_ID=<service-account-id>
ZITADEL_MAIN_ORG_ID=<org-id>
ZITADEL_PROJECT_ID=<project-id>
```

Then restart:

```bash
docker-compose restart server admin
```

**System is now fully operational!**

- ✅ Server can authenticate with Zitadel Management API
- ✅ Users can login via OAuth
- ✅ All features enabled

## Key Improvements (No Host Path Dependencies!)

### 1. Database Init Scripts - Embedded in Image

**Old approach:** Mount `./docker/init.sql` from host
**New approach:** Embedded in custom `Dockerfile.postgres`

```dockerfile
FROM pgvector/pgvector:pg16
COPY init.sql /docker-entrypoint-initdb.d/00-init.sql
COPY 01-init-zitadel.sh /docker-entrypoint-initdb.d/01-init-zitadel.sh
```

### 2. Zitadel PAT Storage - Docker Volume

**Old approach:** Mount `./secrets/bootstrap` from host
**New approach:** Docker-managed volume

```yaml
zitadel:
  volumes:
    - zitadel_machinekey:/machinekey

volumes:
  zitadel_machinekey:
```

**Access PAT:** `docker-compose exec -T zitadel cat /machinekey/pat.txt`

### 3. Service Account JSON - Environment Variable

**Old approach:** Mount `/home/spec-server/zitadel-service-account.json` from host
**New approach:** Pass as environment variable

```yaml
server:
  environment:
    ZITADEL_CLIENT_JWT: ${ZITADEL_CLIENT_JWT} # Full JSON in env var
```

Server code automatically:

1. Checks `ZITADEL_CLIENT_JWT` env var first
2. Falls back to `ZITADEL_CLIENT_JWT_PATH` if file mount needed

## Environment Variables

### Required for All Deployments

```bash
# PostgreSQL
POSTGRES_USER=spec
POSTGRES_PASSWORD=<secure-password>
POSTGRES_DB=spec
ZITADEL_DB_PASSWORD=<secure-password>

# Zitadel
ZITADEL_MASTERKEY=<exactly-32-characters>
ZITADEL_EXTERNALDOMAIN=auth.yourdomain.com
ZITADEL_EXTERNALSECURE=true

# Application URLs
CORS_ORIGIN=https://yourdomain.com
VITE_API_URL=https://api.yourdomain.com
VITE_ZITADEL_ISSUER=https://auth.yourdomain.com

# Google AI
GOOGLE_API_KEY=<your-api-key>

# Security
INTEGRATION_ENCRYPTION_KEY=<32-character-key>
```

### Created by Bootstrap Script (Phase 2)

These are generated by the bootstrap script and must be added after Phase 2:

```bash
ZITADEL_CLIENT_JWT=<full-json-from-bootstrap>
ZITADEL_FRONTEND_CLIENT_ID=<oauth-client-id>
ZITADEL_SERVICE_CLIENT_ID=<service-account-id>
ZITADEL_MAIN_ORG_ID=<org-id>
ZITADEL_PROJECT_ID=<project-id>
```

### Optional: Infisical Integration

```bash
INFISICAL_TOKEN=<service-token>
INFISICAL_PROJECT_ID=<project-id>
INFISICAL_ENVIRONMENT=prod  # or 'dev'
INFISICAL_API_URL=https://app.infisical.com  # or self-hosted URL
```

When Infisical is configured, secrets are fetched automatically at runtime using the Infisical CLI embedded in service images.

## Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs db
docker-compose logs zitadel
docker-compose logs server

# Verify database is healthy
docker-compose exec db pg_isready -U spec -d spec
```

### Bootstrap script can't find PAT

```bash
# Check if Zitadel created the PAT
docker-compose exec -T zitadel cat /machinekey/pat.txt

# If empty, check Zitadel logs for errors
docker-compose logs zitadel | grep -i error
```

### Server can't authenticate with Zitadel

```bash
# Verify service account JSON is set
docker-compose exec server printenv ZITADEL_CLIENT_JWT

# Check server logs
docker-compose logs server | grep -i "service account"
```

### Users can't login

```bash
# Verify OAuth app configuration
echo "Check these env vars match bootstrap output:"
echo "ZITADEL_FRONTEND_CLIENT_ID=$ZITADEL_FRONTEND_CLIENT_ID"

# Check browser console for auth errors
# Check Zitadel logs for authentication failures
docker-compose logs zitadel | grep -i "authentication"
```

## Development vs Production

### Development (`docker-compose.dev.yml`)

- Exposes ports for direct access
- Uses `localhost` domain
- Optional Infisical integration
- Includes debug logging volume for database

### Production/Staging (`docker-compose.staging.yml`)

- Uses Traefik labels for reverse proxy
- Requires proper domain names
- Recommended to use Infisical for secrets
- No debug volumes

## Security Notes

1. **Never commit secrets** to git
2. **Use Infisical** or environment variables for secrets
3. **Rotate service account keys** periodically using:
   ```bash
   ./scripts/bootstrap-zitadel-fully-automated.sh regenerate
   ```
4. **Use strong passwords** (at least 32 characters for keys)
5. **Enable TLS** in production (via Traefik or reverse proxy)

## Next Steps After Deployment

1. **Create users** in Zitadel console: `https://<zitadel-domain>/ui/console`
2. **Configure OAuth scopes** if needed
3. **Set up backups** for PostgreSQL volume
4. **Configure monitoring** (logs, metrics)
5. **Set up CI/CD** for automated deployments

## Reference

- **Bootstrap script modes:**

  - `provision` - Full setup (default)
  - `status` - Show current configuration
  - `test` - Run comprehensive tests
  - `verify` - Detailed verification
  - `regenerate` - Regenerate service account keys

- **Docker volumes:**

  - `postgres_data` - PostgreSQL database files
  - `zitadel_machinekey` - Zitadel bootstrap PAT

- **Important files:**
  - `docker-compose.dev.yml` - Development configuration
  - `docker-compose.staging.yml` - Production configuration
  - `docker/Dockerfile.postgres` - Custom PostgreSQL image
  - `docker/Dockerfile.zitadel` - Custom Zitadel image with Infisical CLI
  - `docker/Dockerfile.login` - Custom Login UI image with Infisical CLI
  - `scripts/bootstrap-zitadel-fully-automated.sh` - Bootstrap script
