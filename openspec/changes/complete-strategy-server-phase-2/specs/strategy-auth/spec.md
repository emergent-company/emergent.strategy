## MODIFIED Requirements

### Requirement: Development Pass-Through

The system SHALL support a no-auth development mode for local development.

#### Scenario: Dev mode request
- **WHEN** `AUTH_ENABLED=false` (default)
- **THEN** all requests are treated as authenticated by the DevUser (id: 00000000-0000-0000-0000-000000000001)
- **AND** the DevUser is injected into the request context by AuthMiddleware
- **AND** audit log entries record actor_id = DevUser.ID
- **AND** a default dev org is auto-created if it does not exist

#### Scenario: Production rejects unauthenticated requests
- **WHEN** `AUTH_ENABLED=true` and no valid Authorization header is present
- **THEN** the server returns HTTP 401 with error code 100004

---

## REMOVED Requirements

### Requirement: GitHub OAuth Authentication
**Reason:** Replaced by Zitadel OIDC introspection. Strategy-server uses the same
identity provider as emergent-memory for single sign-on.
**Migration:** Remove `EPF_OAUTH_CLIENT_ID`, `EPF_OAUTH_CLIENT_SECRET`,
`EPF_SESSION_SECRET` config vars. Add Zitadel vars instead.

### Requirement: Workspace-Scoped Authorisation
**Reason:** Replaced by org-scoped authorisation with explicit membership model.
Workspace access is derived from org membership, not GitHub identity matching.
**Migration:** All queries scoped through org membership. `github_owner` matching
removed.

---

## ADDED Requirements

### Requirement: Zitadel OIDC Authentication

The system SHALL authenticate production requests via Zitadel OIDC token
introspection, using the same identity provider as emergent-memory.

#### Scenario: Valid bearer token
- **WHEN** a request includes a valid `Authorization: Bearer <token>` header
- **THEN** the server introspects the token against Zitadel
- **AND** extracts the user's subject ID and email
- **AND** calls `EnsureUser` to create or update the user record
- **AND** injects the authenticated user into the request context

#### Scenario: Expired or invalid token
- **WHEN** a request includes an invalid or expired bearer token
- **THEN** the server returns HTTP 401 with error code 100004

#### Scenario: Introspection cache hit
- **WHEN** the same token was successfully introspected within the cache TTL
- **THEN** the cached result is used without a Zitadel round-trip

#### Scenario: Zitadel unavailable with warm cache
- **WHEN** Zitadel is unreachable but the token exists in the introspection cache
- **THEN** the cached result is used (circuit breaker open)

#### Scenario: Debug token bypass
- **WHEN** `ZITADEL_DEBUG_TOKEN` is configured (non-production only)
- **AND** the request bears the debug token
- **THEN** the request is treated as authenticated by a test user
- **AND** this bypass is disabled when `AUTH_ENABLED=true` in production

---

### Requirement: Org-Scoped Authorisation

The system SHALL enforce organisation-level access control: a user may only
access workspaces belonging to organisations they are a member of.

#### Scenario: Access workspace in own org
- **WHEN** an authenticated user requests a workspace whose `org_id` matches an org they belong to
- **THEN** the request is allowed

#### Scenario: Access denied to foreign org workspace
- **WHEN** an authenticated user requests a workspace whose `org_id` does not match any of their orgs
- **THEN** the server returns HTTP 403 with error code 100003

#### Scenario: Org admin creates workspace
- **WHEN** an `org_admin` creates a workspace
- **THEN** the workspace is associated with that org
- **AND** the workspace is accessible to all org members

#### Scenario: Org viewer read-only access
- **WHEN** an `org_viewer` attempts a write operation
- **THEN** the server returns HTTP 403

---

### Requirement: User Identity Persistence

The system SHALL persist user identity on first successful authentication.

#### Scenario: First login
- **WHEN** a user authenticates for the first time
- **THEN** a `strategy.users` record is created with their Zitadel subject ID and email
- **AND** any pending org invitations for their email are automatically accepted

#### Scenario: Returning user
- **WHEN** a previously authenticated user logs in again
- **THEN** their existing user record is used (upsert semantics)

#### Scenario: Soft-deleted user re-auth
- **WHEN** a previously soft-deleted user authenticates
- **THEN** their user record is reactivated

---

### Requirement: Organisation Management

The system SHALL support creating and managing organisations as tenant containers.

#### Scenario: Create org
- **WHEN** a user creates an org
- **THEN** the org is created and the user is added as `org_admin`

#### Scenario: Invite member by email
- **WHEN** an `org_admin` invites a user by email
- **AND** the user already exists in the system
- **THEN** a membership is created immediately

#### Scenario: Invite non-existent user
- **WHEN** an `org_admin` invites an email that has no user record
- **THEN** a pending invitation is created
- **AND** the invitation is automatically accepted when that user first authenticates

#### Scenario: Remove member
- **WHEN** an `org_admin` removes a member
- **THEN** the membership is deleted
- **AND** the user loses access to the org's workspaces

#### Scenario: Last admin protection
- **WHEN** an `org_admin` attempts to remove the last admin
- **THEN** the operation is rejected with an error
