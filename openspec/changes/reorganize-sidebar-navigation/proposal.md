# Change: Reorganize Sidebar Navigation

## Why

Users need quick access to cross-project items (Inbox, All Tasks) without selecting a project first. The current layout places all navigation under the project picker, making it unclear which items are project-scoped vs. global. This change improves navigation clarity by placing prominent cross-project items at the top.

## What Changes

- Add **Inbox** and **All Tasks** above project picker (no section title, more prominent with larger icons)
- Rename "Overview" sidebar section to "Project"
- Keep existing project-scoped **Tasks** in the Project section
- Create new `useAllTaskCounts` hook for cross-project task aggregation

## Impact

- Affected specs: `sidebar-navigation` (new capability)
- Affected code:
  - `apps/admin/src/pages/admin/layout.tsx` - sidebar structure
  - `apps/admin/src/components/organisms/Sidebar/` - support for prominent menu items
  - `apps/admin/src/hooks/useTasks.ts` - add cross-project hooks
  - `apps/admin/src/pages/admin/tasks/` - may need "all tasks" variant page
  - `apps/server/src/modules/tasks/` - API endpoint for cross-project tasks
