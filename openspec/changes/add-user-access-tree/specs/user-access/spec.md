## ADDED Requirements

### Requirement: User Access Tree Endpoint

The system SHALL provide a single endpoint that returns the complete hierarchical access tree (organizations and projects) for the authenticated user.

#### Scenario: Successful access tree retrieval

- **WHEN** authenticated user requests `GET /user/orgs-and-projects`
- **THEN** system returns 200 with array of organizations
- **AND** each organization includes id, name, and role
- **AND** each organization includes nested projects array
- **AND** each project includes id, name, orgId, and role

#### Scenario: Access tree with multiple organizations

- **WHEN** user is member of multiple organizations
- **THEN** system returns all organizations the user has membership in
- **AND** each organization includes only projects where user has explicit or inherited access
- **AND** organizations are ordered by creation date (most recent first)

#### Scenario: Access tree with role information

- **WHEN** user has different roles across organizations and projects
- **THEN** system returns correct role for each organization (org_admin, org_member, etc.)
- **AND** system returns correct role for each project (project_admin, project_member, etc.)
- **AND** role values match organization_memberships.role and project_memberships.role

#### Scenario: Empty access tree

- **WHEN** authenticated user has no organization memberships
- **THEN** system returns 200 with empty array
- **AND** response is valid JSON array

#### Scenario: Unauthenticated access

- **WHEN** request lacks valid authentication token
- **THEN** system returns 401 Unauthorized
- **AND** response includes error code 'unauthorized'

### Requirement: Access Tree Response Structure

The access tree response SHALL follow a consistent hierarchical structure with type safety.

#### Scenario: Response schema validation

- **WHEN** system returns access tree
- **THEN** response matches OrgWithProjectsDto structure
- **AND** each org object contains id (uuid), name (string), role (string), and projects (array)
- **AND** each project object contains id (uuid), name (string), orgId (uuid), and role (string)
- **AND** all UUIDs are valid v4 format

#### Scenario: Optional project metadata

- **WHEN** projects have additional metadata (kb_purpose, auto_extract_objects, etc.)
- **THEN** system MAY include optional fields in project objects
- **AND** optional fields follow existing ProjectDto conventions

### Requirement: Access Tree Performance

The system SHALL retrieve access tree data efficiently using optimized database queries.

#### Scenario: Single query optimization

- **WHEN** access tree endpoint is called
- **THEN** system executes at most 2 database queries (one for org memberships with orgs, one for project memberships with projects)
- **AND** queries use proper joins to avoid N+1 patterns
- **AND** response time is under 500ms for users with up to 100 organizations

#### Scenario: Database query structure

- **WHEN** retrieving access tree
- **THEN** system uses joins between organization_memberships, orgs, project_memberships, and projects tables
- **AND** system filters by user_id in single WHERE clause
- **AND** results are aggregated in application layer to build hierarchy
