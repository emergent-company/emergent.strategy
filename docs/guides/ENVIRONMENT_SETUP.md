# Environment Setup Guide

This guide provides comprehensive instructions for setting up the Spec Server application across four distinct environments: **Local**, **Dev**, **Staging**, and **Production**.

## Table of Contents

1. [Environment Overview](#environment-overview)
2. [Quick Start Guide](#quick-start-guide)
3. [Local Environment Setup](#local-environment-setup)
4. [Dev Environment Setup](#dev-environment-setup)
5. [Staging Environment Setup](#staging-environment-setup)
6. [Production Environment Setup](#production-environment-setup)
7. [Environment Variables Reference](#environment-variables-reference)
8. [Infisical Configuration](#infisical-configuration)
9. [Zitadel Bootstrap](#zitadel-bootstrap)
10. [Troubleshooting](#troubleshooting)

## Environment Overview

The Spec Server system supports four distinct deployment environments, each with different infrastructure patterns:

### Environment Comparison

| Aspect                 | Local                                             | Dev                                                    | Staging                   | Production                  |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------ | ------------------------- | --------------------------- |
| **Purpose**            | Feature development and testing on developer's PC | Shared development environment for integration testing | Pre-production validation | Live production system      |
| **Dependencies**       | Docker containers on local PC                     | Hosted within dev environment                          | Full Docker Compose       | Full Docker Compose         |
| **Applications**       | Run on host via workspace CLI                     | Run within dev environment                             | Docker containers         | Docker containers           |
| **Domains**            | localhost with ports                              | Dev-specific domains                                   | Staging domains with SSL  | Production domains with SSL |
| **Configuration**      | .env files + Infisical (optional)                 | Infisical required                                     | Infisical required        | Infisical required          |
| **Secrets Management** | .env fallback available                           | Infisical only                                         | Infisical only            | Infisical only              |

### Infrastructure Patterns

#### Local Environment

- **Dependencies**: PostgreSQL, Zitadel, Login UI run in Docker containers on your PC
- **Applications**: admin and server run directly on host machine via workspace CLI
- **Networking**: Applications connect to Docker containers via localhost ports
- **Use Case**: Day-to-day feature development, debugging, local testing

#### Dev Environment

- **Dependencies**: Run within the dev environment infrastructure (not Docker on local PC)
- **Applications**: Run within the dev environment (similar to local but hosted)
- **Networking**: Internal dev environment networking
- **Use Case**: Integration testing, team collaboration, feature validation

#### Staging Environment

- **Everything in Docker**: Full Docker Compose deployment with all services containerized
- **Networking**: Docker internal networking with external domain access
- **Use Case**: Pre-production testing, QA validation, client demos

#### Production Environment

- **Everything in Docker**: Full Docker Compose deployment with production hardening
- **Security**: Production credentials, SSL/TLS, monitoring, backups
- **Use Case**: Live system serving end users

### Choosing Your Environment

**Use Local when:**

- Developing features on your PC
- Debugging issues locally
- Running unit tests
- Experimenting with changes

**Use Dev when:**

- Testing integrations with team members
- Validating changes before staging
- Collaborative development work

**Use Staging when:**

- Final validation before production
- QA testing
- Client demonstrations
- Performance testing

**Use Production when:**

- Deploying to end users
- Running the live system

## Quick Start Guide

### 🚀 Fast Track - Local Development (Copy & Paste)

**Prerequisites:** Node.js 18+, Docker Desktop, Infisical CLI installed and authenticated

```bash
# Complete local setup in one command sequence
git clone <repository> && \
cd spec-server-2 && \
cp .env.example .env && \
echo "ENVIRONMENT=local" >> .env && \
npm install && \
npm run workspace:deps:start && \
./scripts/bootstrap-zitadel-fully-automated.sh provision --push-to-infisical && \
npm run workspace:start
```

**That's it!** Your local environment is ready:

- Admin app: http://localhost:5176
- Server API: http://localhost:3002
- Zitadel: http://localhost:8200

**Check status:** `npm run workspace:status`

---

### Detailed Prerequisites

**All Environments:**

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **Infisical CLI**: Recommended for all environments, required for dev/staging/production

  ```bash
  # Install Infisical CLI
  brew install infisical/get-cli/infisical  # macOS
  # Or see https://infisical.com/docs/cli/overview for other platforms
  ```

**Infisical Authentication (Choose One Method):**

**Option 1: Interactive Login (Local Development - Recommended)**

```bash
# Login and initialize (one-time setup)
infisical login
infisical init  # Select your project and environment
```

**Option 2: Service Token (CI/CD, Remote Environments)**

Get your service token from [https://infiscal.kucharz.net](https://infiscal.kucharz.net) and add to `.env.local`:

```bash
# Create .env.local with your Infisical token
cat >> .env.local << 'EOF'
# Infisical Service Token (SECRET - never commit)
INFISICAL_TOKEN=st.your-token-here
INFISICAL_PROJECT_ID=2c273128-5d01-4156-a134-be9511d99c61

# Self-hosted Infisical (our instance)
INFISICAL_HOST=infiscal.kucharz.net
EOF
```

**Why use service tokens?**

- CI/CD pipelines (GitHub Actions, GitLab CI, etc.)
- Remote servers where interactive login isn't practical
- Shared development environments
- Automated deployment workflows

**Note:** Scripts automatically construct the API URL as `https://{INFISICAL_HOST}/api`. For Infisical Cloud, omit `INFISICAL_HOST`.

**Local Only:**

- Docker Desktop or Docker Engine
- Docker Compose v2

**Dev/Staging/Production:**

- Access to environment infrastructure
- Infisical authentication credentials (service token recommended)
- Environment-specific domain access

### Step-by-Step Setup (If You Need Details)

**For Local Development** (5 minutes):

```bash
# 1. Clone and install
git clone <repository>
cd spec-server-2
npm install

# 2. Start Docker dependencies
npm run workspace:deps:start

# 3. Bootstrap Zitadel with automatic Infisical push
./scripts/bootstrap-zitadel-fully-automated.sh provision --push-to-infisical

# 4. Start applications
npm run workspace:start

# 5. Verify
npm run workspace:status
```

**For Other Environments**: See environment-specific sections below.

---

_This guide is organized into environment-specific sections. Jump to the section that matches your deployment target._

## Local Environment Setup

This section covers setting up the Spec Server on your local development machine. In this configuration, dependencies run in Docker containers while applications run directly on your host machine via the workspace CLI.

### Architecture

```
Your PC
├── Docker Containers (Dependencies)
│   ├── PostgreSQL (localhost:5432)
│   ├── Zitadel (localhost:8200)
│   └── Login UI (via Zitadel)
└── Host Machine (Applications)
    ├── Admin (localhost:5176) - via workspace CLI
    └── Server (localhost:3002) - via workspace CLI
```

### Prerequisites

1. **Node.js** v18+
2. **Docker Desktop** or Docker Engine with Docker Compose v2
3. **Infisical CLI** (recommended but optional - .env fallback available)

### Step-by-Step Setup

#### 1. Clone Repository and Install Dependencies

```bash
git clone <repository-url>
cd spec-server-2
npm install
```

**Verification:**

```bash
node --version  # Should show v18 or higher
npm --version   # Should show v9 or higher
```

#### 2. Configure Infisical (Optional but Recommended)

If using Infisical for secrets management:

```bash
# Install Infisical CLI
brew install infisical/get-cli/infisical  # macOS
# Or see https://infisical.com/docs/cli/overview

# Login to Infisical
infisical login

# Initialize for this project
infisical init
# Select your project and "local" environment
```

**Verification:**

```bash
infisical secrets list --env local
# Should show existing secrets or empty list
```

**Fallback:** If not using Infisical, you'll copy bootstrap output to .env files (Step 6).

#### 3. Start Docker Dependencies

Start PostgreSQL, Zitadel, and Login UI containers:

```bash
# Option A: Using workspace CLI (recommended)
npm run workspace:deps:start

# Option B: Using Docker Compose directly
cd docker
docker compose -f docker-compose.dev.yml up -d
cd ..
```

This starts three services managed by PM2:

- **postgres-dependency**: PostgreSQL with pgvector extension
- **zitadel-dependency**: Zitadel authentication server
- **zitadel-login-ui-dependency**: Zitadel Login UI v2

**Verification:**

```bash
# Check dependency status
npm run workspace:status

# Expected output:
# ┌─────────────────────────┬────┬──────┬────────┐
# │ Name                    │ ID │ Mode │ Status │
# ├─────────────────────────┼────┼──────┼────────┤
# │ postgres-dependency     │ 0  │ fork │ online │
# │ zitadel-dependency      │ 1  │ fork │ online │
# │ zitadel-login-ui-dep... │ 2  │ fork │ online │
# └─────────────────────────┴────┴──────┴────────┘

# Verify PostgreSQL is ready
docker exec spec-server-2-postgres-1 pg_isready -U postgres
# Expected: postgres:5432 - accepting connections

# Verify Zitadel is ready
curl http://localhost:8200/debug/healthz
# Expected: {"status":"ok"}
```

**What Happens:**

- PostgreSQL starts with database `spec_db` and pgvector extension
- Zitadel runs database migrations on first startup
- Zitadel creates bootstrap service account with PAT saved to `/machinekey/pat.txt` volume
- Services run in background via PM2
- Logs captured to `apps/logs/dependencies/`

**Troubleshooting:**

- **Port conflicts**: If ports 5432, 8200, or 8101 are in use, modify `docker/docker-compose.dev.yml`
- **Docker not running**: Start Docker Desktop
- **Health checks failing**: Wait 30-60 seconds for Zitadel initialization, then retry

#### 4. Run Zitadel Bootstrap

Bootstrap Zitadel with dev-specific domains and redirect URIs:

```bash
# Set environment for dev
export INFISICAL_ENV=dev

# Run bootstrap with automatic Infisical push (recommended)
# Make sure .env has ENVIRONMENT=dev set
./scripts/bootstrap-zitadel-fully-automated.sh provision --push-to-infisical

# Or override environment explicitly
./scripts/bootstrap-zitadel-fully-automated.sh provision \
  --push-to-infisical \
  --infisical-env dev

# Or without automatic push (manual update required)
./scripts/bootstrap-zitadel-fully-automated.sh provision
```

**Dev-Specific Configuration:**

- **ZITADEL_DOMAIN**: `auth-dev.example.com` (not localhost)
- **Redirect URIs**:
  - Admin: `https://app-dev.example.com/auth/callback`
  - Server: `https://api-dev.example.com/auth/callback`
- **PAT**: Provided manually (not from Docker volume)

**Verification:**

```bash
./scripts/bootstrap-zitadel-fully-automated.sh status --env dev
./scripts/bootstrap-zitadel-fully-automated.sh verify --env dev
```

#### 5. Update Infisical with Bootstrap Output

> **💡 Tip:** If you used `--push-to-infisical` flag, this step is already done! Skip to step 6 (Start Applications).

Update Infisical secrets for dev environment manually:

```bash
# Update workspace secrets
infisical secrets set ZITADEL_ORG_ID="<org-id>" --env dev --path /workspace
infisical secrets set ZITADEL_PROJECT_ID="<project-id>" --env dev --path /workspace

# Update server secrets
infisical secrets set ZITADEL_ORG_ID="<org-id>" --env dev --path /server
infisical secrets set ZITADEL_PROJECT_ID="<project-id>" --env dev --path /server
infisical secrets set ZITADEL_OAUTH_CLIENT_ID="<oauth-client-id>" --env dev --path /server

# Update admin secrets
infisical secrets set VITE_ZITADEL_CLIENT_ID="<oauth-client-id>" --env dev --path /admin
infisical secrets set VITE_ZITADEL_ISSUER="https://auth-dev.example.com" --env dev --path /admin
infisical secrets set VITE_API_BASE="https://api-dev.example.com" --env dev --path /admin
```

**Command Options:**

- `--push-to-infisical` - Automatically push generated secrets to Infisical after bootstrap
- `--infisical-env ENV` - Target Infisical environment (default: from `ENVIRONMENT` in .env, or `local`)
- `--infisical-path PATH` - Target Infisical path (default: `/server`)

**Environment Configuration:**

Set `ENVIRONMENT` in your `.env` file to avoid passing `--infisical-env` every time:

```bash
echo "ENVIRONMENT=dev" >> .env
```

Then all scripts will use `dev` as the default environment.

**What Happens:**

- Loads PAT from Docker volume `/machinekey/pat.txt`
- Creates organization "Spec Organization" (or uses existing)
- Creates project "Spec Server" (or uses existing)
- Creates OAuth OIDC application (public client with PKCE)
- Creates API application with JWT authentication
- Creates two service accounts (CLIENT and API with dual SA pattern)
- Creates three user accounts (admin, test, e2e-test)
- Generates JWT keys saved to `secrets/` directory
- Outputs configuration to update in Infisical or .env files
- **If `--push-to-infisical`:** Automatically pushes secrets to Infisical

**Expected Output:**

```
=== Zitadel Bootstrap Complete ===

Organization ID: 123456789012345678
Project ID: 234567890123456789
OAuth Client ID: 345678901234567890@spec-server
API Client ID: 456789012345678901@spec-server

Service Accounts:
  CLIENT: client-introspection-service
  API: api-management-service

Users Created:
  Admin: admin@spec.local / <password>
  Test: test@example.com / <password>
  E2E: e2e-test@example.com / <password>

Next Steps:
1. Update Infisical with these values (or copy to .env files)
2. Restart services to load new configuration

=== Pushing secrets to Infisical ===
Environment: local
Path: /server

✓ Pushed to Infisical:
  - ZITADEL_ORG_ID
  - ZITADEL_PROJECT_ID
  - ZITADEL_OAUTH_CLIENT_ID
  - ZITADEL_API_CLIENT_ID
  - ZITADEL_CLIENT_JWT

Next steps:
1. Verify secrets: infisical secrets --env=local --path=/server
2. Restart services: npm run workspace:restart
3. Look for: 'Dual service account mode active' in logs
```

**Verification:**

```bash
# Verify bootstrap status
./scripts/bootstrap-zitadel-fully-automated.sh status

# Run comprehensive verification
./scripts/bootstrap-zitadel-fully-automated.sh verify

# Run test suite
./scripts/bootstrap-zitadel-fully-automated.sh test
```

**Troubleshooting:**

- **PAT not found**: Ensure Docker dependencies started successfully
- **Connection refused**: Verify Zitadel is running at localhost:8200
- **Organization already exists**: Script will reuse existing organization
- **Script fails mid-way**: Run `verify` mode to see which steps succeeded

#### 5. Update Infisical with Bootstrap Output

> **💡 Tip:** If you used `--push-to-infisical` flag during bootstrap, this step is already done! Skip to step 6 (Restart Services).

**Method A: Automatic Push (Recommended - New!)**

Use the `--push-to-infisical` flag when running bootstrap to automatically push secrets:

```bash
./scripts/bootstrap-zitadel-fully-automated.sh provision --push-to-infisical

# For different environments
./scripts/bootstrap-zitadel-fully-automated.sh provision \
  --push-to-infisical \
  --infisical-env dev \
  --infisical-path /server
```

This automatically pushes:

- `ZITADEL_ORG_ID`
- `ZITADEL_PROJECT_ID`
- `ZITADEL_OAUTH_CLIENT_ID`
- `ZITADEL_OAUTH_CLIENT_SECRET` (if applicable)
- `ZITADEL_API_CLIENT_ID`
- `ZITADEL_CLIENT_JWT` (service account JSON)

**Method B: Manual Infisical CLI Update**

If you didn't use `--push-to-infisical`, update secrets manually:

```bash
# Update workspace secrets (/workspace path)
infisical secrets set ZITADEL_ORG_ID="<org-id>" --env local --path /workspace
infisical secrets set ZITADEL_PROJECT_ID="<project-id>" --env local --path /workspace

# Update server secrets (/server path)
infisical secrets set ZITADEL_ORG_ID="<org-id>" --env local --path /server
infisical secrets set ZITADEL_PROJECT_ID="<project-id>" --env local --path /server
infisical secrets set ZITADEL_OAUTH_CLIENT_ID="<oauth-client-id>" --env local --path /server

# Update admin secrets (/admin path)
infisical secrets set VITE_ZITADEL_CLIENT_ID="<oauth-client-id>" --env local --path /admin
```

**Method C: Using Infisical Dashboard**

1. Open https://app.infisical.com
2. Navigate to your project > "local" environment
3. Update secrets in `/workspace`, `/server`, and `/admin` folders
4. Copy values from bootstrap output

**Method D: Fallback to .env Files (No Infisical)**

If Infisical is not available, copy bootstrap output to .env files:

```bash
# Update root .env
echo "ZITADEL_ORG_ID=<org-id>" >> .env
echo "ZITADEL_PROJECT_ID=<project-id>" >> .env

# Update server .env
echo "ZITADEL_ORG_ID=<org-id>" >> apps/server/.env
echo "ZITADEL_PROJECT_ID=<project-id>" >> apps/server/.env
echo "ZITADEL_OAUTH_CLIENT_ID=<oauth-client-id>" >> apps/server/.env

# Update admin .env
echo "VITE_ZITADEL_CLIENT_ID=<oauth-client-id>" >> apps/admin/.env
```

**Important Variables to Update:**

- `ZITADEL_ORG_ID` - Organization ID from bootstrap
- `ZITADEL_PROJECT_ID` - Project ID from bootstrap
- `ZITADEL_OAUTH_CLIENT_ID` - OAuth client ID from bootstrap
- `VITE_ZITADEL_CLIENT_ID` - Same as ZITADEL_OAUTH_CLIENT_ID (for admin)

**Note:** The server loads JWT keys automatically from `secrets/` directory. No need to update JWT path variables unless you moved the files.

#### 6. Start Application Services

Start the admin and server applications:

```bash
npm run workspace:start
```

**What Happens:**

- Workspace CLI performs preflight checks (dependencies running, .env files exist)
- Starts `admin` service on port 5176 (or ADMIN_PORT from .env)
- Starts `server` service on port 3002 (or SERVER_PORT from .env)
- Services run under PM2 in namespace `spec-server-2` (or NAMESPACE from .env)
- Health checks verify services are responding
- Logs captured to `apps/logs/`

**Verification:**

```bash
# Check service status
npm run workspace:status

# Expected output:
# ┌────────────────────┬────┬──────┬────────┬─────────┐
# │ Name               │ ID │ Mode │ Status │ Port    │
# ├────────────────────┼────┼──────┼────────┼─────────┤
# │ admin              │ 3  │ fork │ online │ 5176    │
# │ server             │ 4  │ fork │ online │ 3002    │
# └────────────────────┴────┴──────┴────────┴─────────┘

# View logs
npm run workspace:logs

# View logs for specific service
npm run workspace:logs -- --service server

# Verify server health
curl http://localhost:3002/health
# Expected: {"status":"ok"}

# Verify admin is serving
curl http://localhost:5176
# Expected: HTML response
```

**Server Logs Should Show:**

```
[INFO] Dual service account mode active
[INFO] CLIENT SA: client-introspection-service
[INFO] API SA: api-management-service
[INFO] Database connected
[INFO] Server listening on port 3002
```

**Troubleshooting:**

- **Port already in use**: Change ADMIN_PORT or SERVER_PORT in .env
- **Database connection failed**: Verify PostgreSQL is running
- **Zitadel connection failed**: Verify Zitadel is at localhost:8200
- **Dual SA mode not active**: Check JWT keys exist in `secrets/` directory

#### 7. Verify Authentication

Test the complete authentication flow:

```bash
# Open admin app
open http://localhost:5176

# Login with test credentials
# Email: test@example.com
# Password: <password-from-bootstrap-output>
```

**Expected Behavior:**

1. Admin app redirects to Zitadel login at `http://localhost:8200`
2. Enter test user credentials
3. Zitadel redirects back to `http://localhost:5176/auth/callback`
4. Admin app exchanges code for tokens
5. Server introspects token using CLIENT service account
6. User is authenticated and sees dashboard

**Verification Checklist:**

- [ ] Admin app loads at localhost:5176
- [ ] Login redirects to Zitadel
- [ ] Can login with test user
- [ ] Callback redirects back to admin
- [ ] Dashboard shows user info
- [ ] API requests succeed (check Network tab)
- [ ] Server logs show token introspection success

**Troubleshooting:**

- **Redirect URI mismatch**: Verify OAuth app has `http://localhost:5176/auth/callback`
- **Token introspection fails**: Verify CLIENT SA JWT key is valid
- **User not found**: Verify user was created in bootstrap
- **CORS errors**: Verify VITE_API_BASE points to correct server URL

### Local Environment Management

#### Stopping Services

```bash
# Stop applications only
npm run workspace:stop

# Stop dependencies only
npm run workspace:deps:stop

# Stop everything
npm run workspace:stop
npm run workspace:deps:stop
```

#### Restarting Services

```bash
# Restart applications
npm run workspace:restart

# Restart dependencies
npm run workspace:deps:restart

# Restart specific service
npm run workspace:restart -- --service server
```

#### Viewing Logs

```bash
# All logs (admin + server)
npm run workspace:logs

# Specific service
npm run workspace:logs -- --service admin
npm run workspace:logs -- --service server

# Dependencies
npm run workspace:logs -- --service postgres-dependency
npm run workspace:logs -- --service zitadel-dependency

# More lines
npm run workspace:logs -- --lines 200

# Follow mode (tail -f)
npm run workspace:logs -- --follow
```

#### Cleanup and Reset

```bash
# Stop all services
npm run workspace:stop
npm run workspace:deps:stop

# Remove Docker volumes (deletes all data)
cd docker
docker compose -f docker-compose.dev.yml down -v
cd ..

# Clean PM2 processes
npx pm2 delete all
npx pm2 kill

# Remove logs
rm -rf apps/logs

# Start fresh
npm run workspace:deps:start
./scripts/bootstrap-zitadel-fully-automated.sh provision
# ... repeat setup steps
```

### Next Steps

- **Run Tests**: See `docs/testing/AI_AGENT_GUIDE.md`
- **Development Workflow**: See `docs/guides/development/HOT_RELOAD.md`
- **Debugging**: Use OpenCode tools (`logs`, `credentials`, `open-browser`)
- **Database Migrations**: See `docs/guides/database-migration-flow.md`

## Dev Environment Setup

This section covers setting up the Spec Server in a shared development environment where dependencies and applications run within the dev infrastructure (not Docker on your local PC).

### 🚀 Fast Track - Dev Environment (Copy & Paste)

**Prerequisites:** Access to dev environment, Infisical CLI authenticated, dev dependencies running

```bash
# SSH to dev environment (if needed)
ssh user@dev-environment.example.com

# Complete dev setup in one command sequence
cd spec-server-2 && \
cp .env.example .env && \
echo "ENVIRONMENT=dev" >> .env && \
npm install && \
./scripts/bootstrap-zitadel-fully-automated.sh provision --push-to-infisical && \
npm run workspace:start
```

**That's it!** Your dev environment is ready:

- Admin app: https://app-dev.example.com
- Server API: https://api-dev.example.com
- Zitadel: https://auth-dev.example.com

**Check status:** `npm run workspace:status`

---

### Architecture

```
Dev Environment (Remote)
├── Dependencies (Hosted Services)
│   ├── PostgreSQL (dev-db.internal)
│   └── Zitadel (auth-dev.example.com)
└── Applications (Hosted)
    ├── Admin (app-dev.example.com)
    └── Server (api-dev.example.com)
```

### Prerequisites

1. **Access** to dev environment infrastructure
2. **Infisical CLI** installed and authenticated
3. **Dev environment credentials** (Infisical, SSH, etc.)
4. **Dev domain access** (VPN, network access, or public domains)

### Key Differences from Local

- **No Docker on your PC**: Dependencies run as hosted services in dev environment
- **Infisical required**: No .env fallback for dev environment
- **Domain-based**: Uses dev-specific domains, not localhost
- **Shared resources**: Team members share the same dev environment

### Step-by-Step Setup

#### 1. Access Dev Environment

```bash
# SSH into dev environment (if applicable)
ssh user@dev-environment.example.com

# Or ensure VPN connection if dev services are internal
```

#### 2. Configure Infisical for Dev Environment

```bash
# Ensure Infisical CLI is installed
infisical --version

# Login to Infisical
infisical login

# Initialize for dev environment
infisical init
# Select project
# Select "dev" environment
```

**Verification:**

```bash
# List secrets in dev environment
infisical secrets list --env dev --path /workspace
infisical secrets list --env dev --path /server
infisical secrets list --env dev --path /admin
```

#### 3. Verify Dev Dependencies

Dev dependencies should already be running. Verify connectivity:

```bash
# Verify PostgreSQL connectivity
psql -h <DEV_POSTGRES_HOST> -U <DEV_POSTGRES_USER> -d spec_db -c "SELECT version();"

# Verify Zitadel accessibility
curl https://auth-dev.example.com/debug/healthz
# Expected: {"status":"ok"}
```

**Dev Environment Variables:**

- `POSTGRES_HOST`: Dev database hostname (e.g., `dev-db.internal` or `postgres.dev.example.com`)
- `ZITADEL_DOMAIN`: Dev Zitadel domain (e.g., `auth-dev.example.com`)
- `ADMIN_PORT`, `SERVER_PORT`: Dev-specific ports (or defaults 5176, 3002)

#### 4. Run Zitadel Bootstrap for Dev

Bootstrap Zitadel with dev-specific domains and redirect URIs:

```bash
# Set environment for dev
export INFISICAL_ENV=dev

# Run bootstrap
./scripts/bootstrap-zitadel-fully-automated.sh provision --env dev
```

**Dev-Specific Configuration:**

- **ZITADEL_DOMAIN**: `auth-dev.example.com` (not localhost)
- **Redirect URIs**:
  - Admin: `https://app-dev.example.com/auth/callback`
  - Server: `https://api-dev.example.com/auth/callback`
- **PAT**: Provided manually (not from Docker volume)

**Verification:**

```bash
./scripts/bootstrap-zitadel-fully-automated.sh status --env dev
./scripts/bootstrap-zitadel-fully-automated.sh verify --env dev
```

#### 5. Update Infisical with Bootstrap Output

Update Infisical secrets for dev environment:

```bash
# Update workspace secrets
infisical secrets set ZITADEL_ORG_ID="<org-id>" --env dev --path /workspace
infisical secrets set ZITADEL_PROJECT_ID="<project-id>" --env dev --path /workspace

# Update server secrets
infisical secrets set ZITADEL_ORG_ID="<org-id>" --env dev --path /server
infisical secrets set ZITADEL_PROJECT_ID="<project-id>" --env dev --path /server
infisical secrets set ZITADEL_OAUTH_CLIENT_ID="<oauth-client-id>" --env dev --path /server

# Update admin secrets
infisical secrets set VITE_ZITADEL_CLIENT_ID="<oauth-client-id>" --env dev --path /admin
infisical secrets set VITE_ZITADEL_ISSUER="https://auth-dev.example.com" --env dev --path /admin
infisical secrets set VITE_API_BASE="https://api-dev.example.com" --env dev --path /admin
```

#### 6. Start Applications in Dev Environment

Depending on how dev environment is configured:

**Option A: Using workspace CLI (if running on dev host)**

```bash
npm run workspace:start
```

**Option B: Using PM2 directly**

```bash
pm2 start ecosystem.config.js --env dev
```

**Option C: Using deployment scripts**

```bash
./scripts/deploy-dev.sh  # If available
```

#### 7. Verify Dev Deployment

```bash
# Check application health
curl https://api-dev.example.com/health
# Expected: {"status":"ok"}

# Access admin app
open https://app-dev.example.com

# Login with dev test user
# Email: test@example.com
# Password: <password-from-bootstrap>
```

**Dev Environment Monitoring:**

- Check logs via deployment platform or PM2
- Monitor resource usage
- Verify database connections
- Test authentication flows

### Dev Environment Management

```bash
# View logs (if using workspace CLI)
npm run workspace:logs -- --env dev

# Restart services
npm run workspace:restart -- --env dev

# Update secrets
infisical secrets set KEY="value" --env dev --path /server
```

### Troubleshooting Dev Environment

- **Cannot connect to Zitadel**: Verify domain accessibility, check firewall/VPN
- **Database connection failed**: Verify POSTGRES_HOST and credentials
- **Redirect URI mismatch**: Ensure bootstrap used dev domains
- **Infisical authentication failed**: Run `infisical login` again
- **SSL certificate errors**: Verify dev SSL certificates are valid

## Staging Environment Setup

This section covers deploying Spec Server to a staging environment using **full Docker Compose** deployment where all dependencies and applications run in containers.

### 🚀 Fast Track - Staging Deployment (Copy & Paste)

**Prerequisites:** SSH access to staging server, Docker + Docker Compose installed, Infisical CLI authenticated, staging DNS configured

```bash
# SSH to staging server
ssh user@staging.example.com

# Complete staging deployment in one command sequence
cd spec-server-2 && \
git pull origin main && \
cp .env.example .env && \
echo "ENVIRONMENT=staging" >> .env && \
npm install && \
infisical export --env staging > .env.staging && \
docker compose -f docker/docker-compose.staging.yml --env-file .env.staging up -d && \
./scripts/bootstrap-zitadel-fully-automated.sh provision --push-to-infisical && \
docker compose -f docker/docker-compose.staging.yml restart
```

**That's it!** Your staging environment is ready:

- Admin app: https://app-staging.example.com
- Server API: https://api-staging.example.com
- Zitadel: https://auth-staging.example.com

**Check status:** `docker compose -f docker/docker-compose.staging.yml ps`

---

### Architecture

```
Staging Server
└── Docker Compose
    ├── PostgreSQL (container)
    ├── Zitadel (container)
    ├── Login UI (container)
    ├── Server (container)
    └── Admin (container)
```

All services run within Docker network with external access via staging domains.

### Prerequisites

1. **Server access** (SSH to staging server)
2. **Docker** and **Docker Compose v2** installed on staging server
3. **Infisical CLI** on staging server
4. **Staging domains** configured (DNS, SSL certificates)
5. **Infisical authentication** for staging environment

### Step-by-Step Setup

#### 1. Prepare Staging Server

```bash
# SSH into staging server
ssh user@staging-server.example.com

# Install Docker (if not installed)
curl -fsSL https://get.docker.com | sh

# Install Docker Compose v2
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Verify
docker --version
docker compose version
```

#### 2. Clone Repository

```bash
git clone <repository-url>
cd spec-server-2
npm install  # For build scripts if needed
```

#### 3. Configure Infisical for Staging

```bash
# Install Infisical CLI
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical

# Login
infisical login

# Initialize for staging
infisical init
# Select project
# Select "staging" environment
```

#### 4. Configure Staging Environment Variables

Update Infisical with staging-specific configuration:

```bash
# Workspace variables (/workspace)
infisical secrets set ZITADEL_DOMAIN="auth-staging.example.com" --env staging --path /workspace
infisical secrets set ADMIN_PORT="5176" --env staging --path /workspace
infisical secrets set SERVER_PORT="3002" --env staging --path /workspace

# Docker variables (/docker)
infisical secrets set POSTGRES_HOST="postgres" --env staging --path /docker
infisical secrets set POSTGRES_USER="postgres" --env staging --path /docker
infisical secrets set POSTGRES_PASSWORD="<secure-password>" --env staging --path /docker
infisical secrets set POSTGRES_DB="spec_db" --env staging --path /docker

# Server variables (/server)
infisical secrets set POSTGRES_HOST="postgres" --env staging --path /server
infisical secrets set ZITADEL_ISSUER="https://auth-staging.example.com" --env staging --path /server
infisical secrets set ZITADEL_DOMAIN="auth-staging.example.com" --env staging --path /server

# Admin variables (/admin)
infisical secrets set VITE_API_BASE="https://api-staging.example.com" --env staging --path /admin
infisical secrets set VITE_ZITADEL_ISSUER="https://auth-staging.example.com" --env staging --path /admin
infisical secrets set VITE_ZITADEL_REDIRECT_URI="https://app-staging.example.com/auth/callback" --env staging --path /admin
```

#### 5. Configure SSL Certificates

Staging requires SSL certificates for HTTPS access:

**Option A: Let's Encrypt (Automated)**

```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificates
sudo certbot certonly --standalone -d auth-staging.example.com
sudo certbot certonly --standalone -d app-staging.example.com
sudo certbot certonly --standalone -d api-staging.example.com

# Certificates saved to /etc/letsencrypt/live/
```

**Option B: Manual certificates**

- Place SSL certificates in `docker/certs/` directory
- Update `docker-compose.staging.yml` to mount certificate paths

#### 6. Deploy with Docker Compose

```bash
# Export Infisical secrets to .env file for Docker Compose
infisical export --env staging > .env.staging

# Start services with staging configuration
docker compose -f docker/docker-compose.staging.yml --env-file .env.staging up -d
```

**What Happens:**

- All containers start: PostgreSQL, Zitadel, Login UI, Server, Admin
- Zitadel initializes database on first run
- Services communicate via Docker internal network
- External access via configured domains with SSL

#### 7. Run Zitadel Bootstrap for Staging

```bash
# Bootstrap with staging environment and automatic Infisical push (recommended)
./scripts/bootstrap-zitadel-fully-automated.sh provision \
  --push-to-infisical \
  --infisical-env staging \
  --infisical-path /server

# Or without automatic push (manual update required)
INFISICAL_ENV=staging ./scripts/bootstrap-zitadel-fully-automated.sh provision --env staging
```

**Staging-Specific Configuration:**

- **ZITADEL_DOMAIN**: `auth-staging.example.com`
- **Redirect URIs**:
  - Admin: `https://app-staging.example.com/auth/callback`
  - Server: `https://api-staging.example.com/auth/callback`
- **PAT**: Manually provided (prompt during bootstrap)

#### 8. Update Infisical with Bootstrap Output

> **💡 Tip:** If you used `--push-to-infisical` flag, this step is already done! Skip to step 9 (Restart Services).

```bash
# Update staging Infisical with bootstrap results
infisical secrets set ZITADEL_ORG_ID="<org-id>" --env staging --path /workspace
infisical secrets set ZITADEL_PROJECT_ID="<project-id>" --env staging --path /workspace
infisical secrets set ZITADEL_OAUTH_CLIENT_ID="<client-id>" --env staging --path /server
infisical secrets set VITE_ZITADEL_CLIENT_ID="<client-id>" --env staging --path /admin
```

#### 9. Restart Services to Load New Configuration

```bash
# Restart all containers
docker compose -f docker/docker-compose.staging.yml restart

# Or rebuild and restart
infisical export --env staging > .env.staging
docker compose -f docker/docker-compose.staging.yml --env-file .env.staging up -d --force-recreate
```

#### 10. Verify Staging Deployment

```bash
# Check container health
docker compose -f docker/docker-compose.staging.yml ps

# Expected: All containers showing "healthy" status

# Verify Zitadel
curl https://auth-staging.example.com/debug/healthz

# Verify Server
curl https://api-staging.example.com/health

# Access Admin
open https://app-staging.example.com

# Login with staging test user
# Email: test@example.com
# Password: <bootstrap-password>
```

**Health Check Checklist:**

- [ ] All containers running (postgres, zitadel, admin, server)
- [ ] Zitadel accessible at staging domain with SSL
- [ ] Server health endpoint returns 200
- [ ] Admin loads at staging domain with SSL
- [ ] Can login with test user
- [ ] API requests succeed
- [ ] Database accessible from containers

### Staging Environment Management

#### Viewing Logs

```bash
# All services
docker compose -f docker/docker-compose.staging.yml logs -f

# Specific service
docker compose -f docker/docker-compose.staging.yml logs -f server
docker compose -f docker/docker-compose.staging.yml logs -f admin
docker compose -f docker/docker-compose.staging.yml logs -f zitadel
```

#### Restarting Services

```bash
# Restart all
docker compose -f docker/docker-compose.staging.yml restart

# Restart specific service
docker compose -f docker/docker-compose.staging.yml restart server
```

#### Updating Configuration

```bash
# Update Infisical secrets
infisical secrets set KEY="value" --env staging --path /server

# Export to .env
infisical export --env staging > .env.staging

# Recreate containers with new config
docker compose -f docker/docker-compose.staging.yml --env-file .env.staging up -d --force-recreate
```

#### Backing Up Database

```bash
# Backup PostgreSQL
docker exec spec-staging-postgres pg_dump -U postgres spec_db > backup-staging-$(date +%Y%m%d).sql

# Backup to remote location
scp backup-staging-*.sql backup-server:/backups/
```

### Monitoring and Maintenance

**Monitoring:**

- Container health: `docker ps --filter "name=spec-staging"`
- Resource usage: `docker stats`
- Logs: `docker compose logs -f`

**Maintenance:**

- **SSL renewal**: Automate with certbot cron job
- **Database backups**: Schedule daily backups
- **Log rotation**: Configure Docker logging driver
- **Updates**: Pull latest images, rebuild, redeploy

### Troubleshooting Staging

- **Containers not starting**: Check `docker compose logs` for errors
- **SSL certificate errors**: Verify certificates are valid and mounted correctly
- **Domain not accessible**: Check DNS, firewall rules
- **Database connection failed**: Verify POSTGRES_HOST is "postgres" (Docker service name)
- **Bootstrap fails**: Ensure Zitadel container is healthy before bootstrap
- **Redirect URI mismatch**: Verify OAuth app has staging domains

## Production Environment Setup

This section covers deploying Spec Server to production using **full Docker Compose** deployment with production-grade security, monitoring, and reliability.

### 🚀 Fast Track - Production Deployment (Copy & Paste)

**⚠️ CRITICAL:** Only run this after verifying all security prerequisites below!

**Prerequisites:** Production server, Docker + Docker Compose, Infisical CLI authenticated, SSL certificates configured, firewall rules in place, monitoring configured

```bash
# SSH to production server
ssh user@production.example.com

# Complete production deployment in one command sequence
cd spec-server-2 && \
git pull origin main && \
cp .env.example .env && \
echo "ENVIRONMENT=production" >> .env && \
npm install && \
infisical export --env production > .env.production && \
chmod 600 .env.production && \
docker compose -f docker/docker-compose.yml --env-file .env.production up -d && \
./scripts/bootstrap-zitadel-fully-automated.sh provision --push-to-infisical && \
docker compose -f docker/docker-compose.yml restart && \
rm .env.production
```

**⚠️ SECURITY CHECKLIST AFTER DEPLOYMENT:**

- [ ] Save bootstrap admin credentials to secure password manager
- [ ] Delete any local credential files
- [ ] Verify SSL certificates are valid
- [ ] Test all authentication flows
- [ ] Configure automated backups
- [ ] Set up monitoring and alerts
- [ ] Document rollback procedures

**Production URLs:**

- Admin app: https://app.example.com
- Server API: https://api.example.com
- Zitadel: https://auth.example.com

**Check status:** `docker compose -f docker/docker-compose.yml ps`

---

### Architecture

```
Production Server
└── Docker Compose (Production Config)
    ├── PostgreSQL (container) + backup automation
    ├── Zitadel (container) + high availability
    ├── Login UI (container)
    ├── Server (container) + monitoring
    └── Admin (container) + CDN
```

### Critical Production Requirements

**Security:**

- ✅ Infisical for all secrets (no .env files with production credentials)
- ✅ SSL/TLS certificates from trusted CA
- ✅ Strong passwords and JWT keys
- ✅ Firewall rules limiting access
- ✅ Regular security audits

**Reliability:**

- ✅ Automated backups (database, configuration)
- ✅ Health checks and auto-restart
- ✅ Monitoring and alerting
- ✅ Disaster recovery plan
- ✅ Rollback capability

**Performance:**

- ✅ Resource limits and reservations
- ✅ Database connection pooling
- ✅ CDN for static assets
- ✅ Log rotation
- ✅ Performance monitoring

### Prerequisites

1. **Production server** with adequate resources (4+ CPU, 8GB+ RAM)
2. **Docker** and **Docker Compose v2**
3. **Infisical CLI** (production authentication)
4. **Production domains** with valid SSL certificates
5. **Backup storage** (S3, network storage, etc.)
6. **Monitoring system** (Prometheus, Datadog, etc.)
7. **Access control** (SSH keys, VPN, IP allowlisting)

### Step-by-Step Setup

#### 1. Prepare Production Server

```bash
# SSH with production credentials
ssh -i production-key.pem user@prod-server.example.com

# Harden server security
sudo ufw enable
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (for cert renewal)
sudo ufw allow 443/tcp  # HTTPS

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose v2
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Verify
docker --version
docker compose version
```

#### 2. Clone Repository (Production Branch)

```bash
# Clone from production branch
git clone -b production <repository-url>
cd spec-server-2

# Verify clean state
git status
```

#### 3. Configure Infisical for Production

```bash
# Install Infisical CLI
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical

# Login with production credentials
infisical login

# Initialize for production environment
infisical init
# Select project
# Select "production" environment
```

**⚠️ CRITICAL**: Production Infisical setup requires:

- Separate Infisical project or strict access control
- MFA enabled for all Infisical accounts
- Audit logging enabled
- Separate service tokens for CI/CD vs manual access

#### 4. Configure Production Secrets in Infisical

**⚠️ Use strong, unique values for production. Never reuse dev/staging credentials.**

```bash
# Workspace variables (/workspace)
infisical secrets set ZITADEL_DOMAIN="auth.example.com" --env production --path /workspace
infisical secrets set ADMIN_PORT="5176" --env production --path /workspace
infisical secrets set SERVER_PORT="3002" --env production --path /workspace

# Docker variables (/docker) - STRONG PASSWORDS REQUIRED
infisical secrets set POSTGRES_PASSWORD="$(openssl rand -base64 32)" --env production --path /docker
infisical secrets set ZITADEL_MASTERKEY="$(openssl rand -base64 32)" --env production --path /docker

# Server variables (/server)
infisical secrets set POSTGRES_HOST="postgres" --env production --path /server
infisical secrets set ZITADEL_ISSUER="https://auth.example.com" --env production --path /server
infisical secrets set GOOGLE_API_KEY="<production-api-key>" --env production --path /server
infisical secrets set SESSION_SECRET="$(openssl rand -base64 32)" --env production --path /server

# Admin variables (/admin)
infisical secrets set VITE_API_BASE="https://api.example.com" --env production --path /admin
infisical secrets set VITE_ZITADEL_ISSUER="https://auth.example.com" --env production --path /admin
infisical secrets set VITE_ZITADEL_REDIRECT_URI="https://app.example.com/auth/callback" --env production --path /admin
```

#### 5. Configure Production SSL Certificates

**Option A: Let's Encrypt with auto-renewal**

```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificates
sudo certbot certonly --standalone -d auth.example.com
sudo certbot certonly --standalone -d app.example.com
sudo certbot certonly --standalone -d api.example.com

# Setup auto-renewal
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet && docker compose -f /path/to/docker-compose.yml restart
```

**Option B: Wildcard certificate**

```bash
sudo certbot certonly --dns-<provider> -d *.example.com -d example.com
```

#### 6. Deploy with Production Docker Compose

```bash
# Export production secrets (never commit this file)
infisical export --env production > .env.production

# Set restrictive permissions
chmod 600 .env.production

# Deploy production stack
docker compose -f docker/docker-compose.yml --env-file .env.production up -d

# Verify all containers started
docker compose -f docker/docker-compose.yml ps
```

#### 7. Run Zitadel Bootstrap for Production

```bash
# Bootstrap with production environment and automatic Infisical push (recommended)
./scripts/bootstrap-zitadel-fully-automated.sh provision \
  --push-to-infisical \
  --infisical-env production \
  --infisical-path /server

# Or without automatic push (manual update required)
INFISICAL_ENV=production ./scripts/bootstrap-zitadel-fully-automated.sh provision --env production
```

**Production Bootstrap Configuration:**

- **ZITADEL_DOMAIN**: `auth.example.com` (production domain)
- **Redirect URIs**: Production domains with HTTPS
- **Admin credentials**: Strong unique password
- **Service account keys**: Long expiration (production stability)
- **PAT**: Securely stored after bootstrap (Infisical, secrets manager)

**⚠️ IMMEDIATELY SECURE**:

- Save bootstrap output to secure location (password manager, Infisical)
- Delete any local files with credentials
- Rotate PAT after initial setup

#### 8. Update Infisical with Bootstrap Output

> **💡 Tip:** If you used `--push-to-infisical` flag, this step is already done! Skip to step 9 (Restart Services).

```bash
# Update production Infisical
infisical secrets set ZITADEL_ORG_ID="<org-id>" --env production --path /workspace
infisical secrets set ZITADEL_PROJECT_ID="<project-id>" --env production --path /workspace
infisical secrets set ZITADEL_OAUTH_CLIENT_ID="<client-id>" --env production --path /server
infisical secrets set VITE_ZITADEL_CLIENT_ID="<client-id>" --env production --path /admin

# CRITICAL: Save admin/test user credentials to secure storage
# DO NOT store in plaintext anywhere
```

#### 9. Restart Services with Updated Configuration

```bash
# Re-export Infisical secrets
infisical export --env production > .env.production
chmod 600 .env.production

# Restart with new configuration
docker compose -f docker/docker-compose.yml --env-file .env.production up -d --force-recreate

# Verify server logs show dual SA mode
docker compose -f docker/docker-compose.yml logs server | grep "Dual service account"
```

#### 10. Production Verification

```bash
# Health checks
curl https://auth.example.com/debug/healthz
curl https://api.example.com/health

# SSL verification
curl -vI https://app.example.com 2>&1 | grep "SSL certificate verify"
# Expected: SSL certificate verify ok

# Login test
open https://app.example.com
# Test with production admin account
```

**Production Verification Checklist:**

- [ ] All containers healthy
- [ ] SSL certificates valid (check expiration)
- [ ] Zitadel accessible at production domain
- [ ] Server API responds
- [ ] Admin app loads
- [ ] Can login with admin user
- [ ] Token introspection works
- [ ] API requests succeed
- [ ] Database backups configured
- [ ] Monitoring/alerts configured
- [ ] Firewall rules in place

### Production Operations

#### Monitoring

```bash
# Container health
docker ps --filter "name=spec-prod"

# Resource usage
docker stats

# Service logs (streamed to monitoring system)
docker compose -f docker/docker-compose.yml logs -f --tail=100 server
```

**Configure monitoring for:**

- Container health and restarts
- CPU/memory usage
- Disk space
- Database connections
- API response times
- Error rates
- SSL certificate expiration

#### Backups

**Automated Database Backups:**

```bash
# Create backup script
cat > /usr/local/bin/backup-prod-db.sh << 'BACKUP_SCRIPT'
#!/bin/bash
BACKUP_DIR=/backups/postgres
DATE=$(date +%Y%m%d-%H%M%S)
docker exec spec-prod-postgres pg_dump -U postgres spec_db | gzip > $BACKUP_DIR/backup-$DATE.sql.gz
# Upload to S3 or remote storage
aws s3 cp $BACKUP_DIR/backup-$DATE.sql.gz s3://prod-backups/postgres/
# Retain only last 30 days locally
find $BACKUP_DIR -name "backup-*.sql.gz" -mtime +30 -delete
BACKUP_SCRIPT

chmod +x /usr/local/bin/backup-prod-db.sh

# Schedule daily backups
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-prod-db.sh
```

**Configuration Backups:**

```bash
# Backup Infisical secrets
infisical export --env production > backups/secrets-$(date +%Y%m%d).env

# Backup JWT keys
tar -czf backups/secrets-$(date +%Y%m%d).tar.gz secrets/

# Upload to secure storage
```

#### Updates and Rollbacks

**Deployment Update:**

```bash
# 1. Backup current state
./scripts/backup-production.sh

# 2. Pull latest code
git fetch origin
git checkout <release-tag>

# 3. Rebuild images
docker compose -f docker/docker-compose.yml build

# 4. Rolling restart (minimize downtime)
docker compose -f docker/docker-compose.yml up -d --no-deps --build server
docker compose -f docker/docker-compose.yml up -d --no-deps --build admin

# 5. Verify
curl https://api.example.com/health
```

**Rollback Procedure:**

```bash
# 1. Stop current deployment
docker compose -f docker/docker-compose.yml down

# 2. Checkout previous version
git checkout <previous-tag>

# 3. Restore from backup if needed
docker exec spec-prod-postgres psql -U postgres spec_db < backup-<timestamp>.sql

# 4. Redeploy
docker compose -f docker/docker-compose.yml up -d
```

#### Security Maintenance

- **Rotate secrets** every 90 days (database passwords, API keys)
- **Update dependencies** regularly (Docker images, npm packages)
- **Review access logs** weekly
- **Audit Infisical access** monthly
- **Test disaster recovery** quarterly

### Production Troubleshooting

**Container issues:**

```bash
# Check container logs
docker compose -f docker/docker-compose.yml logs <service>

# Restart unhealthy container
docker compose -f docker/docker-compose.yml restart <service>

# Check resource limits
docker stats
```

**SSL certificate issues:**

```bash
# Check certificate expiration
echo | openssl s_client -servername api.example.com -connect api.example.com:443 2>/dev/null | openssl x509 -noout -dates

# Renew certificate
sudo certbot renew

# Restart services after renewal
docker compose -f docker/docker-compose.yml restart
```

**Database issues:**

```bash
# Check PostgreSQL logs
docker compose -f docker/docker-compose.yml logs postgres

# Enter database
docker exec -it spec-prod-postgres psql -U postgres spec_db

# Check connections
SELECT * FROM pg_stat_activity;
```

**Performance issues:**

```bash
# Check resource usage
docker stats

# Check slow queries
docker exec spec-prod-postgres psql -U postgres spec_db -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Review logs for errors
docker compose logs -f server | grep ERROR
```

### Production Security Best Practices

1. **Never use .env files** - Always use Infisical for production secrets
2. **Rotate credentials regularly** - Passwords, API keys, JWT keys
3. **Enable MFA** - For all production access (Infisical, SSH, cloud console)
4. **Audit logging** - Enable and review access logs
5. **Principle of least privilege** - Limit access to production systems
6. **Encrypted backups** - Encrypt database and secret backups
7. **Secure secrets at rest** - Use Infisical, AWS Secrets Manager, or HashiCorp Vault
8. **Monitor security events** - Failed logins, unusual traffic
9. **Incident response plan** - Document procedures for security incidents
10. **Regular security audits** - Quarterly reviews of configurations and access

## Environment Variables Reference

This section provides a comprehensive reference for all environment variables used across the four environments.

### Variable Categories

Variables are classified into three categories:

1. **Static**: Set once, rarely change (ports, feature flags)
2. **Environment-specific**: Change per environment (domains, hostnames, URLs)
3. **Bootstrap-generated**: Change when bootstrap runs (organization IDs, client IDs, JWT paths)

### Infisical Folder Structure

Variables are organized into four Infisical paths:

| Path         | Purpose                 | ~Count | Loaded by                       | When               |
| ------------ | ----------------------- | ------ | ------------------------------- | ------------------ |
| `/workspace` | Workspace configuration | ~15    | Workspace CLI, bootstrap script | Startup, bootstrap |
| `/docker`    | Docker dependencies     | ~11    | Docker Compose                  | Startup            |
| `/server`    | Backend application     | ~118   | Server app via Infisical SDK    | Runtime            |
| `/admin`     | Frontend application    | ~10    | Admin build via Vite plugin     | Build time         |

### Workspace Variables

Located in Infisical path: `/workspace` or root `.env` file

| Variable                 | Default                | Used When           | Changes After Bootstrap | Required | Description                          |
| ------------------------ | ---------------------- | ------------------- | ----------------------- | -------- | ------------------------------------ |
| `NAMESPACE`              | `spec-server-2`        | Startup             | No                      | Yes      | PM2 namespace for process isolation  |
| `ADMIN_PORT`             | `5176`                 | Startup             | No                      | Yes      | Frontend dev server port             |
| `SERVER_PORT`            | `3002`                 | Startup             | No                      | Yes      | Backend API port                     |
| `ZITADEL_DOMAIN`         | `localhost:8200`       | Bootstrap + Startup | No                      | Yes      | Zitadel domain (with port for local) |
| `TEST_USER_EMAIL`        | `test@example.com`     | Bootstrap           | No                      | Optional | Manual test user email               |
| `TEST_USER_PASSWORD`     | `TestPassword123!`     | Bootstrap           | No                      | Optional | Manual test user password            |
| `E2E_TEST_USER_EMAIL`    | `e2e-test@example.com` | Bootstrap           | No                      | Optional | E2E test user email                  |
| `E2E_TEST_USER_PASSWORD` | `E2eTestPassword123!`  | Bootstrap           | No                      | Optional | E2E test user password               |
| `POSTGRES_HOST`          | `localhost`            | Runtime             | No                      | Optional | Database host (for MCP tools)        |
| `POSTGRES_PORT`          | `5432`                 | Runtime             | No                      | Optional | Database port (for MCP tools)        |
| `POSTGRES_USER`          | `spec`                 | Runtime             | No                      | Optional | Database user (for MCP tools)        |
| `POSTGRES_DB`            | `spec`                 | Runtime             | No                      | Optional | Database name (for MCP tools)        |
| `POSTGRES_PASSWORD`      | `spec`                 | Runtime             | No                      | Optional | Database password (for MCP tools)    |
| `GCP_PROJECT_ID`         | `spec-server`          | Runtime             | No                      | Optional | GCP project for dev scripts          |
| `VERTEX_AI_LOCATION`     | `us-central1`          | Runtime             | No                      | Optional | Vertex AI region                     |

**Environment-Specific Values:**

| Variable         | Local            | Dev                    | Staging                    | Production          |
| ---------------- | ---------------- | ---------------------- | -------------------------- | ------------------- |
| `ZITADEL_DOMAIN` | `localhost:8200` | `auth-dev.example.com` | `auth-staging.example.com` | `auth.example.com`  |
| `ADMIN_PORT`     | `5176`           | `5176`                 | `5176`                     | `5176`              |
| `SERVER_PORT`    | `3002`           | `3002`                 | `3002`                     | `3002`              |
| `POSTGRES_HOST`  | `localhost`      | `dev-db.internal`      | `postgres` (Docker)        | `postgres` (Docker) |

### Server Variables

Located in Infisical path: `/server` or `apps/server/.env`

#### Core Configuration

| Variable      | Default                 | Used When | Changes After Bootstrap | Required | Description          |
| ------------- | ----------------------- | --------- | ----------------------- | -------- | -------------------- |
| `PORT`        | `3002`                  | Startup   | No                      | Yes      | Server HTTP port     |
| `NODE_ENV`    | `development`           | Runtime   | No                      | Yes      | Node environment     |
| `CORS_ORIGIN` | `http://localhost:5176` | Startup   | No                      | Yes      | Allowed CORS origins |

#### Database Configuration

| Variable            | Default     | Used When | Changes After Bootstrap | Required | Description              |
| ------------------- | ----------- | --------- | ----------------------- | -------- | ------------------------ |
| `POSTGRES_HOST`     | `localhost` | Startup   | No                      | Yes      | PostgreSQL host          |
| `POSTGRES_PORT`     | `5432`      | Startup   | No                      | Yes      | PostgreSQL port          |
| `POSTGRES_USER`     | `spec`      | Startup   | No                      | Yes      | PostgreSQL user          |
| `POSTGRES_PASSWORD` | `spec`      | Startup   | No                      | Yes      | PostgreSQL password      |
| `POSTGRES_DB`       | `spec_db`   | Startup   | No                      | Yes      | PostgreSQL database name |
| `DB_AUTOINIT`       | `true`      | Startup   | No                      | Optional | Auto-initialize database |
| `SKIP_DB`           | `false`     | Startup   | No                      | Optional | Skip database connection |
| `SKIP_MIGRATIONS`   | `false`     | Startup   | No                      | Optional | Skip running migrations  |

#### Zitadel Authentication

| Variable                  | Default                                       | Used When | Changes After Bootstrap | Required | Description                    |
| ------------------------- | --------------------------------------------- | --------- | ----------------------- | -------- | ------------------------------ |
| `ZITADEL_ISSUER`          | `http://localhost:8200`                       | Runtime   | No                      | Yes      | Zitadel issuer URL             |
| `ZITADEL_MAIN_ORG_ID`     | _(generated)_                                 | Runtime   | **YES**                 | Yes      | Organization ID from bootstrap |
| `ZITADEL_PROJECT_ID`      | _(generated)_                                 | Runtime   | **YES**                 | Yes      | Project ID from bootstrap      |
| `ZITADEL_OAUTH_CLIENT_ID` | _(generated)_                                 | Runtime   | **YES**                 | Yes      | OAuth client ID from bootstrap |
| `ZITADEL_CLIENT_JWT_PATH` | `secrets/zitadel-client-service-account.json` | Startup   | **YES**                 | Yes      | CLIENT SA JWT key path         |
| `ZITADEL_API_JWT_PATH`    | `secrets/zitadel-api-service-account.json`    | Startup   | **YES**                 | Yes      | API SA JWT key path            |

#### GCP and AI Configuration

| Variable              | Default                | Used When | Changes After Bootstrap | Required | Description                |
| --------------------- | ---------------------- | --------- | ----------------------- | -------- | -------------------------- |
| `GCP_PROJECT_ID`      | `spec-server`          | Runtime   | No                      | Optional | Google Cloud project ID    |
| `GOOGLE_API_KEY`      | _(secret)_             | Runtime   | No                      | Optional | Google API key for Gemini  |
| `VERTEX_AI_LOCATION`  | `us-central1`          | Runtime   | No                      | Optional | Vertex AI region           |
| `VERTEX_AI_MODEL`     | `gemini-2.0-flash-exp` | Runtime   | No                      | Optional | AI model name              |
| `EMBEDDING_PROVIDER`  | `google-genai`         | Runtime   | No                      | Optional | Embedding provider         |
| `EMBEDDING_DIMENSION` | `768`                  | Runtime   | No                      | Optional | Embedding vector dimension |

#### Chat Configuration

| Variable                   | Default | Used When | Changes After Bootstrap | Required | Description              |
| -------------------------- | ------- | --------- | ----------------------- | -------- | ------------------------ |
| `CHAT_MODEL_ENABLED`       | `true`  | Runtime   | No                      | Optional | Enable chat feature      |
| `CHAT_ENABLE_CITATIONS`    | `true`  | Runtime   | No                      | Optional | Enable citations in chat |
| `CHAT_ENABLE_GRAPH_SEARCH` | `true`  | Runtime   | No                      | Optional | Enable graph search      |
| `CHAT_ENABLE_MCP`          | `false` | Runtime   | No                      | Optional | Enable MCP integration   |

#### Extraction Worker Configuration

| Variable                                 | Default | Used When | Changes After Bootstrap | Required | Description              |
| ---------------------------------------- | ------- | --------- | ----------------------- | -------- | ------------------------ |
| `EXTRACTION_WORKER_ENABLED`              | `true`  | Runtime   | No                      | Optional | Enable extraction worker |
| `EXTRACTION_WORKER_POLL_INTERVAL_MS`     | `5000`  | Runtime   | No                      | Optional | Worker poll interval     |
| `EXTRACTION_CHUNK_SIZE`                  | `1000`  | Runtime   | No                      | Optional | Document chunk size      |
| `EXTRACTION_CHUNK_OVERLAP`               | `200`   | Runtime   | No                      | Optional | Chunk overlap size       |
| `EXTRACTION_CONFIDENCE_THRESHOLD_MIN`    | `0.3`   | Runtime   | No                      | Optional | Minimum confidence       |
| `EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW` | `0.7`   | Runtime   | No                      | Optional | Review threshold         |
| `EXTRACTION_CONFIDENCE_THRESHOLD_AUTO`   | `0.9`   | Runtime   | No                      | Optional | Auto-accept threshold    |

#### LangSmith Tracing

| Variable             | Default                           | Used When | Changes After Bootstrap | Required | Description              |
| -------------------- | --------------------------------- | --------- | ----------------------- | -------- | ------------------------ |
| `LANGSMITH_TRACING`  | `false`                           | Runtime   | No                      | Optional | Enable LangSmith tracing |
| `LANGSMITH_ENDPOINT` | `https://api.smith.langchain.com` | Runtime   | No                      | Optional | LangSmith API endpoint   |
| `LANGSMITH_API_KEY`  | _(secret)_                        | Runtime   | No                      | Optional | LangSmith API key        |
| `LANGSMITH_PROJECT`  | `spec-server`                     | Runtime   | No                      | Optional | LangSmith project name   |

**Note:** See `apps/server/.env.example` for complete list of all 118+ server variables.

### Admin Variables

Located in Infisical path: `/admin` or `apps/admin/.env`

**⚠️ Only `VITE_*` variables are exposed to the browser.**

| Variable                                | Default                               | Used When       | Changes After Bootstrap | Required | Description                              |
| --------------------------------------- | ------------------------------------- | --------------- | ----------------------- | -------- | ---------------------------------------- |
| `VITE_ZITADEL_ISSUER`                   | `http://localhost:8200`               | Build + Runtime | No                      | Optional | Zitadel issuer URL                       |
| `VITE_ZITADEL_CLIENT_ID`                | _(generated)_                         | Build           | **YES**                 | Yes      | OAuth client ID from bootstrap           |
| `VITE_ZITADEL_REDIRECT_URI`             | `http://localhost:5176/auth/callback` | Build           | No                      | Optional | OAuth callback URL                       |
| `VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI` | `http://localhost:5176/`              | Build           | No                      | Optional | Post-logout redirect                     |
| `VITE_ZITADEL_SCOPES`                   | `openid profile email offline_access` | Build           | No                      | Optional | OAuth scopes                             |
| `VITE_ZITADEL_AUDIENCE`                 | `spec-api`                            | Build           | No                      | Optional | OAuth audience                           |
| `VITE_API_BASE`                         | _(empty)_                             | Build           | No                      | Optional | Backend API URL (proxy if empty)         |
| `VITE_ENV`                              | `development`                         | Build           | No                      | Optional | Environment name in UI                   |
| `VITE_CLIENT_LOGGING`                   | _(empty)_                             | Build           | No                      | Optional | Client logging toggle                    |
| `ADMIN_PORT`                            | `5176`                                | Startup         | No                      | Optional | Dev server port (not exposed to browser) |

**Environment-Specific Values:**

| Variable                    | Local                                 | Dev                                         | Staging                                         | Production                              |
| --------------------------- | ------------------------------------- | ------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| `VITE_ZITADEL_ISSUER`       | `http://localhost:8200`               | `https://auth-dev.example.com`              | `https://auth-staging.example.com`              | `https://auth.example.com`              |
| `VITE_ZITADEL_CLIENT_ID`    | _(from bootstrap)_                    | _(from bootstrap)_                          | _(from bootstrap)_                              | _(from bootstrap)_                      |
| `VITE_ZITADEL_REDIRECT_URI` | `http://localhost:5176/auth/callback` | `https://app-dev.example.com/auth/callback` | `https://app-staging.example.com/auth/callback` | `https://app.example.com/auth/callback` |
| `VITE_API_BASE`             | _(empty, uses proxy)_                 | `https://api-dev.example.com`               | `https://api-staging.example.com`               | `https://api.example.com`               |

### Docker Dependency Variables

Located in Infisical path: `/docker` or `docker/.env`

| Variable                                  | Default                            | Used When | Changes After Bootstrap | Required | Description                              |
| ----------------------------------------- | ---------------------------------- | --------- | ----------------------- | -------- | ---------------------------------------- |
| `ZITADEL_MASTERKEY`                       | `MasterkeyNeedsToHave32Characters` | Startup   | No                      | Yes      | Zitadel encryption master key (32 chars) |
| `ZITADEL_EXTERNALDOMAIN`                  | `localhost`                        | Startup   | No                      | Yes      | External domain for Zitadel              |
| `ZITADEL_EXTERNALSECURE`                  | `false`                            | Startup   | No                      | Yes      | Whether external domain uses HTTPS       |
| `ZITADEL_TLS_ENABLED`                     | `false`                            | Startup   | No                      | Optional | Enable TLS for Zitadel                   |
| `ZITADEL_DATABASE_POSTGRES_USER_PASSWORD` | `zitadel`                          | Startup   | No                      | Yes      | Zitadel database password                |
| `ZITADEL_HTTP_PORT`                       | `8100`                             | Startup   | No                      | Optional | Zitadel HTTP port mapping                |
| `ZITADEL_LOGIN_PORT`                      | `8101`                             | Startup   | No                      | Optional | Zitadel login UI port mapping            |
| `POSTGRES_USER`                           | `spec`                             | Startup   | No                      | Yes      | PostgreSQL superuser                     |
| `POSTGRES_PASSWORD`                       | `spec`                             | Startup   | No                      | Yes      | PostgreSQL superuser password            |
| `POSTGRES_DB`                             | `spec_db`                          | Startup   | No                      | Yes      | PostgreSQL default database              |

**Environment-Specific Values:**

| Variable                 | Local        | Staging                    | Production                   |
| ------------------------ | ------------ | -------------------------- | ---------------------------- |
| `ZITADEL_EXTERNALDOMAIN` | `localhost`  | `auth-staging.example.com` | `auth.example.com`           |
| `ZITADEL_EXTERNALSECURE` | `false`      | `true`                     | `true`                       |
| `POSTGRES_PASSWORD`      | `spec` (dev) | Strong password            | Strong unique password       |
| `ZITADEL_MASTERKEY`      | Dev key      | Strong key (32 chars)      | Strong unique key (32 chars) |

### Configuration Precedence

Variables are loaded in this order (later overrides earlier):

1. **Default values** in code
2. **`.env.example`** files (template, not loaded at runtime)
3. **Infisical** (environment-specific: local/dev/staging/production)
4. **`.env`** files (local only, fallback when Infisical unavailable)
5. **`.env.local`** files (local only, user-specific overrides)
6. **Environment variables** (CI/CD, Docker Compose)

**Important Notes:**

- **Local**: Infisical recommended, `.env` fallback available
- **Dev/Staging/Production**: Infisical required, no `.env` fallback
- **Bootstrap outputs** must be updated in Infisical after running bootstrap
- **Never commit** `.env` files with real credentials (use `.env.example` templates)
- **Production** must use Infisical or secure secrets management (never `.env` files)

## Infisical Configuration

This section covers Infisical CLI setup, folder structure, and workflows for managing secrets across environments.

### Infisical CLI Installation

**macOS:**

```bash
brew install infisical/get-cli/infisical
```

**Linux:**

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical
```

**Verification:**

```bash
infisical --version
```

### Initial Authentication

```bash
# Login to Infisical
infisical login

# Browser opens for authentication
# After login, CLI is authenticated
```

### Project Initialization

```bash
# Initialize Infisical for this project
cd /path/to/spec-server-2
infisical init

# Follow prompts:
# - Select your project
# - Select environment (local/dev/staging/production)
```

This creates `.infisical.json` in project root (gitignored).

### Folder/Path Structure

Infisical secrets are organized into four paths per environment:

```
Project: Spec Server
├── Environment: local
│   ├── /workspace  (~15 secrets) - Workspace CLI config
│   ├── /docker     (~11 secrets) - Docker dependency config
│   ├── /server     (~118 secrets) - Backend app config
│   └── /admin      (~10 secrets) - Frontend app config
├── Environment: dev
│   ├── /workspace
│   ├── /docker
│   ├── /server
│   └── /admin
├── Environment: staging
│   └── ... (same structure)
└── Environment: production
    └── ... (same structure)
```

### Loading Patterns

**1. Bootstrap Script** (reads from `/workspace` and `/docker`):

```bash
# Bootstrap loads from Infisical paths:
# - /workspace: ZITADEL_DOMAIN, NAMESPACE, ports
# - /docker: POSTGRES_* for database connection
./scripts/bootstrap-zitadel-fully-automated.sh provision
```

**2. Server Runtime** (loads from `/server` via Infisical SDK):

```javascript
// apps/server/src/config/infisical.ts
// Automatically loads at runtime if INFISICAL_ENABLED=true
```

**3. Admin Build Time** (loads from `/admin` via Vite plugin):

```javascript
// apps/admin/vite.config.ts
// Loads VITE_* variables during build
```

**4. Docker Compose** (loads from `/docker` via sidecar or export):

```bash
# Export to .env file for Docker Compose
infisical export --env staging --path /docker > docker/.env
```

### Common Workflows

#### View Secrets

```bash
# List all secrets in workspace path
infisical secrets list --env local --path /workspace

# List server secrets
infisical secrets list --env local --path /server

# Get specific secret
infisical secrets get ZITADEL_ORG_ID --env local --path /server
```

#### Set/Update Secrets

```bash
# Set a single secret
infisical secrets set ZITADEL_ORG_ID="123456789" --env local --path /workspace

# Set multiple secrets
infisical secrets set KEY1="value1" KEY2="value2" --env local --path /server

# Update from .env file (use cautiously)
infisical secrets set --from-file .env --env local --path /server
```

#### Delete Secrets

```bash
# Delete a secret
infisical secrets delete KEY_NAME --env local --path /server
```

#### Export Secrets

```bash
# Export to .env format
infisical export --env local --path /server > apps/server/.env

# Export all paths (combined)
infisical export --env local > .env.local-backup

# Export for Docker Compose
infisical export --env staging --path /docker > docker/.env.staging
```

### After Bootstrap Workflow

**1. Bootstrap generates values:**

```bash
./scripts/bootstrap-zitadel-fully-automated.sh provision
# Outputs: ZITADEL_ORG_ID, ZITADEL_PROJECT_ID, ZITADEL_OAUTH_CLIENT_ID, etc.
```

**2. Update Infisical (REQUIRED):**

```bash
# Update workspace secrets
infisical secrets set ZITADEL_ORG_ID="<value>" --env local --path /workspace
infisical secrets set ZITADEL_PROJECT_ID="<value>" --env local --path /workspace

# Update server secrets
infisical secrets set ZITADEL_ORG_ID="<value>" --env local --path /server
infisical secrets set ZITADEL_PROJECT_ID="<value>" --env local --path /server
infisical secrets set ZITADEL_OAUTH_CLIENT_ID="<value>" --env local --path /server

# Update admin secrets
infisical secrets set VITE_ZITADEL_CLIENT_ID="<value>" --env local --path /admin
```

**3. Restart services:**

```bash
npm run workspace:restart
```

**Alternative: Using Infisical Dashboard**

1. Open https://app.infisical.com
2. Navigate to project > environment (local/dev/staging/production)
3. Click folder (/workspace, /server, /admin)
4. Edit secrets directly in UI
5. Restart services

### Fallback to .env Files (Local Only)

If Infisical is unavailable for local development:

```bash
# Export from Infisical to .env files
infisical export --env local --path /workspace > .env
infisical export --env local --path /server > apps/server/.env
infisical export --env local --path /admin > apps/admin/.env

# Restart services to load .env files
npm run workspace:restart
```

**⚠️ Limitations:**

- `.env` fallback only for local development
- Dev/staging/production MUST use Infisical
- `.env` files are not monitored for changes (must restart services)
- `.env` files should never contain production credentials

### Best Practices

**Security:**

- ✅ Use different secrets per environment
- ✅ Never commit .env files with real credentials
- ✅ Enable MFA for Infisical accounts
- ✅ Use service tokens for CI/CD
- ✅ Regularly rotate secrets

**Organization:**

- ✅ Use consistent naming across paths
- ✅ Document custom variables in .env.example
- ✅ Keep /workspace, /server, /admin, /docker paths separate
- ✅ Use environment-specific values (no localhost in production)

**Operations:**

- ✅ Export backups before major changes
- ✅ Test changes in lower environments first
- ✅ Document bootstrap output → Infisical mapping
- ✅ Automate secret updates in CI/CD

### Troubleshooting Infisical

**Authentication failed:**

```bash
# Re-login
infisical login

# Check authentication status
infisical user
```

**Project not found:**

```bash
# Reinitialize
rm .infisical.json
infisical init
```

**Wrong environment selected:**

```bash
# Specify environment explicitly
infisical secrets list --env production --path /server
```

**Secrets not loading at runtime:**

```bash
# Verify INFISICAL_ENABLED=true
# Verify INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET set
# Check server logs for Infisical errors
npm run workspace:logs -- --service server | grep -i infisical
```

## Troubleshooting

This section provides solutions to common issues across all environments.

### Docker Dependency Issues (Local)

#### Dependencies won't start

```bash
# Check Docker is running
docker ps

# Check PM2 status
npm run workspace:status

# View dependency logs
npm run workspace:logs -- --service postgres-dependency
npm run workspace:logs -- --service zitadel-dependency

# Restart dependencies
npm run workspace:deps:restart

# Nuclear option: Clean restart
npm run workspace:deps:stop
cd docker
docker compose -f docker-compose.dev.yml down -v
cd ..
npm run workspace:deps:start
```

#### Port conflicts

**Symptoms:** "Port already in use" errors

**Solution:**

```bash
# Find process using port
lsof -i :5432  # PostgreSQL
lsof -i :8200  # Zitadel

# Kill process or change port in docker/docker-compose.dev.yml
# Update POSTGRES_PORT, ZITADEL_HTTP_PORT in .env
```

#### Health checks failing

```bash
# Wait for Zitadel initialization (can take 30-60s on first run)
sleep 60

# Manual health check
curl http://localhost:8200/debug/healthz

# Check Zitadel logs
docker logs spec-server-2-zitadel-1

# Check PostgreSQL
docker exec spec-server-2-postgres-1 pg_isready
```

### Bootstrap Issues

#### PAT not found

**Symptoms:** "Bootstrap PAT not found at /machinekey/pat.txt"

**Solution:**

```bash
# Verify Docker dependencies are running
npm run workspace:status

# Check PAT exists in volume
docker exec spec-server-2-zitadel-1 cat /machinekey/pat.txt

# If missing, Zitadel didn't initialize correctly
# Recreate Zitadel container:
cd docker
docker compose -f docker-compose.dev.yml down -v zitadel
docker compose -f docker-compose.dev.yml up -d zitadel
cd ..
```

#### Bootstrap fails mid-process

```bash
# Check current state
./scripts/bootstrap-zitadel-fully-automated.sh status

# Run verification
./scripts/bootstrap-zitadel-fully-automated.sh verify

# Re-run bootstrap (idempotent, reuses existing resources)
./scripts/bootstrap-zitadel-fully-automated.sh provision
```

#### Organization already exists error

**This is normal!** Bootstrap script is idempotent and will reuse existing organization/project.

#### Invalid redirect URI

**Symptoms:** "Redirect URI mismatch" during login

**Solution:**

```bash
# Verify OAuth app configuration
./scripts/bootstrap-zitadel-fully-automated.sh verify

# Check redirect URIs match environment:
# Local: http://localhost:5176/auth/callback
# Dev: https://app-dev.example.com/auth/callback
# Staging: https://app-staging.example.com/auth/callback
# Production: https://app.example.com/auth/callback

# Re-run bootstrap to update redirect URIs
./scripts/bootstrap-zitadel-fully-automated.sh provision --env <environment>
```

### Authentication Issues

#### Login redirects but fails

**Symptoms:** Redirects to Zitadel, successful login, but error on callback

**Checks:**

```bash
# 1. Verify OAuth client ID matches
infisical secrets get VITE_ZITADEL_CLIENT_ID --env local --path /admin
infisical secrets get ZITADEL_OAUTH_CLIENT_ID --env local --path /server

# 2. Verify redirect URI configured in Zitadel
# 3. Check server logs
npm run workspace:logs -- --service server | grep -i "token\|auth"

# 4. Verify CORS settings
infisical secrets get CORS_ORIGIN --env local --path /server
```

#### Token introspection fails

**Symptoms:** "401 Unauthorized" from server API

**Solution:**

```bash
# Verify dual SA mode active
npm run workspace:logs -- --service server | grep "Dual service account"

# Should see:
# [INFO] Dual service account mode active
# [INFO] CLIENT SA: client-introspection-service
# [INFO] API SA: api-management-service

# Check JWT keys exist
ls -la secrets/
# Should have:
# - zitadel-client-service-account.json
# - zitadel-api-service-account.json

# Regenerate keys if corrupted
./scripts/bootstrap-zitadel-fully-automated.sh regenerate
npm run workspace:restart
```

### Service Startup Issues

#### Services won't start

```bash
# Check dependencies first
npm run workspace:status | grep dependency

# Check for .env files
ls -la .env apps/server/.env apps/admin/.env

# Start services
npm run workspace:start

# Check for errors
npm run workspace:logs
```

#### Server crashes immediately

```bash
# View server logs
npm run workspace:logs -- --service server --lines 100

# Common causes:
# - Database connection failed (check POSTGRES_HOST)
# - Zitadel connection failed (check ZITADEL_ISSUER)
# - Missing environment variables
# - Port already in use
```

#### Admin app shows blank page

**Checks:**

```bash
# 1. Check admin is running
npm run workspace:status | grep admin

# 2. Check browser console for errors
# Open http://localhost:5176
# Press F12, check Console tab

# 3. Verify VITE_* variables set
cat apps/admin/.env | grep VITE_

# 4. Rebuild admin
cd apps/admin
npm run build
cd ../..
npm run workspace:restart -- --service admin
```

### Database Issues

#### Cannot connect to PostgreSQL

```bash
# Verify PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -U spec -d spec_db -c "SELECT version();"

# Check host/port/credentials match
infisical secrets list --env local --path /server | grep POSTGRES
```

#### Migrations fail

```bash
# Check database exists
psql -h localhost -U spec -l | grep spec_db

# Run migrations manually
cd apps/server
npm run migration:run

# Reset database (CAUTION: Deletes all data)
npm run migration:drop
npm run migration:run
npm run seed
```

### SSL Certificate Issues (Staging/Production)

#### Certificate expired

```bash
# Check expiration
echo | openssl s_client -servername api.example.com -connect api.example.com:443 2>/dev/null | openssl x509 -noout -dates

# Renew with certbot
sudo certbot renew

# Restart services
docker compose -f docker/docker-compose.yml restart
```

#### Certificate not trusted

**Local:** Use HTTP (http://localhost:8200) not HTTPS

**Staging/Production:** Ensure using valid SSL certificate from trusted CA (Let's Encrypt, DigiCert, etc.)

### Environment-Specific Issues

#### Dev: Cannot connect to dev environment

```bash
# Check VPN connection (if required)
# Check SSH access
ssh user@dev-environment.example.com

# Verify dev environment services running
# Check firewall rules allow access
```

#### Staging/Production: Container health checks failing

```bash
# Check all containers
docker compose -f docker/docker-compose.yml ps

# Check specific container logs
docker compose -f docker/docker-compose.yml logs <service>

# Restart unhealthy container
docker compose -f docker/docker-compose.yml restart <service>

# Check resource usage
docker stats

# Check disk space
df -h
```

### Performance Issues

#### Slow API responses

```bash
# Check resource usage
docker stats

# Check database connections
docker exec spec-prod-postgres psql -U postgres spec_db -c "SELECT count(*) FROM pg_stat_activity;"

# Check for slow queries
docker exec spec-prod-postgres psql -U postgres spec_db -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Review server logs for errors
docker compose logs server | grep -i "error\|slow\|timeout"
```

#### High memory usage

```bash
# Check container limits
docker inspect <container-name> | grep -i memory

# Adjust resource limits in docker-compose.yml
# Restart containers with new limits
```

### Infisical Issues

See [Infisical Configuration > Troubleshooting](#troubleshooting-infisical) section above.

### Getting Help

If issues persist:

1. **Check logs:**

   ```bash
   # Local
   npm run workspace:logs

   # Docker environments
   docker compose logs -f
   ```

2. **Run verification scripts:**

   ```bash
   ./scripts/bootstrap-zitadel-fully-automated.sh verify
   ./scripts/bootstrap-zitadel-fully-automated.sh test
   ```

3. **Review documentation:**

   - This guide
   - `docs/guides/`
   - `README.md`
   - `RUNBOOK.md`

4. **Search issues:**

   - Check GitHub Issues
   - Review closed issues for solutions

5. **Create bug report:**
   - Use `docs/bugs/TEMPLATE.md`
   - Include logs, environment, steps to reproduce
   - Tag with environment label (local/dev/staging/production)

---

**End of Environment Setup Guide**

For more information:

- **Testing:** `docs/testing/AI_AGENT_GUIDE.md`
- **Development:** `docs/guides/development/`
- **Operations:** `docs/guides/operations/`
- **Database:** `docs/guides/database-documentation.md`
- **Migrations:** `docs/guides/database-migration-flow.md`
