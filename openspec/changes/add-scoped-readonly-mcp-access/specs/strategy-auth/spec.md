## ADDED Requirements

### Requirement: Access Token Credentials

The system SHALL support long-lived, revocable access tokens as an inbound
authentication mechanism alongside Zitadel OIDC, enabling unattended clients to
authenticate without an interactive login.

Tokens SHALL be opaque random strings prefixed `est_`. The system SHALL store
only an Argon2id hash of the token, never the plaintext. Every token SHALL have
an expiry.

#### Scenario: Mint a token
- **WHEN** an `org_admin` mints an access token with a name and expiry
- **THEN** the system generates a cryptographically random token with the `est_` prefix
- **AND** stores an Argon2id hash plus an 8-character indexed public prefix
- **AND** returns the plaintext token exactly once in the mint response
- **AND** the plaintext is never retrievable afterwards

#### Scenario: Authenticate with a token
- **WHEN** a request arrives with `Authorization: Bearer est_<token>`
- **THEN** the system resolves it against `access_tokens` by public prefix
- **AND** verifies the Argon2id hash
- **AND** injects a Principal carrying the token's owner and grants into the request context
- **AND** does not call the Zitadel introspection endpoint

#### Scenario: Expired token rejected
- **WHEN** a request presents a token whose `expires_at` is in the past
- **THEN** the system returns HTTP 401
- **AND** no Principal is injected

#### Scenario: Revoked token rejected
- **WHEN** a token has been revoked
- **THEN** any request presenting it returns HTTP 401
- **AND** the resolution cache entry for that token is purged at revocation time

#### Scenario: Unknown token rejected
- **WHEN** a request presents an `est_`-prefixed string matching no stored hash
- **THEN** the system returns HTTP 401
- **AND** the response does not reveal whether the prefix matched any row

#### Scenario: Token usage is recorded
- **WHEN** a token successfully authenticates a request
- **THEN** `last_used_at` is updated
- **AND** the update does not block the request path

#### Scenario: Expiry is mandatory
- **WHEN** a mint request omits an expiry or requests one beyond the maximum of 1 year
- **THEN** the system rejects the request with HTTP 400

---

### Requirement: Instance-Scoped Grants

The system SHALL support binding an access token to one or more specific strategy
instances with a permission of `read` or `write`, enabling access scoped more
narrowly than org membership.

A token's grants SHALL narrow its owner's authority and SHALL NOT widen it.

#### Scenario: Read grant allows reading the granted instance
- **WHEN** a token with a `read` grant on instance X calls a read tool for instance X
- **THEN** the call succeeds

#### Scenario: Grant does not extend to other instances
- **WHEN** a token with a grant on instance X calls any tool for instance Y
- **THEN** the system returns a forbidden error
- **AND** org membership is not consulted as a fallback

#### Scenario: Grants override org membership
- **WHEN** the token owner is an `org_admin` of the org owning instance X
- **AND** the token carries only a `read` grant on instance X
- **THEN** write tools for instance X are denied
- **AND** the owner's `org_admin` role does not escalate the token's permission

#### Scenario: Mint cannot exceed the minter's authority
- **WHEN** a user requests a token with a grant on an instance they cannot access
- **THEN** the system rejects the mint with a forbidden error

#### Scenario: Owner losing access invalidates the grant
- **WHEN** a token's owner is removed from the org owning the granted instance
- **THEN** subsequent calls with that token are denied once the resolution cache expires

#### Scenario: Interactive sessions are unaffected
- **WHEN** a Principal has no grants because it came from a Zitadel session
- **THEN** authorisation falls back to the existing org-membership path

---

### Requirement: Production Safety Guards

The system SHALL refuse to start in a configuration that would expose an
unauthenticated or bypassable endpoint when running in production.

#### Scenario: Production requires auth
- **WHEN** `ENV=production` and `AUTH_ENABLED=false`
- **THEN** the server logs a fatal error and exits non-zero
- **AND** does not bind a listener

#### Scenario: Debug token forbidden in production
- **WHEN** `ENV=production` and `ZITADEL_DEBUG_TOKEN` is set
- **THEN** the server logs a fatal error and exits non-zero

#### Scenario: Debug token ignored outside its environment
- **WHEN** `ENV` is not `development` and a request presents the debug token
- **THEN** the token is not honoured and introspection proceeds normally

#### Scenario: Production requires configured Zitadel
- **WHEN** `ENV=production` and `AUTH_ENABLED=true` and Zitadel is not configured
- **THEN** the server logs a fatal error and exits non-zero

#### Scenario: Development is unaffected
- **WHEN** `ENV=development` (the default) and `AUTH_ENABLED=false`
- **THEN** the server starts normally with the dev pass-through

---

### Requirement: Token Management Operations

The system SHALL provide operations to mint, list, and revoke access tokens,
restricted to `org_admin` of the owning org.

#### Scenario: List tokens
- **WHEN** an `org_admin` lists access tokens for their org
- **THEN** the system returns id, name, public prefix, grants, expiry, last used, and revocation status
- **AND** never returns the plaintext token or its hash

#### Scenario: Revoke a token
- **WHEN** an `org_admin` revokes a token belonging to their org
- **THEN** `revoked_at` is set
- **AND** the cached resolution entry is purged
- **AND** an audit log entry records the revocation

#### Scenario: Non-admin cannot manage tokens
- **WHEN** a user who is not `org_admin` calls a token management operation
- **THEN** the system returns a forbidden error

#### Scenario: Tokens cannot manage tokens
- **WHEN** a request authenticated by an access token calls any token management operation
- **THEN** the system returns a forbidden error

## MODIFIED Requirements

### Requirement: Workspace-Scoped Authorisation

The system SHALL enforce workspace-level access control. Authorisation checks
SHALL fail closed: when the caller's authority cannot be established, access is
denied rather than granted.

#### Scenario: Access own workspace
- **WHEN** an authenticated user requests a workspace in an org they belong to
- **THEN** the request is allowed

#### Scenario: Access denied to foreign workspace
- **WHEN** an authenticated user requests a workspace in an org they do not belong to
- **THEN** the server returns HTTP 403 with error code 100003

#### Scenario: Missing principal denies access
- **WHEN** an authorisation check runs and no Principal is present in context
- **THEN** access is denied
- **AND** the denial is logged as a server-side defect, since middleware should always populate a Principal

#### Scenario: Tools needing no instance are not subject to the instance check
- **WHEN** a tool takes no `instance_id` and reads no tenant data, such as `set_tool_filter`
- **THEN** no instance access check runs
- **AND** the absence of a Principal does not deny the call
- **AND** this keeps transport-level introspection and tool-listing usable before any tenant context exists

#### Scenario: Unavailable org service denies access
- **WHEN** an authorisation check runs and the org service is not wired
- **THEN** access is denied rather than skipped

#### Scenario: Dev mode uses an explicit principal
- **WHEN** `AUTH_ENABLED=false`
- **THEN** middleware injects a dev Principal with full capability and a wildcard grant
- **AND** authorisation succeeds because of that explicit principal, not because of an absent one

#### Scenario: Org membership (future)
- **WHEN** a user is a member of the organisation that owns a workspace
- **THEN** access is granted
- **AND** this is now implemented via `org_memberships` and `IsMember`, superseding the original deferral to the Phase 2 exit gate
