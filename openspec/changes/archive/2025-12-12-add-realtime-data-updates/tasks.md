# Tasks: Add Real-Time Data Updates

## 1. Backend Infrastructure

- [ ] 1.1 Install `@nestjs/event-emitter` package
- [ ] 1.2 Create `EventsModule` at `apps/server/src/modules/events/`
- [ ] 1.3 Create `EventsService` for publishing events
- [ ] 1.4 Create `EventsController` with SSE endpoint `GET /api/events/stream`
- [ ] 1.5 Implement JWT authentication for SSE endpoint
- [ ] 1.6 Implement project-scoped event channels
- [ ] 1.7 Add heartbeat mechanism (30s interval)
- [ ] 1.8 Register EventsModule in AppModule

## 2. Event Publishing

- [ ] 2.1 Add event emission to `ChunkEmbeddingWorkerService` (embedding progress)
- [ ] 2.2 Add event emission to extraction job completion
- [ ] 2.3 Add event emission to document CRUD operations
- [ ] 2.4 Define event payload types in shared types

## 3. Frontend Infrastructure

- [ ] 3.1 Enhance `useSSE` hook with reconnection logic and connection state
- [ ] 3.2 Create `DataUpdatesProvider` context
- [ ] 3.3 Create `useDataUpdates` hook with subscription pattern
- [ ] 3.4 Add event type filtering and pattern matching (`document:*`, `document:id`)

## 4. Frontend Integration

- [ ] 4.1 Integrate real-time updates in Documents table (embedding status)
- [ ] 4.2 Integrate real-time updates in Chunks table
- [ ] 4.3 Add optional connection state indicator

## 5. Testing

- [ ] 5.1 Write unit tests for EventsService
- [ ] 5.2 Write unit tests for useDataUpdates hook
- [ ] 5.3 Write integration test for SSE endpoint
- [ ] 5.4 Manual testing of real-time embedding progress

## 6. Documentation

- [ ] 6.1 Update API documentation with SSE endpoint
- [ ] 6.2 Add usage examples for useDataUpdates hook
