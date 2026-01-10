# Change: Add Object-Level Refinement Chat

## Why

Users need a way to iteratively refine extracted knowledge graph objects through natural language conversation. Currently, editing objects requires manual property changes through form fields, which is tedious for complex refinements like rephrasing descriptions, adjusting relationships, or correcting extraction errors. A chat-based refinement interface allows users to describe desired changes in natural language ("make description more compact", "rename to...", "add parent relationship to X"), have the LLM suggest specific changes with diffs, and confirm or reject each modification.

## What Changes

### New Capability: Object Refinement Chat

- **Object-Chunk Join Table**: Create `object_chunks` table to track which chunks each object was extracted from (replacing properties-based approach)
- **Object Refinement Conversation**: Extend `chat_conversations` with `object_id` to support object-scoped shared chats
- **Rich Context Injection**: Inject object details, related objects (all relationship types, full details), and source chunks into LLM context
- **Change Suggestion System**: LLM suggests changes as structured diffs (property changes, relationship additions/removals)
- **User Confirmation Flow**: User reviews diff and confirms/rejects each suggested change
- **Audit Trail**: Track which refinement conversation led to each object modification
- **Shared Chat**: All project users see and can participate in the same object refinement chat
- **AI SDK Integration**: Use existing Vercel AI SDK chat infrastructure (`useChat`, streaming, etc.)

### Backend Changes

- New `ObjectRefinementService` for context assembly and change application
- New `/api/objects/:id/refinement-chat` endpoint for object-scoped chat
- Extend `GraphService` to support change application with refinement attribution
- Migration for `object_chunks` join table and `chat_conversations.object_id`

### Frontend Changes

- New `ObjectRefinementChat` component using AI SDK `useChat`
- Integration into `ObjectDetailModal` (new tab or slide-out panel)
- `RefinementDiff` component showing proposed changes with accept/reject buttons
- Real-time sync for shared chat across project users

## Impact

- **Affected specs**:
  - NEW: `object-refinement-chat` (new capability)
  - MODIFIED: `chat-sdk-ui` (extend for object context)
- **Affected code**:
  - `apps/server/src/entities/` - new entities and migrations
  - `apps/server/src/modules/graph/` - change application with attribution
  - `apps/server/src/modules/chat/` or new `refinement-chat` module
  - `apps/admin/src/components/organisms/ObjectDetailModal/`
  - `apps/admin/src/hooks/` - new hook for refinement chat
- **Database changes**:
  - New table: `kb.object_chunks`
  - New column: `kb.chat_conversations.object_id`
  - New column: `kb.graph_objects.refinement_conversation_id` (optional, for audit)
