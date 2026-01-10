# authentication Specification

## Purpose
TBD - created by archiving change ensure-logout-clears-auth-data. Update Purpose after archive.
## Requirements
### Requirement: Complete Auth Data Cleanup on Logout

The system SHALL remove all authentication-related data from localStorage when a user logs out, while preserving non-sensitive user preferences.

#### Scenario: Logout clears auth tokens

- **GIVEN** a user is authenticated with tokens stored in localStorage
- **WHEN** the user logs out
- **THEN** the `spec-server-auth` localStorage key SHALL be removed
- **AND** the `__nexus_auth_v1__` legacy localStorage key SHALL be removed
- **AND** the AuthContext state SHALL be reset to empty

#### Scenario: Logout clears user-scoped configuration

- **GIVEN** a user has selected an organization and project
- **WHEN** the user logs out
- **THEN** the `activeOrgId` field SHALL be cleared from `spec-server` localStorage
- **AND** the `activeOrgName` field SHALL be cleared from `spec-server` localStorage
- **AND** the `activeProjectId` field SHALL be cleared from `spec-server` localStorage
- **AND** the `activeProjectName` field SHALL be cleared from `spec-server` localStorage

#### Scenario: Logout preserves non-auth preferences

- **GIVEN** a user has set theme and UI preferences
- **WHEN** the user logs out
- **THEN** the `theme` field SHALL remain in `spec-server` localStorage
- **AND** the `direction` field SHALL remain in `spec-server` localStorage
- **AND** the `fontFamily` field SHALL remain in `spec-server` localStorage
- **AND** the `sidebarTheme` field SHALL remain in `spec-server` localStorage
- **AND** the `fullscreen` field SHALL remain in `spec-server` localStorage

#### Scenario: No auth data remains after logout

- **GIVEN** a user has completed logout
- **WHEN** examining localStorage
- **THEN** no JWT tokens SHALL be present in any key
- **AND** no user identification data SHALL be present in any key
- **AND** no organization or project context SHALL be present in any key
- **AND** the user SHALL be redirected to the post-logout redirect URI

### Requirement: View-As Impersonation for Superadmins

The system SHALL allow superadmin users to view the platform from another user's perspective by providing a `X-View-As-User-ID` header, while maintaining audit trail integrity.

#### Scenario: Superadmin initiates view-as session

- **GIVEN** a user is authenticated and is a superadmin
- **AND** the request includes header `X-View-As-User-ID: <target-user-uuid>`
- **WHEN** the system processes the request
- **THEN** the authorization context SHALL use the target user's org/project memberships
- **AND** the system SHALL record both the superadmin user and target user in the request context

#### Scenario: View-as resolves target user permissions

- **GIVEN** a superadmin is using view-as for a target user
- **AND** the target user is a member of Organization A with role `project_user`
- **WHEN** the superadmin accesses Organization A's resources
- **THEN** the access level SHALL match the target user's permissions
- **AND** the superadmin SHALL see the same data the target user would see

#### Scenario: View-as denied for non-superadmin

- **GIVEN** a user is authenticated but is NOT a superadmin
- **AND** the request includes header `X-View-As-User-ID: <target-user-uuid>`
- **WHEN** the system processes the request
- **THEN** the header SHALL be ignored
- **AND** the request SHALL use the authenticated user's own context

#### Scenario: View-as with invalid user ID returns error

- **GIVEN** a superadmin is authenticated
- **AND** the request includes header `X-View-As-User-ID: <non-existent-uuid>`
- **WHEN** the system processes the request
- **THEN** the system SHALL return 400 Bad Request
- **AND** the error message SHALL indicate the target user was not found

### Requirement: View-As Audit Trail

The system SHALL maintain a complete audit trail when superadmins use view-as impersonation, recording both the acting superadmin and the impersonated user.

#### Scenario: Audit log records both actors

- **GIVEN** a superadmin is using view-as for a target user
- **WHEN** any action is performed (read or write)
- **THEN** the audit log SHALL record `actor: <superadmin-user-id>`
- **AND** the audit log SHALL record `viewAs: <target-user-id>`
- **AND** the audit log SHALL include a flag indicating impersonation was active

#### Scenario: Write operations attributed to superadmin

- **GIVEN** a superadmin is using view-as for a target user
- **WHEN** a write operation is performed (create, update, delete)
- **THEN** the `created_by` or `updated_by` field SHALL record the superadmin user ID
- **AND** the operation SHALL NOT be attributed to the target user

### Requirement: View-As Response Metadata

The system SHALL include metadata in API responses when view-as impersonation is active, to help clients display appropriate UI indicators.

#### Scenario: Response includes view-as context

- **GIVEN** a superadmin is using view-as for a target user
- **WHEN** an API response is returned
- **THEN** the response SHALL include a `_viewAs` metadata object
- **AND** the metadata SHALL include the target user's ID and display name
- **AND** the metadata SHALL indicate `actingAs: "superadmin"`

#### Scenario: Response without view-as has no metadata

- **GIVEN** a request is made without view-as impersonation
- **WHEN** an API response is returned
- **THEN** the response SHALL NOT include `_viewAs` metadata

### Requirement: View-As UI Indicator

The system SHALL display a persistent visual indicator in the frontend when view-as impersonation is active.

#### Scenario: View-as banner displayed when impersonating

- **GIVEN** a superadmin activates view-as for a target user
- **WHEN** any page is displayed
- **THEN** a banner SHALL be visible indicating "Viewing as [User Name]"
- **AND** the banner SHALL include an "Exit" button to end the impersonation

#### Scenario: Exit view-as clears impersonation state

- **GIVEN** a superadmin is viewing as a target user
- **WHEN** the superadmin clicks the "Exit" button on the view-as banner
- **THEN** the impersonation state SHALL be cleared
- **AND** subsequent requests SHALL use the superadmin's own context
- **AND** the view-as banner SHALL no longer be displayed

