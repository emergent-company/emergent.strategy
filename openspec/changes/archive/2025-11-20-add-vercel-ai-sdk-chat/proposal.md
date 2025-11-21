# Add Vercel AI SDK Chat Implementation

## Why

We have a working custom chat implementation (`/chat` and `/api/chat-ui`) that uses:
- Custom SSE streaming protocol
- Custom React hooks (`useChat` from `@/hooks/use-chat`)
- Manual state management and conversation persistence

While functional, this approach requires significant custom code to maintain. Vercel AI SDK provides a production-ready alternative with:

1. **Standard Protocol:** UI Message Stream Protocol for interoperability
2. **Built-in React Hooks:** `useChat()` from `@ai-sdk/react` with automatic state management
3. **Framework Integration:** Works seamlessly with existing LangGraph setup via `LangChainAdapter`
4. **Rich Features:** Built-in tool calling display, error handling, loading states
5. **Community Support:** Active ecosystem with examples and patterns

**Goal:** Build a parallel implementation using Vercel AI SDK for side-by-side comparison. This allows us to:
- Evaluate Vercel AI SDK's capabilities against our custom implementation
- Compare developer experience and maintainability
- Test performance and user experience differences
- Make an informed decision about future direction

Both implementations will coexist, allowing A/B testing and gradual migration if desired.

## What Changes

### Frontend (apps/admin)

- **New UI route:** `/chat-sdk` for Vercel AI SDK implementation (separate from `/chat`)
- **Use Vercel AI SDK React:** Import `useChat()` from `@ai-sdk/react` (already installed)
- **New page component:** `apps/admin/src/pages/chat-sdk/index.tsx` using DaisyUI styling
- **Conversation management:** Use backend API for persistence (no localStorage)
- **Streaming display:** Automatic via `useChat()` hook

### Backend (apps/server)

- **New endpoint:** `POST /api/chat-sdk` (separate from `/api/chat-ui`)
- **New controller:** `ChatSdkController` for Vercel AI SDK protocol
- **LangChainAdapter integration:** Use `LangChainAdapter.toDataStreamResponse()` to bridge LangGraph
- **Reuse services:** Share `LangGraphService` and `ConversationService` with existing chat
- **Vercel AI SDK protocol:** Use `streamText()` and proper response formatting

### Shared Components

- **Services:** Reuse `LangGraphService` and `ConversationService` (no duplication)
- **Database:** Same `chat_conversations` and `chat_messages` tables
- **Authentication:** Same JWT authentication with optional access
- **MCP Integration:** Same LangGraph orchestration and tool calling

### Configuration

- **No new env vars:** Uses existing Vertex AI and database configuration
- **Feature flag:** Optional `ENABLE_CHAT_SDK=true` to enable/disable the new endpoint

## Impact

### New Capabilities

- **specs/chat-sdk-ui** - NEW capability for Vercel AI SDK chat interface
- Relates to existing `chat-ui` spec (parallel implementation, not replacement)

### Affected Code

- **apps/admin/src/pages/chat-sdk/** - New page component for SDK-based chat
- **apps/admin/src/router/register.tsx** - Add `/chat-sdk` route
- **apps/server/src/modules/chat-sdk/** - New module with ChatSdkController
- **apps/server/src/app.module.ts** - Import ChatSdkModule
- **No changes to existing chat-ui code** - Parallel implementation

### Dependencies

- `@ai-sdk/react` (already installed) - React hooks for chat UI
- `@ai-sdk/langchain` (already installed) - LangChainAdapter to bridge LangGraph streams
- `@langchain/langgraph` (already installed) - LangGraph orchestration (unchanged)
- **NO new AI provider needed** - Reuses existing Vertex AI connection in LangGraphService

### Breaking Changes

- **NONE** - This is a new parallel implementation
- Existing `/chat` and `/api/chat-ui` remain unchanged
- No changes to database schema

### Migration Path

- No migration needed - new feature alongside existing chat
- Users can access both `/chat` and `/chat-sdk` independently
- Future decision: keep both, deprecate one, or hybrid approach

### Risks & Mitigations

**Risk:** Vercel AI SDK may not support all LangGraph features  
**Mitigation:** Use `LangChainAdapter` which is designed for this integration

**Risk:** Two chat implementations create maintenance burden  
**Mitigation:** This is intentional for comparison; decision point after evaluation

**Risk:** Confusion between two chat UIs  
**Mitigation:** Clear labeling, separate routes, documentation

**Risk:** Duplicate conversation data  
**Mitigation:** Share same database tables and services

### Success Metrics

- Chat SDK endpoint responds with proper Vercel AI SDK protocol
- `useChat()` hook successfully consumes and displays streaming responses
- Conversation persistence works identically to current implementation
- LangGraph tool calling displays correctly via Vercel AI SDK
- Performance is comparable to existing implementation

## Implementation Plan

### Phase 1: Backend Integration (2-3 days)

- Verify `@ai-sdk/langchain` is installed (already in package.json)
- Create `ChatSdkModule` and `ChatSdkController`
- Implement `POST /api/chat-sdk` endpoint with `LangChainAdapter.toDataStreamResponse()`
- Reuse existing `LangGraphService` (no changes to Vertex AI connection)
- Reuse `ConversationService` for persistence
- Test streaming response format with curl/Postman

### Phase 2: Frontend Implementation (2-3 days)

- Create `apps/admin/src/pages/chat-sdk/index.tsx`
- Use `useChat()` hook from `@ai-sdk/react`
- Implement conversation list sidebar (similar to current chat)
- Add DaisyUI styling matching existing design
- Connect to `/api/chat-sdk` endpoint

### Phase 3: Feature Parity (2-3 days)

- Add markdown rendering with syntax highlighting
- Implement copy-to-clipboard functionality
- Add keyboard shortcuts (Ctrl+Enter, Escape)
- Show timestamps and relative time
- Add conversation search/filter

### Phase 4: Testing & Documentation (1-2 days)

- Write unit tests for ChatSdkController
- Test streaming, tool calling, error handling
- Document API differences between implementations
- Create comparison guide for developers
- Update architecture documentation

## References

- Current chat implementation: `apps/admin/src/pages/chat/index.tsx`
- Current backend: `apps/server/src/modules/chat-ui/`
- Vercel AI SDK docs: https://sdk.vercel.ai/docs
- LangChainAdapter docs: https://sdk.vercel.ai/providers/adapters/langchain
