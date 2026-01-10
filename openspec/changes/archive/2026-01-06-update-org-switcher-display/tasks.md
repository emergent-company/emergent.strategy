# Implementation Tasks

## 1. Update Data Layer

- [x] 1.1 Verify that `ProjectWithRole` type from `useAccessTreeContext` includes organization name via lookup
- [x] 1.2 Update `SidebarProjectDropdown` to use `useAccessTreeContext` to lookup organization names by `orgId`
- [x] 1.3 Ensure organization name is available for each project in the dropdown

## 2. Update SidebarProjectItem Component

- [x] 2.1 Add `orgName` prop to `SidebarProjectItemProps` interface
- [x] 2.2 Update display logic to show `orgName` as subtitle instead of `project.status`
- [x] 2.3 Add `truncate` class to project name to handle long names with ellipsis (already present)
- [x] 2.4 Keep `title` attribute for full text on hover (already present)
- [x] 2.5 Handle case where `orgName` is undefined (show empty subtitle or fallback)
- [x] 2.6 Standardize icon to hexagon (`mask-hexagon-2`) for consistency

## 3. Update SidebarProjectDropdown Component

- [x] 3.1 Add `useAccessTreeContext` hook to access organization data
- [x] 3.2 Create organization lookup map from access tree (orgId → orgName)
- [x] 3.3 Pass `orgName` to each `SidebarProjectItem` by looking up `project.orgId`
- [x] 3.4 Handle loading and error states appropriately
- [x] 3.5 Update trigger (collapsed state) to show active project's organization name

## 4. Update Stories

- [x] 4.1 Update `SidebarProjectItem.stories.tsx` with `orgName` prop in sample data
- [x] 4.2 Add story variant for long project name with truncation
- [x] 4.3 Add story variant for missing organization name
- [x] 4.4 Update `SidebarProjectDropdown.stories.tsx` sample projects to include organization context
- [x] 4.5 Verify all stories render correctly in Storybook

## 5. Testing

- [x] 5.1 Run unit tests for `SidebarProjectItem` component
- [x] 5.2 Run unit tests for `SidebarProjectDropdown` component
- [x] 5.3 Manual testing: verify organization name displays correctly in sidebar
- [x] 5.4 Manual testing: verify long project names truncate with ellipsis
- [x] 5.5 Manual testing: verify hover shows full project name
- [x] 5.6 Manual testing: verify behavior with multiple organizations

## 6. Build & Lint

- [x] 6.1 Run `nx run admin:build` and fix any errors
- [x] 6.2 Run `nx run admin:lint` and fix any errors
- [x] 6.3 Run `nx run admin:test` to ensure all tests pass
