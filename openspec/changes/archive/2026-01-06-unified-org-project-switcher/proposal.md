# Change: Unified Organization & Project Switcher

## Why

Currently, users must interact with two different UI components to switch context:

1. **Organization switcher** - Located in the topbar profile/avatar dropdown menu
2. **Project switcher** - Located in the sidebar as a separate dropdown

This creates several usability issues:

- **Redundant UI** - Two separate dropdowns for related functionality
- **Poor discoverability** - Organization switcher is hidden in the avatar menu
- **Inefficient workflow** - Requires multiple clicks to switch org + project
- **Cognitive load** - Users must remember two different interaction patterns
- **Unclear hierarchy** - The org → project relationship is not visually represented

A unified switcher in the sidebar that groups projects by organization provides a clearer mental model, improves discoverability, and streamlines the context-switching workflow.

## What Changes

- Remove organization switcher from `TopbarProfileMenu` component
- Enhance `SidebarProjectDropdown` to display projects grouped by organization
- Add non-interactive organization headers as visual grouping elements
- Update project selection logic to automatically update org context when switching across orgs
- Add visual indentation to indicate project hierarchy under organizations
- Update component stories to reflect new grouped structure
- Simplify `TopbarProfileMenu` to focus solely on user account actions

## Impact

**Affected specs:**

- `ui-components` (modified requirements for sidebar project dropdown and topbar profile menu, added requirements for org headers and indentation)

**Affected code:**

- `apps/admin/src/components/organisms/SidebarProjectDropdown/index.tsx` - Major update to group by org
- `apps/admin/src/components/organisms/Topbar/partials/TopbarProfileMenu.tsx` - Remove org switcher section
- `apps/admin/src/components/molecules/SidebarProjectItem/index.tsx` - Potential visual hierarchy updates
- `apps/admin/src/components/organisms/SidebarProjectDropdown/SidebarProjectDropdown.stories.tsx` - Update stories
- `apps/admin/src/contexts/access-tree.tsx` - Already provides tree structure (no changes needed)
- `apps/admin/src/contexts/config.tsx` - May need to ensure setActiveOrg is called correctly

**User-facing impact:**

- Organization switcher no longer accessible from avatar dropdown
- All organization and project switching done from sidebar
- Clearer visual hierarchy showing organization → project relationships
- Faster context switching (single dropdown instead of two separate locations)

**Breaking changes:**

- None (pure UI reorganization, no API or data model changes)

### Benefits

- **Reduced UI complexity** - One dropdown instead of two
- **Better discoverability** - Organization context always visible
- **Improved efficiency** - Faster context switching
- **Clearer hierarchy** - Visual representation of org → project relationship
- **Consistent UX** - Single interaction pattern for switching context

### Risks

- **Migration complexity** - Users accustomed to old pattern
- **Screen space** - Dropdown might be taller with grouped structure
- **Performance** - Rendering all orgs + projects in one component

### Mitigation

- Add visual cues (animations, grouping) to help users understand new structure
- Implement virtualization if dropdown becomes too tall
- Use `useMemo` for organization grouping to optimize rendering
- Consider adding search/filter if user has many orgs/projects

## Affected Components

- `TopbarProfileMenu` - Remove org switcher
- `SidebarProjectDropdown` - Add org grouping
- `SidebarProjectItem` - Potential visual hierarchy updates
- `AccessTreeContext` - Already provides hierarchical data
- Stories for all affected components

## Testing Requirements

1. **Unit Tests**

   - SidebarProjectDropdown renders orgs and projects correctly
   - Selection updates both org and project context
   - Empty states (no orgs, no projects)
   - Loading states

2. **Integration Tests**

   - Switching projects within same org
   - Switching projects across different orgs
   - Active project persists across page reloads
   - Organization context updates correctly

3. **E2E Tests**

   - User can switch between projects in same org
   - User can switch between projects in different orgs
   - Dropdown shows correct grouping structure
   - Active selection is visually indicated

4. **Manual Testing**
   - Visual hierarchy is clear and intuitive
   - Long org/project names handle gracefully
   - Dropdown height reasonable (not too tall)
   - Accessibility (keyboard navigation, screen readers)

## Acceptance Criteria

- [ ] Organization switcher removed from TopbarProfileMenu
- [ ] SidebarProjectDropdown displays projects grouped by organization
- [ ] Organization names appear as group headers (non-selectable)
- [ ] Project names appear as selectable items under their org
- [ ] Clicking a project updates both project and org context
- [ ] Active project is visually indicated
- [ ] Trigger shows active project name and org name
- [ ] Dropdown handles empty states gracefully
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Stories updated for all affected components
- [ ] Visual hierarchy is clear and accessible

## Future Enhancements

- Add search/filter for large lists
- Add "Add organization" action to dropdown
- Add "Manage organizations" link
- Add recent/favorite projects quick access
- Add keyboard shortcuts for switching
