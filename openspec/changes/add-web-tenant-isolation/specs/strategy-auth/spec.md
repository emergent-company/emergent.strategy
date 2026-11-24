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

### Requirement: Records Named Beside an Instance Belong to It

A route that names a record next to its instance (a staged draft batch, a cycle
proposal, a coherence signal, an AIM run, a skill run) SHALL answer as for a
missing record when that record belongs to a different instance, whatever the
caller's access to the instance in the URL.

#### Scenario: Own instance with another tenant's record
- **WHEN** a user of organisation A names an instance of A and the id of a record of organisation B in the same URL
- **THEN** the server answers as for a record that does not exist, for every method
- **AND** the record of B is not read, changed, committed, discarded, approved or aborted

#### Scenario: Own record
- **WHEN** the record belongs to the instance in the URL
- **THEN** the request reaches its handler

#### Scenario: Record that does not exist
- **WHEN** the id names no record
- **THEN** the handler answers (not found or bad request) and the guard reveals nothing about any other tenant

### Requirement: Moving an Instance Never Joins an Existing Organisation

Moving an instance SHALL require `org_admin` of its organisation and of the
target organisation. A new workspace created by the move SHALL belong to a new
organisation with the caller as admin; a name that is taken, or a GitHub owner
that already has a workspace, SHALL be a conflict that creates nothing and adds
the caller to nothing.

#### Scenario: Target in another organisation
- **WHEN** an admin of A moves an instance of A to a workspace of B
- **THEN** the server answers as for a workspace that does not exist and the instance stays where it is

#### Scenario: New workspace named like an existing organisation
- **WHEN** a user names an existing organisation as the new workspace of a move
- **THEN** the server returns a conflict and the user is not a member of that organisation afterwards

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
