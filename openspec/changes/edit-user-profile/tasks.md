# Tasks for User Profile Editing

## Backend

- [x] Update `UserProfileService.upsertBase` to accept and save profile fields (firstName, lastName, displayName) <!-- id: backend-upsert -->
- [x] Update `AuthService.ensureUserProfile` to extract profile fields from Zitadel tokens/introspection and pass to `upsertBase` <!-- id: backend-auth-sync -->
- [x] Update `AuthController.me` to return full user profile instead of mock data <!-- id: backend-me-endpoint -->
- [x] Verify `UserProfileController` functionality (already exists, just ensure it works with new data) <!-- id: backend-verify-controller -->

## Frontend

- [x] Create `ProfileSettings` page component in `apps/admin/src/pages/admin/pages/settings/ProfileSettings.tsx` <!-- id: frontend-page -->
- [x] Add route `/settings/profile` in `apps/admin/src/router` <!-- id: frontend-route -->
- [x] Update `TopbarProfileMenu` to link "My Profile" to `/settings/profile` <!-- id: frontend-menu -->
- [x] Implement form submission to `PUT /user/profile` <!-- id: frontend-form -->
