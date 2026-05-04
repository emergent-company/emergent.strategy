# Capability: strategy-auth

Authentication and authorisation for strategy-server. Multi-tenant from the first route.
GitHub App OAuth is the identity provider.

---

## Requirements

### Requirement: Development Pass-Through

The system SHALL support a no-auth development mode for local development.

#### Scenario: Dev mode request
- **WHEN** `AUTH_ENABLED=false` (default)
- **THEN** all requests are treated as authenticated by the DevUser (id: 00000000-0000-0000-0000-000000000001)
- **AND** the DevUser is injected into the request context by AuthMiddleware
- **AND** audit log entries record actor_id = DevUser.ID

#### Scenario: Production rejects unauthenticated requests
- **WHEN** `AUTH_ENABLED=true` and no valid Authorization header is present
- **THEN** the server returns HTTP 401 with error code 100004

---

### Requirement: GitHub OAuth Authentication

The system SHALL implement GitHub App OAuth for production authentication.

#### Scenario: Initiate OAuth flow
- **WHEN** a client navigates to `GET /auth/github/login`
- **THEN** the server redirects to GitHub's OAuth consent page with the correct client_id and scope

#### Scenario: OAuth callback success
- **WHEN** GitHub redirects to `GET /auth/github/callback` with a valid `code`
- **THEN** the server exchanges the code for an access token
- **AND** fetches the user's GitHub profile
- **AND** creates or updates the workspace record for the GitHub owner
- **AND** issues a signed session JWT containing the user ID and GitHub login
- **AND** redirects the client to the application home

#### Scenario: OAuth callback failure
- **WHEN** the GitHub callback contains an error or an invalid state
- **THEN** the server redirects to an error page without issuing a session

---

### Requirement: Workspace-Scoped Authorisation

The system SHALL enforce workspace-level access control: a user may only access workspaces
associated with their GitHub identity.

#### Scenario: Access own workspace
- **WHEN** an authenticated user requests a workspace whose `github_owner` matches their GitHub login
- **THEN** the request is allowed

#### Scenario: Access denied to foreign workspace
- **WHEN** an authenticated user requests a workspace whose `github_owner` does not match their GitHub login
- **THEN** the server returns HTTP 403 with error code 100003

#### Scenario: Org membership (future)
- **WHEN** a user is a member of a GitHub organisation that owns a workspace
- **THEN** access is granted (implementation deferred to Phase 2 exit gate; placeholder must exist)
