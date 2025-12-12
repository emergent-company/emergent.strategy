# frontend-data-fetching Specification

## Purpose
TBD - created by archiving change fix-duplicate-access-tree-calls. Update Purpose after archive.
## Requirements
### Requirement: Access Tree Context Provider

The frontend application SHALL provide a React Context provider (`AccessTreeProvider`) that maintains a single shared state for user access tree data (organizations and projects with roles).

#### Scenario: Single fetch on application mount

- **WHEN** the application renders and `AccessTreeProvider` mounts for the first time
- **THEN** the provider SHALL make exactly one HTTP GET request to `/api/user/orgs-and-projects`
- **AND** the provider SHALL store the response in context state accessible to all child components
- **AND** no additional requests SHALL be made until `refresh()` is explicitly called

#### Scenario: Shared state across multiple consumers

- **GIVEN** the `AccessTreeProvider` has fetched and stored access tree data
- **WHEN** multiple components render and call `useAccessTreeContext()`, `useOrganizations()`, or `useProjects()`
- **THEN** all components SHALL receive the same shared data instance
- **AND** no additional API requests SHALL be triggered by component renders

#### Scenario: Explicit refresh after data mutation

- **GIVEN** a user creates a new organization or project
- **WHEN** the creation succeeds and the component calls `refresh()` from the context
- **THEN** the provider SHALL make a new HTTP GET request to `/api/user/orgs-and-projects`
- **AND** all context consumers SHALL receive the updated data
- **AND** all consuming components SHALL re-render with the new data

### Requirement: Context Consumer Hook

The frontend application SHALL provide a `useAccessTreeContext()` hook that returns access tree data and utility functions from the context.

#### Scenario: Hook used inside provider boundary

- **GIVEN** a component is rendered within `<AccessTreeProvider>`
- **WHEN** the component calls `useAccessTreeContext()`
- **THEN** the hook SHALL return an object containing `{ tree, orgs, projects, getOrgRole, getProjectRole, loading, error, refresh }`
- **AND** the data SHALL be consistent with the provider's current state

#### Scenario: Hook used outside provider boundary

- **GIVEN** a component is rendered outside of `<AccessTreeProvider>`
- **WHEN** the component calls `useAccessTreeContext()`
- **THEN** the hook SHALL throw an error with a message indicating the provider is missing
- **AND** the error message SHALL guide developers to wrap the app with `<AccessTreeProvider>`

### Requirement: Backward Compatible Hook Facades

The frontend application SHALL maintain `useOrganizations()` and `useProjects()` hooks that internally consume the shared context, preserving their existing return interfaces.

#### Scenario: useOrganizations returns filtered org list

- **GIVEN** the access tree context has loaded data with organizations
- **WHEN** a component calls `useOrganizations()`
- **THEN** the hook SHALL return `{ orgs, loading, error, refresh, createOrg }` with the same shape as before
- **AND** `orgs` SHALL be derived from the shared context state
- **AND** calling `refresh()` SHALL trigger a context-level refresh affecting all consumers

#### Scenario: useProjects returns filtered project list

- **GIVEN** the access tree context has loaded data with projects
- **AND** an active organization is selected in config
- **WHEN** a component calls `useProjects()`
- **THEN** the hook SHALL return `{ projects, loading, error, refresh, createProject }` with the same shape as before
- **AND** `projects` SHALL be filtered by `activeOrgId` from the shared context state
- **AND** calling `refresh()` SHALL trigger a context-level refresh affecting all consumers

### Requirement: Loading State Management

The access tree context provider SHALL manage a single `loading` state that reflects the fetch status.

#### Scenario: Initial loading state

- **GIVEN** the `AccessTreeProvider` has just mounted
- **WHEN** the fetch request is in progress
- **THEN** `loading` SHALL be `true` for all context consumers
- **AND** components rendering loading spinners SHALL display them

#### Scenario: Loaded state

- **GIVEN** the fetch request has completed successfully
- **WHEN** context consumers read the `loading` state
- **THEN** `loading` SHALL be `false`
- **AND** `tree`, `orgs`, and `projects` SHALL contain the fetched data
- **AND** components SHALL render their normal UI

#### Scenario: Error state

- **GIVEN** the fetch request has failed with an error
- **WHEN** context consumers read the state
- **THEN** `loading` SHALL be `false`
- **AND** `error` SHALL contain an error message string
- **AND** components MAY display error UI to the user

### Requirement: Performance - Reduced API Calls

The frontend application SHALL minimize redundant API calls for access tree data across page navigation and component renders.

#### Scenario: Single call on page load

- **GIVEN** the user navigates to `/admin/apps/documents`
- **WHEN** the page renders with multiple components consuming access tree data (SetupGuard, AdminLayout, Topbar, OrgAndProjectGate)
- **THEN** the browser SHALL make exactly 1 HTTP GET request to `/api/user/orgs-and-projects`
- **AND** all components SHALL receive data from the shared context

#### Scenario: No redundant calls on component re-renders

- **GIVEN** the access tree data is already loaded in context
- **WHEN** a component re-renders due to state changes (e.g., UI interactions, route changes)
- **THEN** no additional API requests to `/api/user/orgs-and-projects` SHALL be triggered
- **AND** the component SHALL continue using cached data from context

### Requirement: Real-Time Data Updates Provider

The frontend application SHALL provide a `DataUpdatesProvider` React context that establishes and manages a Server-Sent Events (SSE) connection for receiving real-time entity updates.

#### Scenario: SSE connection established on mount

- **GIVEN** the `DataUpdatesProvider` is rendered with a valid `projectId`
- **WHEN** the provider mounts
- **THEN** it SHALL establish an SSE connection to `GET /api/events/stream`
- **AND** the connection SHALL include the JWT token for authentication
- **AND** the connection SHALL include the `X-Project-Id` header

#### Scenario: Automatic reconnection on connection loss

- **GIVEN** an active SSE connection exists
- **WHEN** the connection is lost (network error, server restart)
- **THEN** the provider SHALL automatically attempt to reconnect
- **AND** the connection state SHALL be updated to reflect the reconnection attempt

#### Scenario: Connection cleanup on unmount

- **GIVEN** an active SSE connection exists
- **WHEN** the `DataUpdatesProvider` unmounts
- **THEN** the SSE connection SHALL be closed
- **AND** all subscriptions SHALL be cleaned up

### Requirement: Entity Update Subscription Hook

The frontend application SHALL provide a `useDataUpdates` hook that allows components to subscribe to real-time entity updates with pattern-based filtering.

#### Scenario: Subscribe to all events for an entity type

- **GIVEN** a component calls `subscribe('document:*', callback)`
- **WHEN** an event is received for any document entity
- **THEN** the callback SHALL be invoked with the event payload
- **AND** events for other entity types SHALL NOT trigger the callback

#### Scenario: Subscribe to a specific entity

- **GIVEN** a component calls `subscribe('document:doc_123', callback)`
- **WHEN** an event is received for document `doc_123`
- **THEN** the callback SHALL be invoked with the event payload
- **AND** events for other document IDs SHALL NOT trigger the callback

#### Scenario: Unsubscribe on cleanup

- **GIVEN** a component has an active subscription
- **WHEN** the unsubscribe function (returned from `subscribe`) is called
- **THEN** the callback SHALL no longer be invoked for matching events

#### Scenario: Connection state exposure

- **GIVEN** a component uses the `useDataUpdates` hook
- **WHEN** the SSE connection state changes (connecting, connected, disconnected)
- **THEN** the hook SHALL expose the current `connectionState` value
- **AND** components MAY display connection status indicators

### Requirement: Enhanced SSE Hook

The frontend application SHALL provide an enhanced `useSSE` hook with reconnection logic, event type filtering, and connection state management.

#### Scenario: Reconnection with exponential backoff

- **GIVEN** an SSE connection fails
- **WHEN** automatic reconnection is attempted
- **THEN** the hook SHALL use exponential backoff between attempts
- **AND** the maximum retry interval SHALL be capped at 30 seconds

#### Scenario: Heartbeat handling

- **GIVEN** an active SSE connection
- **WHEN** a heartbeat event is received from the server
- **THEN** the hook SHALL update the last-seen timestamp
- **AND** connection health MAY be monitored based on heartbeat intervals

