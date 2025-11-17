# Authentication Specification Delta

## ADDED Requirements

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
