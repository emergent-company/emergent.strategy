# Coolify Deployment Guide

## Overview

This guide covers deploying the Spec Server application to Coolify, a self-hosted platform-as-a-service (PaaS). The application consists of multiple services orchestrated via Docker Compose:

- **PostgreSQL Database** (with pgvector extension)
- **Zitadel IAM** (Identity and Access Management)
- **NestJS Backend API** (server)
- **React Frontend** (admin)

## Prerequisites

- Coolify instance running and accessible
- Domain names configured for:
  - Zitadel authentication service
  - Backend API
  - Frontend application
- SSL certificates (automatically managed by Coolify/Traefik)
- Google Cloud API key (for AI/embeddings)

## Important: NODE_ENV Configuration

⚠️ **CRITICAL**: The `NODE_ENV` variable must be configured as **"Runtime Only"** in Coolify.

### Why This Matters

Both the server and admin services use multi-stage Docker builds:
- **Build Stage**: Requires `NODE_ENV=development` to install devDependencies (TypeScript, Webpack, Vite, etc.)
- **Runtime Stage**: Uses `NODE_ENV=production` for optimized execution

If `NODE_ENV=production` is set as a build-time variable, `npm ci` will skip devDependencies and the build will fail with:
```
ERROR: process '/bin/sh -c npm ci' did not complete successfully: exit code: 1
```

### Solution

In Coolify's environment variable settings:
1. Find the `NODE_ENV` variable
2. Change from "Build & Runtime" to **"Runtime Only"**
3. Save and redeploy

This allows:
- ✅ Dockerfile's `ENV NODE_ENV=development` to work during build
- ✅ `NODE_ENV=production` to be set at runtime
- ✅ DevDependencies to install correctly
- ✅ TypeScript/Vite builds to succeed

## Required Environment Variables

### Database Configuration

```bash
# PostgreSQL Main Database
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER=spec
POSTGRES_PASSWORD=<secure-password>
POSTGRES_DB=spec
```

### Zitadel Authentication

```bash
# Zitadel Domain Configuration
ZITADEL_DOMAIN=auth.yourdomain.com
ZITADEL_ISSUER=https://auth.yourdomain.com
ZITADEL_INTROSPECTION_URL=https://auth.yourdomain.com/oauth/v2/introspect

# Zitadel Initial Admin Setup (used only on first deployment)
ZITADEL_ORG_NAME="Your Organization"
ZITADEL_ADMIN_USERNAME=admin@yourdomain.com
ZITADEL_ADMIN_PASSWORD=<secure-password>
ZITADEL_ADMIN_FIRSTNAME=Admin
ZITADEL_ADMIN_LASTNAME=User
ZITADEL_MASTERKEY=<32-character-master-key>

# Zitadel Client Configuration (get these after first deployment)
ZITADEL_CLIENT_ID=<client-id-from-zitadel>
ZITADEL_CLIENT_SECRET=<client-secret-from-zitadel>
ZITADEL_MAIN_ORG_ID=<org-id-from-zitadel>
```

### Backend API Configuration

```bash
# Server Runtime Configuration
PORT=3002
NODE_ENV=production  # ⚠️ Set as "Runtime Only" in Coolify
DB_AUTOINIT=true

# Google AI/Embeddings
GOOGLE_API_KEY=<your-google-api-key>
EMBEDDING_DIMENSION=1536

# CORS Configuration
CORS_ORIGIN=https://app.yourdomain.com

# Optional Features
ORGS_DEMO_SEED=false
CHAT_ENABLE_MCP=1

# Integration Security
INTEGRATION_ENCRYPTION_KEY=<32-character-encryption-key>
```

### Frontend Configuration

```bash
# Frontend Build Arguments (set as Build & Runtime)
VITE_API_URL=https://api.yourdomain.com
VITE_ZITADEL_ISSUER=https://auth.yourdomain.com
VITE_ZITADEL_CLIENT_ID=<client-id-from-zitadel>
VITE_APP_ENV=production
```

## Deployment Steps

### 1. Initial Deployment

1. **Create New Application in Coolify:**
   - Select "Docker Compose" as deployment type
   - Connect your Git repository
   - Set build context to repository root
   - Use `docker-compose.yml` as the compose file

2. **Configure Environment Variables:**
   - Use the setup script (see below) to generate secure values
   - Copy all variables to Coolify's environment settings
   - **IMPORTANT**: Set `NODE_ENV` as "Runtime Only"
   - Set all `VITE_*` variables as "Build & Runtime"

3. **Deploy Application:**
   - Click "Deploy" in Coolify
   - Monitor build logs for any errors
   - Wait for all services to become healthy

### 2. Configure Zitadel

After first deployment, you need to configure Zitadel and update environment variables:

1. **Access Zitadel:**
   - Navigate to `https://auth.yourdomain.com`
   - Login with `ZITADEL_ADMIN_USERNAME` and `ZITADEL_ADMIN_PASSWORD`

2. **Create Application:**
   - Go to your organization
   - Create new "Web Application"
   - Configure redirect URIs:
     - `https://app.yourdomain.com/callback`
     - `https://app.yourdomain.com`
   - Save and note the Client ID and Client Secret

3. **Get Organization ID:**
   - Navigate to your organization settings
   - Copy the Organization ID

4. **Update Coolify Environment Variables:**
   ```bash
   ZITADEL_CLIENT_ID=<client-id-from-step-2>
   ZITADEL_CLIENT_SECRET=<client-secret-from-step-2>
   ZITADEL_MAIN_ORG_ID=<org-id-from-step-3>
   ```

5. **Redeploy Application:**
   - Redeploy in Coolify to apply new variables
   - Backend and frontend will now authenticate correctly

### 3. Verify Deployment

Check that all services are healthy:

```bash
# Check service health
curl https://api.yourdomain.com/health
curl https://app.yourdomain.com/health
curl https://auth.yourdomain.com/debug/ready

# Check backend API
curl https://api.yourdomain.com/api/health

# Test authentication flow
# Navigate to https://app.yourdomain.com and login
```

## Using the Setup Script

A setup script is provided to generate secure credentials and configure environment variables:

```bash
# Run the setup script
./scripts/setup-coolify.sh

# Follow the prompts to:
# 1. Enter your domain names
# 2. Generate secure passwords and keys
# 3. Get a complete .env file for Coolify
```

The script will:
- Generate secure random passwords for databases
- Create 32-character encryption and master keys
- Validate domain formats
- Create a complete environment configuration
- Provide instructions for Coolify setup

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Coolify/Traefik                       │
│                    (Reverse Proxy + SSL)                     │
└────┬─────────────────────┬──────────────────────┬───────────┘
     │                     │                      │
     │                     │                      │
┌────▼─────┐         ┌────▼─────┐         ┌─────▼──────┐
│  Admin   │         │  Server  │         │  Zitadel   │
│ (Nginx)  │◄───────►│ (NestJS) │◄───────►│   (IAM)    │
│ Port 3000│         │ Port 3002│         │ Port 8080  │
└──────────┘         └────┬─────┘         └─────┬──────┘
                          │                     │
                          │                     │
                     ┌────▼─────┐         ┌────▼──────┐
                     │    DB    │         │ Zitadel   │
                     │(Postgres)│         │    DB     │
                     │Port 5432 │         │(Postgres) │
                     └──────────┘         └───────────┘
```

## Multi-Stage Docker Builds

### Server (NestJS)

```dockerfile
# Build stage - NODE_ENV=development
FROM node:20-alpine AS builder
ENV NODE_ENV=development
RUN npm ci                    # Installs ALL dependencies
RUN npm run build             # Compiles TypeScript

# Runtime stage - NODE_ENV=production
FROM node:20-alpine
ENV NODE_ENV=production       # ⚠️ Coolify overrides this
COPY --from=builder /build/dist ./dist
CMD ["node", "dist/main.js"]
```

### Admin (React + Vite)

```dockerfile
# Build stage - NODE_ENV=development
FROM node:20-alpine AS builder
ENV NODE_ENV=development
ARG VITE_API_URL              # Build-time variables
RUN npm ci                    # Installs ALL dependencies
RUN npm run build             # Compiles with Vite

# Runtime stage - Nginx
FROM nginx:alpine
COPY --from=builder /build/dist /usr/share/nginx/html
CMD ["nginx", "-g", "daemon off;"]
```

## Troubleshooting

### Build Fails with "npm ci did not complete successfully"

**Symptom:**
```
ERROR: process '/bin/sh -c npm ci' did not complete successfully: exit code: 1
```

**Cause:** `NODE_ENV=production` set as build-time variable, skipping devDependencies.

**Solution:**
1. In Coolify, find `NODE_ENV` variable
2. Change to "Runtime Only"
3. Redeploy

### Services Not Starting / Health Checks Failing

**Symptom:** Services show as unhealthy in Coolify.

**Solution:**
1. Check logs: `docker logs <container-name>`
2. Verify environment variables are set correctly
3. Ensure Zitadel is fully initialized before backend starts
4. Check database connectivity
5. Verify domain DNS records point to Coolify

### Zitadel Database Authentication Failures

**Symptom:** Zitadel container repeatedly logs:
```
level=fatal msg="unable to initialize ZITADEL" error="failed to connect to `user=zitadel database=zitadel`: failed SASL auth: FATAL: password authentication failed for user \"zitadel\""
```

Or you see:
```
ERROR:  role "zitadel" already exists
FATAL:  password authentication failed for user "zitadel"
DETAIL:  User "zitadel" has no password assigned.
```

**Causes:**
- `ZITADEL_DB_PASSWORD` environment variable not set or incorrect
- Zitadel user exists from previous deployment but has no password assigned
- Database volumes persist between deployments with different passwords

**Solution:**

The init script (`docker/01-init-zitadel.sh`) now automatically handles existing users:
- If user doesn't exist: creates it with password
- If user exists: updates the password (using `ALTER ROLE`)

**To apply the fix:**

1. **Ensure password is set in environment:**
   ```bash
   # In Coolify environment variables or .env file
   ZITADEL_DB_PASSWORD=your-secure-password
   ```

2. **Restart the database service to run init scripts:**
   ```bash
   docker-compose restart db
   ```
   
   The init script will see the existing user and update its password.

3. **Then restart Zitadel:**
   ```bash
   docker-compose restart zitadel
   ```

4. **If still failing, manually set the password:**
   ```bash
   # Connect to postgres
   docker exec -it <postgres-container> psql -U spec -d spec
   
   # Update password
   ALTER USER zitadel WITH LOGIN PASSWORD 'your-password-here';
   ```

**For fresh deployment (no existing volumes):**
- Simply set `ZITADEL_DB_PASSWORD` before first `docker-compose up`
- Init script will create everything correctly

**Prevention:**
- Always set `ZITADEL_DB_PASSWORD` in environment variables
- The init script now handles both new and existing user scenarios
- Database healthcheck waits for both `spec` and `zitadel` databases to be ready

### Authentication Not Working

**Symptom:** Login redirects fail or show "unauthorized" errors.

**Causes:**
- Incorrect `ZITADEL_CLIENT_ID` or `ZITADEL_CLIENT_SECRET`
- Redirect URIs not configured in Zitadel
- `ZITADEL_MAIN_ORG_ID` not set or incorrect

**Solution:**
1. Verify Zitadel application configuration
2. Check redirect URIs match your domain
3. Update environment variables with correct IDs
4. Redeploy

### Database Migration Issues

**Symptom:** Backend crashes with database schema errors.

**Solution:**
1. Check `DB_AUTOINIT=true` is set (enables automatic migrations)
2. Review backend logs for migration errors
3. Manually run migrations if needed:
   ```bash
   docker exec <server-container> npm run migration:run
   ```

### Frontend Shows "Cannot connect to API"

**Symptom:** Admin UI loads but shows connection errors.

**Causes:**
- `VITE_API_URL` incorrect or not set
- CORS not configured correctly
- Backend not accessible from frontend

**Solution:**
1. Verify `VITE_API_URL` points to backend domain
2. Check `CORS_ORIGIN` includes frontend domain
3. Test backend directly: `curl https://api.yourdomain.com/health`
4. Rebuild frontend with correct `VITE_API_URL`

## Security Considerations

### Required Security Configuration

1. **Strong Passwords:**
   - Generate secure passwords for all database credentials
   - Use `openssl rand -base64 32` or similar

2. **Encryption Keys:**
   - `INTEGRATION_ENCRYPTION_KEY`: Must be exactly 32 characters
   - `ZITADEL_MASTERKEY`: Must be exactly 32 characters
   - Store securely, never commit to Git

3. **CORS Configuration:**
   - Set `CORS_ORIGIN` to your frontend domain only
   - Never use `*` in production

4. **Environment Variables:**
   - Mark sensitive variables as "Encrypted" in Coolify
   - Use "Runtime Only" for `NODE_ENV`
   - Use "Build & Runtime" for `VITE_*` variables

5. **SSL/TLS:**
   - Coolify automatically manages certificates via Traefik
   - Ensure all domains use HTTPS
   - Set `ZITADEL_EXTERNALSECURE=true`

### Best Practices

- Rotate passwords and keys regularly
- Monitor logs for suspicious activity
- Keep Docker images updated
- Enable Coolify's automatic deployment on Git push
- Use separate environments for staging and production
- Backup database volumes regularly

## Monitoring and Logging

### View Logs in Coolify

1. Navigate to your application
2. Click on individual services
3. View real-time logs

### Log Configuration

All services use JSON logging with rotation:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "20m"
    max-file: "5"
```

### Health Checks

All services have health checks configured:
- **Database**: `pg_isready` every 5s
- **Zitadel**: `/debug/ready` every 15s
- **Backend**: `/health` endpoint every 10s
- **Frontend**: `/health` endpoint every 10s

## Backup and Recovery

### Database Backup

```bash
# Backup main database
docker exec <postgres-container> pg_dump -U spec spec > backup.sql

# Backup Zitadel database
docker exec <zitadel-db-container> pg_dump -U postgres zitadel > zitadel-backup.sql
```

### Restore Database

```bash
# Restore main database
cat backup.sql | docker exec -i <postgres-container> psql -U spec spec

# Restore Zitadel database
cat zitadel-backup.sql | docker exec -i <zitadel-db-container> psql -U postgres zitadel
```

### Volume Backup

Coolify stores data in Docker volumes:
- `postgres-data`: Main application database
- `zitadel-db-data`: Zitadel IAM database

Configure regular volume backups in Coolify settings.

## Scaling Considerations

### Current Architecture
- Single instance of each service
- Suitable for small to medium deployments
- All services on same Coolify instance

### Scaling Options

1. **Horizontal Scaling:**
   - Multiple server instances behind load balancer
   - Session persistence required (sticky sessions or Redis)
   - Database connection pooling

2. **Database Scaling:**
   - PostgreSQL read replicas
   - Connection pooling (PgBouncer)
   - Separate database server

3. **Zitadel Scaling:**
   - Multiple Zitadel instances
   - Shared database with connection pooling
   - External database recommended for production

## Related Documentation

- [Environment Variables Required](./ENV_VARIABLES_REQUIRED.md)
- [Database Migrations](./DATABASE_MIGRATIONS.md)
- [Security Scopes](../SECURITY_SCOPES.md)
- [Coolify Deployment Ready](../COOLIFY_DEPLOYMENT_READY.md)

## Support

For issues with:
- **Coolify**: Check Coolify documentation and community
- **Application**: Review application logs and documentation
- **Zitadel**: Consult Zitadel documentation
- **Docker**: Docker documentation and compose references

## Quick Reference

| Service | Port | Health Check | Logs Location |
|---------|------|--------------|---------------|
| PostgreSQL | 5432 | `pg_isready` | N/A (internal) |
| Zitadel DB | 5432 | `pg_isready` | N/A (internal) |
| Zitadel | 8080 | `/debug/ready` | Coolify UI |
| Backend | 3002 | `/health` | Coolify UI |
| Frontend | 3000 | `/health` | Coolify UI |

| Environment Variable | Type | Required | Default |
|---------------------|------|----------|---------|
| NODE_ENV | Runtime Only | Yes | production |
| POSTGRES_PASSWORD | Runtime | Yes | (none) |
| GOOGLE_API_KEY | Runtime | Yes | (none) |
| ZITADEL_CLIENT_ID | Runtime | Yes | (none) |
| VITE_API_URL | Build & Runtime | Yes | (none) |
| DB_AUTOINIT | Runtime | No | true |

---

**Last Updated:** October 31, 2025  
**Coolify Version:** Latest  
**Application Version:** See package.json
