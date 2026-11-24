## MODIFIED Requirements

### Requirement: Workspace-Scoped Authorisation

The system SHALL enforce workspace-level access control by organisation
membership: a user may reach a workspace, and the instances in it, only as a
member of the organisation that owns the workspace. `org_admin` may read and
write; `org_viewer` may read only. A request for a workspace or instance the user
cannot reach SHALL be answered as for one that does not exist.

#### Scenario: Access own workspace
- **WHEN** an authenticated user who is a member of organisation A requests a workspace or an instance of A
- **THEN** the request is allowed (read for `org_viewer`, read and write for `org_admin`)

#### Scenario: Access denied to foreign workspace
- **WHEN** an authenticated user who is not a member of organisation B requests a workspace or an instance of B
- **THEN** the server answers as for one that does not exist, for every method
- **AND** nothing about it is revealed (this replaces the earlier HTTP 403 with code 100003, which confirmed that the id exists)

#### Scenario: Org membership (future)
- **WHEN** a user is a member of the organisation that owns a workspace
- **THEN** access is granted by that membership; this placeholder of the earlier spec is now the rule, and a match between the user's GitHub login and the workspace's `github_owner` grants nothing

#### Scenario: Viewer cannot write
- **WHEN** an `org_viewer` of organisation A sends a write request for an instance of A
- **THEN** the server answers as for an instance that does not exist and changes nothing

## ADDED Requirements

### Requirement: Web Routes Are Classified and Enforced

Every route of the web UI SHALL belong to a declared class (instance read,
instance write, organisation admin, list, authentication flow, public), and the
server SHALL enforce the class for it. A route without a class SHALL fail the
build.

#### Scenario: New route without a class
- **WHEN** a route is registered that no class names
- **THEN** the route-classification test fails

#### Scenario: Instance pages and actions
- **WHEN** a user requests any `/strategies/:id/...` route for an instance of an organisation they do not belong to
- **THEN** the answer is that of a missing instance, for GET and for every write method

### Requirement: Lists Show Only the Caller's Organisations

The dashboard, settings and every list, count or lookup in the web UI SHALL
include only workspaces and instances of the organisations the caller belongs to.
The filter SHALL be applied in the query so that counts agree with the lists.

#### Scenario: Dashboard of a multi-tenant server
- **WHEN** a user of organisation A opens the dashboard and organisation B has workspaces and instances
- **THEN** the page and its counts contain only those of A

#### Scenario: Move between organisations
- **WHEN** a user moves an instance to a workspace of another organisation
- **THEN** the move happens only if they are `org_admin` of both organisations
