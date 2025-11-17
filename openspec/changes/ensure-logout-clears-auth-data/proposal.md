# Change: Ensure Logout Clears All Auth Data from localStorage

## Why

The current logout implementation only removes the legacy auth key (`__nexus_auth_v1__`) from localStorage, potentially leaving sensitive authentication data in other storage keys. This creates a security risk where logged-out users may have residual auth tokens or configuration data that could be exploited or cause unexpected authentication state.

## What Changes

- Update the `logout` function in `AuthContext` to clear all auth-related localStorage keys
- Clear both legacy (`__nexus_auth_v1__`) and current (`spec-server-auth`) auth storage keys
- Clear user-scoped configuration data from `spec-server` key (activeOrgId, activeProjectId, user preferences)
- Document which localStorage keys are cleared on logout and which are preserved
- Add tests to verify all auth data is removed on logout

## Impact

- **Affected specs**: `authentication` (new spec delta)
- **Affected code**:
  - `apps/admin/src/contexts/auth.tsx` (logout function)
  - `apps/admin/src/constants/storage.ts` (documentation)
  - E2E tests for logout behavior
- **Breaking changes**: None - this is a security enhancement that makes logout more thorough
- **User impact**: Users will need to re-select their organization and project preferences after logout (expected behavior)
