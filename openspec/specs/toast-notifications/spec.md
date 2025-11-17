# toast-notifications Specification

## Purpose
TBD - created by archiving change add-global-toast-system. Update Purpose after archive.
## Requirements
### Requirement: Global Toast State Management

The system SHALL provide a centralized toast notification state using React Context that manages the lifecycle of all toast notifications in the application.

#### Scenario: Show toast notification

- **WHEN** a component calls `showToast({ message, variant })`
- **THEN** the toast MUST be added to the global toast state
- **AND** the toast MUST be assigned a unique ID
- **AND** the toast MUST be visible in the ToastContainer

#### Scenario: Dismiss toast manually

- **WHEN** a user clicks the dismiss button on a toast
- **THEN** the toast MUST be removed from the global state
- **AND** the toast MUST no longer be visible

#### Scenario: Auto-dismiss after duration

- **WHEN** a toast is created with a duration value
- **THEN** the toast MUST automatically dismiss after the specified duration
- **AND** the toast MUST be removed from the state

#### Scenario: Manual-only dismiss

- **WHEN** a toast is created with `duration: null`
- **THEN** the toast MUST NOT auto-dismiss
- **AND** the toast MUST remain visible until manually dismissed

### Requirement: Toast Stacking

The system SHALL support displaying multiple toast notifications simultaneously with a maximum stack limit to prevent UI clutter.

#### Scenario: Display multiple toasts

- **WHEN** multiple components call `showToast()` in quick succession
- **THEN** all toasts MUST be displayed in the ToastContainer
- **AND** toasts MUST be stacked vertically

#### Scenario: Enforce maximum stack limit

- **WHEN** more than 5 toasts are active simultaneously
- **THEN** the oldest toast (lowest createdAt timestamp) MUST be auto-dismissed
- **AND** the new toast MUST be added to the stack
- **AND** only 5 toasts MUST be visible at any time

#### Scenario: FIFO ordering

- **WHEN** the toast stack is full and a new toast is added
- **THEN** toasts MUST be dismissed in First-In-First-Out order
- **AND** the oldest toast MUST be removed first

### Requirement: Toast Variants

The system SHALL support multiple toast variants with appropriate visual styling to indicate notification severity and type.

#### Scenario: Success toast

- **WHEN** a toast is created with `variant: 'success'`
- **THEN** the toast MUST use the `alert-success` DaisyUI class
- **AND** the toast MUST display with success color styling

#### Scenario: Error toast

- **WHEN** a toast is created with `variant: 'error'`
- **THEN** the toast MUST use the `alert-error` DaisyUI class
- **AND** the toast MUST display with error color styling

#### Scenario: Warning toast

- **WHEN** a toast is created with `variant: 'warning'`
- **THEN** the toast MUST use the `alert-warning` DaisyUI class
- **AND** the toast MUST display with warning color styling

#### Scenario: Info toast

- **WHEN** a toast is created with `variant: 'info'`
- **THEN** the toast MUST use the `alert-info` DaisyUI class
- **AND** the toast MUST display with info color styling

### Requirement: Toast Action Buttons

The system SHALL support action buttons within toasts to enable users to perform contextual actions (undo, navigate, etc.) directly from the notification.

#### Scenario: Single action button

- **WHEN** a toast is created with one action: `actions: [{ label: 'Undo', onClick: handleUndo }]`
- **THEN** the toast MUST display a single action button with label "Undo"
- **AND** clicking the button MUST execute the `handleUndo` callback
- **AND** the toast MUST be dismissed after the action executes

#### Scenario: Multiple action buttons

- **WHEN** a toast is created with two actions
- **THEN** the toast MUST display both action buttons
- **AND** both buttons MUST be clickable
- **AND** clicking either button MUST execute its respective callback

#### Scenario: Action button callback error handling

- **WHEN** an action button callback throws an error
- **THEN** the error MUST be caught and logged
- **AND** a new error toast MUST be displayed with message "Action failed"
- **AND** the original toast MUST still be dismissed

#### Scenario: Toast without actions

- **WHEN** a toast is created without the `actions` property
- **THEN** the toast MUST display only the message and dismiss button
- **AND** no action buttons MUST be rendered

### Requirement: Toast Positioning

The system SHALL display toasts in a consistent, fixed position to ensure predictable UX and avoid overlapping with other UI elements.

#### Scenario: Default positioning

- **WHEN** any toast is displayed
- **THEN** the toast MUST appear in the top-right corner of the viewport
- **AND** the toast MUST use DaisyUI classes `toast-top toast-end`
- **AND** the toast MUST remain fixed during scrolling

### Requirement: Toast Accessibility

The system SHALL implement accessibility features to ensure toast notifications are perceivable by users of assistive technologies.

#### Scenario: ARIA live region

- **WHEN** the ToastContainer is rendered
- **THEN** it MUST have `role="alert"`
- **AND** it MUST have `aria-live="polite"`
- **AND** screen readers MUST announce new toasts

#### Scenario: Keyboard dismiss

- **WHEN** a toast is focused and the user presses Escape
- **THEN** the toast MUST be dismissed
- **AND** focus MUST return to the previously focused element

### Requirement: Toast API Hook

The system SHALL provide a `useToast()` hook that exposes a declarative API for components to create and manage toast notifications.

#### Scenario: Call showToast with minimal options

- **WHEN** a component calls `showToast({ message: 'Success', variant: 'success' })`
- **THEN** a success toast MUST be displayed with default duration (5000ms)
- **AND** the toast MUST auto-dismiss after 5 seconds

#### Scenario: Call showToast with custom duration

- **WHEN** a component calls `showToast({ message: 'Custom', variant: 'info', duration: 10000 })`
- **THEN** the toast MUST be displayed
- **AND** the toast MUST auto-dismiss after 10 seconds

#### Scenario: Call showToast with actions

- **WHEN** a component calls `showToast({ message: 'Item deleted', variant: 'warning', actions: [{ label: 'Undo', onClick: restore }] })`
- **THEN** the toast MUST display with an "Undo" action button
- **AND** clicking "Undo" MUST execute the `restore` callback

#### Scenario: Call dismissToast programmatically

- **WHEN** a component calls `dismissToast(toastId)`
- **THEN** the toast with the specified ID MUST be removed from state
- **AND** the toast MUST no longer be visible

### Requirement: Migration of Existing Toast Implementations

The system SHALL replace all ad-hoc toast implementations with the global toast system to ensure consistency and maintainability.

#### Scenario: DocumentsPage upload success uses global toast

- **WHEN** a user uploads a document successfully on DocumentsPage
- **THEN** a success toast MUST be displayed using `useToast()` hook
- **AND** the old `uploadSuccess` state MUST be removed
- **AND** the toast message MUST be "Upload successful."
- **AND** the document list MUST be reloaded before the toast appears

#### Scenario: DocumentsPage upload error uses global toast

- **WHEN** a document upload fails on DocumentsPage
- **THEN** an error toast MUST be displayed using `useToast()` hook
- **AND** the old `uploadError` state MUST be removed
- **AND** the toast MUST show the error message

#### Scenario: DocumentsPage extraction job success uses global toast

- **WHEN** an extraction job is created successfully on DocumentsPage
- **THEN** a success toast MUST be displayed using `useToast()` hook
- **AND** the toast message MUST be "Extraction job created successfully!"
- **AND** the toast MUST remain visible during navigation redirect

#### Scenario: TopbarProfileMenu uses global toast

- **WHEN** the user switches organizations in TopbarProfileMenu
- **THEN** a toast MUST be displayed using `useToast()` hook
- **AND** the old `toastMsg` state MUST be removed
- **AND** the toast message MUST be "Switched to {orgName}"

#### Scenario: KBPurposeEditor uses global toast

- **WHEN** the user saves KB purpose in KBPurposeEditor
- **THEN** a success toast MUST be displayed using `useToast()` hook
- **AND** the old DOM manipulation code MUST be removed
- **AND** the toast message MUST be "KB purpose saved successfully"

#### Scenario: No direct DOM manipulation

- **WHEN** any component needs to display a toast
- **THEN** it MUST use the `useToast()` hook
- **AND** it MUST NOT use `document.createElement()` or `document.body.appendChild()`

