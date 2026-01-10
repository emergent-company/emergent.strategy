# Change: Update Organization Switcher Display

## Why

The project switcher in the sidebar currently displays the project name with a generic "Active" status on a second line. This doesn't provide useful context about which organization the project belongs to, especially when users work across multiple organizations with similarly named projects. Displaying the organization name instead improves clarity and helps users quickly identify the organizational context of their current project.

## What Changes

- Update `SidebarProjectItem` molecule to display organization name as subtitle instead of project status
- Enhance `SidebarProjectItem` to accept organization name as a prop (via enriched Project type or separate prop)
- Update `SidebarProjectDropdown` organism to look up and pass organization names to project items
- Implement text truncation with ellipsis for long project names in the title
- Update component stories to reflect new behavior
- Remove or deprecate the `status` field display from the project item UI

## Impact

**Affected specs:**

- `ui-components` (new requirement for organization-aware project display)

**Affected code:**

- `apps/admin/src/components/molecules/SidebarProjectItem/index.tsx` - Display logic update
- `apps/admin/src/components/molecules/SidebarProjectItem/SidebarProjectItem.stories.tsx` - Story updates
- `apps/admin/src/components/organisms/SidebarProjectDropdown/index.tsx` - Organization name lookup and passing
- `apps/admin/src/components/organisms/SidebarProjectDropdown/SidebarProjectDropdown.stories.tsx` - Story updates
- `apps/admin/src/hooks/use-projects.ts` - May need to expose organization names

**User-facing impact:**

- Users will see organization name instead of "Active" status in project switcher
- Long project names will truncate with ellipsis to prevent layout issues
- Improved clarity when working across multiple organizations
