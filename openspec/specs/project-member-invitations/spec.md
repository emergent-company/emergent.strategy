# project-member-invitations Specification

## Purpose
TBD - created by archiving change add-project-member-invitations. Update Purpose after archive.
## Requirements
### Requirement: User Search for Invitations

The system SHALL provide an API endpoint to search for existing users by email address for the purpose of sending project invitations.

#### Scenario: Search users by email prefix

- **GIVEN** the user has `project:invite:create` scope
- **WHEN** they call `GET /api/users/search?email=john@`
- **THEN** the system returns a list of users whose email starts with the search term
- **AND** results include user id, display name, and email

#### Scenario: No results for unmatched search

- **GIVEN** the user has `project:invite:create` scope
- **WHEN** they call `GET /api/users/search?email=nonexistent@nowhere.com`
- **THEN** the system returns an empty array

#### Scenario: Unauthorized search

- **GIVEN** the user does NOT have `project:invite:create` scope
- **WHEN** they call `GET /api/users/search?email=test`
- **THEN** the system returns 403 Forbidden

---

### Requirement: Project Member Listing

The system SHALL provide an API endpoint to list all members of a project with their roles.

#### Scenario: List project members

- **GIVEN** the user has `project:read` scope for the project
- **WHEN** they call `GET /api/projects/:projectId/members`
- **THEN** the system returns a list of members with id, display name, email, role, and joined date

#### Scenario: Empty project has only creator

- **GIVEN** a newly created project
- **WHEN** listing project members
- **THEN** the list contains at least the project creator as `project_admin`

---

### Requirement: Project Member Removal

The system SHALL allow project admins to remove members from a project.

#### Scenario: Admin removes member

- **GIVEN** the user has `project_admin` role in the project
- **WHEN** they call `DELETE /api/projects/:projectId/members/:userId`
- **THEN** the member is removed from the project
- **AND** the system returns 200 OK

#### Scenario: Cannot remove self if sole admin

- **GIVEN** the user is the only `project_admin` in the project
- **WHEN** they attempt to remove themselves
- **THEN** the system returns 400 Bad Request with message "Cannot remove the only project admin"

#### Scenario: Non-admin cannot remove members

- **GIVEN** the user has `project_user` role (not admin)
- **WHEN** they call `DELETE /api/projects/:projectId/members/:userId`
- **THEN** the system returns 403 Forbidden

---

### Requirement: Create Project Invitation

The system SHALL allow project admins to invite existing users to join a project.

#### Scenario: Invite existing user to project

- **GIVEN** the user has `project:invite:create` scope
- **AND** the target user exists in the system
- **WHEN** they call `POST /api/invites` with email, projectId, and role
- **THEN** an invitation record is created with status "pending"
- **AND** the system returns the invitation id

#### Scenario: Invite already-member user

- **GIVEN** the target user is already a member of the project
- **WHEN** attempting to invite them
- **THEN** the system returns 400 Bad Request with message "User is already a project member"

#### Scenario: Auto-add to organization on accept

- **GIVEN** a user accepts a project invitation
- **AND** they are not yet a member of the project's organization
- **WHEN** the invitation is accepted
- **THEN** the user is automatically added to the organization with `org_member` role
- **AND** the user is added to the project with the invited role

---

### Requirement: Pending Invitations for User

The system SHALL provide an API endpoint for users to view their pending project invitations.

#### Scenario: List pending invitations

- **GIVEN** the user is authenticated
- **WHEN** they call `GET /api/invites/pending`
- **THEN** the system returns invitations where the user's email matches
- **AND** each invitation includes project name, organization name, inviter name, role, and sent date

#### Scenario: No pending invitations

- **GIVEN** the user has no pending invitations
- **WHEN** they call `GET /api/invites/pending`
- **THEN** the system returns an empty array

---

### Requirement: Accept Project Invitation

The system SHALL allow users to accept pending project invitations.

#### Scenario: Accept invitation

- **GIVEN** the user has a pending invitation
- **WHEN** they call `POST /api/invites/:id/accept`
- **THEN** the invitation status changes to "accepted"
- **AND** the user is added to the project with the specified role
- **AND** the user is added to the organization if not already a member

#### Scenario: Accept expired invitation

- **GIVEN** the invitation has expired (older than 7 days)
- **WHEN** the user attempts to accept
- **THEN** the system returns 400 Bad Request with message "Invitation has expired"

---

### Requirement: Decline Project Invitation

The system SHALL allow users to decline pending project invitations.

#### Scenario: Decline invitation

- **GIVEN** the user has a pending invitation
- **WHEN** they call `POST /api/invites/:id/decline`
- **THEN** the invitation status changes to "declined"
- **AND** no membership is created

---

### Requirement: List Sent Invitations

The system SHALL allow project admins to view invitations sent for their project.

#### Scenario: List project invitations

- **GIVEN** the user has `project_admin` role
- **WHEN** they call `GET /api/projects/:projectId/invites`
- **THEN** the system returns all invitations for that project
- **AND** each includes email, role, status, and sent date

---

### Requirement: Cancel Pending Invitation

The system SHALL allow project admins to cancel pending invitations.

#### Scenario: Cancel pending invitation

- **GIVEN** the user has `project_admin` role
- **AND** the invitation status is "pending"
- **WHEN** they call `DELETE /api/invites/:id`
- **THEN** the invitation status changes to "cancelled"
- **AND** the system returns 200 OK

#### Scenario: Cannot cancel accepted invitation

- **GIVEN** the invitation has already been accepted
- **WHEN** attempting to cancel
- **THEN** the system returns 400 Bad Request with message "Cannot cancel accepted invitation"

---

### Requirement: Project Members UI Page

The frontend SHALL provide a project settings page to manage project members.

#### Scenario: View members list

- **GIVEN** the user navigates to `/admin/settings/project/members`
- **THEN** they see a table with all project members
- **AND** columns include avatar, name, email, role, and joined date

#### Scenario: Remove member from UI

- **GIVEN** the user is a project admin viewing the members page
- **WHEN** they click "Remove" on a member row
- **THEN** a confirmation modal appears
- **AND** confirming removes the member and refreshes the list

---

### Requirement: Invite Member Modal

The frontend SHALL provide a modal to invite existing users to the project.

#### Scenario: Search and select user

- **GIVEN** the invite modal is open
- **WHEN** the user types an email in the search field
- **THEN** matching users appear in a dropdown after debounce
- **AND** selecting a user populates the invite form

#### Scenario: Send invitation

- **GIVEN** a user is selected and role is chosen
- **WHEN** clicking "Send Invitation"
- **THEN** the invitation is created via API
- **AND** a success toast appears
- **AND** the modal closes

---

### Requirement: Pending Invitations UI

The frontend SHALL display pending invitations for the current user.

#### Scenario: View pending invitations

- **GIVEN** the user has pending project invitations
- **WHEN** they view the inbox or invitations section
- **THEN** they see cards for each pending invitation
- **AND** each card shows project name, organization, inviter, and date

#### Scenario: Accept invitation from UI

- **GIVEN** a pending invitation card is displayed
- **WHEN** the user clicks "Accept"
- **THEN** the invitation is accepted via API
- **AND** a success toast appears
- **AND** the project list is refreshed to include the new project

#### Scenario: Decline invitation from UI

- **GIVEN** a pending invitation card is displayed
- **WHEN** the user clicks "Decline"
- **THEN** the invitation is declined via API
- **AND** the card is removed from the list

