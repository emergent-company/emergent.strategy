# User Profile Editing

## Summary

Allow users to view and edit their profile information (First Name, Last Name) within the application. Sync initial data from Zitadel on first login.

## Motivation

Users need to verify and manage their personal information. Currently, we receive data from Zitadel but do not fully utilize or expose it for verification/editing.

## Design

- **Source of Truth**: Local `user_profiles` table.
- **Sync Strategy**: On first login (account creation), populate `user_profiles` with data from Zitadel (First Name, Last Name, Email). Subsequent logins do _not_ overwrite local changes to avoid reverting user edits.
- **API**:
  - `GET /user/profile` (existing) - returns profile.
  - `PUT /user/profile` (existing) - updates profile.
  - `GET /auth/me` - updated to return consistent profile data.
- **UI**: New "Profile Settings" page accessible from the user avatar menu.

## Impact

- **Backend**: Updates to `AuthService` and `UserProfileService`.
- **Frontend**: New page and route.
