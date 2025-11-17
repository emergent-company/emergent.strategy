# Design: Global Toast Notification System

## Context

The application currently has ad-hoc toast implementations using direct DOM manipulation (e.g., `document.createElement`, `document.body.appendChild`). This approach leads to:

- Inconsistent UX (different timeouts, styling)
- Code duplication across components
- No support for actions (undo, navigate)
- No centralized state management
- Difficult to test

The goal is to centralize toast notifications using React patterns (Context API) while leveraging DaisyUI's existing toast component.

## Goals / Non-Goals

### Goals

- Single source of truth for toast state (React Context)
- Declarative API via `useToast()` hook
- Support action buttons with callbacks
- Auto-dismiss with configurable duration
- Stacking behavior for multiple toasts
- Consistent styling using DaisyUI
- Easy to test (no direct DOM manipulation)

### Non-Goals

- Replace persistent notification inbox (NotificationInbox component)
- Replace inline form validation alerts
- Complex notification history/persistence (transient only)
- Custom positioning per toast (single top-right position)

## Decisions

### 1. State Management: React Context API

**Decision:** Use React Context for global toast state
**Rationale:**

- Consistent with existing patterns (AuthContext, ConfigContext, AccessTreeContext)
- No need for external state library (Redux, Zustand) for this scope
- Simple pub-sub pattern: components call `showToast()`, ToastContainer renders

**Alternatives considered:**

- Direct DOM manipulation: Current approach, difficult to test, not idiomatic React
- Event emitter pattern: Additional complexity, harder to track state
- Redux/Zustand: Overkill for toast notifications

### 2. Toast Stack Limit: 5 Visible Toasts

**Decision:** Maximum 5 toasts visible, FIFO auto-dismiss
**Rationale:**

- Prevents UI clutter if many toasts triggered rapidly
- 5 is generous but bounded (typical UX: 3-5)
- Oldest toast dismissed first when limit exceeded

### 3. Default Auto-Dismiss: 5 Seconds

**Decision:** Default `duration: 5000` (5 seconds), configurable per toast
**Rationale:**

- Balances readability with UI cleanup
- Success/info: 5s (transient, low priority)
- Error/warning: Can set longer (e.g., 10s) or `duration: null` for manual-only dismiss

**API:**

```typescript
showToast({
  message: 'Success!',
  variant: 'success',
  duration: 5000, // default
});

showToast({
  message: 'Critical error',
  variant: 'error',
  duration: null, // manual dismiss only
});
```

### 4. Action Buttons: Primary + Secondary

**Decision:** Support up to 2 action buttons per toast
**Rationale:**

- Common patterns: "Undo" (primary) or "View Details" (primary)
- Secondary action: "Dismiss" (explicit, in addition to auto-dismiss)
- More than 2 buttons clutters small toast UI

**API:**

```typescript
showToast({
  message: 'Item deleted',
  variant: 'warning',
  actions: [
    { label: 'Undo', onClick: () => restoreItem() },
    { label: 'View Trash', onClick: () => navigate('/trash') },
  ],
});
```

### 5. DaisyUI Toast Extension

**Decision:** Use DaisyUI toast base, extend with action buttons
**Rationale:**

- Leverage existing design system (consistent with other UI)
- DaisyUI provides positioning (`toast-top toast-end`), stacking, animations
- Only need to add action button rendering

**Implementation:**

```tsx
<div className="toast toast-top toast-end">
  <div className="alert alert-{variant}">
    <span>{message}</span>
    {actions && (
      <div className="flex gap-2">
        {actions.map((action) => (
          <button className="btn btn-sm" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    )}
  </div>
</div>
```

### 6. Toast ID Generation

**Decision:** Use `crypto.randomUUID()` for toast IDs
**Rationale:**

- Unique IDs for dismissing specific toasts
- Built-in browser API (no dependencies)
- Better than incremental counter (avoids collisions)

## Architecture

### Component Hierarchy

```
App.tsx
└── ToastProvider (context)
    ├── ... (app content)
    └── ToastContainer (renders toasts)
        └── Toast[] (individual toast items)
```

### Data Flow

1. Component calls `showToast({ message, variant, actions, duration })`
2. ToastContext adds toast to state array with generated ID
3. ToastContainer renders all toasts in stack
4. Auto-dismiss timer started (if duration set)
5. On dismiss (manual or auto): ToastContext removes toast by ID

### Type Definitions

```typescript
type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  message: string;
  variant: ToastVariant;
  duration?: number | null; // null = manual dismiss only, default 5000ms
  actions?: ToastAction[];
}

interface Toast extends ToastOptions {
  id: string;
  createdAt: number; // timestamp for FIFO ordering
}
```

## Risks / Trade-offs

### Risk: Toast Stacking Performance

**Mitigation:** Limit to 5 toasts, use React key prop for efficient rendering

### Risk: Memory Leaks from Timers

**Mitigation:** Cleanup timers in useEffect, clear on unmount

### Risk: Action Callback Errors

**Mitigation:** Wrap onClick in try-catch, show error toast if action fails

### Trade-off: Global vs Scoped Toasts

**Decision:** Global positioning only (top-right)
**Rationale:** Simplicity first. Can add positioning options later if needed.

## Migration Plan

1. Add ToastProvider to App.tsx (non-breaking, no usage yet)
2. Migrate TopbarProfileMenu (replace setToastMsg state with useToast)
3. Migrate KBPurposeEditor (replace DOM manipulation with useToast)
4. Test E2E flows (org switch, KB save) to ensure parity
5. Remove old toast code (setToastMsg state, DOM manipulation)

**Rollback:** Revert migrations, remove ToastProvider (no schema changes)

## Open Questions

1. Should error toasts auto-dismiss or require manual dismiss?

   - **Proposal:** Default 10s for errors, can override with `duration: null`

2. Should toasts support rich content (links, icons, multi-line)?

   - **Proposal:** Start with plain text + action buttons, extend later if needed

3. Should toasts be accessible (ARIA live region)?
   - **Proposal:** Yes, add `role="alert"` and `aria-live="polite"` to ToastContainer
