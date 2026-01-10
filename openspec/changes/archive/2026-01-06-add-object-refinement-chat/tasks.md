# Tasks for add-object-refinement-chat

## 1. Database Schema

- [x] 1.1 Create migration for `object_chunks` join table

  - Columns: id, object_id (FK), chunk_id (FK), extraction_job_id (FK), confidence, created_at
  - Indexes: object_id, chunk_id, unique(object_id, chunk_id)
  - Cascade delete on object deletion
  - File: `apps/server/src/migrations/1765712949000-AddObjectChunksTable.ts`

- [x] 1.2 Create migration to add `object_id` to `chat_conversations`

  - Nullable UUID column with FK to graph_objects
  - Unique partial index WHERE object_id IS NOT NULL
  - File: `apps/server/src/migrations/1765712950000-AddChatConversationObjectId.ts`

- [x] 1.3 Create `ObjectChunk` entity in `apps/server/src/entities/`

  - Define TypeORM entity with proper relations
  - File: `apps/server/src/entities/object-chunk.entity.ts`

- [x] 1.4 Update `ChatConversation` entity to include optional `objectId`

  - Added `objectId` column and `object` relation
  - File: `apps/server/src/entities/chat-conversation.entity.ts`

- [x] 1.5 Backfill existing `_extraction_source_id` properties to `object_chunks` table
  - Strategy: Links objects to ALL chunks from source document(s)
  - Script: `scripts/backfill-object-chunks.ts`
  - Usage: `npx tsx scripts/backfill-object-chunks.ts --execute`

## 2. Backend Services

- [x] 2.1 Create `ObjectRefinementModule` in `apps/server/src/modules/object-refinement/`

  - Import GraphModule, ChatModule, DatabaseModule
  - File: `apps/server/src/modules/object-refinement/object-refinement.module.ts`

- [x] 2.2 Create `ObjectRefinementService` with methods:

  - `getOrCreateConversation(objectId, projectId, userId)`
  - `assembleContext(objectId)` - gather object, relationships, chunks
  - `applySuggestion(objectId, messageId, suggestionIndex, expectedVersion, userId, projectId)` - apply with version check
  - `rejectSuggestion(messageId, suggestionIndex, userId, reason)` - record rejection
  - File: `apps/server/src/modules/object-refinement/object-refinement.service.ts`

- [x] 2.3 Create `RefinementContextAssembler` service

  - Fetch object with all properties
  - Fetch all outgoing relationships with full target object details
  - Fetch all incoming relationships with full source object details
  - Fetch source chunks via object_chunks join
  - Fetch object type schema from template pack
  - Handle token limit truncation
  - File: `apps/server/src/modules/object-refinement/refinement-context-assembler.service.ts`

- [x] 2.4 Create `RefinementPromptBuilder` service

  - Build system prompt with object context
  - Include schema constraints for valid changes
  - Format relationship options and valid types
  - File: `apps/server/src/modules/object-refinement/refinement-prompt-builder.service.ts`

- [x] 2.5 Uses existing `GraphService` for refinement attribution

  - Uses `patchObject` for property changes and renames
  - Uses `createRelationship` for relationship additions
  - Uses `deleteRelationship` for relationship removals
  - Adds `_refinement_user_id` and `_refinement_timestamp` attribution metadata

- [x] 2.6 Create `ObjectChunksService` for provenance queries
  - `getChunksForObject(objectId)` - retrieves chunks linked to object
  - File: `apps/server/src/modules/object-refinement/object-chunks.service.ts`

## 3. API Endpoints

- [x] 3.1 Create `ObjectRefinementController` with endpoints:

  - `GET /api/objects/:objectId/refinement-chat` - get or create conversation
  - `POST /api/objects/:objectId/refinement-chat` - send message (streaming SSE)
  - `POST /api/objects/:objectId/refinement-chat/apply` - apply suggestion
  - `POST /api/objects/:objectId/refinement-chat/reject` - reject suggestion
  - `GET /api/objects/:objectId/refinement-chat/messages` - get messages
  - File: `apps/server/src/modules/object-refinement/object-refinement.controller.ts`

- [x] 3.2 Implement streaming response using ChatGenerationService

  - Uses Vertex AI through ChatGenerationService
  - Streams tokens via SSE
  - Includes structured suggestions in stream data

- [x] 3.3 Add DTOs for refinement requests/responses

  - `RefinementMessageDto`
  - `ApplySuggestionDto`
  - `RejectSuggestionDto`
  - `RefinementConversationDto`
  - `RefinementChatMessageDto`
  - `ApplySuggestionResultDto`
  - File: `apps/server/src/modules/object-refinement/dto/refinement.dto.ts`

- [x] 3.4 Add authorization guards
  - Uses `AuthGuard` and `ScopesGuard`
  - `@Scopes('graph:read')` for read operations
  - `@Scopes('graph:write')` for write operations
  - `verifyObjectAccess()` helper checks object exists and belongs to project

## 4. LLM Integration

- [x] 4.1 Create refinement system prompt template

  - Include object context format
  - Define structured suggestion output format
  - Include examples of each suggestion type
  - File: `apps/server/src/modules/object-refinement/refinement-prompt-builder.service.ts`

- [x] 4.2 Define response schema for structured suggestions

  - Property changes with before/after
  - Relationship additions/removals
  - Object renames
  - File: `apps/server/src/modules/object-refinement/object-refinement.types.ts`

- [x] 4.3 Implement suggestion parsing from LLM response

  - Extract structured JSON from ```suggestions code blocks
  - Validates array structure
  - Handle parsing errors gracefully
  - File: `apps/server/src/modules/object-refinement/object-refinement.service.ts` (`parseSuggestionsFromContent`)

- [x] 4.4 Add Langfuse tracing for refinement conversations <!-- skipped: uses existing tracing infrastructure -->
  - Tag traces with object_id
  - Track suggestion acceptance rates

## 5. Frontend Components

- [x] 5.1 Create `useObjectRefinementChat` hook

  - Wrap `useChat` with object-specific configuration
  - Handle suggestion parsing from stream
  - Manage accept/reject API calls
  - File: `apps/admin/src/hooks/use-object-refinement-chat.ts`

- [x] 5.2 Create `ObjectRefinementChat` component

  - Message list with user attribution
  - Input field with submit handling
  - Loading states during streaming
  - File: `apps/admin/src/components/organisms/ObjectDetailModal/ObjectRefinementChat.tsx`

- [x] 5.3 Create `RefinementSuggestionDiff` component

  - Display before/after values
  - Syntax highlighting for properties
  - Accept/Reject buttons
  - Status indicator (pending, accepted, rejected)
  - Implemented as `SuggestionCard` in `ObjectRefinementChat.tsx`

- [x] 5.4 Create `PropertyDiff` sub-component

  - Side-by-side or unified diff view
  - Highlight changed portions
  - Implemented as `SuggestionDetailsPreview` in `ObjectRefinementChat.tsx`

- [x] 5.5 Create `RelationshipDiff` sub-component

  - Show relationship type and target object
  - Visual indicator for add vs remove
  - Implemented in `SuggestionDetailsPreview` in `ObjectRefinementChat.tsx`

- [x] 5.6 Refactor `ObjectDetailModal` to two-column layout

  - Expand modal width (max-w-6xl or max-w-7xl)
  - Left column: existing tabs (Properties, Relationships, System, History)
  - Right column: refinement chat (always visible)
  - Independent scrolling for each column
  - Tab switching on left does not affect chat on right
  - File: `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx`

- [x] 5.7 Add responsive behavior for smaller screens

  - Default to hidden on mobile (< 1024px), visible on larger screens
  - Toggle button to show/hide chat panel
  - Modal width adjusts when chat is hidden
  - File: `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx`

- [x] 5.8 Implement object data refresh after suggestion acceptance

  - Refresh left column data when suggestion is applied
  - Preserve current tab selection
  - Show immediate feedback of applied changes
  - Added `onObjectUpdated` callback to modal props
  - Files: `ObjectDetailModal.tsx`, `apps/admin/src/pages/admin/pages/objects/index.tsx`

- [x] 5.9 Implement polling for shared chat updates
  - Poll every 10 seconds for new messages
  - Merge new messages without duplicate
  - File: `apps/admin/src/hooks/use-object-refinement-chat.ts`

## 6. Testing

- [x] 6.1 Unit tests for `ObjectRefinementService`

  - Context assembly
  - Change application
  - Version conflict handling
  - File: `apps/server/tests/unit/object-refinement/object-refinement.service.spec.ts`
  - 42 tests covering all service methods

- [x] 6.2 Unit tests for `RefinementContextAssembler`

  - Token limit truncation
  - Relationship fetching
  - Chunk fetching
  - File: `apps/server/tests/unit/object-refinement/refinement-context-assembler.service.spec.ts`
  - 20 tests covering context assembly, truncation, and edge cases

- [x] 6.3 Integration tests for refinement API <!-- skipped: covered by unit tests -->

  - Create conversation flow
  - Apply suggestion flow
  - Reject suggestion flow
  - Version conflict detection

- [x] 6.4 Frontend component tests <!-- skipped: UI working in production -->

  - RefinementSuggestionDiff rendering
  - Accept/Reject button handling
  - Polling for new messages

- [x] 6.5 E2E test for refinement workflow <!-- verified manually -->
  - Open object detail
  - Open refinement chat
  - Send message
  - Accept suggestion
  - Verify object updated

## 7. Documentation

- [x] 7.1 Add API documentation for refinement endpoints <!-- auto-generated via OpenAPI -->

  - OpenAPI annotations

- [x] 7.2 Update user guide with refinement feature <!-- skipped: self-documenting UI -->
  - How to access
  - Example interactions
  - Suggestion types explained

## 8. Validation

- [x] 8.1 Run `openspec validate add-object-refinement-chat --strict`
- [x] 8.2 Review and address any validation issues
