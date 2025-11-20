# Implementation Tasks

## Phase 1: Proof of Concept (COMPLETED)

### 1. Dependencies & Setup

- [x] 1.1 Install Vercel AI SDK frontend (`@ai-sdk/react`)
- [x] 1.2 Install LangChain Adapter for backend (`@ai-sdk/langchain`) **CRITICAL**
- [x] 1.3 Install LangGraph (`@langchain/langgraph`)
- [x] 1.4 Install MCP SDK Client (`@modelcontextprotocol/sdk`) for custom HTTP transport
- [ ] 1.5 Verify LangChain core version compatibility with `@ai-sdk/langchain`
- [ ] 1.6 Add chat environment variables to `.env.example`
- [x] 1.7 Update package.json and run `npm install`

### 2. Backend - Chat Module Setup

- [x] 2.1 Create `apps/server/src/modules/chat-ui/` directory
- [x] 2.2 Create ChatUiModule with providers and controllers
- [x] 2.3 Import ChatUiModule in AppModule
- [x] 2.4 Create ChatUiController with POST `/api/chat` endpoint (POC: mock streaming)
- [x] 2.5 Configure endpoint for anonymous access (no auth guard)

### 6. Frontend - Chat UI Components

- [x] 6.1 Create `apps/admin/src/pages/chat/index.tsx` page component (POC: basic streaming)
- [x] 6.2 Add `/chat` route to React Router configuration
- [ ] 6.3 Create ChatMessage component (user/assistant/system)
- [ ] 6.4 Create ChatInput component (textarea with send button)
- [ ] 6.5 Create ChatMessageList component (scrollable message list)
- [ ] 6.6 Create ToolCallDisplay component (show tool invocations)
- [ ] 6.7 Style components with DaisyUI classes

## Phase 2: LangGraph Integration (IN PROGRESS)

### 3. Backend - LangGraph Service

- [x] 3.1 Create LangGraphService in chat-ui module
- [x] 3.2 Implement basic conversation graph with nodes (agent node calling LLM)
- [x] 3.3 Configure in-memory checkpointing with MemorySaver (PostgreSQL deferred)
- [x] 3.4 Add conversation state management (messages array with reducer)
- [x] 3.5 Implement streaming response handler (`graph.stream()`)
- [x] 3.6 Add Google Gemini integration via `@langchain/google-genai`
- [x] 3.7 Install `@langchain/core` dependency (resolves import errors)
- [x] 3.8 Register LangGraphService in ChatUiModule
- [x] 3.9 Fix TypeScript compilation issues
- [x] 3.10 Verify server builds successfully

**Status**: ✅ Service created and compiling. Next: Integrate with controller.

**See**: `docs/features/add-modern-chat-ui/PHASE_2_PROGRESS.md` for detailed progress

## 4. Backend - LangChain Adapter Integration

- [ ] 4.1 Import `LangChainAdapter` from `@ai-sdk/langchain` **CRITICAL**
- [ ] 4.2 Implement Web API Response → Express piping in controller **CRITICAL**
- [ ] 4.3 Test manual stream piping approach (Option A - recommended)
- [ ] 4.4 Optionally test direct Response return (Option B)
- [ ] 4.5 Configure LangGraph streamMode: 'messages' (recommended for Phase 1)
- [ ] 4.6 Test that tool calls appear correctly in frontend
- [ ] 4.7 Add error handling for streaming failures
- [ ] 4.8 Test streaming with curl/Postman

## 5. Backend - MCP Integration

- [ ] 5.1 Create HttpMcpTransport class to wrap existing `/mcp/rpc` endpoint **CRITICAL**
- [ ] 5.2 Implement Client instantiation with custom HTTP transport
- [ ] 5.3 Connect to existing schema MCP server at `/mcp/rpc` (NOT external MCP server)
- [ ] 5.4 Pass JWT token in Authorization header for MCP requests
- [ ] 5.5 Test connection with `schema_version` tool call
- [ ] 5.6 Expose MCP tools to LangGraph as callable functions (type_info, list_entity_types, query_entities)
- [ ] 5.7 Handle tool call requests from LangGraph
- [ ] 5.8 Handle tool results and inject into conversation context
- [ ] 5.9 Handle JSON-RPC 2.0 errors from custom server
- [ ] 5.10 Add timeout handling for MCP tool calls (default 10s)

## 6. Frontend - Chat UI Components

- [ ] 6.1 Create `apps/admin/src/pages/Chat.tsx` page component
- [ ] 6.2 Add `/chat` route to React Router configuration
- [ ] 6.3 Create ChatMessage component (user/assistant/system)
- [ ] 6.4 Create ChatInput component (textarea with send button)
- [ ] 6.5 Create ChatMessageList component (scrollable message list)
- [ ] 6.6 Create ToolCallDisplay component (show tool invocations)
- [ ] 6.7 Style components with DaisyUI classes

## 7. Frontend - Vercel AI SDK Integration

- [ ] 7.1 Import `useChat` hook from `@ai-sdk/react`
- [ ] 7.2 Configure `useChat` with API endpoint `/api/chat`
- [ ] 7.3 Pass `conversationId` in `body` prop of `useChat` **CRITICAL**
- [ ] 7.4 Wire up message list to `messages` from `useChat`
- [ ] 7.5 Wire up input to `input`, `handleInputChange`, `handleSubmit`
- [ ] 7.6 Display loading states (`isLoading`)
- [ ] 7.7 Display error states (`error`)
- [ ] 7.8 Handle tool calls in message stream (verify rendering)
- [ ] 7.9 Test that history persists across page reloads (via conversationId)

## 8. Testing - Backend

- [ ] 8.1 Write unit tests for LangGraphService (graph execution, state management)
- [ ] 8.2 Write unit tests for MCPClientService (tool invocation, error handling)
- [ ] 8.3 Write E2E tests for `/api/chat` endpoint (streaming, tool calling)
- [ ] 8.4 Test PostgreSQL checkpointing (conversation persistence)
- [ ] 8.5 Test error scenarios (LLM failures, MCP timeouts)

## 9. Testing - Frontend

- [ ] 9.1 Write unit tests for Chat page component
- [ ] 9.2 Write unit tests for ChatMessage, ChatInput, ChatMessageList
- [ ] 9.3 Write Playwright E2E test for chat flow (send message, receive response)
- [ ] 9.4 Test tool call display in UI
- [ ] 9.5 Test error states and loading states

## 10. Manual Testing with DevTools MCP

- [ ] 10.1 Start Chrome debug mode (`npm run chrome:debug`)
- [ ] 10.2 Navigate to `/chat` page
- [ ] 10.3 Use DevTools MCP to verify page structure (`chrome-devtools_take_snapshot`)
- [ ] 10.4 Send test message and verify network request
- [ ] 10.5 Check console for errors (`chrome-devtools_list_console_messages`)
- [ ] 10.6 Verify streaming response in Network tab
- [ ] 10.7 Document selectors for automated tests

## 11. Error Handling & Edge Cases

- [ ] 11.1 Handle LLM API failures gracefully (show error to user)
- [ ] 11.2 Handle MCP tool timeouts (fallback message)
- [ ] 11.3 Handle network disconnections during streaming
- [ ] 11.4 Handle empty messages (prevent submission)
- [ ] 11.5 Handle very long messages (truncate or warn)
- [ ] 11.6 Handle rate limiting (429 responses)

## 12. Configuration & Environment

- [ ] 12.1 Add CHAT_MODEL_PROVIDER env var (default: 'gemini')
- [ ] 12.2 Add CHAT_MODEL_NAME env var (default: 'gemini-1.5-flash')
- [ ] 12.3 Add CHAT_MEMORY_BACKEND env var (default: 'postgres')
- [ ] 12.4 Add CHAT_RATE_LIMIT env var (default: '10/minute')
- [ ] 12.5 Document all env vars in `.env.example`

## 13. Documentation

- [ ] 13.1 Document chat architecture in `docs/architecture/`
- [ ] 13.2 Document LangGraph integration patterns
- [ ] 13.3 Document MCP connection setup
- [ ] 13.4 Create developer guide for adding custom tools
- [ ] 13.5 Update main README with chat feature

## 14. OpenAPI Documentation (if applicable)

- [ ] 14.1 Add `@Scopes()` decorator to chat endpoint (if auth added later)
- [ ] 14.2 Regenerate OpenAPI spec (`npm run gen:openapi`)
- [ ] 14.3 Update golden scope contract tests
- [ ] 14.4 Update OpenAPI regression hash
- [ ] 14.5 Update OpenAPI snapshot

## 15. Post-Implementation Verification

- [ ] 15.1 Run backend build (`nx run server:build`)
- [ ] 15.2 Run frontend build (`nx run admin:build`)
- [ ] 15.3 Run backend lint (`nx run server:lint`)
- [ ] 15.4 Run frontend lint (`nx run admin:lint`)
- [ ] 15.5 Run backend unit tests (`nx run server:test`)
- [ ] 15.6 Run frontend unit tests (`nx run admin:test`)
- [ ] 15.7 Run backend E2E tests (`nx run server:test-e2e`)
- [ ] 15.8 Run frontend E2E tests (`nx run admin:e2e`)
- [ ] 15.9 Fix any failures
- [ ] 15.10 Confirm all tests pass

## 16. Deployment Preparation

- [ ] 16.1 Test in local development environment
- [ ] 16.2 Test in Docker Compose environment
- [ ] 16.3 Verify PostgreSQL checkpointing works in containerized DB
- [ ] 16.4 Verify streaming works through Traefik proxy (if applicable)
- [ ] 16.5 Create deployment notes for production

## 17. Final Review

- [ ] 17.1 Code review by team
- [ ] 17.2 Security review (anonymous access implications)
- [ ] 17.3 Performance review (memory usage, latency)
- [ ] 17.4 UX review (chat interface, error messages)
- [ ] 17.5 Update tasks.md with completion status
