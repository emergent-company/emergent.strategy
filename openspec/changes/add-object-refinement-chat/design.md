## Context

Users have extracted knowledge graph objects from documents, but these objects often need refinement:

- Descriptions may be too verbose or unclear
- Object names may not follow conventions
- Relationships may be missing or incorrect
- Properties may need adjustment

Currently, users must manually edit each property through form fields. A chat-based interface allows natural language refinement with LLM assistance.

### Stakeholders

- End users editing objects
- Project collaborators who share the refinement chat
- Administrators reviewing changes

### Constraints

- Must integrate with existing AI SDK chat infrastructure
- Must maintain audit trail for compliance
- Must work within existing multi-tenant RLS model
- Shared chat must handle concurrent users gracefully

## Goals / Non-Goals

### Goals

- Enable natural language object refinement through chat
- Provide LLM-suggested changes with clear diffs
- Support all change types: properties, relationships, metadata
- Share refinement chat across project users
- Track refinement history for audit
- Integrate with existing ObjectDetailModal UI

### Non-Goals

- Bulk refinement across multiple objects (future)
- Automated refinement without user confirmation (future)
- Task/suggestion queue system (future - keep changes on chat level for now)
- Custom refinement agents/personas (future)

## Decisions

### Decision 1: Object-Chunk Join Table (`object_chunks`)

**What**: Create a proper join table to track which chunks each object was extracted from.

**Why**:

- Current approach stores `_extraction_source_id` in properties (unstructured)
- Join table enables efficient queries for "get all chunks for object"
- Supports objects extracted from multiple chunks/documents
- Enables proper foreign key constraints and indexing

**Schema**:

```sql
CREATE TABLE kb.object_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES kb.chunks(id) ON DELETE CASCADE,
  extraction_job_id UUID REFERENCES kb.object_extraction_jobs(id),
  confidence REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(object_id, chunk_id)
);
```

**Alternatives considered**:

- Keep properties-based approach: Rejected - poor queryability, no referential integrity
- Store chunk IDs in array column: Rejected - no FK constraints, harder to query

### Decision 2: Extend Chat Conversations for Object Scope

**What**: Add `object_id` column to `chat_conversations` table.

**Why**:

- Reuse existing conversation infrastructure
- Simple query for "get refinement chat for object"
- Leverages existing message storage, streaming, etc.

**Schema change**:

```sql
ALTER TABLE kb.chat_conversations
  ADD COLUMN object_id UUID REFERENCES kb.graph_objects(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX idx_chat_conversations_object_id
  ON kb.chat_conversations(object_id)
  WHERE object_id IS NOT NULL;
```

**Alternatives considered**:

- Separate `object_refinement_chats` table: Rejected - duplicates conversation logic
- Store conversation ID in object properties: Rejected - less queryable

### Decision 3: Structured Change Suggestions with Diff Format

**What**: LLM returns structured JSON describing proposed changes; frontend renders as diff.

**Why**:

- Clear separation between suggestion and application
- Enables user review before commit
- Supports partial acceptance (accept some changes, reject others)
- Machine-readable for audit trail

**Change suggestion schema**:

```typescript
interface RefinementSuggestion {
  type:
    | 'property_change'
    | 'relationship_add'
    | 'relationship_remove'
    | 'rename';
  target: {
    objectId: string;
    field?: string; // for property changes
    relationshipType?: string; // for relationship changes
    targetObjectId?: string; // for relationship changes
  };
  before: any; // current value
  after: any; // proposed value
  reasoning: string; // LLM explanation
}
```

**Alternatives considered**:

- Free-form text diffs: Rejected - hard to parse, can't selectively apply
- Automatic application: Rejected - user confirmed we want explicit approval

### Decision 4: Context Assembly Strategy

**What**: Assemble rich context including object, all related objects (full details), and source chunks.

**Context structure**:

```typescript
interface RefinementContext {
  object: {
    id: string;
    type: string;
    key: string;
    properties: Record<string, any>;
    labels: string[];
    version: number;
  };
  relationships: {
    outgoing: Array<{
      type: string;
      target: ObjectDetails; // full details, not just ID
    }>;
    incoming: Array<{
      type: string;
      source: ObjectDetails;
    }>;
  };
  sourceChunks: Array<{
    id: string;
    text: string;
    documentTitle: string;
    documentId: string;
  }>;
  schema: {
    objectType: ObjectTypeDefinition;
    relationshipTypes: RelationshipTypeDefinition[];
  };
}
```

**Why full related object details**: User clarified they want complete context for all related objects to enable LLM to make informed suggestions.

### Decision 5: Two-Column Layout with Independent Navigation

**What**: Expand `ObjectDetailModal` to a two-column layout: left column for object details (existing tabs), right column for refinement chat. Both columns operate independently.

**Layout**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Object: My Requirement                                    [×]      │
├────────────────────────────────────┬────────────────────────────────┤
│  [Properties] [Relations] [System] │  Refinement Chat               │
│  [History]                         │                                │
├────────────────────────────────────┼────────────────────────────────│
│                                    │  ┌──────────────────────────┐  │
│  Name: My Requirement              │  │ User: Make the           │  │
│  Type: Requirement                 │  │ description shorter      │  │
│  Description: This is a long...    │  └──────────────────────────┘  │
│                                    │  ┌──────────────────────────┐  │
│  Properties:                       │  │ AI: Here's a suggestion: │  │
│  • priority: high                  │  │ ┌────────────────────┐   │  │
│  • status: draft                   │  │ │ description:       │   │  │
│                                    │  │ │ - "This is a long  │   │  │
│  (scrollable)                      │  │ │   description..."  │   │  │
│                                    │  │ │ + "Shorter desc."  │   │  │
│                                    │  │ └────────────────────┘   │  │
│                                    │  │ [Accept] [Reject]        │  │
│                                    │  └──────────────────────────┘  │
│                                    │                                │
│                                    │  ┌──────────────────────────┐  │
│                                    │  │ Type your message...     │  │
│                                    │  └──────────────────────────┘  │
└────────────────────────────────────┴────────────────────────────────┘
```

**Implementation**:

- Modal width expands (e.g., `max-w-6xl` or `max-w-7xl`)
- Left column: existing tabs (properties, relationships, system, history) - independent scroll
- Right column: refinement chat - independent scroll
- User can switch tabs on left while chat remains visible on right
- Responsive: stack vertically on small screens, or hide chat behind toggle

**Why**:

- User explicitly requested ability to browse details and chat independently
- Seeing object details while chatting provides better context for refinement
- No need for separate tab or slide-out - chat is always accessible

**Alternatives considered**:

- Chat as separate tab: Rejected - can't see details while chatting
- Slide-out panel: Rejected - obscures content, less integrated
- Separate modal: Rejected - loses context, poor UX

### Decision 6: Shared Chat with Optimistic UI

**What**: Single refinement chat per object, visible to all project users, with optimistic UI updates.

**Implementation**:

- Use existing `isPrivate: false` on conversation
- Poll for new messages or use WebSocket (defer WebSocket to future)
- Optimistic UI for own messages, reconcile on response
- Show other users' messages with attribution

**Alternatives considered**:

- Real-time WebSocket: Deferred - adds complexity, polling sufficient for MVP
- Per-user private chats: Rejected - user wants shared context

### Decision 7: Audit Trail via Message Metadata

**What**: Store applied changes in chat message metadata.

**Schema**:

```typescript
// In ChatMessage.citations (or new metadata column)
{
  refinementApplied: {
    timestamp: string;
    userId: string;
    changes: RefinementSuggestion[];
    objectVersionBefore: number;
    objectVersionAfter: number;
  }
}
```

**Why**:

- Links each object version to the refinement conversation
- Enables "why did this change?" queries
- Leverages existing message storage

## Risks / Trade-offs

### Risk: LLM Suggests Invalid Changes

- **Mitigation**: Validate all changes against schema before allowing confirmation
- **Mitigation**: Show clear error if suggested change is invalid

### Risk: Concurrent Edits Conflict

- **Mitigation**: Use optimistic locking (version column)
- **Mitigation**: Show "object was modified" error if version mismatch
- **Mitigation**: Reload context and re-request suggestion if conflict

### Risk: Large Context Exceeds Token Limit

- **Mitigation**: Summarize distant relationships if graph is large
- **Mitigation**: Paginate source chunks, prioritize by relevance
- **Mitigation**: Use embedding similarity to select most relevant chunks

### Trade-off: Polling vs WebSocket

- Chose polling for simplicity in MVP
- Can upgrade to WebSocket for real-time collaboration later

## Migration Plan

1. **Phase 1: Schema** - Create `object_chunks` table, add `object_id` to conversations
2. **Phase 2: Backfill** - Migrate `_extraction_source_id` properties to `object_chunks`
3. **Phase 3: Backend** - New refinement service and endpoints
4. **Phase 4: Frontend** - Chat component integration
5. **Rollback**: Drop new columns/tables; no breaking changes to existing features

## Open Questions

1. **Token limit handling**: What's the max context size we should assemble? Should we dynamically adjust based on model?
2. **Relationship depth**: Should we include relationships of related objects (2 hops) or just direct relationships?
3. **Schema validation**: Should the LLM be constrained to only suggest changes valid per the template pack schema?
4. **Notification**: Should project users be notified when someone refines an object?
