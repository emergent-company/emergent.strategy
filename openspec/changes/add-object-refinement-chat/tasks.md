# Tasks for add-object-refinement-chat

## 1. Database Schema

- [ ] 1.1 Create migration for `object_chunks` join table

  - Columns: id, object_id (FK), chunk_id (FK), extraction_job_id (FK), confidence, created_at
  - Indexes: object_id, chunk_id, unique(object_id, chunk_id)
  - Cascade delete on object deletion

- [ ] 1.2 Create migration to add `object_id` to `chat_conversations`

  - Nullable UUID column with FK to graph_objects
  - Unique partial index WHERE object_id IS NOT NULL

- [ ] 1.3 Create `ObjectChunk` entity in `apps/server/src/entities/`

  - Define TypeORM entity with proper relations

- [ ] 1.4 Update `ChatConversation` entity to include optional `objectId`

- [ ] 1.5 Backfill existing `_extraction_source_id` properties to `object_chunks` table
  - Write script to migrate existing data
  - Preserve extraction job links where available

## 2. Backend Services

- [ ] 2.1 Create `ObjectRefinementModule` in `apps/server/src/modules/object-refinement/`

  - Import GraphModule, ChatModule, ChunksModule

- [ ] 2.2 Create `ObjectRefinementService` with methods:

  - `getOrCreateConversation(objectId, projectId, userId)`
  - `assembleContext(objectId)` - gather object, relationships, chunks
  - `applyChange(objectId, suggestion, userId)` - apply with version check
  - `recordSuggestionStatus(messageId, suggestionIndex, status, userId)`

- [ ] 2.3 Create `RefinementContextAssembler` service

  - Fetch object with all properties
  - Fetch all outgoing relationships with full target object details
  - Fetch all incoming relationships with full source object details
  - Fetch source chunks via object_chunks join
  - Fetch object type schema from template pack
  - Handle token limit truncation

- [ ] 2.4 Create `RefinementPromptBuilder` service

  - Build system prompt with object context
  - Include schema constraints for valid changes
  - Format relationship options and valid types

- [ ] 2.5 Extend `GraphService` with refinement attribution

  - Add `updateObjectFromRefinement(objectId, changes, conversationId, userId)`
  - Create new version with `change_summary` linking to refinement
  - Handle relationship add/remove with attribution

- [ ] 2.6 Create `ObjectChunksService` for provenance queries
  - `getChunksForObject(objectId)`
  - `linkChunkToObject(objectId, chunkId, jobId, confidence)`
  - `unlinkChunk(objectId, chunkId)`

## 3. API Endpoints

- [ ] 3.1 Create `ObjectRefinementController` with endpoints:

  - `GET /api/objects/:objectId/refinement-chat` - get or create conversation
  - `POST /api/objects/:objectId/refinement-chat` - send message (streaming)
  - `POST /api/objects/:objectId/refinement-chat/apply` - apply suggestion
  - `POST /api/objects/:objectId/refinement-chat/reject` - reject suggestion

- [ ] 3.2 Implement streaming response using LangChainAdapter

  - Reuse existing LangGraph infrastructure
  - Include structured suggestions in stream data

- [ ] 3.3 Add DTOs for refinement requests/responses

  - `RefinementMessageDto`
  - `RefinementSuggestionDto`
  - `ApplySuggestionDto`

- [ ] 3.4 Add authorization guards
  - Verify user has project write access
  - Verify object belongs to accessible project

## 4. LLM Integration

- [ ] 4.1 Create refinement system prompt template

  - Include object context format
  - Define structured suggestion output format
  - Include examples of each suggestion type

- [ ] 4.2 Define response schema for structured suggestions

  - Property changes with before/after
  - Relationship additions/removals
  - Object renames with conflict checking

- [ ] 4.3 Implement suggestion parsing from LLM response

  - Extract structured JSON from response
  - Validate against schema
  - Handle parsing errors gracefully

- [ ] 4.4 Add Langfuse tracing for refinement conversations
  - Tag traces with object_id
  - Track suggestion acceptance rates

## 5. Frontend Components

- [ ] 5.1 Create `useObjectRefinementChat` hook

  - Wrap `useChat` with object-specific configuration
  - Handle suggestion parsing from stream
  - Manage accept/reject API calls

- [ ] 5.2 Create `ObjectRefinementChat` component

  - Message list with user attribution
  - Input field with submit handling
  - Loading states during streaming

- [ ] 5.3 Create `RefinementSuggestionDiff` component

  - Display before/after values
  - Syntax highlighting for properties
  - Accept/Reject buttons
  - Status indicator (pending, accepted, rejected)

- [ ] 5.4 Create `PropertyDiff` sub-component

  - Side-by-side or unified diff view
  - Highlight changed portions

- [ ] 5.5 Create `RelationshipDiff` sub-component

  - Show relationship type and target object
  - Visual indicator for add vs remove

- [ ] 5.6 Integrate into `ObjectDetailModal`

  - Add "Refine" tab or slide-out panel
  - Load existing conversation on open
  - Show chat UI with context sidebar

- [ ] 5.7 Implement polling for shared chat updates
  - Poll every 5 seconds for new messages
  - Merge new messages without duplicate
  - Show "new message" indicator

## 6. Testing

- [ ] 6.1 Unit tests for `ObjectRefinementService`

  - Context assembly
  - Change application
  - Version conflict handling

- [ ] 6.2 Unit tests for `RefinementContextAssembler`

  - Token limit truncation
  - Relationship fetching
  - Chunk fetching

- [ ] 6.3 Integration tests for refinement API

  - Create conversation flow
  - Apply suggestion flow
  - Reject suggestion flow
  - Version conflict detection

- [ ] 6.4 Frontend component tests

  - RefinementSuggestionDiff rendering
  - Accept/Reject button handling
  - Polling for new messages

- [ ] 6.5 E2E test for refinement workflow
  - Open object detail
  - Open refinement chat
  - Send message
  - Accept suggestion
  - Verify object updated

## 7. Documentation

- [ ] 7.1 Add API documentation for refinement endpoints

  - OpenAPI annotations

- [ ] 7.2 Update user guide with refinement feature
  - How to access
  - Example interactions
  - Suggestion types explained

## 8. Validation

- [ ] 8.1 Run `openspec validate add-object-refinement-chat --strict`
- [ ] 8.2 Review and address any validation issues
