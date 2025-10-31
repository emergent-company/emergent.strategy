# Coolify Deployment Plan for spec-server-2

**Status**: Planning  
**Created**: October 31, 2025  
**Reference Project**: huma-blueprint-ui (successful Coolify deployment)

---

## Overview

This document outlines the comprehensive plan to prepare spec-server-2 for Coolify deployment. The plan is based on a successful implementation in the huma-blueprint-ui project and adapted for spec-server-2's architecture (Nx monorepo, NestJS backend, Vite/React frontend).

---

## Phase 1: Docker Infrastructure (HIGH PRIORITY)

### Task 1.1: Create Dockerfiles

**Location**: Root of each app directory

**Files to create**:
- `apps/server-nest/Dockerfile` - Backend NestJS API
- `apps/admin/Dockerfile` - Frontend Vite/React app

#### Backend Dockerfile Requirements

**Target**: `apps/server-nest/Dockerfile`

**Features**:
- Multi-stage build (builder + production)
- BuildKit cache mounts for npm (50-80% faster dependency installs)
- NODE_ENV=development for build stage (installs devDependencies needed for TypeScript, NestJS CLI)
- NODE_ENV=production for runtime stage
- Copy migrations folder from `src/common/database/migrations/`
- Include tini for proper signal handling
- Healthcheck using existing `/health` endpoint
- Expose port 3002 (configured in package.json)
- Copy and build from local package.json (not root workspace)

**Key considerations**:
- Build context is `apps/server-nest/` directory
- Must include all dependencies from package.json
- Migration files must be accessible at runtime
- Support for DB_AUTOINIT flag to run migrations on startup

#### Frontend Dockerfile Requirements

**Target**: `apps/admin/Dockerfile`

**Features**:
- Multi-stage build (builder + nginx)
- BuildKit cache mounts for npm
- Vite build with environment variables baked in at build time
- Nginx serving on configurable port (default 3000)
- SPA routing support (try_files fallback to index.html)
- Healthcheck on root path
- Dynamic port configuration via entrypoint script

**Build arguments needed**:
- `VITE_API_URL` - API endpoint URL
- `VITE_ZITADEL_ISSUER` - Auth issuer URL
- `VITE_ZITADEL_CLIENT_ID` - OAuth client ID
- `VITE_APP_ENV` - Environment (production/staging)

**Key considerations**:
- Build context is `apps/admin/` directory
- Environment variables must be set at build time (not runtime)
- Nginx configuration must support SPA routing
- Storybook can be optionally included for staging builds

### Task 1.2: Update docker-compose.yml

**Location**: `/docker-compose.yml` (root level for production)

**Strategy**:
- Keep existing `docker/docker-compose.yml` for local development
- Create new production compose file at repository root
- Use existing Zitadel configuration as reference

**Services needed**:

1. **db** (PostgreSQL with pgvector)
   - Image: `pgvector/pgvector:pg16` (already in use)
   - Expose: 5432 (internal only)
   - Healthcheck: pg_isready
   - Volume: postgres-data
   - Init script: Copy approach from `docker/init.sql`

2. **zitadel-db** (Zitadel PostgreSQL)
   - Image: `postgres:16-alpine`
   - Database: zitadel
   - Healthcheck: pg_isready
   - Volume: zitadel-db-data

3. **zitadel** (Identity Provider)
   - Image: `ghcr.io/zitadel/zitadel:latest`
   - Command: start-from-init with masterkey
   - Depends on: zitadel-db
   - Expose: 8080 (HTTP API)
   - Environment: Extensive Zitadel configuration
   - Healthcheck: `/app/zitadel ready`
   - Volume mount for service account key

4. **zitadel-login** (Optional - Zitadel v2 Login UI)
   - Image: `ghcr.io/zitadel/zitadel-login:latest`
   - Network mode: service:zitadel
   - Depends on: zitadel

5. **server** (NestJS Backend)
   - Build: `apps/server-nest/Dockerfile`
   - Expose: 3002
   - Depends on: db, zitadel
   - Healthcheck: `curl http://localhost:3002/health`
   - Environment: Database, Zitadel, Google AI config

6. **admin** (React Frontend)
   - Build: `apps/admin/Dockerfile`
   - Build args: Vite environment variables
   - Expose: 3000
   - Depends on: server, zitadel
   - Healthcheck: `curl http://localhost:3000/`

**Key changes from reference**:
- Use `expose` instead of `ports` (Coolify handles external routing)
- Remove all port mappings for production (Coolify proxy manages this)
- Add Traefik labels for Coolify routing:
  ```yaml
  labels:
    - "traefik.enable=true"
    - "traefik.http.services.server.loadbalancer.server.port=3002"
  ```
- Configure proper service dependencies with health conditions
- Add logging configuration for Coolify log aggregation

**Volume strategy**:
- `postgres-data`: Main database persistence
- `zitadel-db-data`: Zitadel database persistence
- Logs: Optional volume for centralized logging

---

## Phase 2: Environment Configuration (HIGH PRIORITY)

### Task 2.1: Create Comprehensive .env.example

**Location**: `/.env.production.example`

**Required sections**:

```bash
# ============================================================================
# Spec Server 2 - Production Environment Configuration
# ============================================================================
# Copy this file to .env.production and fill in actual values
# Never commit .env.production to version control
# ============================================================================

# ----------------------------------------------------------------------------
# Database Configuration (PostgreSQL with pgvector)
# ----------------------------------------------------------------------------
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER=spec
POSTGRES_PASSWORD=<generate-secure-password>
POSTGRES_DB=spec

# E2E Testing Database (optional, for test environments)
PGDATABASE_E2E=spec_e2e

# Legacy variables (if needed by any scripts)
PGHOST=${POSTGRES_HOST}
PGPORT=${POSTGRES_PORT}
PGUSER=${POSTGRES_USER}
PGPASSWORD=${POSTGRES_PASSWORD}
PGDATABASE=${POSTGRES_DB}

# ----------------------------------------------------------------------------
# Google AI Configuration
# ----------------------------------------------------------------------------
# Get your key from: https://makersuite.google.com/app/apikey
GOOGLE_API_KEY=<your-google-api-key>

# Embedding dimension for vector search (default: 1536)
# Supported: 128, 384, 768, 1536 (recommended), 3072
# Note: Changing requires database migration
EMBEDDING_DIMENSION=1536

# ----------------------------------------------------------------------------
# Server Configuration
# ----------------------------------------------------------------------------
PORT=3002
NODE_ENV=production

# Database auto-initialization (run migrations on startup)
DB_AUTOINIT=true

# Demo organization seed data (disable for production)
ORGS_DEMO_SEED=false

# ----------------------------------------------------------------------------
# Zitadel Authentication
# ----------------------------------------------------------------------------
# Your Zitadel domain (without https://)
ZITADEL_DOMAIN=<your-zitadel-domain>

# Full issuer URL
ZITADEL_ISSUER=https://${ZITADEL_DOMAIN}

# Token introspection endpoint
ZITADEL_INTROSPECTION_URL=https://${ZITADEL_DOMAIN}/oauth/v2/introspect

# Backend API OAuth Client (JWT Profile)
ZITADEL_CLIENT_ID=<your-backend-client-id>
ZITADEL_CLIENT_SECRET=<your-backend-client-secret-jwt>

# Zitadel Organization ID
ZITADEL_MAIN_ORG_ID=<your-organization-id>

# Cache configuration for token introspection
INTROSPECTION_CACHE_TTL=300
CACHE_CLEANUP_INTERVAL=900

# ----------------------------------------------------------------------------
# Frontend Build Configuration
# ----------------------------------------------------------------------------
# ⚠️  These are BAKED INTO the frontend build at build time
# Changing these requires rebuilding the frontend image

# API endpoint URL (publicly accessible)
VITE_API_URL=https://<your-api-domain>

# Zitadel issuer for frontend OAuth
VITE_ZITADEL_ISSUER=https://${ZITADEL_DOMAIN}

# Frontend OAuth Client ID (User Agent / PKCE)
VITE_ZITADEL_CLIENT_ID=<your-frontend-client-id>

# Application environment
VITE_APP_ENV=production

# ----------------------------------------------------------------------------
# API CORS Configuration
# ----------------------------------------------------------------------------
# Frontend origin for CORS (must match actual frontend URL)
CORS_ORIGIN=https://<your-frontend-domain>

# ----------------------------------------------------------------------------
# Zitadel First Instance Setup
# ----------------------------------------------------------------------------
# ⚠️  Only used for FIRST deployment when Zitadel initializes
# After first run, these values are ignored

ZITADEL_ORG_NAME=Your Organization
ZITADEL_ADMIN_USERNAME=admin@yourdomain.com
ZITADEL_ADMIN_PASSWORD=<generate-secure-password>
ZITADEL_ADMIN_FIRSTNAME=Admin
ZITADEL_ADMIN_LASTNAME=User

# ----------------------------------------------------------------------------
# Zitadel Database Configuration
# ----------------------------------------------------------------------------
ZITADEL_DB_USER=zitadel
ZITADEL_DB_PASSWORD=<generate-secure-password>
ZITADEL_DB_NAME=zitadel

# ----------------------------------------------------------------------------
# Zitadel Internal Configuration
# ----------------------------------------------------------------------------
# Master encryption key (exactly 32 characters)
ZITADEL_MASTERKEY=<generate-32-character-key>

# External domain configuration
ZITADEL_EXTERNALDOMAIN=${ZITADEL_DOMAIN}
ZITADEL_EXTERNALPORT=443
ZITADEL_EXTERNALSECURE=true

# ----------------------------------------------------------------------------
# Optional: Google OAuth Configuration
# ----------------------------------------------------------------------------
# If using Google OAuth integration
GCP_PROJECT_ID=<your-gcp-project-id>
GOOGLE_REDIRECT_URL=https://<your-domain>/oauth/callback

# ----------------------------------------------------------------------------
# Optional: Feature Flags
# ----------------------------------------------------------------------------
# Enable MCP (Model Context Protocol) integration for chat
CHAT_ENABLE_MCP=1
MCP_SERVER_URL=http://localhost:3001
MCP_TIMEOUT=30000
```

### Task 2.2: Create Staging Environment File

**Location**: `/.env.staging.example`

**Differences from production**:
- `NODE_ENV=staging`
- Enable mock tokens: `ALLOW_MOCK_TOKENS=true`
- Different Zitadel instance or test organization
- Potentially different database
- Enable demo seed data for testing
- Less restrictive CORS for development tools

---

## Phase 3: Docker Optimization (MEDIUM PRIORITY)

### Task 3.1: Update .dockerignore

**Location**: `/.dockerignore` (root level)

**Current file exists at root, enhance it with**:

```
# ============================================================================
# Docker Build Context Exclusions
# ============================================================================
# This file controls what gets sent to Docker build context
# Smaller context = faster builds and less cache invalidation
# ============================================================================

# ----------------------------------------------------------------------------
# Version Control
# ----------------------------------------------------------------------------
.git
.gitignore
.gitmodules
.specify/
.github/

# ----------------------------------------------------------------------------
# IDE & Editor
# ----------------------------------------------------------------------------
.vscode/
.idea/
*.swp
*.swo
*~

# ----------------------------------------------------------------------------
# Node.js
# ----------------------------------------------------------------------------
node_modules/
**/node_modules/
dist/
**/dist/
build/
**/build/
*.tsbuildinfo
**/*.tsbuildinfo
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*
.npm/
.pnpm-store/

# ----------------------------------------------------------------------------
# Testing & Coverage
# ----------------------------------------------------------------------------
coverage/
**/coverage/
.vitest/
**/.vitest/
playwright-report/
**/playwright-report/
test-results/
**/test-results/
**/*.spec.ts
**/*.test.ts
**/e2e/
**/__tests__/

# ----------------------------------------------------------------------------
# Environment & Secrets
# ----------------------------------------------------------------------------
.env
.env.*
*.local
!.env.example
!.env.production.example
!.env.staging.example
*.key
*.pem

# ----------------------------------------------------------------------------
# Logs
# ----------------------------------------------------------------------------
apps/logs/
logs/
*.log
**/*.log

# ----------------------------------------------------------------------------
# Database & Backups
# ----------------------------------------------------------------------------
*.sql
backup_*.sql
*-schema-dump.sql

# ----------------------------------------------------------------------------
# Docker
# ----------------------------------------------------------------------------
Dockerfile*
.dockerignore
docker-compose*.yml
docker/

# ----------------------------------------------------------------------------
# Build & Development Tools
# ----------------------------------------------------------------------------
.prettierrc
.prettierignore
.eslintrc*
tsconfig*.json
vitest*.config.ts
playwright.config.ts

# ----------------------------------------------------------------------------
# Documentation
# ----------------------------------------------------------------------------
docs/
*.md
!README.md

# ----------------------------------------------------------------------------
# CI/CD
# ----------------------------------------------------------------------------
.github/
.circleci/
.gitlab-ci.yml

# ----------------------------------------------------------------------------
# OS Files
# ----------------------------------------------------------------------------
.DS_Store
Thumbs.db
Desktop.ini

# ----------------------------------------------------------------------------
# Project Specific
# ----------------------------------------------------------------------------
# Reference projects (read-only, not needed in container)
reference/

# Specs and planning
specs/

# Tools and scripts (unless needed in container)
tools/
scripts/

# Backup files
backups/

# Test data
test-*.mjs
test-*.sh

# OpenAPI artifacts (regenerated)
openapi.json
openapi.yaml
openapi.diff.*.json
```

**Strategy**:
- Exclude everything not needed for runtime
- Keep only source code, package files, and migrations
- Reduce build context size for faster uploads to Coolify
- Prevent accidentally copying secrets

---

## Phase 4: Health Checks & Monitoring (MEDIUM PRIORITY)

### Task 4.1: Verify Health Endpoints

**Backend health endpoint**: ✅ Already exists at `/health`

**Location**: `apps/server-nest/src/modules/health/`

**Current implementation**:
- Controller: `health.controller.ts`
- Service: `health.service.ts`
- Module: `health.module.ts`

**Verification needed**:
1. Confirm it returns proper JSON response
2. Ensure it checks database connectivity
3. Verify it reports RLS policy status
4. Test response time (should be < 1 second)

**Expected response format**:
```json
{
  "status": "ok",
  "timestamp": "2025-10-31T12:00:00.000Z",
  "database": "connected",
  "rlsPolicies": { "count": 5 }
}
```

### Task 4.2: Add Frontend Health Check

**Requirement**: Simple health check for Nginx container

**Options**:

**Option A**: Static health file
- Create `apps/admin/public/health.txt` with content "OK"
- Nginx serves automatically
- Healthcheck: `curl http://localhost:3000/health.txt`

**Option B**: Root path check
- Healthcheck: `curl http://localhost:3000/`
- Verifies Nginx + static files working
- No additional files needed

**Recommendation**: Use Option B (simpler, tests actual app delivery)

---

## Phase 5: Deployment Scripts (MEDIUM PRIORITY)

### Task 5.1: Create Deployment Script

**Location**: `/scripts/deploy-coolify.sh`

**Purpose**: Automate Coolify deployment process

**Features**:
- Check Coolify CLI authentication
- Validate environment variables
- Get app UUID from config or environment
- Trigger deployment (build + deploy)
- Monitor deployment progress
- Show deployment logs
- Display access URLs on success

**Script structure**:
```bash
#!/bin/bash
# Coolify Deployment Script for Spec Server 2

set -e

APP_UUID="${COOLIFY_APP_UUID:-your-app-uuid-here}"
ENVIRONMENT="${DEPLOY_ENV:-preview}"

echo "🚀 Deploying spec-server-2 to Coolify..."
echo "   App UUID: $APP_UUID"
echo "   Environment: $ENVIRONMENT"

# Check authentication
if ! coolify project list > /dev/null 2>&1; then
    echo "❌ Not authenticated with Coolify"
    echo "   Run: coolify auth"
    exit 1
fi

# Get current status
echo "📋 Current application status:"
coolify app get $APP_UUID

# Trigger deployment
echo "🔨 Triggering deployment..."
coolify app deploy $APP_UUID --$ENVIRONMENT

# Follow logs
echo "📜 Following deployment logs (Ctrl+C to stop watching)..."
coolify app logs $APP_UUID --$ENVIRONMENT --follow

# Final status
echo ""
echo "🎉 Deployment initiated!"
echo ""
echo "📋 Access URLs:"
echo "   Admin UI: https://<your-admin-domain>"
echo "   API: https://<your-api-domain>"
echo "   Zitadel: https://<your-zitadel-domain>"
echo ""
echo "🔧 Management Commands:"
echo "   View logs:    coolify app logs $APP_UUID --$ENVIRONMENT --follow"
echo "   Stop:         coolify app stop $APP_UUID --$ENVIRONMENT"
echo "   Restart:      coolify app restart $APP_UUID --$ENVIRONMENT"
echo "   Status:       coolify app get $APP_UUID"
```

### Task 5.2: Create Environment Sync Script

**Location**: `/scripts/sync-coolify-env.sh`

**Purpose**: Sync environment variables to Coolify via API

**Features**:
- Read variables from `.env.production` or `.env.staging`
- Use Coolify REST API (not CLI, which has bugs)
- Handle both create and update operations
- Support preview and production environments
- Verify all required variables are set
- Exclude commented lines and empty values
- Secure handling of secrets

**Script structure**:
```bash
#!/bin/bash
# Sync environment variables to Coolify

set -e

APP_UUID="${COOLIFY_APP_UUID}"
ENV_FILE="${1:-.env.production}"
ENVIRONMENT="${2:-preview}"  # preview or production
COOLIFY_TOKEN="${COOLIFY_TOKEN}"
COOLIFY_URL="${COOLIFY_URL:-https://coolify.yourdomain.com}"

# Validate inputs
if [[ -z "$APP_UUID" ]]; then
    echo "❌ COOLIFY_APP_UUID not set"
    exit 1
fi

if [[ -z "$COOLIFY_TOKEN" ]]; then
    echo "❌ COOLIFY_TOKEN not set"
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ Environment file not found: $ENV_FILE"
    exit 1
fi

echo "🔄 Syncing environment variables to Coolify..."
echo "   File: $ENV_FILE"
echo "   Environment: $ENVIRONMENT"

# Parse and upload each variable
while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    
    # Upload via API
    curl -X POST "$COOLIFY_URL/api/v1/applications/$APP_UUID/envs" \
        -H "Authorization: Bearer $COOLIFY_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"key\":\"$key\",\"value\":\"$value\",\"is_preview\":$([ "$ENVIRONMENT" = "preview" ] && echo true || echo false)}"
    
    echo "✅ Set: $key"
done < <(grep -v '^#' "$ENV_FILE" | grep -v '^$')

echo ""
echo "🎉 Environment variables synced successfully!"
```

---

## Phase 6: Documentation (HIGH PRIORITY)

### Task 6.1: Create COOLIFY_DEPLOYMENT_READY.md

**Location**: `/COOLIFY_DEPLOYMENT_READY.md`

**Purpose**: Comprehensive deployment guide and checklist

**Sections**:

1. **Status & Metadata**
   - Current status
   - Date created/updated
   - Version information
   - Quick deploy command

2. **Prerequisites**
   - Coolify instance access
   - Coolify CLI installed
   - Zitadel configured (service account, organizations, clients)
   - Domain names configured and DNS pointing to Coolify
   - SSL certificates (handled by Coolify/Traefik)
   - Environment variables prepared

3. **Pre-Deployment Checklist**
   - [ ] All tests passing locally
   - [ ] Build succeeds for both apps
   - [ ] Environment variables configured in Coolify
   - [ ] Zitadel service account key uploaded
   - [ ] Database migration tested
   - [ ] Docker images build successfully
   - [ ] Health endpoints responding
   - [ ] Git repository accessible to Coolify

4. **Quick Start**
   ```bash
   # One-command deployment
   ./scripts/deploy-coolify.sh
   ```

5. **Detailed Deployment Steps**
   - Clone repository on Coolify
   - Configure build settings
   - Set environment variables
   - Configure domain routing
   - Trigger initial deployment
   - Monitor logs
   - Verify services

6. **Environment Variable Setup**
   - List of required variables
   - How to set via UI
   - How to set via CLI
   - How to set via API
   - Verification commands

7. **First Deployment Process**
   - Database initialization
   - Zitadel setup
   - Service account configuration
   - User creation
   - OAuth client setup

8. **Post-Deployment Verification**
   - Health check tests
   - Database connectivity
   - Zitadel authentication
   - Frontend access
   - API endpoint tests
   - End-to-end workflow test

9. **Testing After Deployment**
   ```bash
   # Health checks
   curl https://api.yourdomain.com/health
   
   # Test authentication
   curl -H "Authorization: Bearer <token>" https://api.yourdomain.com/api/...
   
   # Test frontend
   curl -I https://app.yourdomain.com
   ```

10. **Monitoring & Logs**
    - View real-time logs
    - Search logs for errors
    - Monitor resource usage
    - Check service health
    - Set up alerts

11. **Troubleshooting**
    - Common deployment issues
    - Database connection problems
    - Zitadel authentication errors
    - Build failures
    - Migration failures
    - Network/routing issues
    - Debug commands
    - How to access container logs

12. **Rollback Procedure**
    - How to roll back to previous version
    - Database backup/restore
    - Emergency procedures

13. **Production Considerations**
    - Security settings checklist
    - Performance tuning
    - Scaling strategies
    - Backup procedures
    - Monitoring setup
    - SSL/TLS configuration

14. **Coolify-Specific Notes**
    - BuildKit settings
    - Volume persistence
    - Network configuration
    - Resource limits
    - Auto-deployment triggers

15. **Reference Information**
    - Architecture diagram
    - Service ports mapping
    - Domain routing table
    - Environment variable reference
    - API endpoints list

### Task 6.2: Update README.md

**Location**: `/README.md`

**Changes to add**:

Add new section after "Changelog":

```markdown
## Production Deployment

Spec Server 2 is ready for production deployment on Coolify.

### Quick Deploy

```bash
./scripts/deploy-coolify.sh
```

### Full Documentation

See [COOLIFY_DEPLOYMENT_READY.md](./COOLIFY_DEPLOYMENT_READY.md) for:
- Complete deployment guide
- Environment variable reference
- Pre-deployment checklist
- Troubleshooting guide
- Monitoring setup

### Architecture

**Production Stack:**
- **Frontend**: React + Vite (Nginx container)
- **Backend**: NestJS (Node.js container)
- **Database**: PostgreSQL 16 with pgvector
- **Auth**: Zitadel (self-hosted IAM)
- **Deployment**: Coolify (Docker Compose)
- **Proxy**: Traefik (managed by Coolify)

**Services:**
- `admin`: Frontend UI (port 3000)
- `server`: Backend API (port 3002)
- `db`: PostgreSQL with pgvector extension
- `zitadel`: Identity provider (port 8080)
- `zitadel-db`: Zitadel PostgreSQL database

### Environment Variables

Copy `.env.production.example` to `.env.production` and configure:
- Database credentials
- Google API key
- Zitadel configuration
- Frontend build variables
- CORS settings

See [.env.production.example](./.env.production.example) for complete list.

### Local Testing

Test the Docker setup locally before deploying:

```bash
# Build images
DOCKER_BUILDKIT=1 docker compose build --parallel

# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Test health
curl http://localhost:3002/health
curl http://localhost:3000/

# Stop
docker compose down
```
```

### Task 6.3: Update RUNBOOK.md

**Location**: `/RUNBOOK.md`

**New section to add**:

```markdown
## Coolify Deployment Operations

### Deployment

**Initial deployment:**
```bash
./scripts/deploy-coolify.sh
```

**Update environment variables:**
```bash
./scripts/sync-coolify-env.sh .env.production preview
```

**Manual deployment via CLI:**
```bash
coolify app deploy <APP_UUID> --preview
```

### Monitoring

**View logs:**
```bash
# Follow all logs
coolify app logs <APP_UUID> --preview --follow

# View specific service
docker compose logs -f server

# Search for errors
coolify app logs <APP_UUID> --preview | grep ERROR
```

**Check service health:**
```bash
# Via API
curl https://api.yourdomain.com/health

# Via Coolify CLI
coolify app get <APP_UUID>
```

### Scaling

**Horizontal scaling:**
- Configure in Coolify UI: Application → Resources → Replicas
- Increase replicas for server and admin services
- Load balancing handled automatically by Traefik

**Vertical scaling:**
- Configure in Coolify UI: Application → Resources → Limits
- Adjust CPU and memory limits per service

### Backup & Restore

**Database backup:**
```bash
# SSH into Coolify server
ssh coolify@yourdomain.com

# Create backup
docker compose exec db pg_dump -U spec spec > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T db psql -U spec spec < backup_20251031.sql
```

**Zitadel backup:**
```bash
docker compose exec zitadel-db pg_dump -U postgres zitadel > zitadel_backup_$(date +%Y%m%d).sql
```

### Maintenance

**Update application:**
1. Push changes to Git repository
2. Coolify auto-deploys (if configured) or run `./scripts/deploy-coolify.sh`
3. Monitor deployment logs
4. Verify health checks pass

**Database migrations:**
- Automatic on container start if `DB_AUTOINIT=true`
- Manual: `docker compose exec server npm run migrate`

**Clear cache:**
```bash
# Rebuild without cache
coolify app deploy <APP_UUID> --preview --no-cache
```

### Troubleshooting

**Service won't start:**
```bash
# Check logs
coolify app logs <APP_UUID> --preview | tail -100

# Check service status
docker compose ps

# Restart service
docker compose restart server
```

**Database connection issues:**
```bash
# Verify database is running
docker compose ps db

# Test connection
docker compose exec server psql -h db -U spec -d spec -c "SELECT 1"
```

**Build failures:**
```bash
# Check Docker BuildKit enabled
docker buildx version

# Manual build test
docker compose build --no-cache server
```
```

---

## Phase 7: Pre-flight & Testing (LOW PRIORITY)

### Task 7.1: Create Pre-flight Check Script

**Location**: `/scripts/preflight-check.sh`

**Purpose**: Automated checks before deployment

**Checks to perform**:

```bash
#!/bin/bash
# Pre-flight checks for Coolify deployment

set -e

echo "🔍 Running pre-flight checks..."

EXIT_CODE=0

# Check 1: Required environment variables
echo ""
echo "1️⃣  Checking environment variables..."
REQUIRED_VARS=(
    "POSTGRES_PASSWORD"
    "GOOGLE_API_KEY"
    "ZITADEL_DOMAIN"
    "ZITADEL_CLIENT_ID"
    "ZITADEL_CLIENT_SECRET"
)

if [[ -f .env.production ]]; then
    source .env.production
    for var in "${REQUIRED_VARS[@]}"; do
        if [[ -z "${!var}" ]]; then
            echo "   ❌ Missing: $var"
            EXIT_CODE=1
        else
            echo "   ✅ Set: $var"
        fi
    done
else
    echo "   ⚠️  No .env.production file found"
    EXIT_CODE=1
fi

# Check 2: Docker BuildKit
echo ""
echo "2️⃣  Checking Docker BuildKit..."
if docker buildx version > /dev/null 2>&1; then
    echo "   ✅ BuildKit available"
else
    echo "   ❌ BuildKit not available"
    EXIT_CODE=1
fi

# Check 3: Coolify CLI
echo ""
echo "3️⃣  Checking Coolify CLI..."
if command -v coolify > /dev/null 2>&1; then
    echo "   ✅ Coolify CLI installed"
    if coolify project list > /dev/null 2>&1; then
        echo "   ✅ Coolify authenticated"
    else
        echo "   ❌ Coolify not authenticated"
        EXIT_CODE=1
    fi
else
    echo "   ⚠️  Coolify CLI not installed (optional)"
fi

# Check 4: Git status
echo ""
echo "4️⃣  Checking Git status..."
if git diff-index --quiet HEAD --; then
    echo "   ✅ Working directory clean"
else
    echo "   ⚠️  Uncommitted changes present"
    echo "   Consider committing before deployment"
fi

# Check 5: Build test
echo ""
echo "5️⃣  Testing builds..."
echo "   Building server..."
if npm --prefix apps/server-nest run build > /dev/null 2>&1; then
    echo "   ✅ Server build successful"
else
    echo "   ❌ Server build failed"
    EXIT_CODE=1
fi

echo "   Building admin..."
if npm --prefix apps/admin run build > /dev/null 2>&1; then
    echo "   ✅ Admin build successful"
else
    echo "   ❌ Admin build failed"
    EXIT_CODE=1
fi

# Check 6: Tests
echo ""
echo "6️⃣  Running tests..."
echo "   Server tests..."
if npm --prefix apps/server-nest run test > /dev/null 2>&1; then
    echo "   ✅ Server tests passed"
else
    echo "   ❌ Server tests failed"
    EXIT_CODE=1
fi

echo "   Admin tests..."
if npm --prefix apps/admin run test > /dev/null 2>&1; then
    echo "   ✅ Admin tests passed"
else
    echo "   ❌ Admin tests failed"
    EXIT_CODE=1
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $EXIT_CODE -eq 0 ]]; then
    echo "✅ All pre-flight checks passed!"
    echo "🚀 Ready to deploy"
else
    echo "❌ Some pre-flight checks failed"
    echo "🔧 Please fix issues before deploying"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $EXIT_CODE
```

### Task 7.2: Local Docker Testing

**Purpose**: Verify Docker setup before pushing to Coolify

**Test procedure**:

```bash
# 1. Build images with BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

docker compose build --parallel

# 2. Verify images created
docker images | grep spec-server-2

# 3. Start all services
docker compose up -d

# 4. Wait for services to be healthy
sleep 30

# 5. Check service status
docker compose ps

# 6. Test health endpoints
curl -f http://localhost:3002/health || echo "❌ Server health check failed"
curl -f http://localhost:3000/ || echo "❌ Admin health check failed"

# 7. View logs
docker compose logs --tail=50

# 8. Test database connection
docker compose exec server npm run migrate -- --list

# 9. Test API endpoint
curl http://localhost:3002/api/... || echo "⚠️  API test"

# 10. Cleanup
docker compose down -v

echo "✅ Local Docker test complete"
```

**Create test script**:

**Location**: `/scripts/test-docker-local.sh`

```bash
#!/bin/bash
# Local Docker deployment test

set -e

echo "🐳 Testing Docker deployment locally..."

# Use test environment file
if [[ ! -f .env.test.local ]]; then
    echo "❌ .env.test.local not found"
    echo "   Copy from .env.test.local.example and configure"
    exit 1
fi

# Build
echo "🔨 Building images..."
export DOCKER_BUILDKIT=1
docker compose --env-file .env.test.local build --parallel

# Start
echo "🚀 Starting services..."
docker compose --env-file .env.test.local up -d

# Wait for health
echo "⏳ Waiting for services to be healthy..."
timeout 60 bash -c 'until docker compose ps | grep -q "healthy"; do sleep 2; done' || {
    echo "❌ Services did not become healthy"
    docker compose logs
    docker compose down -v
    exit 1
}

# Test
echo "✅ Services healthy, running tests..."

# Test database
echo "   Testing database..."
docker compose exec -T db psql -U spec -d spec -c "SELECT 1" > /dev/null || {
    echo "   ❌ Database test failed"
    docker compose down -v
    exit 1
}

# Test server health
echo "   Testing server health..."
curl -f http://localhost:3002/health > /dev/null || {
    echo "   ❌ Server health check failed"
    docker compose logs server
    docker compose down -v
    exit 1
}

# Test admin
echo "   Testing admin..."
curl -f http://localhost:3000/ > /dev/null || {
    echo "   ❌ Admin health check failed"
    docker compose logs admin
    docker compose down -v
    exit 1
}

# Cleanup
echo "🧹 Cleaning up..."
docker compose down -v

echo ""
echo "✅ All Docker tests passed!"
echo "🚀 Ready for Coolify deployment"
```

---

## Phase 8: Coolify-Specific Configuration (MEDIUM PRIORITY)

### Task 8.1: Configure Coolify Application

**Steps in Coolify UI**:

1. **Create New Application**
   - Navigate to Project → New Application
   - Select "Docker Compose" as deployment type
   - Name: "spec-server-2" or similar

2. **Connect Git Repository**
   - Add Git repository URL
   - Select branch (main/master)
   - Configure deploy key or use existing credentials
   - Set auto-deploy on push (optional)

3. **Configure Build Settings**
   - Build context: Repository root
   - Dockerfile path: Leave empty (uses docker-compose.yml)
   - Enable BuildKit: ✅
   - Build arguments: None (use environment variables)

4. **Configure Domains**
   
   Map Coolify services to domains:
   
   | Service | Internal Port | Domain | Path |
   |---------|--------------|--------|------|
   | admin | 3000 | app.yourdomain.com | / |
   | server | 3002 | api.yourdomain.com | / |
   | zitadel | 8080 | auth.yourdomain.com | / |

   Settings per domain:
   - Enable SSL/TLS (Let's Encrypt)
   - Enable automatic renewal
   - Force HTTPS redirect
   - Enable HSTS (optional)

5. **Configure Volumes**
   
   Persistent volumes needed:
   
   | Volume | Mount Path | Purpose |
   |--------|-----------|---------|
   | postgres-data | /var/lib/postgresql/data | Main database |
   | zitadel-db-data | /var/lib/postgresql/data | Zitadel database |
   | logs (optional) | /app/logs | Application logs |

6. **Configure Resources**
   
   Recommended limits per service:
   
   | Service | CPU Limit | Memory Limit | Replicas |
   |---------|-----------|--------------|----------|
   | admin | 0.5 | 512MB | 1-2 |
   | server | 1.0 | 1GB | 1-3 |
   | db | 2.0 | 2GB | 1 |
   | zitadel | 1.0 | 1GB | 1 |
   | zitadel-db | 1.0 | 1GB | 1 |

7. **Configure Deployment**
   - Deployment strategy: Rolling update
   - Health check grace period: 60 seconds
   - Max startup time: 120 seconds
   - Auto-restart on failure: ✅

8. **Configure Logging**
   - Log driver: json-file
   - Max log size: 20MB
   - Max log files: 5
   - Enable compression: ✅

### Task 8.2: Configure Secrets

**Sensitive values to store in Coolify Secrets**:

**Method 1: Via Coolify UI**
1. Navigate to Application → Environment Variables
2. Toggle "Secret" for sensitive values
3. Values are encrypted at rest

**Secret variables** (mark as secret in UI):
- `POSTGRES_PASSWORD`
- `ZITADEL_CLIENT_SECRET`
- `GOOGLE_API_KEY`
- `ZITADEL_ADMIN_PASSWORD`
- `ZITADEL_MASTERKEY`
- `ZITADEL_DB_PASSWORD`
- `COOLIFY_TOKEN` (for scripts)

**Method 2: Via Coolify API**
```bash
curl -X POST "https://coolify.yourdomain.com/api/v1/applications/$APP_UUID/secrets" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "POSTGRES_PASSWORD",
    "value": "your-secure-password",
    "is_preview": true
  }'
```

**Secret Management Best Practices**:
- Never commit secrets to Git
- Use different secrets for preview/production
- Rotate secrets regularly
- Use strong random passwords (32+ characters)
- Document secret rotation procedures
- Keep backup of secrets in secure vault (1Password, etc.)

**Generate secure secrets**:
```bash
# Generate 32-character password
openssl rand -base64 32

# Generate 32-character key (for ZITADEL_MASTERKEY)
openssl rand -hex 16

# Generate UUID
uuidgen
```

---

## Phase 9: Migration & Database (HIGH PRIORITY)

### Task 9.1: Verify Migration System

**Current migration setup**:
- Location: `apps/server-nest/src/common/database/migrations/`
- Migrations run on startup if `DB_AUTOINIT=true`
- Service: `DatabaseService` handles migration execution

**Verification steps**:

1. **Review existing migrations**
   ```bash
   ls -la apps/server-nest/src/common/database/migrations/
   ```

2. **Test migration locally**
   ```bash
   # Start fresh database
   docker compose up -d db
   
   # Run migrations
   npm --prefix apps/server-nest run migrate
   
   # Verify schema
   docker compose exec db psql -U spec -d spec -c "\dt"
   ```

3. **Verify migration order**
   - Check that migrations are numbered sequentially
   - Verify no gaps in sequence
   - Check migration naming follows convention: `NNN-description.sql`

4. **Test AUTO_INIT_DB behavior**
   ```bash
   # Set in environment
   export DB_AUTOINIT=true
   
   # Start server (should run migrations)
   npm --prefix apps/server-nest run start:dev
   
   # Check logs for migration messages
   ```

5. **Document rollback procedures**
   - Create rollback migrations if needed
   - Document how to restore from backup
   - Test rollback locally

**Migration checklist for production**:
- [ ] All migrations tested locally
- [ ] Migration order verified
- [ ] Rollback procedures documented
- [ ] Backup created before first deployment
- [ ] AUTO_INIT_DB=true set for first deployment
- [ ] Migration success verified in logs

### Task 9.2: Seed Data Strategy

**Current seed scripts**:
- `scripts/seed-emergent-framework.ts`
- `scripts/seed-extraction-demo.ts`
- `scripts/seed-meeting-pack.ts`
- `scripts/seed-togaf-template.ts`

**Configuration**:
- Environment variable: `ORGS_DEMO_SEED`
- Controls whether demo organizations are created

**Decision matrix**:

| Environment | ORGS_DEMO_SEED | Seed Scripts | Reason |
|-------------|----------------|--------------|--------|
| Development | true | All demo scripts | Full demo data for testing |
| Staging | true | Selected demos | Representative test data |
| Production | false | None or custom only | Real data only |

**Production seed strategy**:

**Option A**: No seed data
- Set `ORGS_DEMO_SEED=false`
- Create organizations via API/UI
- Clean slate for production

**Option B**: Minimal production seed
- Create production-specific seed script
- Include essential reference data only
- Document what gets seeded

**Recommendation**: Use Option A for production

**Create production seed script** (if needed):

**Location**: `/scripts/seed-production.ts`

```typescript
// Production-only seed data
// Only essential reference data, no demo content

import { Pool } from 'pg';

async function seedProduction() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });

  try {
    console.log('🌱 Seeding production data...');

    // Insert essential reference data only
    // Example: default templates, system configurations, etc.
    
    await pool.query(`
      -- Add production reference data here
      -- NO demo organizations
      -- NO test users
      -- Only essential system data
    `);

    console.log('✅ Production seed complete');
  } catch (error) {
    console.error('❌ Production seed failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedProduction();
```

**Seed data checklist**:
- [ ] Seed strategy decided (none/minimal/custom)
- [ ] ORGS_DEMO_SEED configured appropriately
- [ ] Production seed script created (if needed)
- [ ] Seed script tested locally
- [ ] Seed script idempotent (can run multiple times)
- [ ] Seed data documented

---

## Implementation Order

### Sprint 1: Core Infrastructure (Day 1-2)
**Priority: HIGH | Estimated: 4-6 hours**

1. ✅ Create `apps/server-nest/Dockerfile` (Task 1.1)
2. ✅ Create `apps/admin/Dockerfile` (Task 1.1)
3. ✅ Create root `docker-compose.yml` (Task 1.2)
4. ✅ Create `.env.production.example` (Task 2.1)
5. ✅ Update `.dockerignore` (Task 3.1)

**Success criteria**:
- Docker images build successfully
- docker-compose up starts all services
- No build errors

### Sprint 2: Testing & Validation (Day 2-3)
**Priority: HIGH | Estimated: 4-6 hours**

6. ✅ Test local Docker build (Task 7.2)
7. ✅ Create test script `/scripts/test-docker-local.sh` (Task 7.2)
8. ✅ Verify server health endpoint (Task 4.1)
9. ✅ Verify admin health check (Task 4.2)
10. ✅ Verify migrations work (Task 9.1)
11. ✅ Fix any build issues

**Success criteria**:
- All services start and become healthy
- Health checks return 200 OK
- Migrations execute successfully
- Can access services locally

### Sprint 3: Deployment Tools (Day 3-4)
**Priority: MEDIUM | Estimated: 3-4 hours**

12. ✅ Create `/scripts/deploy-coolify.sh` (Task 5.1)
13. ✅ Create `/scripts/sync-coolify-env.sh` (Task 5.2)
14. ✅ Create `/scripts/preflight-check.sh` (Task 7.1)
15. ✅ Make scripts executable
16. ✅ Test scripts locally

**Success criteria**:
- Scripts run without errors
- Environment sync works with test API
- Pre-flight checks validate setup

### Sprint 4: Documentation (Day 4-5)
**Priority: HIGH | Estimated: 2-3 hours**

17. ✅ Create `COOLIFY_DEPLOYMENT_READY.md` (Task 6.1)
18. ✅ Update `README.md` (Task 6.2)
19. ✅ Update `RUNBOOK.md` (Task 6.3)
20. ✅ Create `.env.staging.example` (Task 2.2)
21. ✅ Document seed data strategy (Task 9.2)

**Success criteria**:
- Complete deployment documentation
- Clear step-by-step instructions
- Troubleshooting guide included
- All edge cases documented

### Sprint 5: Coolify Setup & Deploy (Day 5-6)
**Priority: HIGH | Estimated: 3-4 hours**

22. ✅ Create Coolify application (Task 8.1)
23. ✅ Configure domains (Task 8.1)
24. ✅ Set environment variables (Task 8.2)
25. ✅ Configure secrets (Task 8.2)
26. ✅ Configure volumes (Task 8.1)
27. ✅ Run pre-flight checks
28. ✅ Trigger first deployment
29. ✅ Monitor deployment logs
30. ✅ Verify all services running

**Success criteria**:
- Application deploys successfully
- All services healthy in Coolify
- Domains resolve correctly
- SSL certificates issued
- Can access application

### Sprint 6: Verification & Testing (Day 6)
**Priority: HIGH | Estimated: 2-3 hours**

31. ✅ Test health endpoints on production
32. ✅ Test Zitadel authentication
33. ✅ Test frontend access and routing
34. ✅ Test API endpoints
35. ✅ Test end-to-end workflows
36. ✅ Monitor logs for errors
37. ✅ Verify database persistence
38. ✅ Test SSL/HTTPS

**Success criteria**:
- All health checks pass
- Authentication works end-to-end
- Frontend loads and functions
- API responds correctly
- No errors in logs

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Sprint 1: Core Infrastructure | 4-6 hours | None |
| Sprint 2: Testing & Validation | 4-6 hours | Sprint 1 |
| Sprint 3: Deployment Tools | 3-4 hours | Sprint 2 |
| Sprint 4: Documentation | 2-3 hours | Sprint 1-3 |
| Sprint 5: Coolify Setup | 3-4 hours | Sprint 1-4 |
| Sprint 6: Verification | 2-3 hours | Sprint 5 |
| **Total** | **18-26 hours** | **~3 days** |

**Buffer for issues**: +6-8 hours  
**Total with buffer**: **3-4 days**

---

## Success Criteria

### Technical Success
- [ ] All Docker images build without errors
- [ ] All services start and reach healthy state
- [ ] Health endpoints return 200 OK
- [ ] Database migrations execute successfully
- [ ] Zitadel authentication works end-to-end
- [ ] Frontend loads and is functional
- [ ] API endpoints respond correctly
- [ ] SSL/HTTPS configured correctly
- [ ] Domain routing works properly
- [ ] Logs are accessible and clean

### Operational Success
- [ ] Deployment can be triggered with one command
- [ ] Environment variables managed via script
- [ ] Pre-flight checks catch common issues
- [ ] Deployment logs are clear and helpful
- [ ] Rollback procedure documented and tested
- [ ] Monitoring configured
- [ ] Backup procedure documented

### Documentation Success
- [ ] Complete deployment guide exists
- [ ] Troubleshooting section covers common issues
- [ ] Environment variables fully documented
- [ ] Architecture documented with diagrams
- [ ] Runbook includes Coolify operations
- [ ] README updated with deployment info

---

## Key Differences from Reference Project

Understanding these differences is crucial for successful adaptation:

| Aspect | Reference (huma-blueprint-ui) | This Project (spec-server-2) |
|--------|------------------------------|------------------------------|
| **Structure** | Simple monorepo with pnpm | Nx monorepo with npm |
| **Backend** | NestJS API in `apps/api/` | NestJS in `apps/server-nest/` |
| **Frontend** | Vite + React in `apps/web/` | Vite + React in `apps/admin/` |
| **Database** | PostgreSQL 17 | PostgreSQL 16 with pgvector |
| **Auth** | Zitadel (remote or local) | Zitadel (local dev setup exists) |
| **Ports** | API: 4000, Web: 8080 | Server: 3002, Admin: 3000 |
| **Build Tool** | pnpm workspaces | Nx targets |
| **Dev Server** | Direct npm scripts | PM2 via workspace CLI |
| **Migrations** | Unknown | Built-in with AUTO_INIT_DB |
| **AI Provider** | Unknown | Google Gemini (Vertex AI) |
| **Special Features** | Basic API | MCP integration, graph search, pgvector |

### Adaptations Required

1. **Build Context**: Must use app-specific directories, not root
2. **Package Manager**: Use npm instead of pnpm
3. **Port Numbers**: Adjust to 3002/3000
4. **Migrations**: Leverage AUTO_INIT_DB feature
5. **Health Checks**: Use existing `/health` endpoint
6. **Environment Variables**: Include Google AI config
7. **Volumes**: Include pgvector extension requirements

---

## Risk Assessment

### High Risk Items
1. **Database Migration Failure**
   - Mitigation: Test thoroughly locally, backup before first deploy
   - Rollback: Have database restore procedure ready

2. **Zitadel Configuration Issues**
   - Mitigation: Test full OAuth flow locally first
   - Fallback: Use existing docker/zitadel setup as reference

3. **Build Context Issues with Nx**
   - Mitigation: Test Docker builds extensively before Coolify
   - Alternative: Adjust Dockerfile paths if needed

### Medium Risk Items
4. **Environment Variable Sync**
   - Mitigation: Use tested API script, verify after sync
   - Backup: Manual entry via UI if script fails

5. **SSL Certificate Issues**
   - Mitigation: Ensure DNS configured before deployment
   - Fallback: Use Coolify's auto-provision, not manual certs

6. **Service Dependencies**
   - Mitigation: Proper health checks and depends_on config
   - Monitoring: Watch startup logs carefully

### Low Risk Items
7. **Resource Limits**
   - Mitigation: Start with generous limits, tune later
   - Monitoring: Watch metrics in Coolify

8. **Log Volume**
   - Mitigation: Configure log rotation from start
   - Cleanup: Regular log maintenance procedures

---

## Post-Deployment Tasks

After successful first deployment:

### Immediate (Day 1)
- [ ] Verify all services running for 24 hours
- [ ] Monitor error logs
- [ ] Test all critical user workflows
- [ ] Verify database backups working
- [ ] Check SSL renewal configuration
- [ ] Configure monitoring alerts

### Short Term (Week 1)
- [ ] Performance tuning based on metrics
- [ ] Adjust resource limits if needed
- [ ] Set up automated backups
- [ ] Configure log aggregation
- [ ] Create operational dashboards
- [ ] Document any deployment issues encountered

### Medium Term (Month 1)
- [ ] Review and optimize Docker images
- [ ] Implement auto-scaling if needed
- [ ] Set up staging environment
- [ ] Configure CI/CD pipeline
- [ ] Implement automated testing in deployment
- [ ] Review and update documentation

---

## Resources & References

### Documentation
- Coolify Docs: https://coolify.io/docs
- Docker Compose: https://docs.docker.com/compose/
- Zitadel Docs: https://zitadel.com/docs
- PostgreSQL + pgvector: https://github.com/pgvector/pgvector

### Scripts & Tools
- Coolify CLI: Install via coolify.io
- Docker BuildKit: Enabled by default in Docker 23.0+
- Pre-flight script: `/scripts/preflight-check.sh`
- Deployment script: `/scripts/deploy-coolify.sh`

### Internal References
- Reference project: `~/code/huma/huma-blueprint-ui/`
- Local dev setup: `QUICK_START_DEV.md`
- Database setup: `SETUP.md`
- Security scopes: `SECURITY_SCOPES.md`

---

## Questions & Answers

### Q: Can we use the existing docker/docker-compose.yml?
**A**: No. The existing file is optimized for local development with port mappings and local volumes. We need a production-optimized compose file at the root with `expose` instead of `ports`, proper health checks, and Coolify-compatible configuration.

### Q: Do we need to change the Nx build process?
**A**: No. The Dockerfiles will use the existing build commands (`npm run build`). Nx is abstracted away inside the container.

### Q: How do we handle secrets?
**A**: Use Coolify's built-in secrets management. Mark sensitive environment variables as secrets in the UI, and they'll be encrypted at rest and injected at runtime.

### Q: What about database backups?
**A**: Coolify can be configured to backup volumes. Additionally, implement a cron job in the database container or external backup solution. Document backup and restore procedures in RUNBOOK.md.

### Q: Can we preview changes before production?
**A**: Yes. Coolify supports "preview" and "production" environments. Use preview for testing, then promote to production when ready.

### Q: How do we roll back if deployment fails?
**A**: Coolify keeps previous container images. Use `coolify app rollback` or redeploy a previous Git commit. Always backup database before major changes.

---

## Appendix A: File Checklist

Files to create or modify:

### New Files (11 files)
- [ ] `apps/server-nest/Dockerfile`
- [ ] `apps/admin/Dockerfile`
- [ ] `docker-compose.yml` (root level)
- [ ] `.env.production.example`
- [ ] `.env.staging.example`
- [ ] `scripts/deploy-coolify.sh`
- [ ] `scripts/sync-coolify-env.sh`
- [ ] `scripts/preflight-check.sh`
- [ ] `scripts/test-docker-local.sh`
- [ ] `COOLIFY_DEPLOYMENT_READY.md`
- [ ] `docs/COOLIFY_DEPLOYMENT_PLAN.md` (this file)

### Files to Update (3 files)
- [ ] `.dockerignore` (enhance existing)
- [ ] `README.md` (add deployment section)
- [ ] `RUNBOOK.md` (add Coolify operations)

### Optional Files
- [ ] `docker-compose.staging.yml` (if separate staging config needed)
- [ ] `scripts/seed-production.ts` (if production seed data needed)
- [ ] `.github/workflows/deploy.yml` (CI/CD automation)

**Total**: 14-17 files

---

## Appendix B: Environment Variable Reference

Complete list of environment variables needed for production:

### Database (Required)
```bash
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER=spec
POSTGRES_PASSWORD=<secret>
POSTGRES_DB=spec
```

### Google AI (Required)
```bash
GOOGLE_API_KEY=<secret>
EMBEDDING_DIMENSION=1536
```

### Server (Required)
```bash
PORT=3002
NODE_ENV=production
DB_AUTOINIT=true
```

### Zitadel Auth (Required)
```bash
ZITADEL_DOMAIN=<your-domain>
ZITADEL_ISSUER=https://${ZITADEL_DOMAIN}
ZITADEL_INTROSPECTION_URL=https://${ZITADEL_DOMAIN}/oauth/v2/introspect
ZITADEL_CLIENT_ID=<client-id>
ZITADEL_CLIENT_SECRET=<secret>
ZITADEL_MAIN_ORG_ID=<org-id>
```

### Frontend Build Args (Required)
```bash
VITE_API_URL=https://<api-domain>
VITE_ZITADEL_ISSUER=https://${ZITADEL_DOMAIN}
VITE_ZITADEL_CLIENT_ID=<frontend-client-id>
VITE_APP_ENV=production
```

### CORS (Required)
```bash
CORS_ORIGIN=https://<frontend-domain>
```

### Zitadel Setup (First Deployment Only)
```bash
ZITADEL_ORG_NAME=<org-name>
ZITADEL_ADMIN_USERNAME=<admin-email>
ZITADEL_ADMIN_PASSWORD=<secret>
ZITADEL_ADMIN_FIRSTNAME=<firstname>
ZITADEL_ADMIN_LASTNAME=<lastname>
ZITADEL_MASTERKEY=<32-char-secret>
```

### Optional
```bash
ORGS_DEMO_SEED=false
CHAT_ENABLE_MCP=1
MCP_SERVER_URL=http://localhost:3001
MCP_TIMEOUT=30000
GCP_PROJECT_ID=<gcp-project>
```

**Total**: ~30 variables (25 required, 5 optional)

---

## Appendix C: Troubleshooting Quick Reference

### Service Won't Start
```bash
# Check logs
docker compose logs <service-name>

# Check if port is in use
netstat -tulpn | grep <port>

# Verify environment variables
docker compose config

# Restart service
docker compose restart <service-name>
```

### Database Connection Failed
```bash
# Test database
docker compose exec db pg_isready -U spec

# Check credentials
docker compose exec server env | grep POSTGRES

# Manual connection test
docker compose exec server psql -h db -U spec -d spec
```

### Build Failure
```bash
# Check BuildKit enabled
docker buildx version

# Clear cache and rebuild
docker compose build --no-cache <service-name>

# Check build context
docker compose build --progress=plain <service-name>
```

### Health Check Failing
```bash
# Check endpoint manually
curl -v http://localhost:3002/health

# Check service logs
docker compose logs server --tail=50

# Check if service listening
docker compose exec server netstat -tulpn
```

### Deployment Hangs
```bash
# Check Coolify status
coolify app get <app-uuid>

# Force stop and restart
coolify app stop <app-uuid>
coolify app start <app-uuid>

# Check Coolify logs
coolify app logs <app-uuid> | tail -100
```

---

**End of Plan**

**Next Steps**: Begin implementation with Sprint 1 (Core Infrastructure)
