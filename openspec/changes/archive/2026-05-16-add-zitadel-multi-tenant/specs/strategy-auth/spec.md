## MODIFIED Requirements

### Requirement: Development Pass-Through

The system SHALL support a no-auth development mode for local development.

#### Scenario: Dev mode request
- **WHEN** `AUTH_ENABLED=false` (default)
- **THEN** all requests are treated as authenticated by the DevUser (id: 00000000-0000-0000-0000-000000000001)
- **AND** the DevUser is injected into the request context by AuthMiddleware
- **AND** audit log entries record actor_id = DevUser.ID
- **AND** no Zitadel configuration is required to start the server

#### Scenario: Production rejects unauthenticated requests
- **WHEN** `AUTH_ENABLED=true` and no valid Authorization header is present
- **THEN** the server returns HTTP 401 with error code 100004

## REMOVED Requirements

### Requirement: GitHub OAuth Authentication
**Reason**: Replaced by Zitadel OIDC introspection. GitHub OAuth is not the identity
provider for this system. Users are authenticated via the shared Zitadel instance used
by emergent-memory.
**Migration**: Remove `EPF_OAUTH_CLIENT_ID`, `EPF_OAUTH_CLIENT_SECRET`, `EPF_SESSION_SECRET`
env vars. Add `ZITADEL_ISSUER` and `ZITADEL_CLIENT_JWT` (or `ZITADEL_CLIENT_JWT_PATH`).

### Requirement: Workspace-Scoped Authorisation
**Reason**: Superseded by org-scoped authorisation defined in strategy-core. Workspace
access is now derived from org membership, not GitHub login matching.
**Migration**: See strategy-core Requirement: Org-Scoped Access Control.

## ADDED Requirements

### Requirement: Zitadel OIDC Introspection Authentication

The system SHALL validate Bearer tokens by calling the Zitadel introspection endpoint
using a JWT-profile service account. Results SHALL be cached in
`strategy.auth_introspection_cache` to avoid per-request network round-trips.

#### Scenario: Valid token — cache miss
- **WHEN** `AUTH_ENABLED=true`
- **AND** a request arrives with `Authorization: Bearer <token>`
- **AND** the token is not in `strategy.auth_introspection_cache` or is expired
- **THEN** the server calls the Zitadel introspection endpoint
- **AND** receives `active: true`
- **AND** caches the result with TTL = `min(token_exp - now, ZITADEL_INTROSPECT_CACHE_TTL)`
- **AND** calls `EnsureUser(sub, email)` to upsert the user record
- **AND** injects the resolved `web.User` into the request context
- **AND** the request proceeds normally

#### Scenario: Valid token — cache hit
- **WHEN** `AUTH_ENABLED=true`
- **AND** a request arrives with `Authorization: Bearer <token>`
- **AND** the SHA-512 hash of the token matches an unexpired row in `strategy.auth_introspection_cache`
- **THEN** the server resolves the user from the cache without calling Zitadel
- **AND** the request proceeds normally

#### Scenario: Invalid or revoked token
- **WHEN** `AUTH_ENABLED=true`
- **AND** introspection returns `active: false`
- **THEN** the server returns HTTP 401
- **AND** the result is NOT cached

#### Scenario: Introspection endpoint unavailable — circuit breaker
- **WHEN** the Zitadel introspection endpoint fails (network error or 5xx)
- **THEN** the circuit breaker opens for 30 seconds
- **AND** during the cooldown, cached tokens continue to be served from the Postgres cache
- **AND** tokens with no cache entry are rejected with HTTP 503

### Requirement: Debug Token Bypass

In non-production environments the system SHALL support a static debug token to
facilitate integration testing without a live Zitadel instance.

#### Scenario: Debug token accepted
- **WHEN** `AUTH_ENABLED=true`
- **AND** `ZITADEL_DEBUG_TOKEN` is set
- **AND** `ENV` is not `production`
- **AND** a request arrives with `Authorization: Bearer <value of ZITADEL_DEBUG_TOKEN>`
- **THEN** the server injects a fixed test user (sub: `debug-user`, email: `debug@localhost`)
- **AND** the introspection endpoint is NOT called

#### Scenario: Debug token rejected in production
- **WHEN** `ENV=production`
- **AND** `ZITADEL_DEBUG_TOKEN` is set
- **THEN** the debug bypass is silently disabled; the token is sent to Zitadel for introspection normally

### Requirement: Deployment Mode Selection

The system SHALL support two deployment modes selected by `STRATEGY_DB_MODE`:

| Mode | Value | Identity source |
|------|-------|----------------|
| Standalone | `standalone` (default) | `strategy.users`, `strategy.orgs`, `strategy.org_memberships` |
| Shared | `shared` | `core.user_profiles`, `kb.orgs`, `kb.organization_memberships` (emergent-memory schema) |

#### Scenario: Shared mode — user resolved from core schema
- **WHEN** `STRATEGY_DB_MODE=shared`
- **AND** a request is authenticated via Zitadel introspection
- **AND** a row exists in `core.user_profiles` with `zitadel_user_id = sub`
- **THEN** the server resolves `web.User.ID` from `core.user_profiles.id`
- **AND** does NOT write to `strategy.users`

#### Scenario: Standalone mode — user upserted on first auth
- **WHEN** `STRATEGY_DB_MODE=standalone` (or unset)
- **AND** a request is authenticated for the first time for a given `sub`
- **THEN** the server inserts a row into `strategy.users`
- **AND** resolves `web.User.ID` from the new row

#### Scenario: Standalone mode — org bootstrap
- **WHEN** `STRATEGY_DB_MODE=standalone`
- **AND** no orgs exist in `strategy.orgs`
- **AND** a user authenticates for the first time
- **THEN** the server creates a default org (`"Default Organisation"`)
- **AND** adds the user as `org_admin`
- **AND** the operation is idempotent under concurrent first-auth requests
