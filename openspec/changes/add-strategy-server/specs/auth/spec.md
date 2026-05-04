## ADDED Requirements

### Requirement: Auth Middleware Scaffold — Dev No-Op, Prod Real
Authentication middleware SHALL be scaffolded from day one as a no-op pass-through in
development (when `AUTH_ENABLED=false`) and a real validator in production. This pattern
SHALL be in place before any route is registered, so that adding auth later does not require
touching route definitions.

#### Scenario: Dev mode — no auth required
- **WHEN** the server starts with `AUTH_ENABLED=false`
- **THEN** all routes are accessible without a bearer token
- **AND** `UserFromContext(c)` returns a `DevUser` with a known fixed ID
- **AND** no OAuth configuration is required to start the server

#### Scenario: Prod mode — bearer token required
- **WHEN** the server starts with `AUTH_ENABLED=true`
- **AND** a request is made to `/mcp` without a bearer token
- **THEN** the response is `401 Unauthorized`

### Requirement: GitHub App OAuth (Multi-Tenant)
The system SHALL support GitHub App OAuth for multi-tenant authentication, importing the
complete `epf-cli/internal/auth` package. Session management, token refresh, and installation
token resolution SHALL be imported without modification.

#### Scenario: GitHub OAuth login flow
- **WHEN** a user navigates to `/auth/github/login`
- **THEN** they are redirected to GitHub's OAuth authorization page
- **WHEN** GitHub redirects to `/auth/github/callback` with a valid code
- **THEN** a session is created and the user is redirected to the dashboard

#### Scenario: Session validated on authenticated request
- **WHEN** a request includes a valid session bearer token
- **THEN** `UserFromContext(c)` returns the authenticated user with `UserID` and `Login`

### Requirement: Workspace-Scoped Access Control
Authenticated users SHALL only access workspaces and instances they are authorised for.
Authorisation SHALL be based on GitHub repository access (the user must have read access
to the GitHub repo backing the workspace).

#### Scenario: User cannot access another user's workspace
- **WHEN** user A calls `list_instances` with workspace B's ID
- **THEN** workspace B is not included in the response if user A does not have GitHub read access to workspace B's repo

#### Scenario: created_by populated on mutations
- **WHEN** an authenticated user commits a batch
- **THEN** the resulting `strategy_mutations` row has `created_by` set to the user's UUID
- **AND** the `audit_log` entry has `actor_id` set to the user's UUID
