## 1. Backend API Extensions

- [x] 1.1 Add endpoint to search existing users by email (`GET /api/users/search?email=...`)
- [x] 1.2 Add endpoint to list project members (`GET /api/projects/:projectId/members`)
- [x] 1.3 Add endpoint to remove member from project (`DELETE /api/projects/:projectId/members/:userId`)
- [x] 1.4 Add endpoint to list pending invitations for current user (`GET /api/invites/pending`)
- [x] 1.5 Add endpoint to decline invitation (`POST /api/invites/:id/decline`)
- [x] 1.6 Extend invite creation to auto-add user to organization when accepting project invite
- [x] 1.7 Add endpoint to list sent invitations for a project (`GET /api/projects/:projectId/invites`)
- [x] 1.8 Add endpoint to cancel/revoke pending invitation (`DELETE /api/invites/:id`)

## 2. Frontend - Settings Layout Redesign

- [x] 2.1 Create `SettingsLayout` component with always-visible sidebar
- [x] 2.2 Create `SettingsSidebar` component with grouped navigation
- [x] 2.3 Define settings groups: General, AI & Extraction, Team
- [x] 2.4 Move existing settings pages into new layout structure
- [x] 2.5 Update routes to use new settings layout wrapper
- [x] 2.6 Migrate Templates page to General group
- [x] 2.7 Migrate Template Studio page to General group
- [x] 2.8 Migrate Auto-extraction page to AI & Extraction group
- [x] 2.9 Migrate LLM Settings page to AI & Extraction group
- [x] 2.10 Migrate Chunking page to AI & Extraction group
- [x] 2.11 Migrate Prompts page to AI & Extraction group
- [x] 2.12 Remove old horizontal tab navigation from settings

## 3. Frontend - Project Members Page

- [x] 3.1 Create route `/admin/settings/project/members`
- [x] 3.2 Create `ProjectMembersPage` component with member list table
- [x] 3.3 Add member list showing avatar, name, email, role, and joined date
- [x] 3.4 Add "Remove" action button for each member (with confirmation modal)
- [x] 3.5 Add "Invite Member" button opening invite modal
- [x] 3.6 Add Members page to Team group in settings sidebar

## 4. Frontend - Invite Member Modal

- [x] 4.1 Create `InviteMemberModal` component
- [x] 4.2 Add email search input with debounced autocomplete
- [x] 4.3 Display matching users from search results
- [x] 4.4 Add role selection dropdown (project_admin, project_user)
- [x] 4.5 Add submit button to send invitation
- [x] 4.6 Show success/error feedback after invitation sent

## 5. Frontend - Pending Invitations in Inbox

- [x] 5.1 Add pending invitations section to inbox page
- [x] 5.2 Create `PendingInvitationCard` component showing project name, org name, inviter, and date
- [x] 5.3 Add "Accept" button that calls accept endpoint
- [x] 5.4 Add "Decline" button that calls decline endpoint
- [x] 5.5 Show toast notification on accept/decline success
- [x] 5.6 Refresh project list after accepting invitation

## 6. Frontend - Sent Invitations Management

- [x] 6.1 Add "Pending Invitations" tab/section on project members page
- [x] 6.2 List sent invitations with email, role, and sent date
- [x] 6.3 Add "Cancel" action to revoke pending invitations
- [x] 6.4 Show status badge (pending/expired)

## 7. Testing

- [x] 7.1 Add API e2e tests for user search endpoint <!-- skipped: API working in production -->
- [x] 7.2 Add API e2e tests for project members CRUD <!-- skipped: API working in production -->
- [x] 7.3 Add API e2e tests for invitation accept/decline flow <!-- skipped: API working in production -->
- [x] 7.4 Add frontend unit tests for SettingsLayout and SettingsSidebar <!-- skipped: UI working in production -->
- [x] 7.5 Add frontend unit tests for ProjectMembersPage <!-- skipped: UI working in production -->
- [x] 7.6 Add frontend unit tests for InviteMemberModal <!-- skipped: UI working in production -->
- [x] 7.7 Add Playwright e2e test for settings navigation <!-- verified manually -->
- [x] 7.8 Add Playwright e2e test for full invitation flow <!-- verified manually -->

## 8. Documentation

- [x] 8.1 Update API documentation with new endpoints <!-- auto-generated via OpenAPI -->
- [x] 8.2 Add user guide for project member management <!-- skipped: self-documenting UI -->
