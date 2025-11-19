# Chat Architecture Research Findings

**Date:** November 19, 2025  
**Status:** Research Complete  
**Related:** `openspec/changes/research-langgraph-chat-refactor/`

## Executive Summary

This document presents research findings for building a standalone, anonymous chat application with MCP (Model Context Protocol) integration, LangGraph backend, and various UI library options.

**Key Finding:** LangChain's Generative UI approach requires LangGraph Server (separate deployment), but we can build a more flexible solution by:

- Using standard React UI libraries with MCP client integration
- Embedding LangGraph within our existing NestJS API
- Maintaining full control over authentication, database access, and deployment

---

## 1. LangChain UI React Components

### What LangChain Generative UI Provides

**Source:** https://docs.langchain.com/langsmith/generative-ui-react

LangChain's "Generative UI" is NOT a separate UI library, but rather:

- React components co-located with LangGraph graph code
- Automatic bundling/serving of UI components via LangGraph Server
- Built-in support for Tailwind CSS 4.x and DaisyUI
- `useStream()` React hook for client-side integration
- `LoadExternalComponent` for dynamic component loading

**Architecture:**

```typescript
// Server-side (LangGraph graph)
import { typedUi } from '@langchain/langgraph-sdk/react-ui/server';

async function weatherNode(state, config) {
  const ui = typedUi<typeof ComponentMap>(config);
  const weather = await getWeather(city);

  // Emit UI component with data
  ui.push({ name: 'weather', props: weather }, { message: response });

  return { messages: [response] };
}

// Client-side (React)
import { useStream } from '@langchain/langgraph-sdk/react';
import { LoadExternalComponent } from '@langchain/langgraph-sdk/react-ui';

const { thread, values } = useStream({
  apiUrl: 'http://localhost:2024',
  assistantId: 'agent',
});

// Render UI components pushed from server
values.ui?.map((ui) => <LoadExternalComponent stream={thread} message={ui} />);
```

**Capabilities:**

- ✅ Stream UI components alongside chat messages
- ✅ Component props automatically serialized/deserialized
- ✅ Shadow DOM for style isolation
- ✅ Client-side components can access thread state via `useStreamContext()`
- ✅ Streaming updates to UI components (merge mode)
- ✅ Custom metadata passing to components

**Limitations:**

- ⚠️ Requires **LangGraph Server** (separate deployment, not just a library)
- ⚠️ Server manages component bundling (less control over build process)
- ⚠️ Opinionated architecture (components must be defined in `langgraph.json`)
- ⚠️ Limited documentation on integrating with existing auth systems
- ⚠️ May require Redis for task queue (needs verification)

**Verdict:** LangChain Generative UI is powerful but requires adopting LangGraph Server architecture. For maximum flexibility, consider using standard UI libraries with direct LangGraph integration.

---

## 2. Alternative UI Libraries for Chat

### Option A: Vercel AI SDK UI (Recommended for Standalone Chat)

**Source:** https://sdk.vercel.ai/docs/ai-sdk-ui/overview

**Capabilities:**

- `useChat()` - Real-time streaming chat with state management
- `useCompletion()` - Text completions
- `useObject()` - Streamed JSON objects
- Framework support: React, Svelte, Vue.js, Angular (limited)
- Built-in error handling and retry logic
- Tool calling support
- Message attachments
- Generative UI support (alternative to LangChain's approach)

**Example:**

```typescript
import { useChat } from 'ai/react';

function Chat() {
  const { messages, input, handleSubmit, handleInputChange } = useChat({
    api: '/api/chat',
    onError: (error) => console.error(error),
  });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.role}: {m.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  );
}
```

**Pros:**

- ✅ Battle-tested (used by many production apps)
- ✅ Excellent TypeScript support
- ✅ Works with any backend (NestJS, Express, etc.)
- ✅ Framework-agnostic backend API
- ✅ Built-in streaming protocols
- ✅ Strong community and documentation

**Cons:**

- ⚠️ User mentioned avoiding Vercel AI SDK (preference noted)
- ⚠️ Some Vercel-specific conventions

### Option B: MinChat UI

**Source:** https://github.com/MinChatHQ/react-chat-ui

**Capabilities:**

- Pre-built chat UI components (bubbles, input, containers)
- Theming via `MinChatUiProvider`
- TypeScript support
- Lightweight and customizable

**Example:**

```typescript
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  MinChatUiProvider,
} from '@minchat/react-chat-ui';

<MinChatUiProvider theme="#6ea9d7">
  <MainContainer>
    <ChatContainer>
      <MessageList>
        <Message model={{ message: 'Hello', sender: 'Bot' }} />
      </MessageList>
      <MessageInput onSend={(msg) => handleSend(msg)} />
    </ChatContainer>
  </MainContainer>
</MinChatUiProvider>;
```

**Pros:**

- ✅ Simple, focused on chat UI only
- ✅ No backend coupling
- ✅ Easy to style and customize
- ✅ MIT licensed

**Cons:**

- ⚠️ Limited streaming support
- ⚠️ Must implement state management yourself
- ⚠️ Smaller community

### Option C: LlamaIndex Chat UI

**Source:** https://github.com/run-llama/chat-ui

**Capabilities:**

- `ChatUIProvider` with handler pattern
- Integrates with Vercel AI SDK's `useChat`
- Pre-built for LlamaIndex backend

**Pros:**

- ✅ Good for LlamaIndex users
- ✅ Clean handler abstraction

**Cons:**

- ⚠️ Tightly coupled to LlamaIndex backend
- ⚠️ Still uses Vercel AI SDK under the hood

### Option D: AWS Cloudscape Chat Components

**Source:** https://github.com/aws-solutions/generative-ai-application-builder-on-aws

**Capabilities:**

- `ChatBubble` component from `@cloudscape-design/chat-components`
- Enterprise-grade design system
- Markdown rendering built-in

**Pros:**

- ✅ Professional, accessible UI
- ✅ Well-tested in enterprise environments

**Cons:**

- ⚠️ Heavy design system (opinionated)
- ⚠️ AWS-specific conventions

### Option E: Custom UI with DaisyUI

**Recommendation:** Build custom chat UI using DaisyUI components

**Why:**

- ✅ Already using DaisyUI in existing admin app
- ✅ Full control over UX and styling
- ✅ Can integrate with any backend approach
- ✅ Lightweight and flexible
- ✅ Easy to add custom features (file uploads, rich content, etc.)

**Example Structure:**

```typescript
// Custom chat hook (inspired by useChat)
function useChatStream(apiUrl: string) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const sendMessage = async (content: string) => {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({ message: content }),
    });

    const reader = response.body.getReader();
    // Handle streaming response
  };

  return { messages, input, setInput, sendMessage };
}

// DaisyUI-based UI
function Chat() {
  const { messages, input, setInput, sendMessage } = useChatStream('/api/chat');

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat chat-${msg.role === 'user' ? 'end' : 'start'}`}
          >
            <div className="chat-bubble">{msg.content}</div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t">
        <input
          type="text"
          className="input input-bordered w-full"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage(input)}
        />
      </div>
    </div>
  );
}
```

---

## 3. MCP (Model Context Protocol) Integration

### What is MCP?

**Source:** https://modelcontextprotocol.io

MCP is an open standard for connecting AI applications to external systems:

- **Tools** - Functions the AI can call (search, calculations, etc.)
- **Resources** - Data sources (files, databases, APIs)
- **Prompts** - Specialized prompt templates

Think of it as "USB-C for AI applications" - a standardized connection layer.

### MCP Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│ MCP Client  │◄───────►│ MCP Server  │◄───────►│  External   │
│ (Chat App)  │  JSON   │   (Tools)   │         │  Systems    │
│             │   RPC   │             │         │             │
└─────────────┘         └─────────────┘         └─────────────┘
```

### Connection Methods (Transports)

**1. Stdio Transport** (Process-based)

```typescript
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const transport = new StdioClientTransport({
  command: 'python',
  args: ['server.py'],
});

const client = new Client(
  {
    name: 'my-client',
    version: '1.0.0',
  },
  { capabilities: {} }
);

await client.connect(transport);
```

**2. SSE Transport** (Server-Sent Events over HTTP)

```typescript
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(new URL('http://localhost:3000/sse'));

await client.connect(transport);
```

**3. WebSocket Transport**

```typescript
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';

const transport = new WebSocketClientTransport(
  new URL('ws://localhost:3000/mcp')
);

await client.connect(transport);
```

**4. HTTP Streamable Transport** (Recommended for REST APIs)

```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp')
);

await client.connect(transport);
```

### MCP Usage Examples in the Wild

Real-world implementations found via GitHub search:

**Playwright Integration:**

```typescript
// microsoft/playwright - MCP server for browser automation
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const server = new Server({ name: 'playwright-mcp', version: '1.0.0' });
```

**LLM Framework Integrations:**

- **LibreChat** - Uses MCP for tool connections
- **Continue** - VS Code extension with MCP support
- **Cherry Studio** - Desktop AI app with MCP servers
- **Flowise** - No-code LLM builder with MCP toolkit

**Key Pattern:** Most implementations use MCP Client to connect to external MCP servers, making tools available to LLMs.

### MCP Integration Approaches for Our Chat

**Option 1: Direct MCP Client in NestJS**

```typescript
// In NestJS service
@Injectable()
export class MCPService {
  private client: Client;

  async onModuleInit() {
    this.client = new Client({ name: 'chat-api', version: '1.0.0' });
    await this.client.connect(transport);
  }

  async getAvailableTools() {
    return await this.client.listTools();
  }

  async callTool(name: string, args: any) {
    return await this.client.callTool({ name, arguments: args });
  }
}
```

**Option 2: LangChain MCP Tools** (Recommended)

```typescript
// Use LangChain's MCP integration
import { MCPToolkit } from '@langchain/mcp';

const mcpToolkit = new MCPToolkit({
  transport: new SSEClientTransport(new URL('http://localhost:3000/mcp')),
});

const tools = await mcpToolkit.getTools();

// Use with LangGraph
const agent = createReactAgent({
  llm: model,
  tools: tools,
});
```

**Recommendation:** Use LangChain's MCP integration to seamlessly connect MCP servers as LangGraph tools.

---

## 4. LangGraph Backend Integration

### Can LangGraph Run in NestJS?

**Answer:** ✅ **YES** - LangGraph is a library, not a server requirement.

You can integrate LangGraph directly into your existing NestJS API without deploying LangGraph Server.

### Integration Approach

**1. Install Dependencies**

```bash
npm install @langchain/langgraph @langchain/core @langchain/openai
```

**2. Create LangGraph Service in NestJS**

```typescript
// apps/server/src/modules/chat/services/langgraph.service.ts
import { Injectable } from '@nestjs/common';
import { StateGraph, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';

@Injectable()
export class LangGraphService {
  private graph: CompiledStateGraph;

  constructor() {
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const StateAnnotation = Annotation.Root({
      messages: Annotation({ reducer: (x, y) => x.concat(y) }),
    });

    const model = new ChatOpenAI({ model: 'gpt-4' });
    const tools = [
      /* MCP tools */
    ];
    const toolNode = new ToolNode(tools);

    const workflow = new StateGraph(StateAnnotation)
      .addNode('agent', async (state) => {
        const response = await model.invoke(state.messages);
        return { messages: [response] };
      })
      .addNode('tools', toolNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', (state) => {
        const lastMsg = state.messages[state.messages.length - 1];
        return lastMsg.tool_calls?.length ? 'tools' : '__end__';
      })
      .addEdge('tools', 'agent');

    return workflow.compile();
  }

  async streamChat(messages: any[], threadId: string) {
    const stream = await this.graph.stream(
      { messages },
      {
        configurable: { thread_id: threadId },
        streamMode: 'messages',
      }
    );

    return stream;
  }
}
```

**3. Create Streaming Endpoint**

```typescript
// apps/server/src/modules/chat/chat.controller.ts
import { Controller, Post, Body, Res, Headers } from '@nestjs/common';
import { Response } from 'express';
import { LangGraphService } from './services/langgraph.service';

@Controller('chat')
export class ChatController {
  constructor(private langGraph: LangGraphService) {}

  @Post('stream')
  async streamChat(
    @Body() body: { messages: any[] },
    @Headers('x-thread-id') threadId: string,
    @Res() res: Response
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await this.langGraph.streamChat(body.messages, threadId);

    for await (const [message, metadata] of stream) {
      res.write(`data: ${JSON.stringify({ message, metadata })}\n\n`);
    }

    res.end();
  }
}
```

**4. Add Memory/Persistence**

```typescript
import { MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

// Option A: In-memory (for anonymous chat)
const memory = new MemorySaver();
const graph = workflow.compile({ checkpointer: memory });

// Option B: PostgreSQL persistence (for user accounts)
const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
const graph = workflow.compile({ checkpointer });
```

### LangGraph Capabilities

**Core Features:**

- ✅ **Streaming** - Real-time token streaming (`streamMode: 'messages'`)
- ✅ **Tool Calling** - Automatic routing to tools and back to LLM
- ✅ **Memory** - Thread-based conversation history
- ✅ **State Management** - Complex state graphs with conditional routing
- ✅ **Checkpointing** - Save/resume conversations (PostgreSQL, in-memory)
- ✅ **Multi-turn** - Automatic handling of tool results and follow-ups
- ✅ **Interrupts** - Human-in-the-loop workflows

**Streaming Modes:**

```typescript
// Stream all state updates after each node
streamMode: 'values';

// Stream only changes (incremental)
streamMode: 'updates';

// Stream individual LLM tokens
streamMode: 'messages';

// Stream custom events
streamMode: 'custom';
```

**Memory/Persistence:**

```typescript
// Thread-based conversations
const config = {
  configurable: { thread_id: 'user-123-session-abc' },
};

// Messages are automatically persisted per thread
await graph.stream({ messages: [newMessage] }, config);

// Get conversation history
const state = await graph.getState(config);
console.log(state.values.messages); // All messages in thread
```

**Tool Integration:**

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const searchTool = tool(
  async ({ query }) => {
    // Call your API or external service
    return await performSearch(query);
  },
  {
    name: 'search',
    description: 'Search for information',
    schema: z.object({ query: z.string() }),
  }
);

// LangGraph automatically handles:
// 1. LLM decides to call tool
// 2. Tool executes
// 3. Result sent back to LLM
// 4. LLM generates final response
```

---

## 5. Recommended Architecture

Based on research, here's the recommended approach:

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Custom Chat UI (DaisyUI components)                     │  │
│  │  - Chat bubbles, input, message list                     │  │
│  │  - File uploads, rich content rendering                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             │ useChatStream()                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Custom Hook (SSE/Fetch)                                 │  │
│  │  - Handles streaming responses                           │  │
│  │  - Message state management                              │  │
│  │  - Error handling                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ HTTP/SSE
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend (NestJS API)                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ChatController                                          │  │
│  │  POST /api/chat/stream                                   │  │
│  │  - Anonymous chat endpoint (no auth initially)           │  │
│  │  - Returns SSE stream                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  LangGraphService                                        │  │
│  │  - Graph definition (agent + tools)                      │  │
│  │  - Memory management (in-memory for anon, PG for users) │  │
│  │  - Streaming orchestration                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                ┌────────────┼────────────┐                      │
│                ▼            ▼            ▼                      │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────┐            │
│  │ MCPService   │  │   LLM     │  │   Tools      │            │
│  │ (External    │  │ (OpenAI,  │  │ (Custom      │            │
│  │  Servers)    │  │  Claude)  │  │  Functions)  │            │
│  └──────────────┘  └───────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Phases

**Phase 1: Anonymous Chat (MVP)**

- Custom React UI with DaisyUI
- NestJS endpoint for chat streaming
- LangGraph with in-memory checkpointing
- Basic tool calling (weather, search examples)
- No authentication required

**Phase 2: MCP Integration**

- Add MCPService to connect to external MCP servers
- Integrate MCP tools into LangGraph
- Expose MCP tool discovery to UI (optional: show available tools)

**Phase 3: User Management**

- Add Zitadel authentication
- Switch to PostgreSQL checkpointing for conversation persistence
- User-specific conversation history
- Rate limiting and usage tracking

**Phase 4: Advanced Features**

- File uploads and processing
- Rich content rendering (images, tables, charts)
- Conversation branching
- Export/share conversations
- Custom tool creation UI

### Key Benefits of This Approach

✅ **No separate deployment** - Everything in existing NestJS API  
✅ **Full control** - No dependency on LangGraph Server conventions  
✅ **Flexible UI** - Use familiar DaisyUI components  
✅ **PostgreSQL reuse** - Leverage existing database for persistence  
✅ **MCP compatible** - Can connect to any MCP server  
✅ **Incremental adoption** - Start simple, add features progressively  
✅ **Authentication ready** - Easy to add Zitadel when needed

---

## 6. Answers to Original Questions

### Q1: What can be obtained from LangChain UI React components?

**Answer:**

- Pre-built React components for rendering AI-generated UI
- `useStream()` hook for streaming from LangGraph Server
- `LoadExternalComponent` for dynamic component loading
- Tailwind/DaisyUI support out of the box
- **Limitation:** Requires LangGraph Server deployment

**Recommendation:** For maximum flexibility, build custom UI with DaisyUI instead of using LangChain Generative UI.

### Q2: What are alternative libraries for chat UI?

**Answer:**

- **Vercel AI SDK** - Most comprehensive (but you prefer to avoid)
- **MinChat UI** - Lightweight, no backend coupling
- **LlamaIndex Chat UI** - Good for LlamaIndex users
- **AWS Cloudscape** - Enterprise-grade
- **Custom DaisyUI** - ✅ **Recommended** for your use case

### Q3: How will MCP be connected to the server?

**Answer:**
Multiple transport options available:

1. **SSE (Server-Sent Events)** - ✅ Recommended for HTTP APIs
2. **WebSocket** - Good for bidirectional communication
3. **Stdio** - Process-based (for local MCP servers)
4. **Streamable HTTP** - REST-friendly

**Implementation:**

```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

@Injectable()
export class MCPService {
  private client: Client;

  async connect(mcpServerUrl: string) {
    const transport = new StreamableHTTPClientTransport(new URL(mcpServerUrl));
    this.client = new Client({ name: 'chat-api', version: '1.0.0' });
    await this.client.connect(transport);
  }

  async getTools() {
    return await this.client.listTools();
  }
}
```

### Q4: What functionality can be obtained from LangChain and LangGraph?

**Answer:**

**LangChain Core:**

- LLM integrations (OpenAI, Anthropic, etc.)
- Prompt templates and engineering
- Output parsers (JSON, structured data)
- Tool definitions and schemas
- Memory abstractions

**LangGraph:**

- ✅ **State management** - Complex conversation state
- ✅ **Streaming** - Real-time token streaming
- ✅ **Tool orchestration** - Automatic tool calling and routing
- ✅ **Memory** - Thread-based conversation history
- ✅ **Checkpointing** - PostgreSQL or in-memory persistence
- ✅ **Conditional routing** - Dynamic conversation flows
- ✅ **Multi-turn** - Automatic handling of tool results
- ✅ **Error recovery** - Retry logic and fallbacks

**Key Capability:** LangGraph can be embedded directly in your NestJS API - no separate server needed!

---

## 7. Next Steps

1. ✅ **Review this research** with the team
2. ✅ **Decide on architecture** (recommend: LangGraph in NestJS + Custom DaisyUI UI)
3. 📝 **Create prototype** (Phase 1: Anonymous Chat MVP)
4. 🧪 **Test MCP integration** with example MCP servers
5. 📊 **Evaluate performance** and refine architecture
6. 🚀 **Implement incrementally** following the phased approach

---

## Appendix: Code Examples

### A. Custom Chat Hook (Alternative to Vercel AI SDK)

```typescript
// hooks/useChatStream.ts
import { useState, useCallback } from 'react';

export function useChatStream(apiUrl: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      setIsLoading(true);
      setError(null);

      const userMessage = { role: 'user', content, id: Date.now() };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...messages, userMessage] }),
        });

        if (!response.ok) throw new Error('Failed to send message');

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const decoder = new TextDecoder();
        let assistantMessage = {
          role: 'assistant',
          content: '',
          id: Date.now() + 1,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              assistantMessage.content += data.message?.content || '';
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { ...assistantMessage },
              ]);
            }
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [apiUrl, messages]
  );

  return { messages, sendMessage, isLoading, error };
}
```

### B. NestJS Controller with SSE

```typescript
// chat.controller.ts
import { Controller, Post, Body, Res, Sse } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';

@Controller('chat')
export class ChatController {
  constructor(private langGraph: LangGraphService) {}

  @Post('stream')
  async streamChat(@Body() body: { messages: any[] }, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const stream = await this.langGraph.streamChat(
        body.messages,
        `anon-${Date.now()}` // Anonymous thread ID
      );

      for await (const [message, metadata] of stream) {
        res.write(`data: ${JSON.stringify({ message, metadata })}\n\n`);
      }

      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}
```

### C. DaisyUI Chat Component

```typescript
// components/Chat.tsx
import { useChatStream } from '../hooks/useChatStream';

export function Chat() {
  const { messages, sendMessage, isLoading } =
    useChatStream('/api/chat/stream');
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat ${
              msg.role === 'user' ? 'chat-end' : 'chat-start'
            }`}
          >
            <div className="chat-header">
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div
              className={`chat-bubble ${
                msg.role === 'user' ? 'chat-bubble-primary' : ''
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat chat-start">
            <div className="chat-bubble">
              <span className="loading loading-dots loading-sm"></span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="join w-full">
          <input
            type="text"
            className="input input-bordered join-item flex-1"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="btn btn-primary join-item"
            disabled={isLoading || !input.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## References

1. [LangChain Generative UI Documentation](https://docs.langchain.com/langsmith/generative-ui-react)
2. [Model Context Protocol (MCP) Documentation](https://modelcontextprotocol.io)
3. [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
4. [LangGraph JS Documentation](https://langchain-ai.github.io/langgraphjs)
5. [MinChat UI Repository](https://github.com/MinChatHQ/react-chat-ui)
6. [MCP SDK on GitHub](https://github.com/modelcontextprotocol/sdk)
