# Design: Integrate Infisical Secrets Management

## Context

The application currently uses multiple `.env` files for configuration management, leading to operational complexity and security concerns. The `reorganize-environment-variables` change improved file organization but didn't solve the underlying problems:

- Secrets stored in gitignored `.env.local` files with no versioning or audit trail
- Manual configuration required for each deployment environment
- No centralized way to rotate credentials or manage access control
- Developers struggle to determine where variables should be defined

Infisical is a self-hosted secrets management platform that provides:
- Encrypted secret storage with versioning and audit logging
- SDK-based secret delivery for runtime applications
- Project/environment organization matching deployment topology
- Universal Auth for machine identity authentication
- Secret caching and fallback mechanisms

## Goals

1. **Centralize secret management** - Single source of truth for all configuration across environments
2. **Improve security** - Encrypted storage, access control, audit trail, secret rotation
3. **Simplify deployments** - Applications auto-fetch configuration on startup
4. **Maintain developer ergonomics** - Local development remains simple with `.env` fallback
5. **Enable gradual migration** - Support transition period with both systems active

## Non-Goals

1. **Migrate away from self-hosted Infisical** - User confirmed self-hosted instance available
2. **Change application runtime behavior** - Configuration values remain the same, only delivery mechanism changes
3. **Eliminate `.env` files entirely** - Keep as local development fallback and documentation
4. **Support Infisical CLI-based injection** - SDK-based approach only for consistency

## Architecture

### Infisical Project Structure

```
Infisical Instance (self-hosted)
├── spec-server-dev/
│   ├── workspace/     # Shared config (NAMESPACE, ports)
│   ├── server/        # Backend config (database, API keys)
│   ├── admin/         # Frontend config (VITE_* variables)
│   └── docker/        # Docker Compose dependencies
├── spec-server-staging/
│   ├── workspace/
│   ├── server/
│   ├── admin/
│   └── docker/
└── spec-server-production/
    ├── workspace/
    ├── server/
    ├── admin/
    └── docker/
```

**Rationale**: Separate projects per deployment environment (dev/staging/production) ensures complete isolation. Environments within each project (workspace/server/admin/docker) mirror the application's modular structure.

### SDK Integration Architecture

#### Server Application (NestJS)

```typescript
// apps/server/src/common/config/infisical.service.ts
export class InfisicalConfigService {
  private client: InfisicalSDK;
  private cache: Map<string, { value: string; expiry: number }>;

  async initialize() {
    // Authenticate with machine identity
    await this.client.auth().universalAuth.login({
      clientId: process.env.INFISICAL_CLIENT_ID,
      clientSecret: process.env.INFISICAL_CLIENT_SECRET
    });
  }

  async getAllSecrets(): Promise<Record<string, string>> {
    // Fetch from Infisical with caching
    const secrets = await this.client.secrets().listSecretsWithImports({
      environment: process.env.INFISICAL_ENVIRONMENT || 'server',
      projectId: process.env.INFISICAL_PROJECT_ID,
      includeImports: true,
      recursive: true
    });

    // Inject into process.env for existing code compatibility
    secrets.forEach(secret => {
      process.env[secret.secretKey] = secret.secretValue;
    });

    return secrets;
  }

  // Fallback to .env files if Infisical unavailable
  private fallbackToEnvFiles() {
    // Existing dotenv loading logic
  }
}
```

**Loading Order**:
1. Try Infisical SDK fetch
2. On success: inject into `process.env`, cache values
3. On failure: fallback to `.env` files (dotenv)
4. Log warning if fallback used

#### Admin Application (React + Vite)

```typescript
// apps/admin/src/config/infisical.ts
export async function loadInfisicalConfig() {
  const client = new InfisicalSDK({
    siteUrl: import.meta.env.VITE_INFISICAL_SITE_URL
  });

  await client.auth().universalAuth.login({
    clientId: import.meta.env.VITE_INFISICAL_CLIENT_ID,
    clientSecret: import.meta.env.VITE_INFISICAL_CLIENT_SECRET
  });

  const secrets = await client.secrets().listSecretsWithImports({
    environment: 'admin',
    projectId: import.meta.env.VITE_INFISICAL_PROJECT_ID,
    includeImports: true
  });

  // Return as config object for React context
  return secrets.reduce((acc, secret) => {
    acc[secret.secretKey] = secret.secretValue;
    return acc;
  }, {} as Record<string, string>);
}
```

**Note**: Vite frontend requires secrets at build time. For runtime secrets, server proxies requests.

#### Workspace CLI (PM2 Process Manager)

```typescript
// tools/workspace-cli/src/services/infisical.service.ts
export class WorkspaceInfisicalService {
  async loadWorkspaceConfig(): Promise<Record<string, string>> {
    // Fetch workspace environment (NAMESPACE, ports, etc.)
    const secrets = await this.client.secrets().listSecretsWithImports({
      environment: 'workspace',
      projectId: process.env.INFISICAL_PROJECT_ID,
      includeImports: true
    });

    return secrets;
  }
}
```

### Secret Caching Strategy

**Cache Layer**:
- In-memory cache with TTL (default: 5 minutes)
- Automatic background refresh before expiry
- Graceful handling of refresh failures (serve stale cache)
- Cache persisted to file system for cold starts

**Rationale**: Balances security (short TTL) with availability (cached fallback) and performance (reduce API calls).

### Authentication Strategy

**Universal Auth (Machine Identity)**:
- Each application/environment gets unique client ID + secret
- Credentials stored in minimal `.env` file (only Infisical bootstrap credentials)
- Scoped access: each machine identity only accesses its required project/environment

**Bootstrap Credentials**:
```bash
# Root .env (or .env.local for secrets)
INFISICAL_SITE_URL=https://infisical.example.com
INFISICAL_PROJECT_ID=<project-id>
INFISICAL_CLIENT_ID=<machine-identity-client-id>
INFISICAL_CLIENT_SECRET=<machine-identity-client-secret>  # .env.local only
INFISICAL_ENVIRONMENT=server  # or admin, workspace, docker
```

**Rationale**: Universal Auth is designed for machine-to-machine communication, doesn't require browser flow, and supports scoped access control.

## Decisions

### Decision 1: SDK-based vs CLI-based secret injection

**Chosen**: SDK-based (runtime fetch)

**Alternatives considered**:
- **CLI-based** (`infisical run -- npm start`): Simpler, secrets injected before app starts
  - ❌ Cons: Requires CLI wrapper in all deployment scripts, no secret refresh without restart
- **Agent-based**: Infisical Agent syncs secrets to files
  - ❌ Cons: Additional infrastructure, complexity of agent management
- **SDK-based**: Application fetches secrets at startup via SDK
  - ✅ Pros: No wrapper scripts, supports secret refresh, graceful fallback, better error handling

**Rationale**: SDK provides most flexibility for caching, refresh, and fallback logic. Clean integration with existing NestJS/React startup sequence.

### Decision 2: Separate projects per environment vs single project

**Chosen**: Separate Infisical projects per deployment environment

**Alternatives considered**:
- **Single project with multiple environments**: 
  - ❌ Cons: All environments in same project increases blast radius of access control errors
- **Separate projects per environment**:
  - ✅ Pros: Complete isolation, independent access control, safer for production

**Rationale**: Production secrets should be completely isolated from dev/staging. Separate projects enforce this at infrastructure level.

### Decision 3: Environment structure within projects

**Chosen**: Environments mirror application structure (workspace/server/admin/docker)

**Alternatives considered**:
- **Single flat environment** with all secrets:
  - ❌ Cons: Harder to manage, unclear ownership
- **Separate environments per application component**:
  - ✅ Pros: Clear boundaries, matches code organization, supports independent updates

**Rationale**: Aligns with existing `.env` file organization after `reorganize-environment-variables` change.

### Decision 4: Fallback strategy

**Chosen**: Graceful fallback to `.env` files in local development only

**Alternatives considered**:
- **No fallback** - Require Infisical always:
  - ❌ Cons: Breaks local development if Infisical unavailable
- **Always fallback to `.env` files**:
  - ❌ Cons: Defeats purpose of Infisical, secrets could drift
- **Conditional fallback** - `.env` only in development:
  - ✅ Pros: Best of both worlds, production enforces Infisical

**Rationale**: Local development shouldn't require Infisical connection. Production deployments must use Infisical for security/audit requirements.

### Decision 5: Secret caching implementation

**Chosen**: In-memory cache with background refresh + file system persistence

**Alternatives considered**:
- **No caching** - Fetch on every request:
  - ❌ Cons: High latency, API rate limits
- **In-memory only**:
  - ❌ Cons: Cold starts require Infisical availability
- **Redis cache**:
  - ❌ Cons: Additional infrastructure dependency
- **In-memory + FS persistence**:
  - ✅ Pros: Fast, survives restarts, minimal dependencies

**Rationale**: In-memory cache is fastest. File system persistence handles cold starts when Infisical temporarily unavailable.

## Migration Strategy

### Phase 1: Bootstrap Infisical Infrastructure

**Actions**:
1. Create Infisical projects: `spec-server-dev`, `spec-server-staging`, `spec-server-production`
2. Create environments within each project: `workspace`, `server`, `admin`, `docker`
3. Generate machine identity credentials for each application/environment combination
4. Store bootstrap credentials in minimal `.env.local` files

**Automation**: Script to create projects/environments via Infisical API

### Phase 2: Migrate Secrets Gradually

**Priority Order**:
1. **Critical secrets first** (blocking production):
   - `POSTGRES_PASSWORD`
   - `GOOGLE_API_KEY`
   - `ZITADEL_CLIENT_SECRET`
   - `ZITADEL_SERVICE_ACCOUNT_KEY`

2. **Application configuration second**:
   - Database connection strings
   - API endpoints
   - Feature flags
   - LLM settings

3. **Test credentials last**:
   - `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`
   - `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`

**Automation**: Script to parse `.env` files and bulk upload to Infisical via SDK

### Phase 3: Update Application Code

**Server (NestJS)**:
1. Install `@infisical/sdk`
2. Create `InfisicalConfigService`
3. Update `ConfigModule` to load from Infisical before dotenv
4. Add fallback logic for local development

**Admin (React)**:
1. Install `@infisical/sdk`
2. Create `loadInfisicalConfig()` function
3. Update `ConfigContext` to fetch from Infisical on app initialization
4. Add fallback logic for local development

**Workspace CLI**:
1. Install `@infisical/sdk`
2. Update workspace start command to fetch workspace secrets
3. Inject into PM2 process environment variables

### Phase 4: Testing Strategy

**Local Development Testing**:
- Test server starts with Infisical secrets
- Test fallback to `.env` when Infisical unavailable (disconnect network)
- Test secret refresh mechanism

**Staging Environment Testing**:
- Deploy with Infisical integration enabled
- Run full E2E test suite
- Verify all features work with Infisical-managed secrets
- Test secret rotation (update in Infisical, restart app, verify new value loaded)

**Production Deployment**:
- Blue-green deployment with rollback plan
- Monitor error rates and application health
- Keep `.env` files as emergency backup for 30 days post-migration

## Data Migration

### Source: `.env` Files

Current structure:
```
/.env                  # Workspace defaults
/.env.local            # Workspace secrets
/apps/server/.env      # Server defaults
/apps/server/.env.local # Server secrets
/apps/admin/.env       # Admin defaults
/apps/admin/.env.local  # Admin secrets
```

### Target: Infisical Projects/Environments

Mapping:
```
/.env (non-secrets) → spec-server-{env}/workspace
/.env.local (secrets) → spec-server-{env}/workspace
/apps/server/.env → spec-server-{env}/server
/apps/server/.env.local → spec-server-{env}/server
/apps/admin/.env → spec-server-{env}/admin
/apps/admin/.env.local → spec-server-{env}/admin
```

### Migration Script

```bash
#!/bin/bash
# scripts/migrate-to-infisical.sh

# Parse .env files
parse_env_file() {
  local file=$1
  local project=$2
  local environment=$3

  # Extract key=value pairs, upload to Infisical
  while IFS='=' read -r key value; do
    infisical secrets set "$key" --value="$value" \
      --project="$project" --environment="$environment"
  done < "$file"
}

# Migrate workspace secrets
parse_env_file ".env.local" "spec-server-dev" "workspace"

# Migrate server secrets
parse_env_file "apps/server/.env.local" "spec-server-dev" "server"

# Migrate admin secrets
parse_env_file "apps/admin/.env.local" "spec-server-dev" "admin"
```

## Rollback Plan

### Scenario 1: Infisical integration breaks application startup

**Action**:
1. Revert code changes (git revert)
2. Redeploy previous version
3. Application falls back to `.env` files
4. **Estimated downtime**: < 5 minutes

### Scenario 2: Secret values incorrect after migration

**Action**:
1. Compare Infisical secrets with original `.env.local` files (kept as backup)
2. Fix incorrect values in Infisical UI
3. Restart applications to fetch corrected secrets
4. **Estimated downtime**: < 2 minutes

### Scenario 3: Infisical service outage

**Action**:
1. Applications serve from cached secrets (5-minute TTL)
2. If outage > cache expiry: applications read from file system cache
3. If file system cache stale: emergency fallback to `.env` files
4. Monitor Infisical health, restore service
5. **Estimated downtime**: 0 minutes (cached fallback)

## Monitoring & Observability

### Metrics to Track

- **Secret fetch latency**: Time to fetch secrets from Infisical
- **Secret fetch failures**: Count of failed Infisical API calls
- **Cache hit rate**: % of requests served from cache vs fresh fetch
- **Fallback usage**: Count of times `.env` fallback triggered

### Alerting

- **Critical**: Infisical API unreachable for > 5 minutes
- **Warning**: Secret fetch latency > 2 seconds
- **Warning**: Cache hit rate < 90%
- **Info**: Fallback to `.env` triggered (local dev only)

### Logging

Log all secret fetch operations:
```typescript
logger.info('Fetching secrets from Infisical', {
  project: projectId,
  environment: envSlug,
  cached: false,
  latencyMs: 150
});
```

Log fallback events:
```typescript
logger.warn('Infisical unavailable, falling back to .env files', {
  reason: error.message,
  environment: process.env.NODE_ENV
});
```

## Security Considerations

### Machine Identity Credentials

- Store `INFISICAL_CLIENT_SECRET` in `.env.local` (gitignored)
- Rotate machine identity credentials quarterly
- Each application/environment gets unique credentials
- Scope access to minimum required project/environment

### Secret Storage

- Infisical encrypts secrets at rest and in transit (TLS)
- Secrets never logged or printed to console
- File system cache encrypted with application-specific key
- Cache files restricted to application user (chmod 600)

### Access Control

- Machine identities scoped to single project/environment
- Human users require MFA for Infisical UI access
- Audit log tracks all secret access and modifications
- Rotate secrets immediately if credentials compromised

## Open Questions

1. **Q**: Should we migrate Docker Compose secrets (PostgreSQL password, etc.) to Infisical?
   **A**: Yes, create `docker` environment in each project for consistency. Docker Compose can read from `.env` file generated by Infisical CLI or injected via SDK wrapper.

2. **Q**: How to handle secrets that change frequently (API rate limits, feature flags)?
   **A**: Use secret refresh mechanism with short cache TTL (1 minute). Applications automatically pick up changes without restart.

3. **Q**: Should we delete `.env` files after migration?
   **A**: Keep `.env.example` files for documentation. Archive actual `.env` files for 30 days as emergency backup, then delete.

4. **Q**: How to handle developer onboarding?
   **A**: Provide Infisical access token in onboarding doc. Developer runs setup script which generates machine identity credentials locally. No manual `.env` configuration needed.

5. **Q**: What if Infisical instance gets compromised?
   **A**: Rotate all machine identity credentials immediately. Fallback to `.env` files temporarily. Review audit logs to identify accessed secrets. Treat as full secret compromise, rotate all credentials in external services (database, APIs, etc.).
