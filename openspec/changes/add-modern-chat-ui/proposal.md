# Change: Add Modern Chat UI with LangGraph & Vercel AI SDK

## Why

The current chat implementation lacks a modern, production-ready UI and relies on basic LangChain components without the advanced orchestration capabilities needed for complex multi-turn conversations with tool calling. Users need:

1. **Modern streaming chat UI** - Real-time message streaming with proper error handling and loading states
2. **Advanced orchestration** - LangGraph for complex conversation flows, tool calling, and state management
3. **MCP integration** - Seamless connection to Model Context Protocol servers for database access
4. **Anonymous access** - Allow chat without authentication (user management deferred to Phase 2)
5. **Future-proof architecture** - Extensible foundation for file uploads, multi-model support, and advanced features

Research findings (documented in `docs/plans/chat-architecture-research-findings.md` and `docs/plans/vercel-ai-sdk-compatibility-analysis.md`) indicate that Vercel AI SDK + LangGraph embedded in NestJS provides the optimal balance of developer experience, flexibility, and zero vendor lock-in.

## What Changes

### Frontend (apps/admin)

- **Add Vercel AI SDK React** - Install `@ai-sdk/react` for streaming chat UI
- **Create Chat UI** - New `/chat` page with DaisyUI-styled components using `useChat()` hook
- **Message components** - Display user/assistant messages, tool calls, loading states, errors
- **Anonymous mode** - Chat accessible without login (no auth guard on route)
- **Thread ID management** - Pass `conversationId` in request body to maintain state

### Backend (apps/server)

- **Add LangGraph** - Install `@langchain/langgraph` for conversation orchestration
- **Add LangChain Adapter** - Install `@ai-sdk/langchain` for bridging LangGraph to Vercel AI SDK **CRITICAL**
- **Chat endpoint** - New POST `/api/chat` endpoint that streams responses via LangChainAdapter
- **LangGraph service** - Embed LangGraph directly in NestJS (no separate server)
- **MCP integration** - Custom HTTP transport to connect to existing `/mcp/rpc` endpoint with JWT auth
- **PostgreSQL memory** - Use PostgreSQL checkpointing for conversation state (via LangGraph MemorySaver)
- **Rate limiting** - X-Forwarded-For aware rate limiting for proxied requests

### Configuration

- **Environment variables** - Add chat model configuration (CHAT_MODEL_PROVIDER, CHAT_MODEL_NAME)
- **Anonymous access** - Configure endpoint to allow unauthenticated requests

### Documentation

- **Architecture docs** - Document chat flow, LangGraph integration, MCP connection
- **Development guide** - Setup instructions, local testing, debugging

## Impact

### New Capabilities

- **specs/chat-ui** - NEW capability for modern chat user interface
- Modifies existing `mcp-integration` spec - Add LangGraph MCP connection pattern

### Affected Code

- **apps/admin/src/pages/** - New Chat.tsx page component
- **apps/admin/src/components/** - New chat UI components (MessageList, MessageInput, ToolCallDisplay)
- **apps/server/src/modules/chat-ui/** - New chat module with LangGraph service and streaming endpoint
- **apps/server/src/app.module.ts** - Import chat module
- **package.json** - Add dependencies (@ai-sdk/react, @ai-sdk/langchain, @langchain/langgraph)

### Dependencies Added

- `@ai-sdk/react` (frontend) - React hooks for useChat
- `@ai-sdk/langchain` (backend) - **CRITICAL** - Adapter to bridge LangGraph to Vercel AI SDK protocol
- `@langchain/langgraph` (backend) - Conversation orchestration
- `@modelcontextprotocol/sdk` (backend) - MCP Client for custom HTTP transport to `/mcp/rpc`

### Breaking Changes

- **NONE** - This is a new feature that does not modify existing chat functionality

### Migration Path

- No migration needed - new feature with no breaking changes
- Existing chat implementation remains untouched (can be deprecated in future change)

### Risks & Mitigations

**Risk**: Vercel AI SDK introduces vendor lock-in  
**Mitigation**: AI SDK is open source (Apache 2.0), protocol is publicly documented, migration path is straightforward

**Risk**: LangGraph adds complexity to NestJS backend  
**Mitigation**: LangGraph runs embedded (no separate server), well-documented, widely adopted

**Risk**: Anonymous chat enables abuse  
**Mitigation**: Rate limiting on chat endpoint, future authentication in Phase 2

**Risk**: PostgreSQL checkpointing adds database load  
**Mitigation**: Checkpoints are small JSON blobs, indexed properly, can be offloaded to Redis later

### Success Metrics

- Chat UI loads in <2 seconds
- First token latency <1 second
- Tool calling works reliably (MCP schema queries)
- No memory leaks during long conversations
- Anonymous users can chat without authentication

## Implementation Phases

### Phase 1: Proof of Concept (1-2 days)

- Install dependencies (`@ai-sdk/react`, `@ai-sdk/langchain`, `@langchain/langgraph`)
- Create basic chat endpoint with `LangChainAdapter.toDataStreamResponse()`
- Build minimal UI with `useChat()` + DaisyUI
- Validate streaming works end-to-end

### Phase 2: LangGraph Integration (2-3 days)

- Create LangGraphService in NestJS
- Configure LangGraph with streamMode: 'messages'
- Integrate LangChainAdapter to bridge LangGraph → Vercel AI SDK
- Add PostgreSQL checkpointing
- Test conversation memory with threadId

### Phase 3: MCP Integration (2-3 days)

- Create custom HttpMcpTransport to connect to existing `/mcp/rpc` endpoint
- Implement Client with JWT authentication
- Expose MCP tools to LangGraph (schema_version, type_info, list_entity_types, query_entities)
- Test tool calling flow with JSON-RPC 2.0
- Handle errors gracefully (timeouts, JSON-RPC errors)

### Phase 4: Production Readiness (2-3 days)

- Add comprehensive tests (unit, E2E)
- Error handling and loading states
- Rate limiting and abuse prevention
- Documentation and deployment

## References

- Research findings: `docs/plans/chat-architecture-research-findings.md`
- Vercel AI SDK compatibility: `docs/plans/vercel-ai-sdk-compatibility-analysis.md`
- Current MCP spec: `openspec/specs/mcp-integration/spec.md`
- LangGraph docs: https://langchain-ai.github.io/langgraph/
- Vercel AI SDK docs: https://sdk.vercel.ai/docs
