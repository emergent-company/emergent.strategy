# Design: Parallel Chat Implementations

## Architecture Overview

We will have **two independent chat implementations** running side-by-side:

### Implementation 1: Custom Chat (Existing)

```
Frontend: /chat → apps/admin/src/pages/chat/index.tsx
Backend:  POST /api/chat-ui → ChatUiController
Protocol: Custom SSE with JSON chunks
Hook:     Custom useChat() from @/hooks/use-chat
State:    Manual state management
```

### Implementation 2: Vercel AI SDK Chat (New)

```
Frontend: /chat-sdk → apps/admin/src/pages/chat-sdk/index.tsx
Backend:  POST /api/chat-sdk → ChatSdkController
Protocol: Vercel AI SDK UI Message Stream Protocol
Hook:     useChat() from @ai-sdk/react
State:    Automatic via SDK
```

## Shared Components

Both implementations will share:

- **LangGraphService:** LangGraph orchestration and streaming
- **ConversationService:** Database persistence (chat_conversations, chat_messages)
- **Authentication:** JWT tokens with optional auth
- **Database Schema:** Same tables for conversations and messages
- **MCP Integration:** Same tool calling via LangGraph

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
├──────────────────────────┬──────────────────────────────────┤
│  /chat (Custom)          │  /chat-sdk (Vercel AI SDK)       │
│  - Custom useChat()      │  - @ai-sdk/react useChat()       │
│  - Manual state          │  - Automatic state               │
│  - Custom UI             │  - DaisyUI + SDK patterns        │
└──────────┬───────────────┴────────────┬─────────────────────┘
           │                            │
           │ POST /api/chat-ui          │ POST /api/chat-sdk
           │ (Custom SSE)               │ (Vercel AI SDK protocol)
           │                            │
┌──────────▼────────────────────────────▼─────────────────────┐
│                   Backend (NestJS)                           │
├──────────────────────────┬──────────────────────────────────┤
│  ChatUiController        │  ChatSdkController               │
│  - Custom SSE chunks     │  - streamText()                  │
│  - Manual streaming      │  - LangChainAdapter              │
└──────────┬───────────────┴────────────┬─────────────────────┘
           │                            │
           │          SHARED SERVICES   │
           ├────────────────────────────┤
           │  LangGraphService          │
           │  ConversationService       │
           │  PostgreSQL                │
           └────────────────────────────┘
```

## Backend: ChatSdkController

### Endpoint Design

```typescript
POST /api/chat-sdk
Content-Type: application/json

Request Body:
{
  "messages": [
    { "id": "msg_1", "role": "user", "content": "Hello" }
  ],
  "conversationId": "uuid" // optional
}

Response:
Content-Type: text/event-stream
Cache-Control: no-cache

Stream format (newline-delimited JSON):
0:"Hello"
0:" world"
0:"!"
d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":3}}
```

### Implementation Approach 1: Using toUIMessageStream (Recommended)

Based on the official Vercel AI SDK docs, the cleanest approach:

```typescript
import { toUIMessageStream } from '@ai-sdk/langchain';
import { createUIMessageStreamResponse } from 'ai';

@Post()
async chat(@Body() body: ChatRequestDto) {
  const { messages, conversationId } = body;
  
  // Get or create conversation
  const dbConversationId = conversationId || await this.createConversation();
  
  // Get latest user message
  const latestMessage = messages[messages.length - 1];
  
  // Save to database
  await this.conversationService.addMessage(dbConversationId, 'user', latestMessage.content);
  
  // Stream from LangGraph (already connected to Vertex AI)
  const langGraphStream = await this.langGraphService.streamConversation({
    message: latestMessage.content,
    threadId: dbConversationId,
  });
  
  // Convert LangGraph stream to Vercel AI SDK format
  // This is the official way per Vercel docs
  return createUIMessageStreamResponse({
    stream: toUIMessageStream(langGraphStream),
  });
}
```

### Implementation Approach 2: Direct Adapter (Alternative)

If you prefer more control over the response format:

```typescript
import { LangChainAdapter } from '@ai-sdk/langchain';

@Post()
async chat(@Body() body: ChatRequestDto, @Res() res: Response) {
  // ... same conversation setup ...
  
  const langGraphStream = await this.langGraphService.streamConversation({
    message: latestMessage.content,
    threadId: dbConversationId,
  });
  
  // Direct conversion with adapter
  const dataStream = LangChainAdapter.toDataStreamResponse(langGraphStream);
  
  return dataStream;
}
```

**Key Point:** Both approaches work. Approach 1 (`toUIMessageStream` + `createUIMessageStreamResponse`) is the officially documented pattern and provides better type safety. We don't need `streamText()` or a separate Vertex AI provider - LangGraph already handles that.

## Frontend: Chat SDK Page

### Component Structure

```typescript
// apps/admin/src/pages/chat-sdk/index.tsx
import { useChat } from '@ai-sdk/react';

export default function ChatSdk() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat-sdk',
    id: conversationId, // current conversation ID
  });
  
  return (
    <div className="flex h-screen">
      {/* Sidebar with conversations */}
      <Sidebar 
        conversations={conversations}
        onSelect={handleSelectConversation}
      />
      
      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <MessageList messages={messages} />
        
        {/* Input */}
        <form onSubmit={handleSubmit}>
          <input 
            value={input} 
            onChange={handleInputChange}
            disabled={isLoading}
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}
```

## Comparison Points

### Custom Implementation

**Pros:**
- Full control over protocol and behavior
- Direct access to LangGraph state
- No external dependencies
- Can customize every aspect

**Cons:**
- More code to maintain
- Manual state management
- Custom error handling
- Need to implement standard features

### Vercel AI SDK Implementation

**Pros:**
- Standard protocol (interoperability)
- Automatic state management
- Built-in error handling
- Rich ecosystem and examples
- Less custom code

**Cons:**
- External dependency
- Less control over internals
- Must follow SDK conventions
- Potential version lock-in

## Decision Criteria

After implementation, evaluate:

1. **Developer Experience:** Which is easier to build and maintain?
2. **Feature Richness:** Which has better out-of-box features?
3. **Performance:** Latency, memory usage, streaming quality
4. **Reliability:** Error handling, edge cases, recovery
5. **Flexibility:** Can we extend/customize as needed?
6. **Community:** Documentation, examples, support

## Migration Strategy (Future)

If we decide to migrate to Vercel AI SDK:

1. **Keep both running** for gradual rollout
2. **Feature flag** to route users between implementations
3. **Monitor metrics** (errors, latency, user satisfaction)
4. **Gradual rollout** (10% → 50% → 100%)
5. **Deprecate old endpoint** after full migration
6. **Remove custom code** in follow-up PR

If we decide to keep custom implementation:

1. **Archive chat-sdk code** for future reference
2. **Document learnings** from SDK evaluation
3. **Improve custom implementation** based on insights
4. **Possibly adopt SDK patterns** without full framework

## Database Schema (Shared)

Both implementations use the same schema:

```sql
-- chat_conversations table
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  user_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- chat_messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

No schema changes needed - both implementations read/write the same tables.

## Deployment Considerations

- **Environment Variables:** No new vars needed, reuse existing Vertex AI config
  - `GCP_PROJECT_ID` (already set)
  - `VERTEX_AI_LOCATION` (already set)
  - `VERTEX_AI_MODEL` (already set)
- **Dependencies:** `@ai-sdk/langchain` and `@ai-sdk/react` already installed
- **Feature Flag:** Optional `ENABLE_CHAT_SDK=true` to enable/disable
- **Rollout:** Can deploy both at once (no breaking changes)
- **Monitoring:** Track usage metrics for both endpoints
- **Costs:** No additional costs (same LLM calls via LangGraph, same database)

## Open Questions

1. **Tool Calling Display:** How does Vercel AI SDK render tool calls compared to our custom approach?
2. **Conversation Switching:** How to handle switching conversations mid-stream?
3. **Error Recovery:** How does SDK handle partial streams on error?
4. **Custom Metadata:** Can we attach custom metadata to messages?
5. **Multi-turn Context:** Does SDK properly handle conversation history via conversationId?

These will be answered during implementation.
