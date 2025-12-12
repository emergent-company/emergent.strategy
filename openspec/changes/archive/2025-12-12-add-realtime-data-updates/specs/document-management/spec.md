## ADDED Requirements

### Requirement: Real-Time Document Status Updates

The document management system SHALL emit real-time events when document status changes occur, enabling connected clients to receive updates without manual refresh.

#### Scenario: Embedding progress update event

- **GIVEN** a document has chunks being processed for embeddings
- **WHEN** a chunk embedding is completed
- **THEN** an `entity.updated` event SHALL be emitted with the document ID
- **AND** the event payload SHALL include the updated `embeddedChunks` count
- **AND** all connected clients viewing that project SHALL receive the event

#### Scenario: Document creation event

- **GIVEN** a user uploads a new document
- **WHEN** the document is successfully created
- **THEN** an `entity.created` event SHALL be emitted with the document ID
- **AND** all connected clients viewing that project SHALL receive the event

#### Scenario: Document deletion event

- **GIVEN** a user deletes a document
- **WHEN** the document is successfully deleted
- **THEN** an `entity.deleted` event SHALL be emitted with the document ID
- **AND** all connected clients viewing that project SHALL receive the event

### Requirement: Server-Sent Events Endpoint

The server SHALL provide an SSE endpoint for real-time event streaming to authenticated clients.

#### Scenario: Authenticated SSE connection

- **GIVEN** a client makes a GET request to `/api/events/stream`
- **AND** the request includes a valid JWT token
- **AND** the request includes a valid `X-Project-Id` header
- **WHEN** the connection is established
- **THEN** the server SHALL return a `text/event-stream` response
- **AND** the server SHALL send a `connected` event with connection metadata

#### Scenario: Project-scoped events

- **GIVEN** an active SSE connection for project A
- **WHEN** events are emitted for project A and project B
- **THEN** only events for project A SHALL be sent to the client
- **AND** events for project B SHALL NOT be sent

#### Scenario: Heartbeat mechanism

- **GIVEN** an active SSE connection
- **WHEN** 30 seconds have elapsed since the last event
- **THEN** the server SHALL send a `heartbeat` event
- **AND** the heartbeat SHALL include a timestamp

#### Scenario: Unauthenticated request rejection

- **GIVEN** a client makes a GET request to `/api/events/stream`
- **WHEN** the request does not include a valid JWT token
- **THEN** the server SHALL return a 401 Unauthorized response

### Requirement: Event Bus Infrastructure

The server SHALL provide a central event bus for publishing and subscribing to entity events.

#### Scenario: Event publishing

- **GIVEN** a service needs to emit an entity event
- **WHEN** the service calls `eventsService.emit(event)`
- **THEN** the event SHALL be published to the in-memory event bus
- **AND** all subscribers for that project channel SHALL receive the event

#### Scenario: Event payload structure

- **GIVEN** an entity event is emitted
- **THEN** the event payload SHALL include:
  - `type`: One of `entity.created`, `entity.updated`, `entity.deleted`, `entity.batch`
  - `entity`: The entity type (e.g., `document`, `chunk`, `extraction_job`)
  - `id`: The entity ID
  - `projectId`: The project ID
  - `data`: Optional partial update payload
  - `timestamp`: ISO 8601 timestamp
