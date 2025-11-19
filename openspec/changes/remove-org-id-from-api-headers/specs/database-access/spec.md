## MODIFIED Requirements

### Requirement: RLS Tenant Context with QueryRunner

The DatabaseService SHALL apply Row Level Security tenant context using TypeORM QueryRunner connections. **Organization ID SHALL be derived server-side from project ID rather than accepted from client headers.**

#### Scenario: Set tenant context before query execution

- **WHEN** tenant context has been set via `runWithTenantContext(projectId, fn)`
- **THEN** the organization ID SHALL be derived from the project ID via database lookup
- **AND** the session variables `app.current_organization_id` and `app.current_project_id` SHALL be set via `set_config()`
- **AND** the session variable `row_security` SHALL be set to 'on'
- **AND** the derived organization ID SHALL be cached in memory for subsequent requests

#### Scenario: Query with temporary QueryRunner maintains tenant context

- **WHEN** `query()` is called with active tenant context
- **AND** no explicit transaction is active
- **THEN** a temporary QueryRunner SHALL be created
- **AND** organization ID SHALL be derived from project ID if not already cached
- **AND** tenant context SHALL be applied to that QueryRunner with derived org ID
- **AND** the query SHALL execute with correct RLS isolation
- **AND** the QueryRunner SHALL be released after query completion

#### Scenario: Reusable QueryRunner maintains tenant context

- **WHEN** `getClient()` is called to obtain a QueryRunner
- **THEN** organization ID SHALL be derived from current project context
- **AND** tenant context SHALL be applied via `set_config()` before returning
- **AND** subsequent queries on that QueryRunner SHALL inherit the context
- **AND** the context SHALL persist until QueryRunner is released

#### Scenario: Derive organization from project ID

- **WHEN** `runWithTenantContext(projectId, fn)` is called
- **THEN** the DatabaseService SHALL query `SELECT organization_id FROM kb.projects WHERE id = $1`
- **AND** if the project exists, the organization ID SHALL be cached in memory
- **AND** if the project does not exist, an error SHALL be thrown
- **AND** cached organization IDs SHALL be reused for subsequent requests with the same project ID

#### Scenario: Handle project not found during org derivation

- **WHEN** `runWithTenantContext(projectId, fn)` is called with non-existent project ID
- **THEN** the database lookup SHALL return zero rows
- **AND** an error SHALL be thrown: "Project {projectId} not found"
- **AND** the error SHALL prevent query execution with invalid tenant context

#### Scenario: Cache project-to-org mappings

- **WHEN** organization ID is derived from project ID
- **THEN** the mapping SHALL be stored in an in-memory Map cache
- **AND** subsequent calls with the same project ID SHALL use the cached value
- **AND** cache hits SHALL not perform database queries
- **AND** the cache SHALL have no TTL or size limit (unbounded)

## ADDED Requirements

### Requirement: API Header Simplification

API endpoints SHALL require only `x-project-id` header for tenant scoping. The `x-org-id` header SHALL NOT be accepted or used.

#### Scenario: API request with project ID only

- **WHEN** a client sends an API request with `x-project-id` header
- **AND** the request does NOT include `x-org-id` header
- **THEN** the request SHALL be processed successfully
- **AND** organization context SHALL be derived server-side from the project ID

#### Scenario: API request without project ID

- **WHEN** a client sends an API request without `x-project-id` header
- **AND** the endpoint requires project scoping
- **THEN** the request SHALL be rejected with 400 Bad Request
- **AND** the error message SHALL be "x-project-id header required"

#### Scenario: Frontend builds headers without org ID

- **WHEN** the frontend `buildHeaders()` function is called
- **THEN** the headers SHALL include `x-project-id` if `activeProjectId` is set
- **AND** the headers SHALL NOT include `x-org-id`
- **AND** the headers SHALL include `Authorization` bearer token if authenticated
- **AND** the headers SHALL include `Content-Type: application/json` by default

#### Scenario: Controller reads only project ID from headers

- **WHEN** a controller method handles an API request
- **THEN** it SHALL read `x-project-id` from request headers
- **AND** it SHALL NOT read `x-org-id` from request headers
- **AND** it SHALL pass only project ID to service layer methods
- **AND** it SHALL pass project ID to `databaseService.runWithTenantContext(projectId, fn)`

### Requirement: Organization Context Derivation

The DatabaseService SHALL provide a method to derive organization ID from project ID for internal use.

#### Scenario: Get organization ID from project ID

- **WHEN** code calls `databaseService.getOrgIdFromProjectId(projectId)`
- **THEN** if the project-to-org mapping is cached, the cached value SHALL be returned immediately
- **AND** if not cached, a database query SHALL be executed: `SELECT organization_id FROM kb.projects WHERE id = $1`
- **AND** if the project exists, the organization ID SHALL be cached and returned
- **AND** if the project does not exist, an error SHALL be thrown

#### Scenario: Cache is shared across requests

- **WHEN** multiple concurrent requests use the same project ID
- **THEN** only the first request SHALL query the database for org derivation
- **AND** subsequent requests SHALL use the cached value
- **AND** the cache SHALL be shared across all requests handled by the same server instance

#### Scenario: User switches projects (different cache keys)

- **WHEN** a user makes API requests with project ID "project-a"
- **THEN** the server SHALL cache the mapping `"project-a" → "org-1"`
- **WHEN** the same user switches projects and makes API requests with project ID "project-b"
- **THEN** the server SHALL look up project ID "project-b" in the cache (different key)
- **AND** if not cached, SHALL query the database and cache `"project-b" → "org-2"`
- **AND** both cache entries SHALL coexist: `{ "project-a": "org-1", "project-b": "org-2" }`
- **AND** subsequent requests SHALL use the appropriate cached value based on the project ID in the request header

#### Scenario: Project-to-org mapping changes (edge case)

- **WHEN** a project's organization_id is updated in the database (rare operation)
- **AND** the old mapping is cached
- **THEN** subsequent requests SHALL continue using the cached (stale) value until server restart
- **AND** this is acceptable because organization_id is effectively immutable in practice
- **AND** if immediate consistency is required, the server SHALL be restarted to clear cache

## REMOVED Requirements

None - no existing requirements are being removed, only modified to reflect the new single-header approach.
