# User Profile Management

## ADDED Requirements

### Requirement: User Profile Data Sync

The system MUST populate the local user profile with data from Zitadel upon the first login (user creation).

#### Scenario: First Login

- **Given** a new user logs in via Zitadel
- **And** the user does not exist in `user_profiles`
- **When** the user logs in
- **Then** a new `user_profiles` record is created
- **And** `firstName`, `lastName`, and `displayName` are populated from the Zitadel token/introspection.

### Requirement: User Profile Persistence

The system MUST NOT overwrite existing local profile data with Zitadel data on subsequent logins.

#### Scenario: Subsequent Login

- **Given** an existing user logs in
- **And** the user has changed their name locally in `user_profiles`
- **When** the user logs in again
- **Then** the local `firstName` and `lastName` remain unchanged.

### Requirement: User Profile Editing

Authenticated users MUST be able to view and edit their profile details.

#### Scenario: View Profile

- **Given** the user is logged in
- **When** they navigate to the Profile Settings page
- **Then** they see their First Name, Last Name, and Email
- **And** the Email is read-only.

#### Scenario: Edit Profile

- **Given** the user is on the Profile Settings page
- **When** they change their First Name and click Save
- **Then** the system updates the `user_profiles` record
- **And** the new name is displayed in the UI.

### Requirement: Access Profile Settings

Users MUST be able to access Profile Settings from the global navigation.

#### Scenario: Access via Avatar

- **Given** the user is on any page
- **When** they click their avatar and select "My Profile"
- **Then** they are navigated to the Profile Settings page.
