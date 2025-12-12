# Technical Design: Real-Time Data Updates

## Context

The application currently uses a request-response model for all data fetching. Background processes (embedding generation, extraction jobs) update entity states asynchronously, but the frontend has no mechanism to receive these updates without manual page refresh.

**Stakeholders:**

- End users: Want to see real-time progress of document processing
- Developers: Need a reusable pattern for future real-time features

**Constraints:**

- Must work with existing authentication (JWT tokens)
- Must be project-scoped (users only see events for their active project)
- Should not require additional infrastructure (Redis, etc.) for MVP
- Must gracefully degrade if connection fails

## Goals / Non-Goals

### Goals

- Provide a general-purpose real-time update mechanism usable by any UI component
- Enable granular subscriptions (specific entity, entity type, or all)
- Minimize latency between backend state change and frontend update
- Keep implementation simple and maintainable

### Non-Goals

- Bidirectional communication (WebSocket) - SSE is sufficient for server-to-client
- Guaranteed delivery / message persistence - best-effort is acceptable
- Cross-project event visibility - events are always project-scoped
- Offline support / message queuing - out of scope for MVP

## Decisions

### Decision 1: SSE over WebSocket

**Choice:** Server-Sent Events (SSE)

**Rationale:**

- SSE already used in codebase (chat streaming, integration sync)
- Unidirectional (server→client) matches our use case perfectly
- Simpler than WebSocket (no handshake, auto-reconnect built into EventSource)
- Works through proxies and load balancers without special configuration
- Native browser support via `EventSource` API

**Alternatives Considered:**

- **WebSocket**: More complex, bidirectional not needed, would require new infrastructure
- **Polling**: Higher latency, more server load, poor UX for real-time feedback
- **Long polling**: Complex to implement correctly, SSE is superior

### Decision 2: In-Memory EventEmitter for MVP

**Choice:** NestJS `@nestjs/event-emitter` (wraps EventEmitter2)

**Rationale:**

- Zero additional infrastructure
- Already a NestJS pattern, easy to integrate
- Sufficient for single-instance deployments
- Can migrate to Redis pub/sub later if horizontal scaling needed

**Trade-offs:**

- Events not shared across multiple server instances
- If server restarts, active SSE connections are lost (clients reconnect automatically)

**Migration Path:**

- Replace in-memory emitter with Redis adapter when needed
- No changes required to event publishers or SSE controller

### Decision 3: Project-Scoped Event Channels

**Choice:** Events are always scoped to a projectId

**Rationale:**

- Matches existing authorization model (all data is project-scoped)
- Prevents information leakage between projects
- Reduces noise (clients only receive relevant events)

**Implementation:**

```typescript
// Event channel format: `events.${projectId}`
// Example: events.proj_abc123

// Event payload format:
{
  type: 'entity.updated',
  entity: 'document',
  id: 'doc_xyz',
  projectId: 'proj_abc123',
  data: { embeddedChunks: 5, chunks: 10 },
  timestamp: '2025-12-04T12:00:00Z'
}
```

### Decision 4: Subscription Filtering on Client

**Choice:** Server sends all project events; client filters by subscription

**Rationale:**

- Simpler server implementation (one stream per project)
- Client can dynamically change subscriptions without reconnecting
- Filtering is cheap on client side
- Reduces complexity of managing per-entity server subscriptions

**Alternative Considered:**

- Server-side filtering: More complex, requires subscription management, harder to debug

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SERVER                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐                                               │
│  │  Chunk Embedding     │                                               │
│  │  Worker Service      │──┐                                            │
│  └──────────────────────┘  │                                            │
│                            │    ┌─────────────────────┐                 │
│  ┌──────────────────────┐  │    │                     │                 │
│  │  Extraction Worker   │──┼───▶│  EventEmitter2      │                 │
│  │  Service             │  │    │  (NestJS Module)    │                 │
│  └──────────────────────┘  │    │                     │                 │
│                            │    └──────────┬──────────┘                 │
│  ┌──────────────────────┐  │               │                            │
│  │  Document Service    │──┘               │ subscribe('events.*')      │
│  │  (CRUD operations)   │                  │                            │
│  └──────────────────────┘                  ▼                            │
│                              ┌─────────────────────────┐                │
│                              │  Events SSE Controller  │                │
│                              │  GET /api/events/stream │                │
│                              └───────────┬─────────────┘                │
│                                          │                              │
└──────────────────────────────────────────│──────────────────────────────┘
                                           │ SSE Stream
                                           │ (text/event-stream)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    DataUpdatesProvider                           │    │
│  │  ┌───────────────────┐    ┌─────────────────────────────────┐   │    │
│  │  │  useSSE hook      │───▶│  Subscription Registry          │   │    │
│  │  │  (EventSource)    │    │  Map<pattern, Set<callback>>    │   │    │
│  │  └───────────────────┘    └─────────────────────────────────┘   │    │
│  └──────────────────────────────────────┬──────────────────────────┘    │
│                                         │                                │
│                    ┌────────────────────┼────────────────────┐          │
│                    │                    │                    │          │
│                    ▼                    ▼                    ▼          │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────┐  │
│  │  DocumentsTable     │  │  ChunksTable        │  │  StatusBadge   │  │
│  │  subscribe('doc:*') │  │  subscribe('chunk:*)│  │  subscribe(id) │  │
│  └─────────────────────┘  └─────────────────────┘  └────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Event Flow

```
1. Background Worker completes embedding for chunk
   │
   ▼
2. Worker emits: eventEmitter.emit('events.proj_123', {
     type: 'entity.updated',
     entity: 'document',
     id: 'doc_456',
     data: { embeddedChunks: 5, chunks: 10 }
   })
   │
   ▼
3. SSE Controller (subscribed to 'events.*') receives event
   │
   ▼
4. Controller writes to all SSE connections for proj_123:
   event: entity.updated
   data: {"entity":"document","id":"doc_456","data":{...}}
   │
   ▼
5. Browser EventSource receives message
   │
   ▼
6. useDataUpdates dispatches to matching subscribers:
   - 'document:*' callbacks receive event
   - 'document:doc_456' callbacks receive event
   │
   ▼
7. DocumentsTable callback updates local state for doc_456
```

### API Design

#### SSE Endpoint

```
GET /api/events/stream
Authorization: Bearer <jwt>
X-Project-Id: <projectId>

Response: text/event-stream

event: connected
data: {"connectionId":"conn_abc","projectId":"proj_123"}

event: entity.updated
data: {"entity":"document","id":"doc_456","data":{"embeddedChunks":5}}

event: heartbeat
data: {"timestamp":"2025-12-04T12:00:00Z"}
```

#### Event Payload Schema

```typescript
interface EntityEvent {
  type: 'entity.created' | 'entity.updated' | 'entity.deleted' | 'entity.batch';
  entity:
    | 'document'
    | 'chunk'
    | 'extraction_job'
    | 'graph_object'
    | 'notification';
  id: string; // Entity ID (or null for batch)
  ids?: string[]; // For batch events
  projectId: string;
  data?: Record<string, any>; // Partial update payload
  timestamp: string; // ISO 8601
}
```

### Frontend Hook API

```typescript
// Context Provider (wrap app or specific sections)
<DataUpdatesProvider projectId={activeProjectId}>
  <DocumentsPage />
</DataUpdatesProvider>;

// Hook usage in components
function DocumentsTable() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const { subscribe, connectionState } = useDataUpdates();

  useEffect(() => {
    // Subscribe to all document events
    return subscribe('document:*', (event) => {
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === event.id ? { ...doc, ...event.data } : doc
        )
      );
    });
  }, [subscribe]);

  // Show connection indicator
  return (
    <>
      {connectionState === 'connecting' && <ConnectionIndicator />}
      <Table data={documents} />
    </>
  );
}

// Granular subscription (single entity)
function EmbeddingProgress({ documentId }) {
  const [progress, setProgress] = useState({ embedded: 0, total: 0 });
  const { subscribe } = useDataUpdates();

  useEffect(() => {
    return subscribe(`document:${documentId}`, (event) => {
      if (event.data.embeddedChunks !== undefined) {
        setProgress({
          embedded: event.data.embeddedChunks,
          total: event.data.chunks,
        });
      }
    });
  }, [documentId, subscribe]);

  return <ProgressBar value={progress.embedded} max={progress.total} />;
}
```

## Risks / Trade-offs

| Risk                                     | Mitigation                                                 |
| ---------------------------------------- | ---------------------------------------------------------- |
| SSE connection drops silently            | EventSource auto-reconnects; add heartbeat every 30s       |
| Too many events overwhelm client         | Debounce/batch events on server for high-frequency updates |
| Memory leak from forgotten subscriptions | Return unsubscribe function; useEffect cleanup pattern     |
| Single server instance limitation        | Document as known limitation; Redis adapter path available |
| Stale data on initial load               | SSE supplements, doesn't replace initial fetch             |

## Migration Plan

### Phase 1: MVP (This Change)

1. Implement Events module with in-memory EventEmitter
2. Add SSE endpoint with JWT auth and project scoping
3. Create frontend hooks and provider
4. Integrate with Documents table (embedding status)

### Phase 2: Expansion (Future)

- Add events to extraction jobs, graph operations
- Integrate with more UI components
- Add connection state indicator to app shell

### Phase 3: Scale (If Needed)

- Replace EventEmitter with Redis pub/sub
- Add event persistence for replay on reconnect
- Implement backpressure handling

## Open Questions

1. **Event batching**: Should we batch rapid-fire events (e.g., 10 chunks embedded in 1 second)?

   - _Proposed_: Yes, batch with 100ms debounce on server

2. **Reconnection state**: Should we refetch full data on reconnect, or trust current state?

   - _Proposed_: Refetch on reconnect to ensure consistency

3. **Connection indicator**: Should we show a global "real-time connected" indicator?
   - _Proposed_: Optional, low priority for MVP
