# Design: Modern Chat UI with LangGraph & Vercel AI SDK

## Context

The current chat implementation is basic and lacks the orchestration capabilities needed for production use. This change introduces a modern, streaming chat UI with LangGraph for conversation orchestration and Vercel AI SDK for the frontend experience.

### Background

- **Current state**: Basic LangChain components with limited UI
- **Research**: Documented in `docs/plans/chat-architecture-research-findings.md` and `docs/plans/vercel-ai-sdk-compatibility-analysis.md`
- **Decision drivers**: Developer experience, zero vendor lock-in, extensibility, production-readiness

### Stakeholders

- End users: Need fast, reliable chat interface
- Developers: Need maintainable, well-documented architecture
- Product team: Need extensible foundation for future features

## Goals / Non-Goals

### Goals

- ✅ Modern streaming chat UI with real-time responses
- ✅ LangGraph embedded in NestJS (no separate server)
- ✅ MCP integration for database tool calling
- ✅ PostgreSQL-based conversation memory
- ✅ Anonymous chat access (no authentication required)
- ✅ Extensible architecture for future enhancements

### Non-Goals

- ❌ User authentication (deferred to Phase 2)
- ❌ Multi-user conversation support (future)
- ❌ File uploads in chat (future)
- ❌ Voice/video chat (out of scope)
- ❌ Chat history persistence beyond conversation context (future)

## Decisions

### Decision 1: Use Vercel AI SDK for Frontend

**What**: Use Vercel AI SDK's `useChat` hook and streaming protocol for the chat UI.

**Why**:

- Open source (Apache 2.0) with no vendor lock-in
- Handles streaming, error handling, loading states automatically
- Well-tested in production (used by thousands of apps)
- ~100KB dependency (frontend + backend combined)
- Protocol is publicly documented and easy to migrate from

**Alternatives considered**:

1. **Custom implementation** - Would require 2-3 weeks of development for streaming, reconnection logic, error handling
2. **LangChain Generative UI** - Requires LangGraph Server (separate deployment), more complex
3. **MinChat** - Lightweight but lacks tool calling support
4. **AWS Cloudscape** - Too heavy (full design system), not suitable for single feature

**Trade-offs**:

- Adds external dependency (mitigated: open source, small size)
- Learning curve for team (mitigated: excellent documentation)

### Decision 2: Embed LangGraph in NestJS

**What**: Run LangGraph directly inside the NestJS application as a service, not as a separate LangGraph Server.

**Why**:

- Simplifies deployment (one fewer service to manage)
- Reduces latency (no HTTP calls between services)
- Easier debugging (all code in one process)
- LangGraph is just a library, doesn't require dedicated server

**Alternatives considered**:

1. **LangGraph Server** - Separate deployment, more complex, adds latency
2. **LangGraph Cloud** - Managed service, vendor lock-in, costs money
3. **Pure LangChain (no LangGraph)** - Limited orchestration, hard to manage complex flows

**Trade-offs**:

- NestJS process becomes slightly heavier (mitigated: LangGraph is lightweight)
- Less isolation between chat and other services (mitigated: proper error boundaries)

### Decision 3: PostgreSQL for Conversation Memory

**What**: Use LangGraph's PostgreSQL checkpointing (MemorySaver) for storing conversation state.

**Why**:

- Already have PostgreSQL in the stack
- Persistent across server restarts
- Supports conversation branching/versioning (LangGraph feature)
- Small storage footprint (JSON blobs, ~1-10KB per conversation)

**Alternatives considered**:

1. **In-memory** - Lost on restart, not suitable for production
2. **Redis** - Adds another dependency, overkill for initial implementation
3. **SQLite** - Doesn't support multi-process access (Docker Compose, Coolify)

**Trade-offs**:

- Adds DB queries to chat flow (mitigated: indexed properly, minimal overhead)
- Increases PostgreSQL load (mitigated: checkpoints are small, infrequent)

### Decision 4: MCP Integration via HTTP Client

**What**: Use `@modelcontextprotocol/sdk` Client with custom HTTP transport to connect to the existing custom MCP server endpoint (`POST /mcp/rpc`).

**Why**:

- Project already has a **custom NestJS MCP server** (McpServerController) that implements JSON-RPC 2.0 manually
- Server exposes MCP tools via HTTP POST endpoint (`/mcp/rpc`) with JWT authentication
- MCP SDK provides `Client` class that can work with custom transports
- No need to refactor existing MCP server implementation

**Architecture Reality**:

- **Server Side (Existing)**: Custom NestJS controller (`McpServerController`) that manually implements MCP protocol
  - Endpoint: `POST /api/mcp/rpc`
  - Transport: HTTP with JSON-RPC 2.0
  - Auth: Bearer token (JWT) with `schema:read` and `data:read` scopes
  - Tools: `schema_version`, `schema_changelog`, `type_info`, `list_entity_types`, `query_entities`
- **Client Side (New Chat UI)**: Will use `@modelcontextprotocol/sdk` Client with custom HTTP transport
  - Create HTTP transport adapter that sends POST requests to `/api/mcp/rpc`
  - Include Authorization header with JWT token
  - Handle JSON-RPC 2.0 request/response format

**Alternatives considered**:

1. **LangChain's MCP toolkit** - Still experimental, less mature than direct SDK
2. **Refactor server to use `@modelcontextprotocol/sdk` Server class** - Unnecessary, existing implementation works
3. **Custom MCP client without SDK** - Reinventing the wheel, SDK provides protocol handling

**Trade-offs**:

- Requires custom HTTP transport adapter (mitigated: ~50 lines of code)
- Couples chat to project's custom MCP endpoint (mitigated: internal API, we control both sides)
- Requires JWT token for authentication (mitigated: chat endpoint already has access to user tokens)

### Decision 5: Anonymous Chat (No Authentication)

**What**: Allow chat access without login, defer user management to Phase 2.

**Why**:

- Simplifies initial implementation
- Enables public demo/testing
- Reduces friction for evaluation
- User auth can be added incrementally

**Alternatives considered**:

1. **Require authentication from Day 1** - Blocks initial release, adds complexity
2. **Optional authentication** - More complex than fully anonymous or fully authenticated

**Trade-offs**:

- Enables abuse (mitigated: rate limiting on endpoint)
- No user-specific history (mitigated: use conversation IDs, add auth later)
- Security concerns (mitigated: no sensitive data exposed, MCP tools are read-only)

### Decision 6: Use LangChainAdapter NOT streamText **CRITICAL**

**What**: Use `LangChainAdapter.toDataStreamResponse(stream)` to convert LangGraph streams to Vercel AI SDK protocol.

**Why**:

- LangChainAdapter is the **correct** bridge between LangGraph and Vercel AI SDK
- Preserves LangGraph orchestration (tool calling, state management, checkpointing)
- Handles tool call events and converts them to useChat-compatible format
- Located in `@ai-sdk/langchain` (dedicated integration package)

**What NOT to do**:

- ❌ Do NOT use `streamText({ model: 'gemini'... })` - this **bypasses LangGraph entirely**
- ❌ Do NOT call the LLM directly from the controller
- ❌ Do NOT use `ai` package for the adapter - use `@ai-sdk/langchain`

**Correct Pattern**:

```typescript
import { LangChainAdapter } from '@ai-sdk/langchain';

const stream = await this.langGraphService.streamConversation({
  message,
  threadId,
});
return LangChainAdapter.toDataStreamResponse(stream);
```

**Trade-offs**:

- Requires additional dependency `@ai-sdk/langchain` (mitigated: small, purpose-built)
- Couples to Vercel AI SDK protocol (mitigated: protocol is open, documented, easy to migrate)
- Version compatibility with LangChain core (mitigated: pin versions, test thoroughly)

## Architecture

### High-Level Flow

```
User (Browser)
  ↓ HTTP POST /api/chat
  ↓ (body: { messages, conversationId })
  ↓
NestJS ChatUiController
  ↓ Extract latest message + conversationId (threadId)
  ↓
LangGraphService
  ├─ Load conversation state from PostgreSQL (via threadId)
  ├─ Execute conversation graph (nodes: input → process → respond)
  ├─ Call LLM (Gemini) via LangGraph
  ├─ Call MCP tools if needed (schema queries)
  ├─ Save conversation state to PostgreSQL (checkpointing)
  └─ Stream LangGraph events/messages
  ↓
LangChainAdapter.toDataStreamResponse()
  ↓ Converts LangGraph stream → Vercel AI SDK protocol
  ↓ (newline-delimited JSON with text/tool_call/tool_result chunks)
  ↓
User (Browser)
  └─ useChat() hook consumes stream, updates UI
```

### LangGraph Conversation Graph

```
[Input Node]
   ↓
   ↓ Extract user message, load context
   ↓
[Process Node]
   ↓
   ↓ Determine if MCP tool needed
   ↓
   ├─→ [Tool Call Node] (if needed)
   │     ↓
   │     ↓ Invoke MCP server
   │     ↓
   │     └─→ [Tool Result Node]
   │            ↓ Inject result into context
   │            ↓
[LLM Node]
   ↓
   ↓ Call Gemini with context + history
   ↓
[Response Node]
   ↓
   ↓ Stream response chunks
   ↓
[End]
```

### Data Models

#### Conversation State (PostgreSQL Checkpointing)

```typescript
interface ConversationState {
  conversation_id: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
  tool_calls: Array<{
    tool: string;
    args: Record<string, any>;
    result: any;
    timestamp: string;
  }>;
  metadata: {
    created_at: string;
    updated_at: string;
    model: string;
  };
}
```

#### Vercel AI SDK Message Format

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolInvocations?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, any>;
    result?: any;
  }>;
}
```

### Component Structure

#### Backend (apps/server)

```
src/modules/chat-ui/
├── chat-ui.module.ts              # NestJS module definition
├── chat-ui.controller.ts          # POST /api/chat endpoint
├── services/
│   ├── langgraph.service.ts       # LangGraph orchestration
│   ├── mcp-client.service.ts      # MCP server connection
│   └── chat-memory.service.ts     # PostgreSQL checkpointing
├── dto/
│   ├── chat-request.dto.ts        # Request validation
│   └── chat-response.dto.ts       # Response types
└── graph/
    ├── conversation-graph.ts      # LangGraph graph definition
    ├── nodes/
    │   ├── input.node.ts
    │   ├── process.node.ts
    │   ├── tool-call.node.ts
    │   └── respond.node.ts
    └── tools/
        └── mcp-tools.ts           # MCP tool wrappers
```

#### Frontend (apps/admin)

```
src/pages/
└── Chat.tsx                       # Main chat page

src/components/chat/
├── ChatMessageList.tsx            # Scrollable message list
├── ChatMessage.tsx                # Single message display
├── ChatInput.tsx                  # Input textarea + send button
├── ToolCallDisplay.tsx            # Show tool invocations
└── ChatLoadingIndicator.tsx       # Loading states
```

## Implementation Details

### Backend - ChatUiController

```typescript
import { LangChainAdapter } from '@ai-sdk/langchain';

@Controller('chat')
export class ChatUiController {
  constructor(
    private readonly langGraphService: LangGraphService,
    private readonly chatMemoryService: ChatMemoryService
  ) {}

  @Post()
  @Public() // No authentication required
  async chat(
    @Body() body: ChatRequestDto,
    @Res() res: Response
  ): Promise<void> {
    const { messages, conversationId } = body;

    // CRITICAL: Use conversationId as threadId for LangGraph checkpointing
    // Do NOT append frontend messages to Postgres history - Postgres is source of truth
    const threadId = conversationId || this.generateThreadId();

    // Get latest user message from frontend
    const latestMessage = messages[messages.length - 1];

    // Execute LangGraph with streaming (LangGraph loads history from Postgres)
    const stream = await this.langGraphService.streamConversation({
      message: latestMessage.content,
      threadId,
    });

    // CRITICAL: Use LangChainAdapter to convert LangGraph stream to Vercel AI protocol
    // Do NOT use streamText() - that bypasses LangGraph!
    return LangChainAdapter.toDataStreamResponse(stream, {
      status: 200,
      headers: res,
    });
  }

  private generateThreadId(): string {
    return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

**CRITICAL: NestJS Response Handling**

`LangChainAdapter.toDataStreamResponse()` returns a standard Web API `Response` object, which NestJS (Express adapter) may not handle automatically when using `@Res()`.

**Two Implementation Options:**

**Option A: Manual Stream Piping (Recommended for Control)**

```typescript
@Post()
@Public()
async chat(
  @Body() body: ChatRequestDto,
  @Res() res: ExpressResponse,
): Promise<void> {
  const { messages, conversationId } = body;
  const threadId = conversationId || this.generateThreadId();
  const latestMessage = messages[messages.length - 1];

  const stream = await this.langGraphService.streamConversation({
    message: latestMessage.content,
    threadId,
  });

  // Convert LangGraph stream to Web API Response
  const webResponse = LangChainAdapter.toDataStreamResponse(stream);

  // Manually pipe Web API Response to Express response
  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => res.setHeader(key, value));

  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        res.write(value);
      }
    };
    await pump();
  } else {
    res.end();
  }
}
```

**Option B: Return Response Object (May Work with Newer NestJS)**

```typescript
@Post()
@Public()
async chat(@Body() body: ChatRequestDto): Promise<Response> {
  // ... same setup ...
  const stream = await this.langGraphService.streamConversation({
    message: latestMessage.content,
    threadId,
  });

  // Return Web API Response directly (NestJS may handle it)
  return LangChainAdapter.toDataStreamResponse(stream);
}
```

**Recommendation**: Start with Option A during POC phase to ensure compatibility. Test Option B if simpler approach is desired.

**Stream Mode Configuration**: Use `streamMode: 'messages'` for Phase 1 (safest path for tool call rendering).

### Backend - LangGraphService

```typescript
@Injectable()
export class LangGraphService {
  private graph: CompiledGraph;

  constructor(
    private readonly mcpClientService: MCPClientService,
    private readonly chatMemoryService: ChatMemoryService
  ) {
    this.graph = this.buildGraph();
  }

  private buildGraph(): CompiledGraph {
    const workflow = new StateGraph({
      channels: {
        messages: [],
        toolCalls: [],
        context: {},
      },
    });

    // Define nodes
    workflow.addNode('input', this.inputNode.bind(this));
    workflow.addNode('process', this.processNode.bind(this));
    workflow.addNode('toolCall', this.toolCallNode.bind(this));
    workflow.addNode('respond', this.respondNode.bind(this));

    // Define edges
    workflow.addEdge('input', 'process');
    workflow.addConditionalEdges('process', this.shouldCallTool, {
      tool: 'toolCall',
      respond: 'respond',
    });
    workflow.addEdge('toolCall', 'respond');

    return workflow.compile({
      checkpointer: this.chatMemoryService.getCheckpointer(),
    });
  }

  async streamConversation(options: {
    message: string;
    threadId: string;
  }): Promise<AsyncIterable<any>> {
    const { message, threadId } = options;

    // CRITICAL: Configure stream mode for Vercel AI SDK compatibility
    // Use 'messages' mode for clean frontend integration
    // Or use 'events' mode if you want intermediate "thinking" steps
    return this.graph.stream(
      {
        messages: [{ role: 'user', content: message }],
      },
      {
        configurable: { thread_id: threadId },
        streamMode: 'messages', // Or 'events' for intermediate steps
      }
    );
  }
}
```

### Backend - MCPClientService (HTTP Transport)

```typescript
import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Custom HTTP Transport for MCP Client
 * Connects to the existing custom MCP server at POST /mcp/rpc
 */
class HttpMcpTransport implements Transport {
  private url: string;
  private token: string;
  private requestId = 0;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async start(): Promise<void> {
    // Initialize connection (send initialize request)
    const initRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'nexus-chat-client',
          version: '1.0.0',
        },
      },
    };

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(initRequest),
    });

    if (!response.ok) {
      throw new Error(`MCP initialization failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(`MCP initialization error: ${result.error.message}`);
    }

    // Send initialized notification
    await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
  }

  async close(): Promise<void> {
    // No persistent connection to close for HTTP transport
  }

  async send(message: any): Promise<any> {
    const request = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: message.method,
      params: message.params,
    };

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(`MCP error: ${result.error.message}`);
    }

    return result.result;
  }
}

@Injectable()
export class MCPClientService {
  private client: Client;

  constructor(private readonly configService: ConfigService) {}

  async initialize(token: string): Promise<void> {
    const mcpUrl =
      this.configService.get('MCP_SERVER_URL') ||
      'http://localhost:3001/api/mcp/rpc';
    const transport = new HttpMcpTransport(mcpUrl, token);

    this.client = new Client(
      {
        name: 'nexus-chat-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(transport);
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }

  async listTools(): Promise<any[]> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    const result = await this.client.listTools();
    return result.tools;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}
```

**Key Implementation Notes:**

1. **Custom HTTP Transport**: The `HttpMcpTransport` class adapts the MCP SDK's `Transport` interface to work with the existing HTTP endpoint
2. **JWT Authentication**: Token is passed in Authorization header for every request
3. **JSON-RPC 2.0**: Transport handles the JSON-RPC request/response format expected by `McpServerController`
4. **Initialize Handshake**: Sends `initialize` request and `notifications/initialized` on startup
5. **Tool Calling**: Uses MCP SDK's `callTool()` method which internally calls `tools/call` via the transport

### Frontend - Chat Page

```typescript
import { useChat } from '@ai-sdk/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: '/api/chat',
    });

  return (
    <div className="flex flex-col h-screen">
      <ChatMessageList messages={messages} isLoading={isLoading} />
      <ChatInput
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        disabled={isLoading}
      />
      {error && <div className="alert alert-error">{error.message}</div>}
    </div>
  );
}
```

## Error Handling

### Backend Error Scenarios

1. **LLM API failure** - Return 500 with error message, log full context
2. **MCP timeout** - Fallback to "Tool unavailable" message, continue conversation
3. **Database connection loss** - In-memory fallback, warn user about lost state
4. **Rate limit exceeded** - Return 429, include retry-after header

### Frontend Error Scenarios

1. **Network disconnection** - Show reconnection UI, retry automatically
2. **Streaming interrupted** - Show partial message + error, allow retry
3. **Invalid message** - Client-side validation, prevent submission

## Performance Considerations

### Latency Targets

- **First token**: <1 second
- **Full response**: <5 seconds (for typical 100-200 token responses)
- **Tool call overhead**: <500ms per tool invocation

### Optimization Strategies

1. **Stream immediately** - Don't wait for full LLM response
2. **Parallel tool calls** - Use LangGraph's parallel node execution
3. **Cache MCP schema** - Avoid repeated schema queries
4. **Checkpoint incrementally** - Save state only when needed (not every message)

### Memory Considerations

- **PostgreSQL checkpoints**: ~1-10KB per conversation
- **In-memory state**: ~100KB per active conversation (cleared after response)
- **LangGraph overhead**: ~5-10MB total (graph definition, dependencies)

## Security Considerations

### Anonymous Access Risks

1. **Abuse prevention**: Rate limiting (10 requests/minute per IP)
2. **Cost control**: Set max tokens per request (1000 tokens)
3. **Data exposure**: MCP tools are read-only, no sensitive data accessible
4. **DDoS protection**: Cloudflare or Traefik rate limiting

### Future Authentication

When adding authentication in Phase 2:

- Add `@UseGuards(JwtAuthGuard)` to chat endpoint
- Associate conversations with user IDs
- Add `@Scopes('chat:read', 'chat:write')` decorator
- Update OpenAPI docs accordingly

## Migration Plan

### Phase 1: Parallel Implementation

- New chat UI runs alongside existing chat (different route)
- No changes to existing chat functionality
- Users can opt-in to new UI

### Phase 2: Gradual Rollout

- Default to new UI, keep old UI available
- Monitor performance, error rates
- Gather user feedback

### Phase 3: Deprecation

- Remove old chat implementation
- Archive old chat code
- Update documentation

### Rollback Plan

If issues arise:

1. Revert to old chat UI (change default route)
2. Disable new chat endpoint
3. Investigate and fix issues
4. Re-enable gradually

## Testing Strategy

### Unit Tests

- LangGraph node functions (input, process, toolCall, respond)
- MCP client service (tool invocation, error handling)
- Chat memory service (checkpoint save/load)
- DTO validation

### Integration Tests

- Full LangGraph execution (end-to-end graph flow)
- MCP tool calling (real MCP server)
- PostgreSQL checkpointing (real database)

### E2E Tests

- **Backend**: `/api/chat` streaming endpoint (supertest)
- **Frontend**: Chat UI flow (Playwright)
  - Send message → receive response
  - Tool call display
  - Error states
  - Loading states

### Manual Testing Checklist

- [ ] Chat loads without authentication
- [ ] Messages stream in real-time
- [ ] Tool calls display correctly
- [ ] Conversation persists across page reloads
- [ ] Error messages display clearly
- [ ] Loading indicators work properly
- [ ] Mobile responsive design

## Monitoring & Observability

### Metrics to Track

- **Latency**: p50, p95, p99 for first token and full response
- **Error rate**: LLM failures, MCP timeouts, database errors
- **Throughput**: Conversations per minute, messages per minute
- **Cost**: LLM API costs per conversation

### Logging

- **Info**: Conversation start/end, tool calls, checkpoints
- **Warn**: MCP timeouts, rate limit warnings
- **Error**: LLM failures, database errors, streaming interruptions

### Future: Add Langfuse Observability

- Track LLM calls, latencies, costs
- Debug tool calling flows
- Visualize conversation graphs
- See related change: `openspec/changes/add-langfuse-observability/`

## Open Questions

1. **Stream mode configuration - messages vs events?** **CRITICAL DECISION**

   - **Option A (messages mode)**: Stream only final messages from each node
     - Pros: Simpler, cleaner UI, less data over the wire
     - Cons: No visibility into "thinking" or tool calling progress
     - UX: Loading spinner, user sees final response only
   - **Option B (events mode)**: Stream all intermediate events
     - Pros: Show "Thinking...", "Calling database...", better transparency
     - Cons: More complex, more data, need to filter/format events
     - UX: Progressive disclosure, animated thinking indicators
   - **Recommendation**: Start with messages mode (simpler), add events mode toggle in Phase 2

2. **How to handle very long conversations?** (>100 messages)

   - Option A: Truncate old messages, keep recent N
   - Option B: Summarize old messages, inject summary
   - Option C: Paginate history, lazy-load old messages

3. **Should we support conversation branching?** (LangGraph feature)

   - Option A: Not in Phase 1, add later
   - Option B: Expose as advanced feature

4. **How to handle multi-modal inputs?** (images, files)

   - Defer to Phase 2, focus on text-only for now

5. **Should we expose conversation IDs to users?**

   - **Option A**: Auto-generate, hidden from user (store in localStorage)
   - **Option B**: Show in URL, allow bookmarking (better for sharing)
   - **Recommendation**: Option B - put conversationId in URL query param

6. **Error propagation in streams?**

   - Question: If LangGraph fails mid-stream, does LangChainAdapter format it correctly?
   - Action: Test error scenarios during POC phase
   - Fallback: Custom error transformer if adapter doesn't handle it

7. **NestJS Response Handling - Web API Response vs Express?** **IMPLEMENTATION CRITICAL**
   - Question: Does NestJS handle Web API Response objects automatically with `@Res()`?
   - **Recommendation**: Use manual stream piping (Option A in design.md) for guaranteed compatibility
   - Action: Test during POC phase, verify streaming works with Express adapter
   - Fallback: If Option A is too complex, investigate NestJS streaming utilities

## Dependencies & Risks

### External Dependencies

- **Vercel AI SDK React (`@ai-sdk/react`)** - Frontend hooks (useChat), open source, actively maintained
- **LangChain Adapter (`@ai-sdk/langchain`)** - **CRITICAL** - Bridges LangGraph to Vercel AI SDK protocol
- **LangGraph (`@langchain/langgraph`)** - LangChain project, stable
- **MCP SDK (`@modelcontextprotocol/sdk`)** - Anthropic project, in active development

**Version Compatibility Note**: LangChain core versions must be compatible with `@ai-sdk/langchain`. Pin versions and test integration during POC.

### Risk Mitigation

| Risk                             | Likelihood | Impact | Mitigation                         |
| -------------------------------- | ---------- | ------ | ---------------------------------- |
| Vercel AI SDK breaking changes   | Low        | Medium | Pin versions, monitor releases     |
| LangGraph bugs                   | Medium     | High   | Comprehensive tests, rollback plan |
| MCP server unavailable           | Low        | Medium | Fallback gracefully, show error    |
| PostgreSQL checkpoint corruption | Low        | High   | Backup/restore strategy            |
| Anonymous abuse                  | High       | Low    | Rate limiting, monitoring          |

## Success Criteria

### Functional

- ✅ Users can send messages and receive streaming responses
- ✅ Tool calls (MCP schema queries) work reliably
- ✅ Conversations persist across page reloads
- ✅ Error messages are clear and actionable

### Performance

- ✅ First token latency <1 second (p95)
- ✅ Full response latency <5 seconds (p95)
- ✅ No memory leaks during long conversations
- ✅ Database checkpoints <10KB per conversation

### Quality

- ✅ All unit tests pass
- ✅ All E2E tests pass
- ✅ No critical security vulnerabilities
- ✅ Code coverage >80% for new code

## References

- Research findings: `docs/plans/chat-architecture-research-findings.md`
- Vercel AI SDK compatibility: `docs/plans/vercel-ai-sdk-compatibility-analysis.md`
- LangGraph docs: https://langchain-ai.github.io/langgraph/
- Vercel AI SDK docs: https://sdk.vercel.ai/docs
- MCP spec: https://modelcontextprotocol.io/
