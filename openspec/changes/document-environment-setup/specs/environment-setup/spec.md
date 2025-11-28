# Environment Setup Specification

## ADDED Requirements

### Requirement: Multi-Environment Architecture

The system SHALL document environment setup for four distinct environments with different infrastructure patterns and deployment approaches.

#### Scenario: Understand local environment architecture

- **WHEN** developer sets up local environment on their PC
- **THEN** infrastructure pattern is documented:
  - **Dependencies**: Run in Docker containers (PostgreSQL, Zitadel, Login UI)
  - **Applications**: Run directly on host machine via workspace CLI (admin, server)
  - **Purpose**: Developer's local PC for feature development and testing
  - **Domain**: localhost with local ports (e.g., localhost:5176, localhost:3002, localhost:8200)
  - **Configuration**: Uses .env and .env.local files
  - **Bootstrap**: Uses bootstrap script with Infisical local environment or .env fallback

#### Scenario: Understand dev environment architecture

- **WHEN** team member works with dev environment
- **THEN** infrastructure pattern is documented:
  - **Dependencies**: Run within dev environment infrastructure (not Docker on local PC)
  - **Applications**: Run directly within dev environment (similar pattern to local but hosted)
  - **Purpose**: Shared development environment for testing integrations
  - **Domain**: Dev-specific domain (e.g., dev.example.com)
  - **Configuration**: Uses environment-specific variables from Infisical or remote .env
  - **Bootstrap**: Uses bootstrap script targeting dev environment Zitadel instance

#### Scenario: Understand staging environment architecture

- **WHEN** team deploys to staging environment
- **THEN** infrastructure pattern is documented:
  - **Everything**: Full Docker Compose deployment (dependencies + applications)
  - **Purpose**: Pre-production testing and validation
  - **Domain**: Staging-specific domain (e.g., staging.example.com)
  - **Configuration**: Uses staging variables and domains from Infisical or deployment config
  - **Deployment**: Docker Compose with staging configuration (docker-compose.staging.yml)
  - **Bootstrap**: Targets staging Zitadel instance with staging organization/project

#### Scenario: Understand production environment architecture

- **WHEN** team deploys to production environment
- **THEN** infrastructure pattern is documented:
  - **Everything**: Full Docker Compose deployment (dependencies + applications)
  - **Purpose**: Live production system serving end users
  - **Domain**: Production domain (e.g., app.example.com, api.example.com)
  - **Configuration**: Uses production variables and domains from Infisical or deployment config
  - **Deployment**: Docker Compose with production configuration (docker-compose.yml)
  - **Bootstrap**: Targets production Zitadel instance with production organization/project
  - **Security**: Production credentials, SSL/TLS, proper secrets management

#### Scenario: Choose appropriate environment guide

- **WHEN** developer/operator needs environment setup instructions
- **THEN** documentation provides clear guidance on which section to follow:
  - **Local PC Development**: Follow local environment setup (Docker dependencies + workspace CLI)
  - **Dev Environment Setup**: Follow dev environment setup (hosted dependencies + applications)
  - **Staging Deployment**: Follow staging deployment guide (full Docker Compose)
  - **Production Deployment**: Follow production deployment guide (full Docker Compose + security)
- **AND** documentation clarifies differences in infrastructure patterns
- **AND** documentation shows which steps are common vs environment-specific

### Requirement: Docker Dependencies Startup (Local Environment)

The system SHALL provide a documented process for starting Docker-based dependencies (PostgreSQL, Zitadel, Login UI) on local PC with proper health checks and verification.

#### Scenario: Start dependencies with workspace CLI (local)

- **WHEN** developer runs `npm run workspace:deps:start` on local PC
- **THEN** the following services start under PM2 with health checks:
  - PostgreSQL (port 5432) with pgvector extension
  - Zitadel (ports 8100/API, 8101/Login UI)
  - Zitadel Login UI v2 (network mode: service:zitadel)
- **AND** health checks verify readiness before returning control
- **AND** logs are captured to apps/logs/dependencies/
- **AND** Docker containers run on local PC while applications run on host

#### Scenario: Verify dependencies are running (local)

- **WHEN** developer runs `npm run workspace:status` on local PC
- **THEN** status shows each dependency (postgres-dependency, zitadel-dependency) with uptime
- **AND** health check status is displayed (online/stopped/unhealthy)

#### Scenario: Manual Docker Compose startup (local alternative)

- **WHEN** developer runs `docker compose up -d` in docker/ directory on local PC
- **THEN** services start using docker-compose.dev.yml configuration
- **AND** Postgres creates database with pgvector extension via init script
- **AND** Zitadel initializes database schema on first run
- **AND** Zitadel creates bootstrap service account with PAT at /machinekey/pat.txt

### Requirement: Dev Environment Dependencies Startup

The system SHALL document how to start dependencies in the dev environment where dependencies run within the dev environment infrastructure.

#### Scenario: Start dependencies in dev environment

- **WHEN** developer/operator sets up dev environment
- **THEN** dependencies are configured within dev environment:
  - PostgreSQL runs as dev environment service (not Docker on local PC)
  - Zitadel runs as dev environment service with dev domain
  - Connection details use dev environment hostnames and ports
- **AND** documentation explains differences from local Docker-based setup
- **AND** health checks verify services are accessible from dev environment

#### Scenario: Connect applications to dev dependencies

- **WHEN** applications run in dev environment
- **THEN** environment variables point to dev environment services:
  - POSTGRES_HOST: dev environment PostgreSQL hostname
  - ZITADEL_DOMAIN: dev environment Zitadel domain
  - Connection strings use internal dev environment networking
- **AND** applications can connect to dependencies within same environment

### Requirement: Staging/Production Full Docker Deployment

The system SHALL document full Docker Compose deployment for staging and production environments where all services run in containers.

#### Scenario: Deploy staging environment with Docker Compose

- **WHEN** operator deploys staging environment
- **THEN** Docker Compose configuration includes:
  - All dependencies (PostgreSQL, Zitadel, Login UI) as containers
  - All applications (admin, server) as containers
  - Staging-specific domains and SSL configuration
  - Staging environment variables
- **AND** deployment uses docker-compose.staging.yml
- **AND** all services run within Docker network
- **AND** health checks verify all containers are healthy

#### Scenario: Deploy production environment with Docker Compose

- **WHEN** operator deploys production environment
- **THEN** Docker Compose configuration includes:
  - All dependencies (PostgreSQL, Zitadel, Login UI) as containers
  - All applications (admin, server) as containers
  - Production domains and SSL certificates
  - Production environment variables from secure secrets management
- **AND** deployment uses docker-compose.yml (production configuration)
- **AND** all services run within Docker network with proper security
- **AND** health checks verify all containers are healthy
- **AND** monitoring and logging are configured

### Requirement: Environment Variable Configuration (All Environments)

The system SHALL document environment variable configuration for all four environments (local, dev, staging, production) with environment-specific domains and connection strings.

#### Scenario: Configure workspace environment (local)

- **WHEN** developer creates .env from .env.example in project root for local development
- **THEN** workspace variables are configured:
  - NAMESPACE (PM2 namespace, default: spec-server-2)
  - ADMIN_PORT (default: 5176)
  - SERVER_PORT (default: 3002)
  - ZITADEL_DOMAIN (local: localhost:8200)
  - POSTGRES_HOST (local: localhost)
  - POSTGRES_PORT, POSTGRES_USER, POSTGRES_DB (for MCP tools)
- **AND** optional .env.local overrides .env for user-specific settings

#### Scenario: Configure environment for dev

- **WHEN** developer/operator configures dev environment
- **THEN** environment variables use dev-specific values:
  - ZITADEL_DOMAIN: dev environment Zitadel domain (e.g., auth-dev.example.com)
  - POSTGRES_HOST: dev environment database hostname
  - ADMIN_PORT, SERVER_PORT: dev environment ports
  - API URLs: dev environment URLs
- **AND** configuration source is Infisical (env: dev) or .env.dev
- **AND** domains and connection strings point to dev environment infrastructure

#### Scenario: Configure environment for staging

- **WHEN** operator deploys staging environment
- **THEN** environment variables use staging-specific values:
  - ZITADEL_DOMAIN: staging Zitadel domain (e.g., auth-staging.example.com)
  - POSTGRES_HOST: staging database hostname (Docker service name or external)
  - Application URLs: staging domains with SSL
  - API URLs: staging API domains
- **AND** configuration source is Infisical (env: staging) or deployment config
- **AND** Docker Compose uses staging environment variables

#### Scenario: Configure environment for production

- **WHEN** operator deploys production environment
- **THEN** environment variables use production values:
  - ZITADEL_DOMAIN: production Zitadel domain (e.g., auth.example.com)
  - POSTGRES_HOST: production database hostname
  - Application URLs: production domains with SSL
  - API URLs: production API domains
- **AND** configuration source is Infisical (env: production) or secure deployment config
- **AND** Docker Compose uses production environment variables
- **AND** sensitive values use secrets management (not plain .env files)

#### Scenario: Configure server environment

- **WHEN** developer creates apps/server/.env from apps/server/.env.example
- **THEN** server variables are configured:
  - Database connection (POSTGRES\_\*)
  - AI/ML (GOOGLE*API_KEY, VERTEX_AI*\*, GCP_PROJECT_ID)
  - Zitadel integration (ZITADEL_ISSUER, ZITADEL_ORG_ID, ZITADEL_PROJECT_ID)
  - Service account JWT paths (ZITADEL_CLIENT_JWT_PATH, ZITADEL_API_JWT_PATH)
  - OAuth configuration (ZITADEL_OAUTH_CLIENT_ID, redirect URIs)

#### Scenario: Configure admin frontend environment

- **WHEN** developer creates apps/admin/.env from apps/admin/.env.example
- **THEN** admin variables are configured:
  - VITE_API_BASE (server URL, e.g., http://localhost:3002)
  - VITE_ZITADEL_ISSUER (e.g., http://localhost:8200)
  - VITE_ZITADEL_CLIENT_ID (OAuth client ID from Zitadel)
  - VITE_ZITADEL_REDIRECT_URI (e.g., http://localhost:5176/auth/callback)
  - VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI (e.g., http://localhost:5176/)

### Requirement: Zitadel Bootstrap Process (All Environments)

The system SHALL provide an automated bootstrap script that creates organizations, projects, service accounts, OAuth applications, and users in Zitadel for any environment (local, dev, staging, production).

#### Scenario: Run fully automated bootstrap (local)

- **WHEN** developer runs `./scripts/bootstrap-zitadel-fully-automated.sh provision` for local environment
- **THEN** script loads configuration from Infisical (env: local, paths: /workspace, /docker)
- **AND** script validates required variables (ZITADEL_DOMAIN: localhost:8200, NAMESPACE, ADMIN_PORT, SERVER_PORT)
- **AND** script loads bootstrap PAT from Docker volume (/machinekey/pat.txt) or prompts for manual entry
- **AND** script performs authentication test against local Zitadel API

#### Scenario: Run bootstrap for dev/staging/production

- **WHEN** operator runs bootstrap script for non-local environment
- **THEN** script loads configuration from Infisical with environment parameter:
  - Dev: `--env dev` or INFISICAL_ENV=dev
  - Staging: `--env staging` or INFISICAL_ENV=staging
  - Production: `--env production` or INFISICAL_ENV=production
- **AND** script validates environment-specific variables:
  - ZITADEL_DOMAIN: environment-specific domain (e.g., auth-dev.example.com, auth-staging.example.com)
  - Redirect URIs: environment-specific application URLs
  - Ports: environment-specific or defaults for full Docker deployment
- **AND** script authenticates with environment-specific PAT (manual entry or secure storage)
- **AND** redirect URIs use environment-specific domains:
  - Local: http://localhost:5176/auth/callback, http://localhost:3002/auth/callback
  - Dev: https://app-dev.example.com/auth/callback, https://api-dev.example.com/auth/callback
  - Staging: https://app-staging.example.com/auth/callback, https://api-staging.example.com/auth/callback
  - Production: https://app.example.com/auth/callback, https://api.example.com/auth/callback

#### Scenario: Create organization and project

- **WHEN** bootstrap script runs with valid PAT
- **THEN** organization is created or reused (name: ORG_NAME, default: "Spec Organization")
- **AND** project is created or reused under organization (name: PROJECT_NAME, default: "Spec Server")
- **AND** organization ID and project ID are returned for environment configuration

#### Scenario: Create OAuth OIDC application

- **WHEN** bootstrap script creates OAuth application
- **THEN** application is configured as:
  - Type: Web application (OIDC_APP_TYPE_WEB)
  - Auth method: NONE (public client/PKCE)
  - Grant types: AUTHORIZATION_CODE, REFRESH_TOKEN
  - Redirect URIs: server callback, admin callback
  - Post-logout redirect URIs: server root, admin root
- **AND** client ID is returned for environment configuration
- **AND** existing applications are verified and updated if misconfigured

#### Scenario: Create API application

- **WHEN** bootstrap script creates API application
- **THEN** application is configured as:
  - Type: API (authentication via JWT)
  - Auth method: PRIVATE_KEY_JWT
- **AND** JWT key is generated and saved to secrets/zitadel-api-app-key.json
- **AND** key expires in 2030 (long-lived for development)

#### Scenario: Create service accounts (dual SA pattern)

- **WHEN** bootstrap script creates service accounts
- **THEN** CLIENT service account is created:
  - Username: client-introspection-service
  - Purpose: Token introspection (minimal permissions)
  - JWT key saved to secrets/zitadel-client-service-account.json
- **AND** API service account is created:
  - Username: api-management-service
  - Purpose: Management API operations (elevated permissions)
  - Role: ORG_OWNER
  - JWT key saved to secrets/zitadel-api-service-account.json

#### Scenario: Create user accounts

- **WHEN** bootstrap script creates users
- **THEN** admin user is created:
  - Email: ADMIN_USER_EMAIL (default: admin@spec.local)
  - Password: ADMIN_USER_PASSWORD
  - Role: ORG_OWNER
  - Email verified: true
- **AND** test user is created:
  - Email: TEST_USER_EMAIL (default: test@example.com)
  - Password: TEST_USER_PASSWORD
  - Email verified: true
  - Purpose: Manual testing
- **AND** E2E test user is created:
  - Email: E2E_TEST_USER_EMAIL (default: e2e-test@example.com)
  - Password: E2E_TEST_USER_PASSWORD
  - Email verified: true
  - Purpose: Automated E2E tests

#### Scenario: Output bootstrap configuration and update Infisical

- **WHEN** bootstrap completes successfully
- **THEN** script outputs environment variables:
  - ZITADEL_DOMAIN, ZITADEL_ORG_ID, ZITADEL_PROJECT_ID
  - ZITADEL_OAUTH_CLIENT_ID, ZITADEL_OAUTH_REDIRECT_URI
  - ZITADEL_API_CLIENT_ID, ZITADEL_API_APP_JWT_PATH
  - ZITADEL_CLIENT_JWT_PATH, ZITADEL_API_JWT_PATH
- **AND** script outputs user credentials (admin, test, e2e)
- **AND** script provides next steps (update Infisical, restart services)
- **AND** operator updates Infisical with bootstrap output:
  - Add/update secrets in Infisical for current environment (local/dev/staging/production)
  - Use Infisical CLI: `infisical secrets set KEY=value --env <environment>`
  - Or use Infisical web dashboard to update secrets
- **AND** .env files are only used as fallback when Infisical is not available

### Requirement: Bootstrap Verification and Troubleshooting

The system SHALL provide verification and troubleshooting modes for the bootstrap process.

#### Scenario: Check bootstrap status

- **WHEN** developer runs `./scripts/bootstrap-zitadel-fully-automated.sh status`
- **THEN** script shows:
  - Local file status (PAT, service account keys)
  - Zitadel configuration (domain, org name, project name)
  - Connectivity test results
  - Organization and project IDs
  - Service account IDs
  - User credentials summary
  - Environment variables to update in Infisical

#### Scenario: Run comprehensive verification

- **WHEN** developer runs `./scripts/bootstrap-zitadel-fully-automated.sh verify`
- **THEN** script performs 7 verification checks:
  1. Local configuration files exist and are valid
  2. Zitadel is reachable (health endpoint)
  3. Admin PAT authentication works
  4. OAuth application configuration is correct (auth method, grant types, redirect URIs)
  5. Service accounts exist in Zitadel and match key files
  6. User accounts exist and are active
  7. All checks pass or failures are reported with troubleshooting steps

#### Scenario: Run comprehensive test suite

- **WHEN** developer runs `./scripts/bootstrap-zitadel-fully-automated.sh test`
- **THEN** script runs 10 automated tests:
  1. Local files (PAT, keys)
  2. Zitadel connectivity
  3. Admin PAT authentication
  4. Organization exists
  5. Project exists
  6. Service accounts exist
  7. Users list (admin, test)
  8. Organization roles (ORG_OWNER)
  9. OAuth applications exist
  10. Key file consistency
- **AND** test results show PASSED/FAILED with detailed output

#### Scenario: Regenerate service account keys

- **WHEN** developer runs `./scripts/bootstrap-zitadel-fully-automated.sh regenerate`
- **THEN** new JWT keys are generated for CLIENT and API service accounts
- **AND** old keys become invalid immediately
- **AND** new keys are saved to secrets/ directory
- **AND** script prompts to restart server to load new keys

### Requirement: Application Service Startup

The system SHALL provide a documented process for starting application services (admin, server) with dependency verification and health checks.

#### Scenario: Start application services

- **WHEN** developer runs `npm run workspace:start`
- **THEN** workspace CLI performs preflight checks:
  - Verify dependencies are running (Postgres, Zitadel)
  - Check .env files exist for admin and server
- **AND** services start under PM2 (namespace: NAMESPACE):
  - admin (port: ADMIN_PORT, default: 5176)
  - server (port: SERVER_PORT, default: 3002)
- **AND** health checks verify each service is responding
- **AND** logs are captured to apps/logs/

#### Scenario: Verify services are running

- **WHEN** developer runs `npm run workspace:status`
- **THEN** status shows services with port assignments and uptime
- **AND** health check status is displayed

#### Scenario: View service logs

- **WHEN** developer runs `npm run workspace:logs`
- **THEN** aggregated logs from admin and server are displayed
- **AND** developer can filter by service: `npm run workspace:logs -- --service server`
- **AND** developer can adjust line count: `npm run workspace:logs -- --lines 200`

### Requirement: Post-Bootstrap Configuration Update

The system SHALL require updating Infisical with bootstrap output and restarting services to load new Zitadel configuration and credentials.

#### Scenario: Update Infisical and restart services after bootstrap

- **WHEN** bootstrap completes successfully
- **THEN** operator updates Infisical with bootstrap output:
  - Add ZITADEL_ORG_ID to Infisical for current environment
  - Add ZITADEL_PROJECT_ID to Infisical for current environment
  - Add ZITADEL_OAUTH_CLIENT_ID to Infisical for current environment
  - Add other bootstrap outputs as needed
  - Use `infisical secrets set KEY=value --env <environment>` or Infisical dashboard
- **AND** operator restarts services to load updated configuration from Infisical:
  - Local: `npm run workspace:stop` then `npm run workspace:start`
  - Dev: Restart applications in dev environment
  - Staging/Production: `docker compose restart` or redeploy
- **AND** server logs show "Dual service account mode active" confirming JWT keys loaded
- **AND** admin app can authenticate via OAuth with Zitadel
- **AND** server can introspect tokens using CLIENT service account
- **AND** server can manage Zitadel resources using API service account

#### Scenario: Fallback to .env files when Infisical unavailable

- **WHEN** Infisical is not available or not configured
- **THEN** operator may copy bootstrap output to .env files as fallback:
  - Update root .env with ZITADEL\_\* variables
  - Update apps/server/.env with Zitadel configuration
  - Update apps/admin/.env with OAuth client configuration
- **AND** restart services to load .env files
- **AND** documentation notes this is fallback approach (Infisical is preferred)

### Requirement: Complete Setup Workflow Documentation (All Environments)

The system SHALL provide environment-specific setup workflows that guide users through complete setup from scratch for local, dev, staging, and production environments.

#### Scenario: Follow local environment setup guide

- **WHEN** developer follows documented local setup workflow
- **THEN** workflow covers these steps in order:
  1. Prerequisites check (Node.js, Docker, Infisical CLI recommended)
  2. Clone repository and install dependencies (`npm install`)
  3. Configure Infisical CLI and authenticate (`infisical login`)
  4. Start Docker dependencies on local PC (`npm run workspace:deps:start`)
  5. Wait for dependencies to be healthy (`npm run workspace:status`)
  6. Run Zitadel bootstrap for local (`./scripts/bootstrap-zitadel-fully-automated.sh provision`)
  7. Update Infisical with bootstrap output using `infisical secrets set` or dashboard
  8. Restart services to load new configuration from Infisical (`npm run workspace:stop`, `npm run workspace:start`)
  9. Verify setup (`npm run workspace:status`, check server logs for "Dual service account mode active")
  10. Test authentication (open admin app at localhost:5176, login with test user)
- **AND** documentation clarifies Docker runs dependencies, applications run on host
- **AND** documentation notes .env files as fallback if Infisical unavailable

#### Scenario: Follow dev environment setup guide

- **WHEN** developer/operator follows documented dev setup workflow
- **THEN** workflow covers these steps:
  1. Prerequisites check (dev environment access, Infisical CLI required)
  2. Clone repository on dev environment
  3. Install dependencies (`npm install`)
  4. Configure Infisical CLI for dev environment
  5. Verify dev dependencies are running (PostgreSQL, Zitadel within dev environment)
  6. Run Zitadel bootstrap for dev environment (`--env dev`) with dev domain
  7. Update Infisical (env: dev) with bootstrap output
  8. Restart applications to load configuration from Infisical
  9. Verify applications can connect to dev dependencies
  10. Test authentication with dev domain URLs
- **AND** documentation explains dependencies run within dev environment, not local Docker

#### Scenario: Follow staging deployment guide

- **WHEN** operator follows documented staging deployment workflow
- **THEN** workflow covers these steps:
  1. Prerequisites check (Docker Compose, staging server access, Infisical with staging environment)
  2. Clone repository on staging server
  3. Run Zitadel bootstrap for staging (`--env staging`) with staging domains
  4. Update Infisical (env: staging) with bootstrap output
  5. Deploy with Docker Compose: `docker compose -f docker-compose.staging.yml up -d`
  6. Wait for all containers to be healthy
  7. Verify Zitadel is accessible at staging domain
  8. Verify applications are accessible at staging URLs
  9. Test authentication with staging users
  10. Configure SSL certificates for staging domains
  11. Set up monitoring and logging for staging
- **AND** documentation clarifies all services run in Docker containers
- **AND** documentation emphasizes Infisical as primary configuration source

#### Scenario: Follow production deployment guide

- **WHEN** operator follows documented production deployment workflow
- **THEN** workflow covers these steps:
  1. Prerequisites check (Docker Compose, production server, Infisical with production environment)
  2. Clone repository on production server
  3. Run Zitadel bootstrap for production (`--env production`) with production domains
  4. Update Infisical (env: production) with bootstrap output using secure workflow
  5. Review and validate all production configuration in Infisical
  6. Deploy with Docker Compose: `docker compose up -d`
  7. Wait for all containers to be healthy
  8. Verify Zitadel is accessible at production domain with SSL
  9. Verify applications are accessible at production URLs with SSL
  10. Test authentication with production users
  11. Configure monitoring, logging, backups, and alerts
  12. Verify security: SSL certificates, secrets rotation, access controls
- **AND** documentation emphasizes security best practices for production
- **AND** documentation clarifies all services run in Docker containers with production-grade configuration
- **AND** documentation prohibits .env files in production (Infisical required)

#### Scenario: Troubleshoot common setup issues (local environment)

- **WHEN** developer encounters local setup problems
- **THEN** documentation provides troubleshooting for:
  - Docker dependencies not healthy: Check logs, verify ports not in use on local PC
  - Bootstrap fails to connect to Zitadel: Verify ZITADEL_DOMAIN (localhost:8200), check health endpoint
  - Bootstrap PAT not found: Check Docker volume, run `docker compose logs zitadel`
  - Service accounts show "Invalid credentials": Regenerate keys with bootstrap script
  - Admin app OAuth fails: Verify client ID, redirect URIs use localhost URLs
  - Server shows "Dual service account mode not active": Check JWT paths in .env
  - Server cannot introspect tokens: Verify CLIENT service account permissions
  - Infisical CLI not found: Install with `brew install infisical/brew/infisical`
  - Port conflicts: Check if ports 5176, 3002, 5432, 8200 are already in use

#### Scenario: Troubleshoot dev environment issues

- **WHEN** developer encounters dev environment problems
- **THEN** documentation provides troubleshooting for:
  - Cannot connect to dev dependencies: Verify network connectivity within dev environment
  - Applications cannot reach Zitadel: Verify ZITADEL_DOMAIN uses dev environment hostname
  - Database connection fails: Verify POSTGRES_HOST points to dev environment service
  - OAuth redirect fails: Verify redirect URIs use dev domain (not localhost)
  - Bootstrap fails: Verify Infisical configured for dev environment, verify dev PAT

#### Scenario: Troubleshoot staging/production deployment issues

- **WHEN** operator encounters staging/production deployment problems
- **THEN** documentation provides troubleshooting for:
  - Docker Compose deployment fails: Check logs with `docker compose logs`
  - Containers not healthy: Check individual container health with `docker ps`
  - SSL certificate issues: Verify certificates are valid and properly mounted
  - Cannot access services: Verify DNS points to correct server, check firewall rules
  - Bootstrap fails: Verify environment-specific PAT, verify domain resolution
  - OAuth redirect fails: Verify redirect URIs match deployed domains exactly
  - Database connection fails: Check PostgreSQL container networking and credentials
  - Environment variables not loaded: Verify Infisical environment, check deployment config
  - Server shows "Dual service account mode not active": Check JWT paths in .env
  - Server cannot introspect tokens: Verify CLIENT service account permissions
  - Infisical CLI not found: Install with `brew install infisical/brew/infisical`

### Requirement: Environment Variable Reference

The system SHALL document all environment variables with their purpose, scope, default values, when they're used (bootstrap/startup/runtime), and whether they change after bootstrap.

#### Scenario: Complete workspace variable inventory

- **WHEN** developer needs comprehensive workspace variable reference
- **THEN** documentation provides table with columns:
  - Variable name
  - Infisical path (`/workspace`)
  - Default value
  - Used when (bootstrap/startup/runtime)
  - Changes after bootstrap (yes/no)
  - Required/Optional
  - Description
- **AND** workspace variables documented:
  - NAMESPACE (spec-server-2, startup, no, required) - PM2 namespace for process isolation
  - ADMIN_PORT (5176, startup, no, required) - Frontend dev server port
  - SERVER_PORT (3002, startup, no, required) - Backend API port
  - ZITADEL_DOMAIN (localhost:8200, bootstrap+startup, no, required) - Zitadel domain with port
  - TEST_USER_EMAIL (test@example.com, bootstrap, no, optional) - Manual test user email
  - TEST_USER_PASSWORD (TestPassword123!, bootstrap, no, optional) - Manual test user password
  - E2E_TEST_USER_EMAIL (e2e-test@example.com, bootstrap, no, optional) - E2E test user email
  - E2E_TEST_USER_PASSWORD (E2eTestPassword123!, bootstrap, no, optional) - E2E test user password
  - POSTGRES_HOST (localhost, runtime, no, optional) - Database host for MCP tools
  - POSTGRES_PORT (5432, runtime, no, optional) - Database port for MCP tools
  - POSTGRES_USER (spec, runtime, no, optional) - Database user for MCP tools
  - POSTGRES_DB (spec, runtime, no, optional) - Database name for MCP tools
  - POSTGRES_PASSWORD (spec, runtime, no, optional) - Database password for MCP tools
  - GCP_PROJECT_ID (spec-server, runtime, no, optional) - GCP project for developer scripts
  - VERTEX_AI_LOCATION (us-central1, runtime, no, optional) - Vertex AI region for scripts
  - VERTEX_AI_MODEL (gemini-2.5-flash-lite, runtime, no, optional) - AI model for scripts

#### Scenario: Complete server variable inventory

- **WHEN** developer needs comprehensive server variable reference
- **THEN** documentation provides table for all 118 server variables including:
  - **Core** (PORT, NODE_ENV, CORS_ORIGIN)
  - **Database** (POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, DB_AUTOINIT, SKIP_DB, SKIP_MIGRATIONS, POSTGRES_DB_E2E, APP_RLS_PASSWORD, RLS_POLICY_STRICT)
  - **Zitadel Auth** (ZITADEL_ISSUER, ZITADEL_CLIENT_JWT, ZITADEL_CLIENT_JWT_PATH, ZITADEL_API_JWT, ZITADEL_API_JWT_PATH, ZITADEL_MAIN_ORG_ID, ZITADEL_PROJECT_ID, SCOPES_DISABLED)
  - **GCP/AI** (GCP_PROJECT_ID, GOOGLE_API_KEY, GOOGLE_APPLICATION_CREDENTIALS, VERTEX_AI_LOCATION, VERTEX_AI_MODEL, EMBEDDING_PROVIDER, EMBEDDING_DIMENSION, EMBEDDINGS_NETWORK_DISABLED)
  - **Chat** (CHAT_MODEL_ENABLED, CHAT_SYSTEM_PROMPT, CHAT_TITLE_GENERATION_ENABLED, CHAT_TITLE_MAX_LENGTH, CHAT_TITLE_MIN_MESSAGES, CHAT_ENABLE_CITATIONS, CHAT_ENABLE_GRAPH_SEARCH, CHAT_ENABLE_MCP)
  - **Extraction Worker** (EXTRACTION_WORKER_ENABLED, EXTRACTION_WORKER_POLL_INTERVAL_MS, EXTRACTION_WORKER_BATCH_SIZE, EXTRACTION_RATE_LIMIT_RPM, EXTRACTION_RATE_LIMIT_TPM, EXTRACTION_ENTITY_LINKING_STRATEGY, EXTRACTION_CONFIDENCE_THRESHOLD_MIN, EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW, EXTRACTION_CONFIDENCE_THRESHOLD_AUTO, EXTRACTION_DEFAULT_TEMPLATE_PACK_ID, EXTRACTION_CHUNK_SIZE, EXTRACTION_CHUNK_OVERLAP, EXTRACTION_BASE_PROMPT)
  - **LangSmith** (LANGSMITH_TRACING, LANGSMITH_ENDPOINT, LANGSMITH_API_KEY, LANGSMITH_PROJECT)
  - **Seeding** (ORGS_DEMO_SEED, BIBLE_SEED_API_URL, BIBLE_SEED_ACCESS_TOKEN, BIBLE_SEED_RATE_LIMIT_MS)
  - **Debug flags** (DEBUG_AUTH_SCOPES, DEBUG_AUTH_CLAIMS, DEBUG_TENANT, SCOPES_DISABLED)
  - **Infisical** (INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_ENABLED, INFISICAL_ENVIRONMENT, INFISICAL_PROJECT_ID, INFISICAL_SITE_URL)
- **AND** for each variable documentation shows:
  - Default value from apps/server/.env.example
  - Used when (bootstrap/startup/runtime)
  - Changes after bootstrap (ZITADEL_MAIN_ORG_ID, ZITADEL_PROJECT_ID, ZITADEL_CLIENT_JWT, ZITADEL_API_JWT change; others don't)
  - Required vs optional
  - Which Infisical path it belongs to (`/server`)

#### Scenario: Complete admin variable inventory

- **WHEN** developer needs comprehensive admin variable reference
- **THEN** documentation provides table for all VITE\_\* variables:
  - VITE_ZITADEL_ISSUER (http://localhost:8080, build+runtime, no, optional) - Zitadel issuer URL
  - VITE_ZITADEL_CLIENT_ID (your-public-client-id-here, build, **YES**, required) - OAuth client ID from bootstrap
  - VITE_ZITADEL_REDIRECT_URI (http://localhost:5176/auth/callback, build, no, optional) - OAuth callback URL
  - VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI (http://localhost:5176/, build, no, optional) - Post-logout redirect
  - VITE_ZITADEL_SCOPES (openid profile email offline_access, build, no, optional) - OAuth scopes
  - VITE_ZITADEL_AUDIENCE (spec-api, build, no, optional) - OAuth audience (API identifier)
  - VITE_API_BASE (empty, build, no, optional) - Backend API base URL (uses Vite proxy if empty)
  - VITE_ENV (development, build, no, optional) - Environment name displayed in UI
  - VITE_CLIENT_LOGGING (empty, build, no, optional) - Client-side logging toggle
  - ADMIN_PORT (5176, startup, no, optional) - Dev server port (not exposed to frontend, build-time only)
- **AND** documentation notes:
  - Only VITE\_\* variables are exposed to browser
  - Variables loaded from Infisical `/admin` path
  - VITE_ZITADEL_CLIENT_ID changes after bootstrap (generated by bootstrap script)

#### Scenario: Complete Docker dependency variable inventory

- **WHEN** operator needs Docker dependency variable reference
- **THEN** documentation provides table for Docker variables (Infisical `/docker` path):
  - ZITADEL_MASTERKEY (MasterkeyNeedsToHave32Characters, startup, no, required) - Zitadel encryption master key
  - ZITADEL_EXTERNALDOMAIN (localhost, startup, no, required) - External domain for Zitadel
  - ZITADEL_EXTERNALSECURE (false, startup, no, required) - Whether external domain uses HTTPS
  - ZITADEL_TLS_ENABLED (false, startup, no, optional) - Enable TLS for Zitadel
  - ZITADEL_DATABASE_POSTGRES_USER_PASSWORD (zitadel, startup, no, required) - Zitadel database password
  - ZITADEL_HTTP_PORT (8100, startup, no, optional) - Zitadel HTTP port mapping
  - ZITADEL_LOGIN_PORT (8101, startup, no, optional) - Zitadel login UI port mapping
  - VITE_ZITADEL_ISSUER (http://localhost:8080, startup, no, required) - Zitadel issuer for bootstrap
  - POSTGRES_USER (spec, startup, no, required) - PostgreSQL superuser for database initialization
  - POSTGRES_PASSWORD (spec, startup, no, required) - PostgreSQL superuser password
  - POSTGRES_DB (spec, startup, no, required) - PostgreSQL default database
- **AND** documentation notes these are for Docker Compose deployments
- **AND** local development uses Docker but apps run on host
- **AND** staging/production use full Docker Compose with all services containerized

### Requirement: Infisical Integration Documentation

The system SHALL document Infisical CLI usage for loading secrets during bootstrap and development.

#### Scenario: Bootstrap with Infisical

- **WHEN** developer has Infisical CLI installed and configured
- **THEN** bootstrap script loads secrets from Infisical:
  - Environment: local
  - Paths: /workspace, /docker
  - Variables: NAMESPACE, ADMIN_PORT, SERVER_PORT, ZITADEL_DOMAIN, etc.
- **AND** script falls back to .env files if Infisical is not available
- **AND** documentation explains Infisical setup and authentication

#### Scenario: Infisical CLI installation

- **WHEN** developer needs to install Infisical CLI
- **THEN** documentation provides:
  - macOS: `brew install infisical/brew/infisical`
  - Linux: Download from GitHub releases
  - Windows: Download executable or use WSL
- **AND** authentication steps: `infisical login`
- **AND** project selection steps

#### Scenario: Update Infisical with bootstrap output

- **WHEN** developer/operator completes Zitadel bootstrap
- **THEN** documentation provides workflow to update Infisical:
  - Copy bootstrap output values (ZITADEL_ORG_ID, ZITADEL_PROJECT_ID, ZITADEL_OAUTH_CLIENT_ID, etc.)
  - Use Infisical CLI to set each secret:
    - `infisical secrets set ZITADEL_ORG_ID=<value> --env local` (or dev/staging/production)
    - `infisical secrets set ZITADEL_PROJECT_ID=<value> --env <environment>`
    - Repeat for all bootstrap outputs
  - OR use Infisical web dashboard:
    - Navigate to project settings
    - Select environment (local/dev/staging/production)
    - Add/update secrets with bootstrap values
- **AND** documentation emphasizes this is required step (not optional)
- **AND** services must be restarted after Infisical update to load new values

#### Scenario: Fallback to .env files (local development only)

- **WHEN** Infisical is not available for local development
- **THEN** documentation provides fallback workflow:
  - Copy bootstrap output to .env files in project root and apps directories
  - Update root .env with workspace variables
  - Update apps/server/.env with server variables
  - Update apps/admin/.env with admin variables
- **AND** documentation notes limitations:
  - Fallback only recommended for local development
  - Dev/staging/production MUST use Infisical
  - .env files are not tracked in git (in .gitignore)
  - Infisical provides better secrets management and team collaboration

#### Scenario: Understand Infisical folder structure

- **WHEN** developer/operator needs to organize secrets in Infisical
- **THEN** documentation describes folder/path organization:
  - **Project**: Single Infisical project for the application (e.g., `spec-server`)
  - **Environments**: local, dev, staging, production (one per deployment environment)
  - **Folders (paths)** within each environment:
    - `/workspace` - Workspace-wide shared configuration
      - Used by: workspace-cli, bootstrap scripts, developer tools
      - Contains: NAMESPACE, ADMIN_PORT, SERVER_PORT, ZITADEL_DOMAIN
      - Contains: TEST_USER_EMAIL, TEST_USER_PASSWORD, E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD
      - Contains: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB (for MCP tools)
      - Count: ~15 secrets
    - `/docker` - Docker dependency configuration
      - Used by: Docker Compose services (PostgreSQL, Zitadel, Login UI)
      - Contains: ZITADEL_MASTERKEY, ZITADEL_EXTERNALDOMAIN, ZITADEL_EXTERNALSECURE
      - Contains: ZITADEL_DATABASE_POSTGRES_USER_PASSWORD, VITE_ZITADEL_ISSUER
      - Contains: ZITADEL_HTTP_PORT, ZITADEL_LOGIN_PORT
      - Count: ~20 secrets
    - `/server` - Server application secrets
      - Used by: NestJS backend application (apps/server)
      - Contains: Database config (POSTGRES*\*), AI/ML keys (GOOGLE_API_KEY, VERTEX_AI*\*)
      - Contains: Zitadel auth (ZITADEL_CLIENT_JWT, ZITADEL_API_JWT, ZITADEL_ORG_ID, ZITADEL_PROJECT_ID)
      - Contains: Extraction config, LangSmith config, feature flags
      - Count: ~30 secrets
    - `/admin` - Admin frontend configuration
      - Used by: React/Vite frontend application (apps/admin)
      - Contains: VITE_ZITADEL_ISSUER, VITE_ZITADEL_CLIENT_ID
      - Contains: VITE_ZITADEL_REDIRECT_URI, VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI
      - Contains: VITE_ZITADEL_SCOPES, VITE_ZITADEL_AUDIENCE, VITE_API_BASE
      - Count: ~6 secrets
- **AND** documentation explains loading patterns:
  - Bootstrap script: Loads from `/workspace` and `/docker` paths
  - Server app: Loads from `/server` path (via Infisical SDK at runtime)
  - Admin app: Loads from `/admin` path (via Vite plugin at build time)
  - Docker Compose: Loads from `/workspace` path (via infisical-secrets sidecar service)
- **AND** documentation notes environment-specific variations:
  - **local**: Uses `--env local` or `INFISICAL_ENVIRONMENT=local`
  - **dev**: Uses `--env dev`, dev-specific domains and connection strings
  - **staging**: Uses `--env staging`, staging domains with SSL
  - **production**: Uses `--env production`, production domains with SSL

#### Scenario: Bootstrap output variables belong in Infisical

- **WHEN** bootstrap script completes and outputs generated values
- **THEN** documentation maps bootstrap outputs to Infisical paths:
  - **Organization and Project IDs** → `/server` path:
    - ZITADEL_ORG_ID (generated by bootstrap, UUID format)
    - ZITADEL_PROJECT_ID (generated by bootstrap, UUID format)
  - **OAuth Client ID** → `/admin` path:
    - VITE_ZITADEL_CLIENT_ID (generated by bootstrap for admin SPA)
  - **Service Account JWTs** → `/server` path:
    - ZITADEL_CLIENT_JWT (generated JWT for CLIENT service account)
    - ZITADEL_API_JWT (generated JWT for API service account)
  - **Test User IDs** (optional) → `/workspace` path:
    - TEST_USER_ID (generated if user created)
    - E2E_TEST_USER_ID (generated if E2E user created)
- **AND** documentation clarifies these values:
  - **Change during bootstrap**: Generated fresh each time bootstrap runs
  - **Must be updated in Infisical**: After successful bootstrap
  - **Trigger service restart**: Applications must restart to load new values
  - **Environment-specific**: Each environment has its own set of IDs

#### Scenario: Static configuration vs bootstrap-generated secrets

- **WHEN** developer/operator needs to understand which secrets are static vs generated
- **THEN** documentation categorizes all variables:
  - **Static (set once, rarely change)**:
    - Workspace: NAMESPACE, ADMIN_PORT, SERVER_PORT
    - Docker: ZITADEL_MASTERKEY, database passwords
    - Server: GOOGLE_API_KEY, GCP_PROJECT_ID, VERTEX_AI_LOCATION, VERTEX_AI_MODEL
    - Admin: VITE_ZITADEL_SCOPES, VITE_ZITADEL_AUDIENCE
  - **Environment-specific (change per environment)**:
    - Workspace/Docker: ZITADEL_DOMAIN, ZITADEL_EXTERNALDOMAIN
    - Server: POSTGRES_HOST (localhost vs dev hostname vs container name)
    - Admin: VITE_ZITADEL_ISSUER, VITE_ZITADEL_REDIRECT_URI, VITE_API_BASE
  - **Bootstrap-generated (change when bootstrap runs)**:
    - Server: ZITADEL_ORG_ID, ZITADEL_PROJECT_ID, ZITADEL_CLIENT_JWT, ZITADEL_API_JWT
    - Admin: VITE_ZITADEL_CLIENT_ID
    - Optional: TEST_USER_ID, E2E_TEST_USER_ID
- **AND** documentation provides update workflows:
  - Static: Set once during initial setup, update via Infisical dashboard/CLI as needed
  - Environment-specific: Set per environment, verify domains match deployment
  - Bootstrap-generated: Update immediately after bootstrap using script output

### Requirement: Initial Environment Setup Script

The system SHALL provide a script that initializes environment configuration from empty state by populating Infisical with default values for a specified environment.

#### Scenario: Initialize local environment from empty state

- **WHEN** developer runs initial setup script for local environment
- **THEN** script performs these actions:
  1. Checks Infisical CLI is installed (`infisical --version`)
  2. Checks Infisical is authenticated (`infisical user`)
  3. Prompts for environment selection (local/dev/staging/production)
  4. Loads default values from .env.example files
  5. Populates Infisical paths with defaults:
     - `/workspace` path: Workspace defaults (NAMESPACE, ports, test users)
     - `/docker` path: Docker defaults (ZITADEL_MASTERKEY, domains)
     - `/server` path: Server defaults (database, AI config, feature flags)
     - `/admin` path: Admin defaults (Vite config, scopes)
  6. Prompts for required secrets that have no defaults (GOOGLE_API_KEY, database passwords)
  7. Applies environment-specific transformations:
     - Local: Uses localhost domains, local ports
     - Dev: Uses dev domains, dev infrastructure hostnames
     - Staging: Uses staging domains, container networking
     - Production: Uses production domains, container networking
  8. Outputs summary of what was created
  9. Lists next steps: "Run bootstrap script to generate Zitadel configuration"
- **AND** script validates before writing:
  - Check if secrets already exist (warn before overwriting)
  - Validate required values are provided
  - Validate format of domains, ports, UUIDs
- **AND** script supports dry-run mode (`--dry-run`)
- **AND** script supports interactive vs non-interactive modes

#### Scenario: Initialize dev/staging/production environment

- **WHEN** operator runs initial setup script for non-local environment
- **THEN** script behavior differs from local:
  - Prompts for environment-specific domains (required, no defaults)
  - Prompts for database connection details (hostnames, not localhost)
  - Prompts for Infisical project ID and environment name
  - Validates SSL/TLS settings for staging/production
  - Sets ZITADEL_EXTERNALSECURE=true for staging/production
  - Uses container networking hostnames (db, zitadel) for Docker Compose deployments
- **AND** script prevents localhost values in non-local environments
- **AND** script warns about security requirements for production

#### Scenario: Script prevents data loss

- **WHEN** script detects existing secrets in target Infisical path
- **THEN** script behavior:
  - Lists existing secrets that would be overwritten
  - Prompts for confirmation: "Overwrite N existing secrets? (y/N)"
  - Offers to merge (only add missing secrets, preserve existing)
  - Offers to backup existing secrets before overwriting
  - Aborts if user declines
- **AND** script never overwrites without explicit confirmation
- **AND** script provides `--force` flag to skip confirmation (for automation)

#### Scenario: Generate initial .env files from Infisical

- **WHEN** developer wants to create local .env files from Infisical
- **THEN** script can export Infisical secrets to .env files:
  - Command: `npm run env:export` or `./scripts/export-env-from-infisical.sh`
  - Reads from Infisical (prompts for environment: local/dev/staging/production)
  - Generates files:
    - `.env` (from `/workspace` path)
    - `docker/.env` (from `/docker` path)
    - `apps/server/.env` (from `/server` path)
    - `apps/admin/.env` (from `/admin` path)
  - Warns: "These files are fallback only. Prefer using Infisical directly."
  - Adds warning comment at top of each file: "# Generated from Infisical. Changes here will not sync back."
- **AND** script checks files don't exist or prompts before overwriting
- **AND** export is only recommended for local development troubleshooting

### Requirement: Step Verification Criteria

The system SHALL provide testable success criteria for every documented setup step to enable verification and future automation.

#### Scenario: Verify Docker dependencies step

- **WHEN** developer completes Docker dependencies startup
- **THEN** verification criteria are documented:
  - Command: `npm run workspace:status`
  - Expected: Services `postgres-dependency` and `zitadel-dependency` show status "online"
  - Expected: PostgreSQL responds on port 5432
  - Expected: Zitadel health endpoint returns 200 OK: `curl http://localhost:8200/debug/healthz`
  - Expected: Zitadel API responds: `curl http://localhost:8200/.well-known/openid-configuration`

#### Scenario: Verify environment configuration step

- **WHEN** developer completes environment configuration
- **THEN** verification criteria are documented:
  - Infisical is configured: `infisical secrets get ZITADEL_DOMAIN --env <environment>` returns value
  - Required secrets exist in Infisical: ZITADEL_ORG_ID, ZITADEL_PROJECT_ID, ZITADEL_OAUTH_CLIENT_ID
  - OR (fallback) files exist: `.env`, `apps/server/.env`, `apps/admin/.env`
  - Ports are available: `lsof -i :5176`, `lsof -i :3002` return no results
  - Database connection works: `psql -h localhost -U postgres -d specdb -c "SELECT 1"`

#### Scenario: Verify Infisical update step

- **WHEN** developer/operator updates Infisical with bootstrap output
- **THEN** verification criteria are documented:
  - Command: `infisical secrets get ZITADEL_ORG_ID --env <environment>`
  - Expected: Returns organization ID from bootstrap
  - Command: `infisical secrets get ZITADEL_PROJECT_ID --env <environment>`
  - Expected: Returns project ID from bootstrap
  - Command: `infisical secrets get ZITADEL_OAUTH_CLIENT_ID --env <environment>`
  - Expected: Returns OAuth client ID from bootstrap
  - All bootstrap outputs are present in Infisical for the correct environment

#### Scenario: Verify bootstrap completion step

- **WHEN** developer completes Zitadel bootstrap
- **THEN** verification criteria are documented:
  - Command: `./scripts/bootstrap-zitadel-fully-automated.sh verify`
  - Expected: All 7 verification checks pass
  - Expected: Files exist: `secrets/zitadel-client-service-account.json`, `secrets/zitadel-api-service-account.json`
  - Expected: Organization and project IDs are valid UUIDs in output
  - Expected: Test user login works in Zitadel console

#### Scenario: Verify service startup step

- **WHEN** developer completes service startup
- **THEN** verification criteria are documented:
  - Command: `npm run workspace:status`
  - Expected: Services `admin` and `server` show status "online" with uptime > 0
  - Expected: Admin app responds: `curl -I http://localhost:5176` returns 200
  - Expected: Server health endpoint responds: `curl http://localhost:3002/health` returns 200
  - Expected: Server logs show "Dual service account mode active"
  - Command: `npm run workspace:logs -- --service server --lines 50 | grep "Dual service account mode active"`

#### Scenario: Verify authentication step

- **WHEN** developer completes authentication test
- **THEN** verification criteria are documented:
  - Admin app loads: Open `http://localhost:5176` in browser
  - Login button redirects to Zitadel: URL contains `localhost:8200`
  - Login with test user succeeds: Enter TEST_USER_EMAIL and TEST_USER_PASSWORD
  - Redirect back to admin app: URL returns to `localhost:5176`
  - User profile loads: Check for user email in UI
  - Token introspection works: Server logs show successful introspection

### Requirement: Script Audit and Cleanup

The system SHALL audit all existing scripts in the scripts/ directory to identify which are active, superseded, or obsolete, and document or archive them accordingly.

#### Scenario: Audit bootstrap scripts

- **WHEN** documentation team audits bootstrap-related scripts
- **THEN** evaluation criteria are applied:
  - **Active**: Currently used in documented workflows, maintain and document
  - **Superseded**: Replaced by newer versions (e.g., bootstrap-zitadel.sh superseded by bootstrap-zitadel-fully-automated.sh)
  - **Obsolete**: No longer applicable to current architecture
- **AND** decisions are documented:
  - Active scripts: Document in environment setup guide
  - Superseded scripts: Move to scripts/archive-old/ with README explaining replacement
  - Obsolete scripts: Remove after confirming no dependencies

#### Scenario: Audit utility scripts

- **WHEN** documentation team audits utility scripts (test, check, verify)
- **THEN** each script is evaluated:
  - Purpose: What does it do?
  - Usage: Is it still used by developers or CI?
  - Dependencies: Does documented workflow rely on it?
  - Status: Active, superseded, or obsolete
- **AND** active scripts are documented in appropriate guides
- **AND** obsolete scripts are archived or removed

#### Scenario: Audit deployment scripts

- **WHEN** documentation team audits deployment scripts (Coolify, Infisical migration)
- **THEN** evaluation considers:
  - Deployment target: Local dev vs staging vs production
  - Current status: Migration complete scripts may be historical
  - Scope: Environment setup guide covers local dev only
- **AND** decisions are made:
  - Local dev scripts: Document in environment setup guide
  - Deployment scripts: Reference in deployment guides, not environment setup
  - Completed migration scripts: Archive to scripts/archive-old/

### Requirement: Documentation Audit and Cleanup

The system SHALL audit all existing root-level markdown documentation to identify which files are current, historical, superseded, or obsolete, and archive or consolidate them accordingly.

#### Scenario: Audit setup documentation

- **WHEN** documentation team audits setup-related markdown files
- **THEN** evaluation criteria are applied:
  - **Current**: Valid information, keep and reference
  - **Historical**: Migration/investigation complete, archive to docs/archive/
  - **Superseded**: Content replaced by newer docs, consolidate or archive
  - **Obsolete**: No longer applicable, remove or archive
- **AND** findings are documented:
  - SETUP.md: Current, update to reference new environment setup guide
  - QUICK_START_DEV.md: Current, cross-reference environment setup
  - COOLIFY\_\*: Deployment-specific, out of scope for local environment setup

#### Scenario: Audit migration documentation

- **WHEN** documentation team audits migration-related files
- **THEN** files are evaluated:
  - INFISICAL_MIGRATION_COMPLETE.md: Historical, migration complete
  - INFISICAL_COMPLETE_SUMMARY.md: Historical, migration complete
  - ORGANIZATION_ID_MIGRATION_COMPLETE.md: Historical, migration complete
  - MIGRATION_CHECKLIST.md: Historical or superseded
- **AND** decisions are made:
  - Move completed migration docs to docs/migrations/completed/
  - Add README in docs/migrations/completed/ explaining historical context
  - Reference migration outcomes in current docs where relevant

#### Scenario: Audit investigation documentation

- **WHEN** documentation team audits investigation files
- **THEN** files are evaluated:
  - ZITADEL_INVESTIGATION_FINDINGS.md: Historical investigation
  - INFISICAL_TROUBLESHOOTING.md: May contain current troubleshooting info
  - LOCALSTORAGE_RESOLUTION.md: Historical issue resolution
- **AND** decisions are made:
  - Extract current troubleshooting info into environment setup guide
  - Move historical investigations to docs/investigations/
  - Add context about when/why investigation was needed

#### Scenario: Consolidate quick reference docs

- **WHEN** documentation team reviews quick reference files
- **THEN** consolidation opportunities are identified:
  - QUICK_REFERENCE_REMOTE_DEV.md: Remote dev specific
  - INFISICAL_QUICK_REFERENCE.md: Infisical-specific
  - MIGRATION_QUICK_REFERENCE.md: Historical
  - SECURITY_SCOPES.md: Authentication reference
- **AND** consolidation decisions are made:
  - Integrate relevant quick reference content into comprehensive guides
  - Keep specialized references for advanced topics
  - Archive purely historical quick references
