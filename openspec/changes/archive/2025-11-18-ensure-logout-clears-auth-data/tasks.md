# Implementation Tasks

## 1. Update Logout Implementation

- [x] 1.1 Modify `logout` function in `apps/admin/src/contexts/auth.tsx` to remove all auth-related keys
- [x] 1.2 Clear `spec-server-auth` storage key (if present)
- [x] 1.3 Clear `__nexus_auth_v1__` storage key (legacy, already implemented)
- [x] 1.4 Clear user-specific config from `spec-server` key (activeOrgId, activeProjectId, activeOrgName, activeProjectName)
- [x] 1.5 Preserve non-auth config (theme, direction, fontFamily, sidebarTheme, fullscreen)

## 2. Documentation

- [x] 2.1 Add JSDoc comments to logout function explaining what is cleared
- [x] 2.2 Update storage constants file with comments about logout behavior
- [x] 2.3 Document which localStorage keys persist across logout

## 3. Testing

- [x] 3.1 Add unit test for `AuthContext` logout function
- [x] 3.2 Verify `spec-server-auth` is removed
- [x] 3.3 Verify `__nexus_auth_v1__` is removed
- [x] 3.4 Verify user-specific config is cleared from `spec-server`
- [x] 3.5 Verify non-auth config (theme, etc.) is preserved
- [x] 3.6 Add E2E test verifying logout clears localStorage correctly
- [x] 3.7 Verify re-login works correctly after logout

## 4. Validation

- [x] 4.1 Manual testing: login, logout, verify localStorage is clean
- [x] 4.2 Manual testing: set theme/preferences, logout, verify preferences persist
- [x] 4.3 Manual testing: verify no authentication data remains after logout
- [x] 4.4 Run all existing auth tests to ensure no regression
