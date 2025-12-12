# Change: Add Real-Time Data Updates via Server-Sent Events

## Why

Currently, data displayed in tables (Documents, Chunks, etc.) becomes stale immediately after loading. Background processes like embedding generation update entity states continuously, but users only see these changes after manual page refresh. This creates confusion and poor UX:

- Users see "0/5 embeddings" status that never updates without refresh
- Extraction job progress isn't visible in real-time
- Any async operation requires manual refresh to see results
- Multiple browser tabs show inconsistent data

A general-purpose real-time update mechanism will:

1. Provide immediate feedback for background operations (embedding progress, extraction jobs)
2. Keep all connected clients in sync with current data state
3. Enable future real-time features without per-feature infrastructure work

## What Changes

### Backend (Server)

- **New Events Module**: Central pub/sub event bus using NestJS EventEmitter2
- **New SSE Controller**: `GET /api/events/stream` endpoint for real-time updates
- **Event Publishing**: Background workers (embedding, extraction) emit events on state changes
- **Connection Management**: Track active SSE connections per user/project with heartbeat

### Frontend (Admin)

- **New `useDataUpdates` Hook**: Subscribe to entity change events, merge updates into local state
- **Enhanced `useSSE` Hook**: Add reconnection logic, event type filtering, connection state
- **Table Integration**: Documents, Chunks, and other tables subscribe to relevant events

### Event Types

- `entity.updated` - Entity field(s) changed (e.g., embedding count increased)
- `entity.created` - New entity created
- `entity.deleted` - Entity removed
- `entity.batch` - Multiple entities changed (for bulk operations)

## Impact

### Affected Specs

- `frontend-data-fetching` - New requirements for real-time data synchronization
- `document-management` - New requirements for real-time status updates

### Affected Code

**Server:**

- `apps/server/src/modules/events/` (new module)
- `apps/server/src/modules/chunks/chunk-embedding-worker.service.ts` (emit events)
- `apps/server/src/modules/extraction-jobs/` (emit events)
- `apps/server/src/app.module.ts` (register EventEmitter2)

**Admin:**

- `apps/admin/src/hooks/use-sse.ts` (enhance)
- `apps/admin/src/hooks/use-data-updates.ts` (new)
- `apps/admin/src/pages/admin/apps/documents/index.tsx` (integrate)
- `apps/admin/src/pages/admin/apps/chunks/index.tsx` (integrate)

### Breaking Changes

None. This is purely additive - existing data fetching continues to work.

### Performance Considerations

- SSE connections are lightweight (single TCP connection per client)
- Events are scoped by projectId to minimize traffic
- Backend uses in-memory EventEmitter (no Redis required for MVP)
- Graceful degradation: if SSE fails, manual refresh still works
