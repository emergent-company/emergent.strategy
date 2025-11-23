# Integrate Infisical Secrets Management

## Why

Environment variables are currently managed through multiple `.env` files scattered across the repository, causing significant operational challenges:

1. **Configuration Discovery** - Developers struggle to find where specific variables should be defined (root `.env`, `apps/server/.env`, `apps/admin/.env`, or their `.local` variants)
2. **Deployment Complexity** - Setting up new deployments requires manually configuring dozens of environment variables across multiple files
3. **Secret Management** - Sensitive credentials (API keys, database passwords) are stored in `.env.local` files with no versioning, rotation, or audit trail
4. **Environment Consistency** - No standardized way to manage variables across development, staging, and production environments
5. **Onboarding Friction** - New developers must manually copy and configure multiple `.env` files from examples

These issues have been documented in multiple bug reports (e.g., `003-missing-google-api-key.md`) and the partially completed `reorganize-environment-variables` change addressed file organization but not the underlying secret management problem.

Infisical provides a centralized, secure platform for managing secrets and configuration across all environments with built-in features for secret rotation, versioning, access control, and audit logging.

## What Changes

Integrate Infisical secrets management to replace `.env` file-based configuration:

### Core Integration

- Add `@infisical/sdk` package to server and admin applications
- Implement Infisical client initialization with Universal Auth (machine identity)
- Create configuration service to fetch secrets on application startup
- Add graceful fallback to `.env` files during local development
- Implement secret caching with automatic refresh

### Project Structure

Create separate Infisical projects for logical separation:
- `spec-server-dev` - Development environment
- `spec-server-staging` - Staging environment  
- `spec-server-production` - Production environment

Each project contains environments:
- `workspace` - Shared configuration (ports, namespace)
- `server` - Backend API configuration
- `admin` - Frontend application configuration
- `docker` - Docker Compose dependencies configuration

### Variable Migration

Move all environment variables to Infisical:
- **Sensitive secrets** - API keys, database passwords, OAuth credentials
- **Application configuration** - Ports, URLs, feature flags, LLM settings
- **Test credentials** - TEST_USER_*, E2E_TEST_USER_* credentials
- **Infrastructure settings** - Database connection strings, Zitadel configuration

### Developer Experience

- **Local development** - SDK fetches secrets automatically, with `.env` fallback
- **CI/CD integration** - GitHub Actions uses Infisical secrets for test environments
- **Deployment automation** - Coolify integrations fetch secrets on startup
- **Onboarding** - New developers only need Infisical access token

### Documentation & Tooling

- Migration guide for existing deployments
- Setup scripts to bootstrap Infisical projects/environments
- CLI commands to sync secrets from `.env` to Infisical
- Updated developer documentation with Infisical workflows

## Impact

### Affected Capabilities

- **configuration-management** (NEW) - Centralized secrets management with Infisical
- **authentication** (MODIFIED) - OAuth credentials stored in Infisical
- **database-access** (MODIFIED) - Database credentials stored in Infisical

### Breaking Changes

**BREAKING**: Applications will require Infisical configuration to start in production environments. Local development maintains backward compatibility with `.env` files.

### Affected Code

- `apps/server/src/common/config/` - Configuration module
- `apps/admin/src/config/` - Frontend configuration
- `tools/workspace-cli/src/commands/` - Process management
- `scripts/bootstrap-*.sh` - Setup scripts
- `docker/docker-compose.yml` - Docker infrastructure
- All `.env.example` files - Documentation updates

### Dependencies

- Self-hosted Infisical instance (already available per user confirmation)
- New npm package: `@infisical/sdk@^4.0.0`

## Benefits

1. **Simplified Deployment** - Single source of truth for all configuration across environments
2. **Enhanced Security** - Encrypted secret storage with access control and audit logging
3. **Better Developer Experience** - No manual `.env` file management, automatic secret injection
4. **Environment Consistency** - Guaranteed configuration parity across development, staging, and production
5. **Secret Rotation** - Built-in support for rotating credentials without code changes
6. **Audit Trail** - Complete history of who accessed/modified secrets and when
7. **Reduced Errors** - Eliminate "missing API key" deployment failures
8. **Team Collaboration** - Team members can access secrets without sharing files

## Risks & Mitigation

### Risk: Infisical service unavailability breaks applications

**Mitigation**:
- Implement local secret caching with automatic refresh
- Maintain `.env` file fallback for local development
- Document emergency recovery procedures
- Monitor Infisical health with alerts

### Risk: Migration complexity for existing deployments

**Mitigation**:
- Provide comprehensive migration guide with step-by-step instructions
- Create automated migration script to sync `.env` → Infisical
- Support gradual migration (critical secrets first, then all config)
- Maintain backward compatibility during transition period

### Risk: Initial setup overhead

**Mitigation**:
- Create bootstrap scripts to auto-generate Infisical projects/environments
- Document one-time setup process clearly
- Provide video/screenshots for visual guidance
- Net time savings after initial setup

### Risk: Learning curve for team members

**Mitigation**:
- Update developer documentation with Infisical workflows
- Provide CLI commands for common operations
- SDK handles complexity, developers just start applications normally
- Infisical UI is intuitive for manual secret management

## Implementation Approach

### Phase 1: Infrastructure Setup (Foundation)
- Add Infisical to Docker Compose for local development
- Create Infisical projects and environments structure
- Generate machine identity credentials for each application

### Phase 2: SDK Integration (Core)
- Install `@infisical/sdk` in server and admin applications
- Implement configuration service to fetch secrets on startup
- Add secret caching layer with refresh mechanism
- Maintain `.env` fallback for local development

### Phase 3: Migration (Transition)
- Create migration scripts to sync `.env` → Infisical
- Migrate critical secrets first (database, API keys)
- Migrate application configuration second
- Migrate test credentials last

### Phase 4: Testing & Validation (Safety)
- Test all applications start with Infisical secrets
- Test fallback to `.env` files in local development
- Test secret refresh and caching mechanisms
- Run full E2E test suite in test environment

### Phase 5: Documentation (Enablement)
- Update all setup/deployment documentation
- Create migration guide for existing deployments
- Update AGENTS.md with Infisical workflows
- Add troubleshooting section for common issues

### Phase 6: Deployment (Rollout)
- Deploy to staging environment first
- Monitor for issues, validate functionality
- Deploy to production with rollback plan
- Archive `.env` files (keep as backup for 30 days)

## Timeline

- **Phase 1 - Infrastructure**: 4 hours
- **Phase 2 - SDK Integration**: 8 hours
- **Phase 3 - Migration**: 6 hours
- **Phase 4 - Testing**: 4 hours
- **Phase 5 - Documentation**: 4 hours
- **Phase 6 - Deployment**: 2 hours

**Total**: ~28 hours (3-4 working days)

## Success Criteria

- All applications start successfully using Infisical secrets in all environments
- Zero secrets stored in committed `.env` files
- Local development works with both Infisical and `.env` fallback
- All E2E tests pass using Infisical-managed test credentials
- Documentation enables new developers to onboard without manual `.env` setup
- Migration guide successfully used in at least one existing deployment
