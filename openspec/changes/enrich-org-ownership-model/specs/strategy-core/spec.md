## ADDED Requirements

### Requirement: Organisation as Ownership Root

The system SHALL treat organisations as the ownership root for all strategies.
Every workspace MUST belong to exactly one org. The org model SHALL include
business identity fields compatible with the 21st ecosystem: `org_number`,
`country`, `website`, `logo_url`, and `twentyfirst_id`.

#### Scenario: Create org with identity fields
- **WHEN** a caller creates an org with name, org_number, and country
- **THEN** the org is persisted with all provided fields
- **AND** a slug is auto-generated from the name
- **AND** the caller is added as org_admin

#### Scenario: Org number uniqueness
- **WHEN** a caller creates an org with an org_number and country that already exists
- **THEN** the server responds with a conflict error
- **AND** no new org is created

#### Scenario: Find or create org by name
- **WHEN** a caller calls GetOrCreate with a name
- **AND** an org with that name already exists (case-insensitive)
- **THEN** the existing org is returned without modification
- **WHEN** no org with that name exists
- **THEN** a new org is created with the given name and the caller as admin

#### Scenario: Update org metadata
- **WHEN** an org admin updates org fields (website, logo_url, org_number)
- **THEN** the org record is updated
- **AND** an audit log entry is written

### Requirement: Workspace Org Assignment

The system SHALL require every workspace to have an `org_id`. The `org_id` column
on the `workspaces` table MUST be NOT NULL. Workspace creation MUST accept an
explicit `org_id` parameter.

#### Scenario: Create workspace with org
- **WHEN** a caller creates a workspace with a valid org_id
- **THEN** the workspace is persisted with the org_id set
- **AND** an audit log entry records the org association

#### Scenario: Create workspace without org rejected
- **WHEN** a caller creates a workspace without providing org_id
- **THEN** the request is rejected with a validation error

#### Scenario: Reassign workspace to different org
- **WHEN** an org admin calls assign_workspace_to_org with a workspace_id and new org_id
- **THEN** the workspace's org_id is updated
- **AND** an audit log entry records the reassignment

### Requirement: Import with Org Resolution

The system SHALL resolve org ownership during EPF instance import. The resolution
chain is: explicit `--org` flag, then `north_star.organization` from the artifact
payloads, then the workspace's `github_owner` as a fallback name.

#### Scenario: Import with explicit org flag
- **WHEN** a CLI import specifies `--org "Acme Corp"`
- **THEN** the system finds or creates an org named "Acme Corp"
- **AND** the workspace is linked to that org

#### Scenario: Import with north_star extraction
- **WHEN** a CLI import does not specify `--org`
- **AND** the imported artifacts include a north_star with `organization: "Emergent"`
- **THEN** the system finds or creates an org named "Emergent"
- **AND** the workspace is linked to that org

#### Scenario: Import fallback to github_owner
- **WHEN** a CLI import does not specify `--org`
- **AND** no north_star artifact is found in the import
- **THEN** the system finds or creates an org named after the workspace github_owner
- **AND** the workspace is linked to that org

## MODIFIED Requirements

### Requirement: Workspace Management

The system SHALL manage workspaces, where a workspace is an association between a GitHub
owner (user or organisation) and a set of strategy instances. Every workspace MUST
belong to exactly one org.

#### Scenario: Create workspace
- **WHEN** a caller POSTs a valid workspace with a unique `github_owner` and a valid `org_id`
- **THEN** the workspace is persisted with a UUID primary key, `org_id` set, and `status=active`
- **AND** an audit log entry is written recording the creation

#### Scenario: Duplicate workspace rejected
- **WHEN** a caller POSTs a workspace whose `github_owner` already exists
- **THEN** the server responds with HTTP 409 and error code 110002
- **AND** no new workspace is created

#### Scenario: List workspaces
- **WHEN** a caller GETs the workspace list
- **THEN** all non-deleted workspaces are returned with cursor-based pagination
- **AND** soft-deleted workspaces (deleted_at IS NOT NULL) are excluded

#### Scenario: Soft-delete workspace
- **WHEN** a caller DELETEs a workspace
- **THEN** `deleted_at` is set to now and the workspace is excluded from future list results
- **AND** all associated strategy instances are also soft-deleted
