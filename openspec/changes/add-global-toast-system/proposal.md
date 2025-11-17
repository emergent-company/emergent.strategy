# Change: Add Global Toast Notification System

## Why

The application currently uses ad-hoc toast implementations scattered across components (e.g., TopbarProfileMenu, KBPurposeEditor), leading to inconsistent UX, code duplication, and limited functionality. There's no centralized way to display transient notifications with actions (undo, navigation), custom durations, or stacking behavior when multiple notifications occur simultaneously.

## What Changes

- Add a global toast notification system using React Context for state management
- Extend DaisyUI toast component with action buttons (primary and secondary actions)
- Support configurable display duration per toast (default 5 seconds)
- Implement toast stacking with a maximum of 5 visible toasts
- Support toast variants: success, error, warning, info
- Enable action callbacks (e.g., undo operations, navigate to specific pages)
- Replace ad-hoc toast implementations in DocumentsPage, TopbarProfileMenu, and KBPurposeEditor
- Add dismiss capability (manual close button + auto-dismiss after duration)
- Position toasts in top-right corner (toast-top toast-end) by default

## Impact

- **Affected specs:** Creates new capability `toast-notifications`
- **Affected code:**
  - New files:
    - `apps/admin/src/contexts/toast.tsx` (ToastProvider context)
    - `apps/admin/src/hooks/use-toast.ts` (useToast hook)
    - `apps/admin/src/components/organisms/ToastContainer/ToastContainer.tsx` (UI component)
  - Modified files:
    - `apps/admin/src/App.tsx` (add ToastProvider)
    - `apps/admin/src/pages/admin/apps/documents/index.tsx` (migrate upload success/error to useToast)
    - `apps/admin/src/components/organisms/Topbar/partials/TopbarProfileMenu.tsx` (migrate to useToast)
    - `apps/admin/src/components/organisms/KBPurposeEditor/KBPurposeEditor.tsx` (migrate to useToast)
- **Dependencies:** No new dependencies (uses existing DaisyUI, React Context)
- **Breaking changes:** None (existing components will be migrated, but API remains internal)
