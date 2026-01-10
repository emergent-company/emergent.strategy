# superadmin-access Specification

## Purpose

Provides system-wide administrative access for platform operators, enabling cross-organization visibility, user management, and support capabilities outside the normal org/project role hierarchy.

## ADDED Requirements

### Requirement: Superadmin Role Storage

The system SHALL store superadmin grants in a dedicated `core.superadmins` table with audit trail information including who granted the role and when.

#### Scenario: Superadmin grant is recorded with audit data

- **GIVEN** a user needs superadmin access
- **WHEN** a superadmin grant is created
- **THEN** the grant SHALL be stored with the user_id, granted_by user, and granted_at timestamp
- **AND** the grant SHALL be queryable for audit purposes

#### Scenario: Superadmin revocation is recorded

- **GIVEN** a superadmin user needs to have access revoked
- **WHEN** the superadmin grant is revoked
- **THEN** the revoked_at timestamp SHALL be set
- **AND** the revoked_by user SHALL be recorded
- **AND** the user SHALL no longer have superadmin access

### Requirement: Superadmin Authorization Check

The system SHALL provide a guard that checks if the authenticated user is a superadmin before checking org/project-scoped permissions.

#### Scenario: Superadmin bypasses org membership check

- **GIVEN** a user is authenticated and is a superadmin
- **WHEN** the user requests access to any organization's resources
- **THEN** the system SHALL allow access without requiring org membership

#### Scenario: Superadmin bypasses project membership check

- **GIVEN** a user is authenticated and is a superadmin
- **WHEN** the user requests access to any project's resources
- **THEN** the system SHALL allow access without requiring project membership

#### Scenario: Non-superadmin follows normal authorization

- **GIVEN** a user is authenticated but is NOT a superadmin
- **WHEN** the user requests access to protected resources
- **THEN** the system SHALL enforce normal org/project membership checks

### Requirement: Superadmin User Management API

The system SHALL provide an API endpoint for superadmins to list all users across all organizations with activity information.

#### Scenario: List all users with pagination

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/users`
- **THEN** the system SHALL return a paginated list of all users
- **AND** each user record SHALL include name, email, last activity timestamp, and org memberships

#### Scenario: Search users by name or email

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/users?search=john`
- **THEN** the system SHALL return users matching the search term in name or email

#### Scenario: Filter users by organization

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/users?orgId=<uuid>`
- **THEN** the system SHALL return only users who are members of that organization

#### Scenario: Non-superadmin denied access to user list

- **GIVEN** a user is authenticated but is NOT a superadmin
- **WHEN** the user requests `GET /superadmin/users`
- **THEN** the system SHALL return 403 Forbidden

### Requirement: Superadmin Organization Browser API

The system SHALL provide an API endpoint for superadmins to list all organizations with summary statistics.

#### Scenario: List all organizations

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/organizations`
- **THEN** the system SHALL return all organizations
- **AND** each organization record SHALL include name, member count, and project count

#### Scenario: Non-superadmin denied access to org list

- **GIVEN** a user is authenticated but is NOT a superadmin
- **WHEN** the user requests `GET /superadmin/organizations`
- **THEN** the system SHALL return 403 Forbidden

### Requirement: Superadmin Project Browser API

The system SHALL provide an API endpoint for superadmins to list all projects with optional organization filtering.

#### Scenario: List all projects

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/projects`
- **THEN** the system SHALL return all projects across all organizations
- **AND** each project record SHALL include name, organization, and document count

#### Scenario: Filter projects by organization

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/projects?orgId=<uuid>`
- **THEN** the system SHALL return only projects belonging to that organization

### Requirement: Superadmin Email History API

The system SHALL provide an API endpoint for superadmins to view email job history with search and filter capabilities.

#### Scenario: List email jobs with pagination

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/email-jobs`
- **THEN** the system SHALL return a paginated list of email jobs
- **AND** each job SHALL include recipient, subject, template name, status, and timestamps

#### Scenario: Filter email jobs by status

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/email-jobs?status=failed`
- **THEN** the system SHALL return only email jobs with the specified status

#### Scenario: Search email jobs by recipient

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/email-jobs?recipient=user@example.com`
- **THEN** the system SHALL return email jobs sent to that recipient

### Requirement: Superadmin Email Preview

The system SHALL provide an API endpoint for superadmins to preview rendered email content.

#### Scenario: Preview email renders template with stored data

- **GIVEN** a superadmin is authenticated
- **AND** an email job exists with template name and template data
- **WHEN** the superadmin requests `GET /superadmin/email-jobs/:id/preview`
- **THEN** the system SHALL return the rendered HTML email content
- **AND** the response Content-Type SHALL be `text/html`

#### Scenario: Preview non-existent email returns 404

- **GIVEN** a superadmin is authenticated
- **WHEN** the superadmin requests `GET /superadmin/email-jobs/:id/preview` with an invalid ID
- **THEN** the system SHALL return 404 Not Found

### Requirement: Superadmin Dashboard UI

The system SHALL provide a dedicated UI section for superadmin functions accessible only to superadmin users.

#### Scenario: Superadmin sees dashboard navigation

- **GIVEN** a user is authenticated and is a superadmin
- **WHEN** the user views the admin navigation
- **THEN** a "Superadmin" menu item SHALL be visible
- **AND** clicking it SHALL navigate to `/admin/superadmin`

#### Scenario: Non-superadmin does not see dashboard navigation

- **GIVEN** a user is authenticated but is NOT a superadmin
- **WHEN** the user views the admin navigation
- **THEN** no "Superadmin" menu item SHALL be visible

#### Scenario: Non-superadmin cannot access dashboard routes

- **GIVEN** a user is authenticated but is NOT a superadmin
- **WHEN** the user navigates to `/admin/superadmin/*`
- **THEN** the system SHALL redirect to an unauthorized page or show access denied

### Requirement: No Self-Grant API

The system SHALL NOT provide any API endpoint for users to grant themselves superadmin access.

#### Scenario: No public endpoint for superadmin grants

- **GIVEN** the API specification
- **WHEN** reviewing all endpoints
- **THEN** no endpoint SHALL exist that allows creating superadmin grants via HTTP request
- **AND** superadmin grants SHALL only be possible via direct database access or CLI command
