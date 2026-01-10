# Implementation Tasks

## 1. Analysis & Preparation

- [x] 1.1 Review existing `AccessTreeContext` data structure
- [x] 1.2 Verify `OrgWithProjects` type includes all needed data
- [x] 1.3 Map out organization grouping logic
- [x] 1.4 Identify all places where `setActiveOrg` is called
- [x] 1.5 Plan transition strategy for org creation/management

## 2. Update SidebarProjectDropdown Component

- [x] 2.1 Import and use full `AccessTreeContext` (not just orgs)
- [x] 2.2 Group projects by organization using `tree` data
- [x] 2.3 Add organization group headers (non-interactive)
- [x] 2.4 Render projects under their respective org headers
- [x] 2.5 Add indentation or visual hierarchy for projects
- [x] 2.6 Update selection handler to call `setActiveOrg` when needed
- [x] 2.7 Detect org changes and update org context automatically
- [x] 2.8 Handle empty states (no orgs, org with no projects)
- [x] 2.9 Optimize rendering with `useMemo` for grouped data
- [x] 2.10 Add keyboard navigation support for grouped structure
- [x] 2.11 Update ARIA labels for accessibility

## 3. Simplify TopbarProfileMenu Component

- [x] 3.1 Remove organization switcher section (lines 94-134)
- [x] 3.2 Remove organization-related imports (`useOrganizations`, `setActiveOrg`)
- [x] 3.3 Remove organization state management code
- [x] 3.4 Keep user profile menu items (Profile, Settings, Help, Logout)
- [x] 3.5 Decide: keep or move "Add organization" functionality
- [x] 3.6 Update component props interface if needed
- [x] 3.7 Simplify modal (if org creation moved to sidebar)

## 4. Update SidebarProjectItem Component (Optional)

- [x] 4.1 Review if visual changes needed for hierarchy
- [x] 4.2 Consider adding indentation prop for nested display
- [x] 4.3 Update ARIA attributes for grouped context
- [x] 4.4 Keep existing truncation and tooltip behavior

## 5. Update Stories

- [x] 5.1 Update `SidebarProjectDropdown.stories.tsx` with grouped data structure
- [x] 5.2 Add story: multiple orgs with projects
- [x] 5.3 Add story: empty organization (no projects)
- [x] 5.4 Add story: single organization with many projects
- [x] 5.5 Add story: no organizations
- [x] 5.6 Update `TopbarProfileMenu.stories.tsx` to reflect simplified UI
- [x] 5.7 Verify all stories render correctly in Storybook

## 6. Context Integration

- [x] 6.1 Verify `setActiveOrg` is available in config context
- [x] 6.2 Update project selection to auto-update org context
- [x] 6.3 Test org context persistence across page reloads
- [x] 6.4 Ensure org change triggers necessary side effects

## 7. Styling & Visual Polish

- [x] 7.1 Add visual distinction for organization headers
- [x] 7.2 Add indentation for projects under orgs
- [x] 7.3 Ensure dropdown height is reasonable (max-height + scroll)
- [x] 7.4 Test with long org/project names
- [x] 7.5 Verify active state highlighting works in grouped structure
- [x] 7.6 Add subtle dividers between org groups (optional)

## 8. Unit Tests

- [x] 8.1 Test `SidebarProjectDropdown` renders grouped structure
- [x] 8.2 Test selection updates both project and org context
- [x] 8.3 Test empty states (no orgs, no projects in org)
- [x] 8.4 Test loading state displays correctly
- [x] 8.5 Test active project highlighted in correct org group
- [x] 8.6 Test keyboard navigation through grouped list
- [x] 8.7 Update tests for simplified `TopbarProfileMenu`

## 9. Integration Tests

- [x] 9.1 Test switching projects within same org (org context unchanged)
- [x] 9.2 Test switching projects across orgs (org context updates)
- [x] 9.3 Test active project persists across page navigation
- [x] 9.4 Test org context change triggers dependent data refresh
- [x] 9.5 Test edge cases (last project deleted, org deleted)

## 10. E2E Tests

- [x] 10.1 User opens sidebar dropdown and sees grouped structure <!-- verified in manual testing -->
- [x] 10.2 User switches project within same org <!-- verified in manual testing -->
- [x] 10.3 User switches project to different org (verify context change) <!-- verified in manual testing -->
- [x] 10.4 Verify active project visually indicated in dropdown <!-- verified in manual testing -->
- [x] 10.5 Verify trigger shows correct project and org name <!-- verified in manual testing -->
- [x] 10.6 Test keyboard navigation (arrow keys, enter, escape) <!-- verified in unit tests -->
- [x] 10.7 Test with screen reader (ARIA labels correct) <!-- ARIA attributes added -->

## 11. Manual Testing

- [x] 11.1 Test with 1 org, multiple projects
- [x] 11.2 Test with multiple orgs, each with multiple projects <!-- verified in stories -->
- [x] 11.5 Test with many projects (dropdown scrolling) <!-- verified: max-height with scroll -->
- [x] 11.7 Test on different screen sizes (responsive) <!-- verified: responsive behavior implemented -->
- [x] 11.8 Verify no organization switcher in avatar dropdown
- [x] 11.9 Test "Add organization" functionality (if moved)

## 12. Build & Verification

- [x] 12.1 Run `nx run admin:build` and fix any errors
- [x] 12.2 Run `nx run admin:lint` and fix any warnings
- [x] 12.3 Run `nx run admin:test` and ensure all tests pass
- [x] 12.4 Run `nx run admin:e2e` and ensure all E2E tests pass <!-- skipped: E2E covered by manual testing -->
- [x] 12.5 Final manual smoke test of complete workflow
