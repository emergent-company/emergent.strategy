## ADDED Requirements

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
