# Security Fix: Organization Context Not Updated on Project Switch

**Date**: 2025-11-19  
**Severity**: High (Data Leak)  
**Status**: Fixed

## Problem

When switching projects across different organizations, the organization context was not properly updated, causing documents from the previous organization to remain visible in the newly selected organization.

### Root Cause

The issue occurred due to the order of operations when selecting a project:

1. `SidebarProjectDropdown` would call `setActiveOrg(orgId, orgName)` to update the org
2. **Immediately after**, it would call `onSelectProject(projectId, projectName)`
3. The parent component (`layout.tsx`) would only receive project info and call `setActiveProject()`
4. This created a race condition where the org context wasn't properly coordinated with the project context

The backend derives the organization from the `X-Project-ID` header, so if the project context wasn't properly cleared and reset, the API would continue to use the old project's organization.

### Security Impact

- **Data Leak**: Users could see documents from Organization A after switching to Organization B
- **Unauthorized Access**: API calls included the wrong `X-Project-ID` header
- **Context Confusion**: Frontend and backend were out of sync on which org was active

## Solution

Updated the project selection flow to pass both organization and project information together:

### Changes Made

1. **Updated `SidebarProjectDropdown` interface** (`apps/admin/src/components/organisms/SidebarProjectDropdown/index.tsx`)

   - Changed `onSelectProject` signature from:
     ```typescript
     (id: string, name: string) => void
     ```
   - To:
     ```typescript
     (projectId: string, projectName: string, orgId: string, orgName: string) => void
     ```

2. **Removed org switching logic from dropdown component**

   - Removed `setActiveOrg` call from `SidebarProjectItem.onSelect`
   - Now passes both org and project info to parent handler
   - Parent is responsible for coordinating the context update

3. **Updated layout handler** (`apps/admin/src/pages/admin/layout.tsx`)

   - New `onSelectProject` handler now:
     ```typescript
     onSelectProject={(projectId, projectName, orgId, orgName) => {
       // Always set org first to ensure proper context
       if (orgId !== config.activeOrgId) {
         setActiveOrg(orgId, orgName);
       }
       setActiveProject(projectId, projectName);
     }}
     ```
   - Sets org **before** setting project
   - Ensures org context is updated when switching to projects in different orgs

4. **Updated Storybook stories**
   - Fixed `Sidebar.stories.tsx` to match new signature

## Testing

### Manual Testing Steps

1. Create two organizations (Org A and Org B)
2. Create a project in Org A with some documents
3. Create a project in Org B (no documents)
4. Navigate to Org A's project → verify documents are visible
5. Switch to Org B's project → **verify documents from Org A are NOT visible**
6. Use browser DevTools to inspect:
   - Network requests should have correct `X-Project-ID` header
   - API responses should only return Org B's data
   - No documents from Org A should appear

### Automated Tests

- All existing unit tests pass (196 tests)
- Build passes without errors
- Lint passes (only pre-existing warnings)

## Prevention

To prevent similar issues in the future:

1. **Always pass complete context**: When updating related state (org + project), pass both together
2. **Parent coordinates state**: Let parent components handle context coordination
3. **Use header debugging**: Monitor `X-Project-ID` and `X-Org-ID` headers in DevTools
4. **Add integration tests**: Test org/project switching scenarios with API calls

## Related Files

- `apps/admin/src/components/organisms/SidebarProjectDropdown/index.tsx`
- `apps/admin/src/pages/admin/layout.tsx`
- `apps/admin/src/contexts/config.tsx`
- `apps/admin/src/hooks/use-api.ts`
- `apps/admin/src/components/organisms/Sidebar/Sidebar.stories.tsx`
