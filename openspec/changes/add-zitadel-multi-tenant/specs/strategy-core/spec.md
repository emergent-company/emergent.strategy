## ADDED Requirements

### Requirement: User Identity Persistence

The system SHALL persist authenticated user identity in `strategy.users` (standalone
mode) or read it from `core.user_profiles` (shared mode). The internal user record is
the FK target for all `created_by` columns.

#### Scenario: First authentication upserts user (standalone)
- **WHEN** `STRATEGY_DB_MODE=standalone`
- **AND** a Zitadel subject authenticates that has not been seen before
- **THEN** a row is inserted into `strategy.users` with `zitadel_user_id = sub` and `email`
- **AND** subsequent authentications with the same sub update `email` if it has changed

#### Scenario: Soft-deleted user reactivated on re-auth
- **WHEN** a `strategy.users` row exists with `deleted_at IS NOT NULL` for the given sub
- **AND** the user authenticates again
- **THEN** `deleted_at` is set to NULL and `updated_at` is refreshed
- **AND** the user regains access to their orgs

#### Scenario: created_by FK integrity
- **WHEN** a workspace, instance, or mutation is created
- **THEN** `created_by` is set to the `strategy.users.id` of the authenticated caller
- **AND** the FK constraint prevents orphaned `created_by` values

### Requirement: Organisation Management

The system SHALL support organisations as top-level tenant containers. Each strategy
instance belongs to an org. Users access instances only through org membership.

#### Scenario: Create org
- **WHEN** an authenticated user calls `create_org(name)`
- **THEN** a new row is inserted into `strategy.orgs`
- **AND** the caller is added as `org_admin` in `strategy.org_memberships`
- **AND** the org id is returned

#### Scenario: List orgs — scoped to caller
- **WHEN** an authenticated user calls `list_orgs()`
- **THEN** only orgs where `org_memberships.user_id = caller.ID` are returned
- **AND** orgs the caller is not a member of are never included

#### Scenario: Duplicate org name
- **WHEN** a user calls `create_org(name)` with a name that already exists in one of
  their accessible orgs
- **THEN** the server returns an error `org_name_conflict`
- **AND** no new org is created

### Requirement: Org Membership Management

The system SHALL allow org admins to add and remove members with explicit roles.
Roles are `org_admin` (full write access, member management) and `org_viewer`
(read-only access to workspaces and instances within the org).

#### Scenario: Invite member — user already exists
- **WHEN** an `org_admin` calls `invite_member(org_id, email, role)`
- **AND** a `strategy.users` row exists with that email
- **THEN** a membership row is inserted into `strategy.org_memberships` with the specified role
- **AND** if a membership for that user already exists, the role is updated
- **AND** no invitation row is created

#### Scenario: Invite member — user not yet signed up (pre-invitation)
- **WHEN** an `org_admin` calls `invite_member(org_id, email, role)`
- **AND** no `strategy.users` row exists with that email
- **THEN** a pending row is inserted into `strategy.org_invitations` with `accepted_at = NULL`
- **AND** if an invitation for that email already exists in the org, the role is updated
- **AND** the caller receives a success response (no error)

#### Scenario: Pre-invitation accepted on first login
- **WHEN** a user authenticates for the first time
- **AND** their email matches one or more rows in `strategy.org_invitations WHERE accepted_at IS NULL`
- **THEN** for each matching invitation, a membership row is inserted into `strategy.org_memberships`
- **AND** `accepted_at` is stamped on the invitation row
- **AND** the operation is transactional and idempotent

#### Scenario: org_viewer has read-only access
- **WHEN** a user with role `org_viewer` calls a read tool (`list_workspaces`, `list_instances`, `get_artifact`, etc.)
- **THEN** the request succeeds and returns data scoped to the org
- **WHEN** a user with role `org_viewer` calls a write tool (`create_workspace`, `commit_batch`, etc.)
- **THEN** the server returns HTTP 403

#### Scenario: Remove member
- **WHEN** an `org_admin` calls `remove_member(org_id, user_id)`
- **AND** the target user is not the last `org_admin` in the org
- **THEN** the membership row is deleted

#### Scenario: Cannot remove last org admin
- **WHEN** `remove_member` would leave the org with zero `org_admin` members
- **THEN** the server returns error `last_admin_protected`
- **AND** no membership row is deleted

#### Scenario: Non-admin cannot manage members
- **WHEN** a user with role `org_viewer` calls `invite_member` or `remove_member`
- **THEN** the server returns HTTP 403

### Requirement: Org-Scoped Access Control

All strategy resources (workspaces, instances, mutations, artifacts) SHALL be scoped to
the caller's accessible orgs. A caller can only see resources that belong to an org
they are a member of.

#### Scenario: list_workspaces scoped to caller
- **WHEN** an authenticated user calls `list_workspaces`
- **THEN** only workspaces with `org_id` in the caller's org memberships are returned
- **AND** workspaces in orgs the caller is not a member of are never included

#### Scenario: Cross-org access denied
- **WHEN** an authenticated user calls any tool referencing a workspace or instance ID
- **AND** that resource belongs to an org the caller is not a member of
- **THEN** the server returns HTTP 403 with error `access_denied`
- **AND** no resource data is leaked in the error response

#### Scenario: Workspace creation requires org membership
- **WHEN** an authenticated user calls `create_workspace(name, org_id)`
- **AND** the user is not a member of the specified org
- **THEN** the server returns HTTP 403

#### Scenario: Workspace creation requires org_admin role
- **WHEN** an authenticated user with role `org_viewer` calls `create_workspace`
- **THEN** the server returns HTTP 403

### Requirement: Workspace Org Association

Each workspace SHALL belong to exactly one org. The `workspaces.org_id` column is
required for all new workspaces. Existing workspaces without an `org_id` are associated
with the default org at migration time.

#### Scenario: New workspace requires org_id
- **WHEN** `create_workspace` is called without specifying an `org_id`
- **THEN** the server returns a validation error `org_id_required`

#### Scenario: Migration backfill
- **WHEN** migration `009_add_org_id_to_workspaces` runs
- **AND** rows exist in `workspaces` with `org_id IS NULL`
- **THEN** those rows are backfilled with the ID of the default org
  (created during the migration if it does not yet exist)
