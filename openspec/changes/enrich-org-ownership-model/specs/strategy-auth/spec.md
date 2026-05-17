## MODIFIED Requirements

### Requirement: Development Pass-Through

The system SHALL support a no-auth development mode for local development.
In dev mode, a development org SHALL be automatically created and all
unscoped workspaces SHALL be adopted by it.

#### Scenario: Dev mode request
- **WHEN** `AUTH_ENABLED=false` (default)
- **THEN** all requests are treated as authenticated by the DevUser (id: 00000000-0000-0000-0000-000000000001)
- **AND** the DevUser is injected into the request context by AuthMiddleware
- **AND** audit log entries record actor_id = DevUser.ID

#### Scenario: Dev org auto-creation
- **WHEN** the server starts in dev mode
- **THEN** the system calls EnsureDevOrg to create or find the dev org (id: 00000000-0000-0000-0000-000000000002, slug: "dev")
- **AND** the dev user is added as org_admin

#### Scenario: Dev mode orphan workspace adoption
- **WHEN** the server starts in dev mode
- **AND** workspaces exist with org_id matching the migration default org
- **THEN** those workspaces are reassigned to the dev org
- **AND** an audit log entry records the adoption

#### Scenario: Production rejects unauthenticated requests
- **WHEN** `AUTH_ENABLED=true` and no valid Authorization header is present
- **THEN** the server returns HTTP 401 with error code 100004
