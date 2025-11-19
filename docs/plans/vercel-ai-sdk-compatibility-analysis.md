# Vercel AI SDK + LangGraph Compatibility Analysis

**Date:** November 19, 2025  
**Status:** Research Complete  
**Question:** Can Vercel AI SDK UI (`useChat`) work with a custom LangGraph backend in NestJS?

---

## Executive Summary

**✅ YES! Vercel AI SDK is fully compatible with custom LangGraph backends.**

Key findings:

- Vercel AI SDK is **NOT vendor-locked** to Vercel infrastructure
- The backend is just a **protocol specification** (streaming format)
- You can use `streamText()` from AI SDK Core to wrap any LLM (including LangGraph)
- **Zero Vercel-specific dependencies** required on the backend
- **100% open source** (Apache 2.0 license)

**Recommended Architecture:**

```
Frontend: Vercel AI SDK UI (useChat hook)
    ↓ HTTP/SSE
Backend: NestJS + LangGraph + AI SDK Core (streamText wrapper)
```

---

## 1. How Vercel AI SDK Works (Architecture)

### Frontend (AI SDK UI)

```typescript
import { useChat } from '@ai-sdk/react';

const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat', // YOUR custom endpoint
  }),
});
```

**What it does:**

- Sends messages to YOUR specified API endpoint
- Handles streaming responses (SSE or HTTP)
- Manages chat state (messages, loading, errors)
- **No Vercel services involved**

### Backend (AI SDK Core - OPTIONAL)

Vercel provides `streamText()` as a **convenience wrapper**, but it's optional:

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4'),
    messages: convertToModelMessages(messages),
  });

  // Converts to the streaming format useChat expects
  return result.toUIMessageStreamResponse();
}
```

**What `streamText()` provides:**

- Standardized streaming format (UI Message Stream Protocol)
- Error handling
- Tool calling support
- **Works with 50+ LLM providers** (OpenAI, Anthropic, etc.)
- **Can be replaced with your own implementation**

---

## 2. Can You Use Your Own Backend?

**YES! You have THREE options:**

### Option A: Use Vercel AI SDK Core with LangGraph (Recommended)

Vercel's `streamText()` can wrap ANY language model, including LangGraph:

```typescript
// apps/server/src/modules/chat/chat.controller.ts
import { streamText, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';

@Controller('chat')
export class ChatController {
  constructor(private langGraph: LangGraphService) {}

  @Post('stream')
  async streamChat(@Body() body: { messages: any[] }) {
    const { messages } = body;

    // Option 1: Use AI SDK's streamText directly
    const result = streamText({
      model: openai('gpt-4'),
      messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  }
}
```

**Pros:**

- ✅ Leverage AI SDK's streaming format (works perfectly with `useChat`)
- ✅ Built-in error handling
- ✅ Tool calling support
- ✅ No custom protocol implementation needed

**Cons:**

- ⚠️ Adds `ai` package dependency (~100KB)
- ⚠️ Less control over streaming format

### Option B: Wrap LangGraph with AI SDK Core

You can create a **custom wrapper** that uses LangGraph internally:

```typescript
// apps/server/src/modules/chat/chat.controller.ts
import { streamText } from 'ai';

@Controller('chat')
export class ChatController {
  constructor(private langGraph: LangGraphService) {}

  @Post('stream')
  async streamChat(@Body() body: { messages: any[] }) {
    const { messages } = body;

    // Create a custom model wrapper for LangGraph
    const customModel = {
      provider: 'langgraph',
      modelId: 'custom',
      doStream: async (options) => {
        // Use LangGraph internally
        const stream = await this.langGraph.streamChat(messages, 'thread-123');

        // Convert LangGraph stream to AI SDK format
        return {
          stream: this.convertLangGraphToAIStream(stream),
          rawCall: {},
        };
      },
    };

    const result = streamText({
      model: customModel,
      messages,
    });

    return result.toUIMessageStreamResponse();
  }

  private async *convertLangGraphToAIStream(langGraphStream) {
    for await (const [message, metadata] of langGraphStream) {
      yield {
        type: 'text-delta',
        textDelta: message.content || '',
      };
    }
  }
}
```

**Pros:**

- ✅ Full control over LangGraph orchestration
- ✅ Still get AI SDK streaming format
- ✅ Can add custom logic (memory, routing, etc.)

**Cons:**

- ⚠️ More complex setup
- ⚠️ Need to implement stream conversion

### Option C: Implement UI Message Stream Protocol Manually

You can skip AI SDK Core entirely and implement the protocol yourself:

```typescript
// apps/server/src/modules/chat/chat.controller.ts
@Controller('chat')
export class ChatController {
  constructor(private langGraph: LangGraphService) {}

  @Post('stream')
  async streamChat(@Body() body: { messages: any[] }, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { messages } = body;
    const stream = await this.langGraph.streamChat(messages, 'thread-123');

    // Send in UI Message Stream format
    res.write(`0:${JSON.stringify({ type: 'start' })}\n`);

    let messageId = 1;
    for await (const [message, metadata] of stream) {
      if (message.content) {
        const chunk = {
          type: 'text',
          text: message.content,
        };
        res.write(`${messageId}:${JSON.stringify(chunk)}\n`);
        messageId++;
      }
    }

    res.write(
      `${messageId}:${JSON.stringify({
        type: 'finish',
        finishReason: 'stop',
      })}\n`
    );
    res.end();
  }
}
```

**Pros:**

- ✅ Zero AI SDK dependencies
- ✅ Complete control

**Cons:**

- ⚠️ Must implement the protocol correctly
- ⚠️ More maintenance burden
- ⚠️ Need to handle errors, tool calls, etc. manually

---

## 3. The UI Message Stream Protocol

The protocol `useChat` expects is simple and well-documented:

**Format:** Newline-delimited messages with `id:payload` format

```
0:{"type":"start"}
1:{"type":"text","text":"Hello"}
2:{"type":"text","text":" world"}
3:{"type":"finish","finishReason":"stop"}
```

**Message Types:**

- `start` - Stream started
- `text` - Text delta (streaming token)
- `tool-call` - LLM calling a tool
- `tool-result` - Tool execution result
- `finish` - Stream ended
- `error` - Error occurred

**Full specification:** https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol

**Key Insight:** This is just a streaming format, not a Vercel service. You can implement it yourself or use their helper functions.

---

## 4. Vendor Lock-In Analysis

### What's Open Source?

- ✅ **AI SDK UI** (`@ai-sdk/react`) - Apache 2.0
- ✅ **AI SDK Core** (`ai`) - Apache 2.0
- ✅ **All provider adapters** - Apache 2.0
- ✅ **Stream protocol** - Publicly documented

### What's Vercel-Specific?

- ⚠️ Some examples use Next.js (but not required)
- ⚠️ Documentation mentions Vercel deployment (but works anywhere)

### Can You Switch Away?

**YES!** The migration path is clear:

1. **Move off `useChat`** → Use custom React hook (you control the state)
2. **Move off AI SDK Core** → Implement stream protocol manually
3. **Keep using `useChat` with custom backend** → Already backend-agnostic!

### Real-World Usage (Non-Vercel)

Found examples in production:

- **VoltAgent** - Uses `toUIMessageStreamResponse` with custom agents
- **Tldraw** - Uses `toTextStreamResponse` with Cloudflare Workers
- **Hono.js example** - Shows usage outside Next.js

**Verdict:** ✅ **No vendor lock-in. It's just a protocol.**

---

## 5. Recommended Architecture for Your Project

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   Frontend (React + DaisyUI)                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  useChat() from @ai-sdk/react                            │  │
│  │  - Handles streaming                                     │  │
│  │  - Manages message state                                 │  │
│  │  - Error handling                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             │ POST /api/chat/stream             │
│                             ▼                                   │
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
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AI SDK Core (optional wrapper)                          │  │
│  │  streamText() + toUIMessageStreamResponse()              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  LangGraphService                                        │  │
│  │  - Graph definition (agent + tools)                      │  │
│  │  - Memory (PostgreSQL checkpointing)                     │  │
│  │  - Tool execution                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                   │
│                ┌────────────┼────────────┐                      │
│                ▼            ▼            ▼                      │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────┐            │
│  │ MCPService   │  │   LLM     │  │   Tools      │            │
│  │ (External)   │  │ (OpenAI)  │  │ (Custom)     │            │
│  └──────────────┘  └───────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Example

**Frontend:**

```typescript
// apps/admin/src/pages/chat.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: 'http://localhost:3000/api/chat/stream', // Your NestJS endpoint
    }),
  });

  const [input, setInput] = useState('');

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
            <div className="chat-bubble">
              {msg.parts.map((part, index) =>
                part.type === 'text' ? (
                  <span key={index}>{part.text}</span>
                ) : null
              )}
            </div>
          </div>
        ))}

        {status === 'streaming' && (
          <div className="chat chat-start">
            <div className="chat-bubble">
              <span className="loading loading-dots loading-sm"></span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
        className="p-4 border-t"
      >
        <div className="join w-full">
          <input
            type="text"
            className="input input-bordered join-item flex-1"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status !== 'ready'}
          />
          <button
            type="submit"
            className="btn btn-primary join-item"
            disabled={status !== 'ready' || !input.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

**Backend (Option A - Using AI SDK Core with LangGraph):**

```typescript
// apps/server/src/modules/chat/chat.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { LangGraphService } from './services/langgraph.service';

@Controller('chat')
export class ChatController {
  constructor(private langGraph: LangGraphService) {}

  @Post('stream')
  async streamChat(@Body() body: { messages: any[] }) {
    const { messages } = body;

    // Use AI SDK's streamText with OpenAI
    // (LangGraph can be integrated as tools)
    const result = streamText({
      model: openai('gpt-4'),
      messages: convertToModelMessages(messages),
      tools: {
        // Expose LangGraph capabilities as tools
        processDocument: {
          description: 'Process a document with LangGraph',
          inputSchema: z.object({
            documentId: z.string(),
          }),
          execute: async ({ documentId }) => {
            return await this.langGraph.processDocument(documentId);
          },
        },
      },
    });

    // Convert to UI Message Stream format
    return result.toUIMessageStreamResponse();
  }
}
```

**Backend (Option B - LangGraph as Primary, AI SDK for Streaming):**

```typescript
// apps/server/src/modules/chat/chat.controller.ts
import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { LangGraphService } from './services/langgraph.service';

@Controller('chat')
export class ChatController {
  constructor(private langGraph: LangGraphService) {}

  @Post('stream')
  async streamChat(@Body() body: { messages: any[] }, @Res() res: Response) {
    const { messages } = body;

    // Get LangGraph stream
    const stream = await this.langGraph.streamChat(
      messages,
      `thread-${Date.now()}`
    );

    // Convert to UI Message Stream format manually
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('X-Vercel-AI-Data-Stream', 'v1');

    let messageId = 0;

    // Start event
    res.write(`${messageId}:${JSON.stringify({ type: 'start' })}\n`);
    messageId++;

    // Stream LangGraph messages
    for await (const [message, metadata] of stream) {
      if (message.content) {
        res.write(
          `${messageId}:${JSON.stringify({
            type: 'text',
            text: message.content,
          })}\n`
        );
        messageId++;
      }

      // Handle tool calls if present
      if (message.tool_calls?.length) {
        for (const toolCall of message.tool_calls) {
          res.write(
            `${messageId}:${JSON.stringify({
              type: 'tool-call',
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              input: toolCall.args,
            })}\n`
          );
          messageId++;
        }
      }
    }

    // Finish event
    res.write(
      `${messageId}:${JSON.stringify({
        type: 'finish',
        finishReason: 'stop',
      })}\n`
    );

    res.end();
  }
}
```

---

## 6. Benefits of Using Vercel AI SDK

### Why Use It?

1. **Battle-tested** - Used by thousands of production apps
2. **Excellent DX** - TypeScript support, great docs
3. **Feature-rich** - Tool calling, streaming, error handling, retries
4. **Framework agnostic** - Works with React, Vue, Svelte, Angular
5. **Provider agnostic** - 50+ LLM providers supported
6. **Open source** - Can fork/modify if needed

### What It Saves You

Building a robust chat UI from scratch requires:

- ✅ Streaming state management
- ✅ Error handling and retries
- ✅ Tool call orchestration
- ✅ Message persistence
- ✅ Optimistic updates
- ✅ Abort/cancel handling
- ✅ Token usage tracking

**Vercel AI SDK handles all of this.** Your time is better spent on:

- Your LangGraph orchestration logic
- Custom tools and integrations
- Domain-specific features

---

## 7. Migration Path (If Needed)

If you later decide to move away from Vercel AI SDK:

### Phase 1: Keep `useChat`, Replace Backend

```
Frontend: useChat (no changes)
Backend: Custom streaming endpoint (implement protocol)
```

**Effort:** Low (1-2 days)

### Phase 2: Replace `useChat`

```
Frontend: Custom React hook (state management)
Backend: Any streaming format you want
```

**Effort:** Medium (3-5 days)

### Exit Risk: **LOW**

- No proprietary APIs
- No Vercel services required
- Protocol is public and simple

---

## 8. Comparison: Vercel AI SDK vs. Custom

| Feature            | Vercel AI SDK         | Custom Implementation |
| ------------------ | --------------------- | --------------------- |
| **Setup Time**     | 30 minutes            | 2-3 days              |
| **Streaming**      | ✅ Built-in           | ⚠️ Must implement     |
| **Error Handling** | ✅ Built-in           | ⚠️ Must implement     |
| **Tool Calling**   | ✅ Built-in           | ⚠️ Must implement     |
| **Type Safety**    | ✅ Excellent          | ⚠️ Manual             |
| **Documentation**  | ✅ Comprehensive      | ⚠️ Self-documented    |
| **Maintenance**    | ✅ Community          | ⚠️ Your team          |
| **Control**        | ⚠️ Some constraints   | ✅ Full control       |
| **Dependencies**   | ⚠️ ~100KB             | ✅ Zero               |
| **Vendor Lock-in** | ✅ None (open source) | ✅ None               |

---

## 9. Recommendation

### ✅ **Use Vercel AI SDK + LangGraph**

**Reasons:**

1. **Not vendor-locked** - Open source, can migrate easily
2. **Saves weeks of development** - Robust streaming, error handling, tool calling
3. **Battle-tested** - Production-ready, used by major companies
4. **Excellent DX** - TypeScript, docs, examples
5. **LangGraph compatible** - Can be integrated as backend or as tools
6. **No Vercel infrastructure required** - Works with NestJS, Express, Fastify, etc.

**Architecture:**

```
Frontend: Vercel AI SDK UI (useChat)
Backend: NestJS + LangGraph + AI SDK Core (streamText wrapper)
```

**Implementation Approach:**

- Start with AI SDK's `streamText()` + OpenAI
- Add LangGraph capabilities as tools
- Gradually migrate to LangGraph as primary orchestrator
- Use `toUIMessageStreamResponse()` to maintain compatibility

**Dependencies:**

```json
{
  "dependencies": {
    "@ai-sdk/react": "^1.0.0", // Frontend only
    "ai": "^4.0.0", // Backend only (optional)
    "@ai-sdk/openai": "^1.0.0", // Backend only
    "@langchain/langgraph": "^0.2.0"
  }
}
```

**Total added weight:** ~100KB (backend only, gzipped)

---

## 10. Next Steps

1. ✅ **Decision made:** Use Vercel AI SDK + LangGraph
2. 📝 **Update architecture docs** with this approach
3. 🧪 **Create proof of concept:**
   - Install dependencies
   - Implement basic chat endpoint with `streamText()`
   - Test with `useChat` on frontend
4. 🚀 **Iterate:**
   - Add LangGraph integration
   - Implement tool calling
   - Add MCP server connections
   - Switch to PostgreSQL memory

---

## Conclusion

**Vercel AI SDK is a perfect fit for your use case:**

- ✅ **No vendor lock-in** - Open source, backend-agnostic
- ✅ **LangGraph compatible** - Can integrate seamlessly
- ✅ **Production-ready** - Battle-tested by thousands of apps
- ✅ **Time-saving** - Focus on your domain logic, not streaming protocols
- ✅ **Great DX** - Excellent TypeScript support and documentation

**You get:**

- Robust frontend chat UI (DaisyUI styling)
- Streaming handled by `useChat`
- LangGraph orchestration on backend
- MCP server integrations
- PostgreSQL memory persistence
- All running in your NestJS API

**You avoid:**

- Weeks of custom streaming implementation
- Complex state management
- Error handling edge cases
- Vendor lock-in to Vercel infrastructure

**Go ahead and use it!** 🚀
