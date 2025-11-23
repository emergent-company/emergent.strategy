# Tasks: Integrate Infisical Secrets Management

## Phase 1: Infrastructure Setup

### 1.1 Infisical Project Creation
- [ ] 1.1.1 Create Infisical project `spec-server-dev`
- [ ] 1.1.2 Create environments in dev project: `workspace`, `server`, `admin`, `docker`
- [ ] 1.1.3 Create Infisical project `spec-server-staging`
- [ ] 1.1.4 Create environments in staging project: `workspace`, `server`, `admin`, `docker`
- [ ] 1.1.5 Create Infisical project `spec-server-production`
- [ ] 1.1.6 Create environments in production project: `workspace`, `server`, `admin`, `docker`

### 1.2 Machine Identity Generation
- [ ] 1.2.1 Generate machine identity for dev/workspace with read access
- [ ] 1.2.2 Generate machine identity for dev/server with read access
- [ ] 1.2.3 Generate machine identity for dev/admin with read access
- [ ] 1.2.4 Generate machine identity for dev/docker with read access
- [ ] 1.2.5 Generate machine identities for staging environments (4 identities)
- [ ] 1.2.6 Generate machine identities for production environments (4 identities)
- [ ] 1.2.7 Document all client IDs and secrets securely (password manager or secure notes)

### 1.3 Bootstrap Script for Infisical Setup
- [ ] 1.3.1 Create `scripts/infisical-bootstrap.sh` to automate project creation
- [ ] 1.3.2 Script SHALL create projects via Infisical API
- [ ] 1.3.3 Script SHALL create environments within projects
- [ ] 1.3.4 Script SHALL generate machine identities and output credentials
- [ ] 1.3.5 Add documentation on running bootstrap script

## Phase 2: SDK Integration - Server

### 2.1 Install Dependencies
- [ ] 2.1.1 Run `npm install @infisical/sdk@^4.0.0` in workspace root
- [ ] 2.1.2 Add SDK to server dependencies in package.json
- [ ] 2.1.3 Verify SDK types are available for TypeScript

### 2.2 Create Infisical Configuration Service
- [ ] 2.2.1 Create `apps/server/src/common/config/infisical.service.ts`
- [ ] 2.2.2 Implement InfisicalConfigService class with InfisicalSDK client
- [ ] 2.2.3 Implement `initialize()` method with Universal Auth login
- [ ] 2.2.4 Implement `getAllSecrets()` method to fetch and inject into process.env
- [ ] 2.2.5 Implement in-memory cache with Map<string, { value, expiry }>
- [ ] 2.2.6 Implement file system cache persistence with encryption
- [ ] 2.2.7 Implement background refresh scheduled task (every 4 minutes)
- [ ] 2.2.8 Implement graceful fallback to dotenv on Infisical failure (dev only)
- [ ] 2.2.9 Add logging for all fetch operations (success, failure, cache hits)

### 2.3 Update Configuration Module
- [ ] 2.3.1 Update `apps/server/src/common/config/config.module.ts`
- [ ] 2.3.2 Import InfisicalConfigService and initialize on module bootstrap
- [ ] 2.3.3 Call Infisical fetch BEFORE ConfigModule.forRoot (dotenv)
- [ ] 2.3.4 Ensure Infisical secrets injected into process.env before ConfigService reads
- [ ] 2.3.5 Add error handling for production (throw) vs development (fallback)

### 2.4 Bootstrap Credentials Configuration
- [ ] 2.4.1 Update `.env.example` with Infisical bootstrap variables (commented examples)
- [ ] 2.4.2 Update `apps/server/.env.example` with server-specific Infisical config
- [ ] 2.4.3 Create `.env.local` with actual INFISICAL_CLIENT_SECRET (gitignored)
- [ ] 2.4.4 Document bootstrap variables in comments: INFISICAL_SITE_URL, PROJECT_ID, CLIENT_ID, CLIENT_SECRET, ENVIRONMENT
- [ ] 2.4.5 Add validation on startup to ensure all bootstrap variables present

### 2.5 Server Testing
- [ ] 2.5.1 Test server starts with Infisical secrets (manual verification)
- [ ] 2.5.2 Test fallback to .env files in development when Infisical unavailable (disconnect network)
- [ ] 2.5.3 Test production mode throws error when Infisical unavailable
- [ ] 2.5.4 Test secret caching works (verify logs show cache hits)
- [ ] 2.5.5 Test background refresh updates cache (check logs after 4 minutes)
- [ ] 2.5.6 Test file system cache loaded on cold start
- [ ] 2.5.7 Run existing unit tests to ensure no regressions

## Phase 3: SDK Integration - Admin

### 3.1 Install Dependencies
- [ ] 3.1.1 Add `@infisical/sdk` to admin dependencies in package.json
- [ ] 3.1.2 Verify SDK works with Vite bundler (check build output)

### 3.2 Create Infisical Configuration Module
- [ ] 3.2.1 Create `apps/admin/src/config/infisical.ts`
- [ ] 3.2.2 Implement `loadInfisicalConfig()` async function
- [ ] 3.2.3 Initialize InfisicalSDK with VITE_INFISICAL_SITE_URL
- [ ] 3.2.4 Authenticate with Universal Auth using VITE_INFISICAL_CLIENT_ID/SECRET
- [ ] 3.2.5 Fetch secrets from 'admin' environment
- [ ] 3.2.6 Return secrets as Record<string, string> for ConfigContext
- [ ] 3.2.7 Implement graceful fallback to import.meta.env in development
- [ ] 3.2.8 Add error handling and logging

### 3.3 Update Configuration Context
- [ ] 3.3.1 Update `apps/admin/src/contexts/ConfigContext.tsx`
- [ ] 3.3.2 Import and call `loadInfisicalConfig()` on context initialization
- [ ] 3.3.3 Merge Infisical config with import.meta.env (Infisical takes precedence)
- [ ] 3.3.4 Handle loading state while fetching from Infisical
- [ ] 3.3.5 Display error message if Infisical fetch fails in production

### 3.4 Bootstrap Credentials Configuration
- [ ] 3.4.1 Update `apps/admin/.env.example` with VITE_INFISICAL_* variables (commented)
- [ ] 3.4.2 Create `apps/admin/.env.local` with actual VITE_INFISICAL_CLIENT_SECRET (gitignored)
- [ ] 3.4.3 Document Vite-specific variable naming (VITE_ prefix required for client-side)
- [ ] 3.4.4 Add validation to ensure bootstrap variables present

### 3.5 Admin Testing
- [ ] 3.5.1 Test admin starts with Infisical secrets (manual verification)
- [ ] 3.5.2 Test fallback to import.meta.env when Infisical unavailable in dev
- [ ] 3.5.3 Test loading state displayed during Infisical fetch
- [ ] 3.5.4 Test error handling when Infisical unavailable in production
- [ ] 3.5.5 Run existing unit tests to ensure no regressions
- [ ] 3.5.6 Run Playwright E2E tests to verify functionality

## Phase 4: SDK Integration - Workspace CLI

### 4.1 Install Dependencies
- [ ] 4.1.1 Add `@infisical/sdk` to workspace-cli dependencies

### 4.2 Create Infisical Service
- [ ] 4.2.1 Create `tools/workspace-cli/src/services/infisical.service.ts`
- [ ] 4.2.2 Implement WorkspaceInfisicalService class
- [ ] 4.2.3 Implement `loadWorkspaceConfig()` to fetch 'workspace' environment
- [ ] 4.2.4 Implement authentication with Universal Auth
- [ ] 4.2.5 Return secrets as Record<string, string> for PM2 environment injection

### 4.3 Update Start Command
- [ ] 4.3.1 Update `tools/workspace-cli/src/commands/workspace-start.command.ts`
- [ ] 4.3.2 Call InfisicalService to fetch workspace config before starting services
- [ ] 4.3.3 Merge Infisical config with process.env
- [ ] 4.3.4 Pass merged environment to PM2 process configuration
- [ ] 4.3.5 Add fallback to .env in development if Infisical unavailable

### 4.4 Workspace CLI Testing
- [ ] 4.4.1 Test `nx run workspace-cli:workspace:start` with Infisical secrets
- [ ] 4.4.2 Verify NAMESPACE, ports loaded from Infisical
- [ ] 4.4.3 Test services start successfully with Infisical config
- [ ] 4.4.4 Test fallback to .env when Infisical unavailable
- [ ] 4.4.5 Verify existing logs/stop/restart commands still work

## Phase 5: SDK Integration - Docker Dependencies

### 5.1 Docker Compose Integration Strategy
- [ ] 5.1.1 Decide on Docker secrets delivery method (see design.md Open Question #1)
- [ ] 5.1.2 Option A: Use Infisical CLI to generate .env file before docker-compose up
- [ ] 5.1.3 Option B: Create wrapper script that fetches secrets and passes to docker-compose
- [ ] 5.1.4 Document chosen approach in design.md

### 5.2 Create Docker Secrets Fetcher Script
- [ ] 5.2.1 Create `scripts/docker-fetch-secrets.sh` or `scripts/docker-fetch-secrets.ts`
- [ ] 5.2.2 Script SHALL authenticate with Infisical using machine identity
- [ ] 5.2.3 Script SHALL fetch secrets from 'docker' environment
- [ ] 5.2.4 Script SHALL write secrets to `docker/.env` (gitignored, generated file)
- [ ] 5.2.5 Add comment header to generated file: "# Auto-generated by Infisical - DO NOT EDIT"
- [ ] 5.2.6 Add error handling if Infisical unavailable (fallback to docker/.env.local)

### 5.3 Update Docker Compose Configuration
- [ ] 5.3.1 Update `docker/docker-compose.yml` to read from `docker/.env` (generated)
- [ ] 5.3.2 Ensure docker/.env is in .gitignore
- [ ] 5.3.3 Update docker/.env.example with Infisical bootstrap variables (commented)
- [ ] 5.3.4 Document that docker/.env is auto-generated, not manually edited

### 5.4 Bootstrap Credentials for Docker
- [ ] 5.4.1 Create `docker/.env.local` with INFISICAL_CLIENT_SECRET for docker environment
- [ ] 5.4.2 Add INFISICAL_SITE_URL, PROJECT_ID, CLIENT_ID, ENVIRONMENT to docker/.env.example
- [ ] 5.4.3 Document docker machine identity credentials in secure notes

### 5.5 Integrate with Workspace CLI
- [ ] 5.5.1 Update workspace start command to run docker-fetch-secrets.sh before docker-compose up
- [ ] 5.5.2 Add validation that docker/.env exists and is fresh (< 5 minutes old)
- [ ] 5.5.3 Add option to skip Docker secrets fetch (--skip-docker-secrets) for offline dev
- [ ] 5.5.4 Log success/failure of Docker secrets fetch

### 5.6 Docker Dependencies Testing
- [ ] 5.6.1 Test docker-fetch-secrets.sh generates docker/.env correctly
- [ ] 5.6.2 Test docker-compose up uses generated secrets (PostgreSQL password, Zitadel config)
- [ ] 5.6.3 Test PostgreSQL container starts with POSTGRES_PASSWORD from Infisical
- [ ] 5.6.4 Test Zitadel container starts with configuration from Infisical
- [ ] 5.6.5 Test fallback to docker/.env.local when Infisical unavailable
- [ ] 5.6.6 Test workspace start command fetches Docker secrets automatically

## Phase 6: Secret Migration

### 6.1 Create Migration Script
- [ ] 6.1.1 Create `scripts/migrate-env-to-infisical.ts` with Node.js
- [ ] 6.1.2 Implement dotenv parsing for all .env.local files
- [ ] 6.1.3 Implement Infisical SDK bulk secret upload
- [ ] 6.1.4 Map root .env.local → spec-server-dev/workspace
- [ ] 6.1.5 Map apps/server/.env.local → spec-server-dev/server
- [ ] 6.1.6 Map apps/admin/.env.local → spec-server-dev/admin
- [ ] 6.1.7 Map docker/.env (current) → spec-server-dev/docker
- [ ] 6.1.8 Map docker/zitadel.env (current) → spec-server-dev/docker (merge with docker/.env)
- [ ] 6.1.9 Add dry-run mode to preview changes without uploading
- [ ] 6.1.10 Add backup creation before migration (copy .env.local → .env.local.backup)
- [ ] 6.1.11 Add logging for all uploaded secrets (key names only, not values)

### 6.2 Migrate Development Environment
- [ ] 6.2.1 Run migration script in dry-run mode to verify secrets parsed correctly
- [ ] 6.2.2 Review output and confirm all expected secrets listed (workspace, server, admin, docker)
- [ ] 6.2.3 Run migration script for real to upload to spec-server-dev project
- [ ] 6.2.4 Verify secrets uploaded correctly via Infisical UI
- [ ] 6.2.5 Count uploaded secrets: workspace (N), server (M), admin (P), docker (Q secrets)

### 6.3 Migrate Critical Secrets First
- [ ] 6.3.1 Manually verify critical secrets in Infisical: POSTGRES_PASSWORD, GOOGLE_API_KEY
- [ ] 6.3.2 Manually verify OAuth secrets: ZITADEL_CLIENT_SECRET, ZITADEL_SERVICE_ACCOUNT_KEY
- [ ] 6.3.3 Manually verify Docker secrets: POSTGRES_PASSWORD, ZITADEL_DB_PASSWORD, ZITADEL_MASTERKEY
- [ ] 6.3.4 Manually verify test credentials: TEST_USER_PASSWORD, E2E_TEST_USER_PASSWORD

### 6.4 Validation Script
- [ ] 6.4.1 Create `scripts/validate-infisical-migration.ts`
- [ ] 6.4.2 Fetch all secrets from Infisical (all 4 environments: workspace, server, admin, docker)
- [ ] 6.4.3 Compare with original .env.local files + docker/.env + docker/zitadel.env
- [ ] 6.4.4 Report missing secrets (in .env.local but not Infisical)
- [ ] 6.4.5 Report mismatched values (same key, different value)
- [ ] 6.4.6 Report extra secrets (in Infisical but not .env.local)
- [ ] 6.4.7 Run validation and confirm 0 discrepancies

## Phase 7: Testing & Validation

### 7.1 Integration Testing
- [ ] 7.1.1 Stop all services: `nx run workspace-cli:workspace:stop`
- [ ] 7.1.2 Stop Docker containers: `cd docker && docker-compose down`
- [ ] 7.1.3 Start Docker dependencies with Infisical secrets: workspace start should fetch docker secrets
- [ ] 7.1.4 Verify PostgreSQL starts with POSTGRES_PASSWORD from Infisical
- [ ] 7.1.5 Verify Zitadel starts with configuration from Infisical (check ZITADEL_MASTERKEY, database config)
- [ ] 7.1.6 Start services with Infisical integration: `nx run workspace-cli:workspace:start`
- [ ] 7.1.7 Verify server starts successfully and logs Infisical fetch
- [ ] 7.1.8 Verify admin starts successfully and loads config from Infisical
- [ ] 7.1.9 Test login flow with Zitadel credentials from Infisical
- [ ] 7.1.10 Test document upload/search with database credentials from Infisical
- [ ] 7.1.11 Test chat with GOOGLE_API_KEY from Infisical

### 7.2 Fallback Testing
- [ ] 6.2.1 Disconnect from network (simulate Infisical outage)
- [ ] 6.2.2 Start services and verify fallback to .env files in development
- [ ] 6.2.3 Verify warning logged about Infisical unavailability
- [ ] 6.2.4 Reconnect network and restart services
- [ ] 6.2.5 Verify services fetch from Infisical successfully again

### 6.3 Cache Testing
- [ ] 6.3.1 Start services and verify initial fetch from Infisical
- [ ] 6.3.2 Wait 5 minutes and check logs for background refresh
- [ ] 6.3.3 Temporarily block Infisical access (firewall rule or network disconnect)
- [ ] 6.3.4 Verify services continue running with cached secrets
- [ ] 6.3.5 Wait for cache expiry and verify services still run (file system cache)
- [ ] 6.3.6 Restore Infisical access and verify refresh succeeds

### 6.4 E2E Test Suite
- [ ] 6.4.1 Run server E2E tests: `nx run server:test-e2e`
- [ ] 6.4.2 Verify all tests pass with Infisical-managed secrets
- [ ] 6.4.3 Run admin E2E tests: `nx run admin:e2e`
- [ ] 6.4.4 Verify all tests pass (authentication, navigation, features)
- [ ] 6.4.5 Check test credentials (E2E_TEST_USER_*) loaded from Infisical

### 6.5 Production Mode Testing
- [ ] 6.5.1 Set NODE_ENV=production
- [ ] 6.5.2 Start server and verify Infisical required (no fallback to .env)
- [ ] 6.5.3 Block Infisical access and verify server fails to start with clear error
- [ ] 6.5.4 Restore access and verify server starts successfully

## Phase 8: Documentation

### 7.1 Migration Guide
- [ ] 7.1.1 Create `docs/guides/INFISICAL_MIGRATION.md`
- [ ] 7.1.2 Document prerequisites (self-hosted Infisical instance)
- [ ] 7.1.3 Document Infisical project/environment setup steps
- [ ] 7.1.4 Document machine identity generation steps
- [ ] 7.1.5 Document migration script usage with examples
- [ ] 7.1.6 Document validation steps
- [ ] 7.1.7 Document rollback procedure (restore .env.local backups)
- [ ] 7.1.8 Include screenshots of Infisical UI for key steps

### 7.2 Developer Setup Guide
- [ ] 7.2.1 Update `QUICK_START_DEV.md` with Infisical setup instructions
- [ ] 7.2.2 Document how to obtain Infisical access token for new developers
- [ ] 7.2.3 Document bootstrap script to generate local machine identity credentials
- [ ] 7.2.4 Document fallback to .env for offline development
- [ ] 7.2.5 Add troubleshooting section for common Infisical issues

### 7.3 Deployment Documentation
- [ ] 7.3.1 Update `docs/deployment/COOLIFY_SETUP.md` with Infisical integration
- [ ] 7.3.2 Document environment variable configuration in Coolify (bootstrap credentials only)
- [ ] 7.3.3 Document how to rotate machine identity credentials
- [ ] 7.3.4 Document monitoring Infisical health and connectivity
- [ ] 7.3.5 Update `docs/deployment/PRODUCTION_CHECKLIST.md` with Infisical requirements

### 7.4 Update AGENTS.md
- [ ] 7.4.1 Update environment variable section with Infisical workflow
- [ ] 7.4.2 Document that .env files are now fallback/documentation only
- [ ] 7.4.3 Document how to add new secrets via Infisical UI or API
- [ ] 7.4.4 Document secret rotation best practices
- [ ] 7.4.5 Add troubleshooting section for Infisical errors

### 7.5 Update .env.example Files
- [ ] 7.5.1 Update root `.env.example` with Infisical bootstrap variables (commented)
- [ ] 7.5.2 Update `apps/server/.env.example` with note about Infisical-managed secrets
- [ ] 7.5.3 Update `apps/admin/.env.example` with note about Infisical-managed secrets
- [ ] 7.5.4 Add header comment explaining .env is for local fallback only
- [ ] 7.5.5 Keep examples of secret placeholders for documentation purposes

### 7.6 Architecture Documentation
- [ ] 7.6.1 Create `docs/architecture/SECRETS_MANAGEMENT.md` based on design.md
- [ ] 7.6.2 Document Infisical project structure diagram
- [ ] 7.6.3 Document SDK integration architecture (server, admin, workspace-cli)
- [ ] 7.6.4 Document caching strategy and refresh mechanism
- [ ] 7.6.5 Document authentication flow with Universal Auth
- [ ] 7.6.6 Document fallback behavior and production enforcement

## Phase 9: Staging Deployment

### 8.1 Infisical Staging Setup
- [ ] 8.1.1 Verify spec-server-staging project exists in Infisical
- [ ] 8.1.2 Migrate staging secrets from .env.local to Infisical staging project
- [ ] 8.1.3 Generate staging machine identity credentials
- [ ] 8.1.4 Validate staging secrets with validation script

### 8.2 Deploy to Staging
- [ ] 8.2.1 Update staging environment variables in deployment platform (Coolify)
- [ ] 8.2.2 Deploy branch with Infisical integration to staging
- [ ] 8.2.3 Monitor staging logs for successful Infisical fetch
- [ ] 8.2.4 Test all critical user flows in staging (login, documents, chat)
- [ ] 8.2.5 Run E2E tests against staging environment
- [ ] 8.2.6 Monitor staging for 24 hours for stability

### 8.3 Rollback Plan Verification
- [ ] 8.3.1 Document rollback steps for staging
- [ ] 8.3.2 Test rollback procedure (revert code, restore .env files)
- [ ] 8.3.3 Verify rollback completes in < 5 minutes
- [ ] 8.3.4 Re-deploy Infisical integration after successful rollback test

## Phase 10: Production Deployment

### 9.1 Infisical Production Setup
- [ ] 9.1.1 Verify spec-server-production project exists in Infisical
- [ ] 9.1.2 Migrate production secrets from .env.local to Infisical production project
- [ ] 9.1.3 Generate production machine identity credentials with restricted access
- [ ] 9.1.4 Validate production secrets with validation script
- [ ] 9.1.5 Enable Infisical audit logging and alerts for production project

### 9.2 Pre-deployment Checklist
- [ ] 9.2.1 All tests passing in staging
- [ ] 9.2.2 Migration guide reviewed and approved
- [ ] 9.2.3 Rollback plan documented and tested
- [ ] 9.2.4 Monitoring dashboards configured for Infisical metrics
- [ ] 9.2.5 On-call team notified of deployment window

### 9.3 Deploy to Production
- [ ] 9.3.1 Create backup of production .env files (store securely offsite)
- [ ] 9.3.2 Update production environment variables in deployment platform
- [ ] 9.3.3 Deploy branch with Infisical integration to production
- [ ] 9.3.4 Monitor logs for successful Infisical fetch
- [ ] 9.3.5 Smoke test critical features (login, document upload, chat)
- [ ] 9.3.6 Monitor error rates and application health for 1 hour
- [ ] 9.3.7 Monitor for 24 hours before marking deployment complete

### 9.4 Post-deployment Validation
- [ ] 9.4.1 Verify all services started successfully
- [ ] 9.4.2 Verify Infisical audit logs show expected access patterns
- [ ] 9.4.3 Verify secret refresh working (check logs after 4 minutes)
- [ ] 9.4.4 Verify no fallback to .env triggered (production enforcement)
- [ ] 9.4.5 Run production E2E tests (if available)

### 9.5 Cleanup
- [ ] 9.5.1 Archive .env.local files securely (keep as backup for 30 days)
- [ ] 9.5.2 Remove archived .env.local files after 30-day retention period
- [ ] 9.5.3 Document location of archived files in case of emergency recovery
- [ ] 9.5.4 Update monitoring dashboards to remove .env-related alerts
- [ ] 9.5.5 Notify team that Infisical migration is complete

## Phase 11: Ongoing Maintenance

### 10.1 Secret Rotation Procedures
- [ ] 10.1.1 Document quarterly secret rotation schedule (database passwords, API keys)
- [ ] 10.1.2 Create runbook for rotating machine identity credentials
- [ ] 10.1.3 Document emergency secret rotation procedure (credential compromise)
- [ ] 10.1.4 Schedule first secret rotation for 3 months post-migration

### 10.2 Monitoring and Alerting
- [ ] 10.2.1 Add Infisical health check to monitoring dashboards
- [ ] 10.2.2 Configure alert for Infisical API latency > 2 seconds
- [ ] 10.2.3 Configure alert for Infisical fetch failures > 5 in 10 minutes
- [ ] 10.2.4 Configure alert for fallback to .env triggered in production (critical)
- [ ] 10.2.5 Review Infisical audit logs weekly for unusual access patterns

### 10.3 Team Training
- [ ] 10.3.1 Conduct training session on Infisical UI for all developers
- [ ] 10.3.2 Document process for adding new secrets via Infisical
- [ ] 10.3.3 Document process for rotating secrets safely
- [ ] 10.3.4 Add Infisical access to new developer onboarding checklist
- [ ] 10.3.5 Create video walkthrough of common Infisical operations

## Success Criteria

- [ ] All applications start successfully using Infisical secrets in all environments (dev/staging/production)
- [ ] Zero secrets stored in committed .env files (validation script confirms)
- [ ] Local development works with both Infisical and .env fallback
- [ ] All E2E tests pass using Infisical-managed test credentials
- [ ] Migration guide successfully used in staging deployment
- [ ] Production deployment completed with 0 incidents
- [ ] Secret refresh mechanism working (logs show background refreshes every 4 minutes)
- [ ] Fallback to file system cache working (tested with simulated Infisical outage)
- [ ] Audit logs show all secret access by machine identities
- [ ] Documentation complete and validated by at least one team member
