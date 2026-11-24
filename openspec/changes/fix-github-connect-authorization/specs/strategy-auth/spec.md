## ADDED Requirements

### Requirement: Connect Flow Writes Only Into the Caller's Own Tenancy

The GitHub connect import (`POST /github/connect/import`) SHALL create or change
data only in organisations where the caller is `org_admin`. It SHALL NOT add the
caller to an organisation they did not create, SHALL NOT write a membership with a
role other than `org_admin` or `org_viewer`, and SHALL NOT move or reuse an
instance that belongs to an organisation the caller cannot write to.

#### Scenario: Foreign workspace refused

- **WHEN** a user of organisation A posts a `workspace_id` that belongs to organisation B
- **THEN** the server answers as for a workspace that does not exist
- **AND** nothing is created or changed

#### Scenario: Viewer cannot import

- **WHEN** a user who is `org_viewer` of organisation A posts a workspace of A
- **THEN** the import is refused and nothing is created

#### Scenario: Admin imports into own workspace

- **WHEN** a user who is `org_admin` of organisation A posts a workspace of A and a repository
- **THEN** the instance is created in that workspace and the import runs

#### Scenario: Inline creation never joins an existing organisation

- **WHEN** a user chooses a new workspace and enters the name of an organisation that already exists
- **THEN** the server returns a conflict
- **AND** the user is not a member of that organisation afterwards
- **AND** the instances of that organisation stay unreachable to the user

#### Scenario: Inline creation makes the caller admin of a new organisation

- **WHEN** a user chooses a new workspace with a name no organisation has
- **THEN** a new organisation and workspace are created and the user is its `org_admin`

#### Scenario: Repository already connected in another organisation

- **WHEN** the repository is already linked to an instance in an organisation the caller cannot write to
- **THEN** the server returns a conflict that names no instance, organisation or workspace
- **AND** the existing instance is neither re-imported nor moved

#### Scenario: Moving an instance needs both sides

- **WHEN** the repository is linked to an instance the caller can write to, and the caller picks a workspace of another organisation
- **THEN** the instance is moved only if the caller is `org_admin` of both organisations

### Requirement: Connect Page Shows Only the Caller's Tenancy

The GitHub connect page SHALL list as assignment targets only the workspaces of
organisations the caller administers, and SHALL show instance, organisation,
workspace and sync details of a connected repository only for instances the
caller can access. For a repository connected in an organisation the caller
cannot access it SHALL show only that it is connected elsewhere.

#### Scenario: Dropdown holds the caller's workspaces

- **WHEN** a user of organisation A opens `/github/connect`
- **THEN** the workspace dropdown lists workspaces of A and none of organisation B

#### Scenario: No foreign details on a repository

- **WHEN** a repository in the list is connected to an instance of organisation B and the caller is not a member of B
- **THEN** the rendered page contains no id, name, organisation, workspace or sync data of that instance
- **AND** the repository is marked as connected in another organisation

### Requirement: GitHub MCP Tools Act With the Caller's Own GitHub Account

The MCP tools `list_github_installations` and `scan_github_repos` SHALL use the
calling user's own stored GitHub token and never the GitHub App's credentials, so
a caller sees only the installations and repositories their own GitHub account
sees. They SHALL refuse access tokens. `import_from_github` SHALL require write
access to the target instance.

#### Scenario: Installations of the caller only

- **WHEN** a user with a stored GitHub token calls `list_github_installations`
- **THEN** the result holds the installations that token can see and no others
- **AND** installations of the GitHub App that the token cannot see are not listed

#### Scenario: Repositories of one owner that the caller can see

- **WHEN** a user with a stored GitHub token calls `scan_github_repos` for an owner
- **THEN** the result holds only repositories of that owner (matched ignoring case) that the user's token can see
- **AND** EPF detection runs only for those repositories

#### Scenario: Owner the caller cannot see

- **WHEN** a caller scans an owner none of whose repositories their token can see
- **THEN** the result is empty, whether or not the GitHub App is installed on that owner

#### Scenario: No stored token

- **WHEN** a caller with no stored GitHub token calls `list_github_installations` or `scan_github_repos`
- **THEN** the tool returns `needs_github_connection` and no installation or repository data

#### Scenario: Revoked token

- **WHEN** GitHub rejects the caller's stored token during either tool
- **THEN** the stored token is cleared and the tool returns `needs_github_connection`

#### Scenario: Access tokens are refused

- **WHEN** a caller authenticated with an access token (scoped or not) calls `list_github_installations` or `scan_github_repos`
- **THEN** the call is refused

#### Scenario: Import needs write access

- **WHEN** a caller whose access to an instance is read-only calls `import_from_github` for it
- **THEN** the call is refused and nothing is imported
