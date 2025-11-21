# Chat RAG Integration with Knowledge Graph

## Overview

This document describes the integration of Retrieval-Augmented Generation (RAG) with the chat system, enabling the AI to access and reference knowledge from the unified search system (graph objects + document chunks).

## Architecture

### Components

1. **Unified Search System** (`unified-search.service.ts`)

   - Hybrid search combining:
     - **Graph Search**: Vector + lexical search over knowledge graph objects
     - **Text Search**: Vector + lexical search over document chunks
   - Fusion strategies: RRF (Reciprocal Rank Fusion), weighted sum
   - Relationship expansion for graph objects

2. **LangChain Tool** (NEW: `chat-search.tool.ts`)

   - Wraps unified search as a LangChain tool
   - AI can invoke this tool to search knowledge base
   - Returns structured results with metadata

3. **LangGraph Service** (ENHANCED: `langgraph.service.ts`)

   - Agent node with tool binding
   - Tool execution node
   - Conditional routing: agent → tools → agent → end

4. **Frontend Rendering** (NEW: `GraphObjectBadge.tsx`)
   - Rich UI components for knowledge graph objects
   - Similar to URL badges but with graph-specific metadata
   - Shows: object type, key, name, relationships

## Implementation Phases

### Phase 1: Local Tool Implementation (Without MCP)

#### 1.1 Create LangChain Search Tool

**File**: `apps/server/src/modules/chat-sdk/tools/chat-search.tool.ts`

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { UnifiedSearchService } from '../../unified-search/unified-search.service';

export function createChatSearchTool(
  searchService: UnifiedSearchService,
  context: { orgId: string; projectId: string; scopes: string[] }
) {
  return new DynamicStructuredTool({
    name: 'search_knowledge_base',
    description: `Search the knowledge base for relevant information. 
    
This tool searches both:
- Knowledge graph objects (concepts, entities, decisions, etc.)
- Document chunks (text content from uploaded documents)

Use this when the user asks about:
- Specific concepts, entities, or decisions
- Technical documentation or architecture
- Historical context or previous discussions
- Any information that might be in the knowledge base

The search returns structured results with relevance scores.`,

    schema: z.object({
      query: z.string().describe('Natural language search query'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Max results to return (1-10)'),
      includeGraph: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include knowledge graph objects'),
      includeText: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include document chunks'),
    }),

    func: async ({ query, limit, includeGraph, includeText }) => {
      // Determine result types
      let resultTypes: 'graph' | 'text' | 'both' = 'both';
      if (includeGraph && !includeText) resultTypes = 'graph';
      if (!includeGraph && includeText) resultTypes = 'text';

      // Execute search
      const response = await searchService.search(
        {
          query,
          limit: Math.min(limit || 5, 10), // Cap at 10
          resultTypes,
          fusionStrategy: 'rrf', // RRF works well for LLM context
          weights: { graph: 0.6, text: 0.4 }, // Slight preference for graph
          relationshipOptions: {
            enabled: true,
            maxDepth: 1,
            maxPerNode: 3,
          },
        },
        context
      );

      // Format results for LLM consumption
      const formattedResults = response.results.map((result) => {
        if (result.type === 'graph') {
          return {
            type: 'graph_object',
            object_type: result.objectType,
            key: result.key,
            name: result.name,
            snippet: result.snippet,
            score: result.score,
            relationships: result.relationships?.map((rel) => ({
              type: rel.type,
              target_key: rel.targetKey,
              target_name: rel.targetName,
            })),
          };
        } else {
          return {
            type: 'document_chunk',
            text: result.text,
            source: result.source,
            score: result.score,
          };
        }
      });

      // Return as formatted string for LLM
      return JSON.stringify(
        {
          query,
          total_results: response.metadata.totalResults,
          results: formattedResults,
          metadata: {
            graph_count: response.metadata.graphResultCount,
            text_count: response.metadata.textResultCount,
            execution_time_ms: response.metadata.executionTime.totalMs,
          },
        },
        null,
        2
      );
    },
  });
}
```

#### 1.2 Integrate Tool with LangGraph

**File**: `apps/server/src/modules/chat-sdk/chat-sdk.service.ts`

Add tool creation and pass to LangGraph:

```typescript
import { createChatSearchTool } from './tools/chat-search.tool';

async streamChat(options: ChatSdkStreamOptions): Promise<ChatSdkStreamResult> {
  // ... existing code ...

  // Create search tool with tenant context
  const searchTool = createChatSearchTool(
    this.unifiedSearchService,
    {
      orgId: organizationId, // Need to get from context
      projectId: conversationProjectId, // Need to get from conversation
      scopes: ['search:read', 'graph:search:read'],
    }
  );

  // Get LangGraph stream WITH TOOLS
  const langGraphStream = await this.langGraphService.streamConversation({
    message: messageContent,
    threadId: dbConversationId,
    tools: [searchTool], // Pass tools to LangGraph
  });

  // ... rest of code ...
}
```

#### 1.3 Update LangGraph to Support Tools

**File**: `apps/server/src/modules/chat-ui/services/langgraph.service.ts`

```typescript
import { ToolNode } from '@langchain/langgraph/dist/prebuilt/tool_node';

export interface StreamConversationOptions {
  message: string;
  threadId: string;
  tools?: any[]; // LangChain tools
}

private buildGraphWithTools(tools?: any[]) {
  if (!this.model) return null;

  const workflow = new StateGraph(GraphState);

  if (tools && tools.length > 0) {
    // Bind tools to model
    const modelWithTools = this.model.bindTools(tools);

    // Create tool execution node
    const toolNode = new ToolNode(tools);

    // Add agent node
    workflow.addNode('agent', async (state) => {
      const response = await modelWithTools.invoke(state.messages);
      return { messages: [response] };
    });

    // Add tool node
    workflow.addNode('tools', toolNode);

    // Conditional edge: agent → tools or end
    workflow.addConditionalEdges('agent', (state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage?.tool_calls?.length > 0) {
        return 'tools';
      }
      return '__end__';
    });

    // After tools, return to agent
    workflow.addEdge('tools', 'agent');
    workflow.addEdge('__start__', 'agent');
  } else {
    // Simple flow without tools
    workflow.addNode('agent', async (state) => {
      const response = await this.model.invoke(state.messages);
      return { messages: [response] };
    });
    workflow.addEdge('__start__', 'agent');
    workflow.addEdge('agent', '__end__');
  }

  return workflow.compile({ checkpointer: this.checkpointer });
}

async streamConversation(options: StreamConversationOptions) {
  const { message, threadId, tools } = options;

  // Build graph with tools if provided
  const graph = tools?.length > 0
    ? this.buildGraphWithTools(tools)
    : this.graph;

  if (!graph) {
    throw new Error('LangGraph not initialized');
  }

  return graph.stream(
    { messages: [new HumanMessage(message)] },
    { configurable: { thread_id: threadId }, streamMode: 'values' }
  );
}
```

### Phase 2: Frontend Rendering

#### 2.1 Create GraphObjectBadge Component

**File**: `apps/admin/src/components/chat/GraphObjectBadge.tsx`

```typescript
interface GraphObjectBadgeProps {
  objectType: string; // 'decision', 'concept', 'entity', etc.
  objectKey: string;
  name: string;
  relationships?: Array<{
    type: string;
    targetKey: string;
    targetName: string;
  }>;
}

export function GraphObjectBadge({
  objectType,
  objectKey,
  name,
  relationships,
}: GraphObjectBadgeProps) {
  // Icon based on object type
  const icon = getIconForObjectType(objectType);

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg">
      {/* Type Icon */}
      <span className={`iconify ${icon} size-4 text-primary`}></span>

      {/* Content */}
      <div className="flex flex-col">
        <span className="text-sm font-medium text-primary">{name}</span>
        <span className="text-xs text-base-content/60">{objectKey}</span>

        {/* Relationships (hover tooltip or inline) */}
        {relationships && relationships.length > 0 && (
          <div className="text-xs text-base-content/50 mt-1">
            +{relationships.length} related
          </div>
        )}
      </div>

      {/* Link to graph explorer */}
      <a
        href={`/graph/objects/${objectKey}`}
        className="iconify lucide--external-link size-3 text-primary/60"
      />
    </div>
  );
}

function getIconForObjectType(type: string): string {
  const iconMap: Record<string, string> = {
    decision: 'lucide--git-branch',
    concept: 'lucide--lightbulb',
    entity: 'lucide--box',
    requirement: 'lucide--check-square',
    default: 'lucide--circle',
  };
  return iconMap[type] || iconMap.default;
}
```

#### 2.2 Detect and Render Graph Object Mentions

**Approach**: Parse AI responses for graph object references and render as badges.

**Pattern**: `@[object_key]` or `[[object_key|name]]`

**File**: `apps/admin/src/components/chat/MessageBubble.tsx`

```typescript
// Add custom remark plugin to detect graph object mentions
function remarkGraphObjects() {
  return (tree: any) => {
    visit(tree, 'text', (node, index, parent) => {
      const text = node.value;
      const pattern = /@\[([^\]]+)\]|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

      // Split text and create nodes
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = pattern.exec(text)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push({
            type: 'text',
            value: text.slice(lastIndex, match.index),
          });
        }

        // Add graph object node
        const objectKey = match[1] || match[2];
        const name = match[3] || objectKey;

        parts.push({
          type: 'graphObject',
          data: { objectKey, name },
        });

        lastIndex = pattern.lastIndex;
      }

      // Add remaining text
      if (lastIndex < text.length) {
        parts.push({
          type: 'text',
          value: text.slice(lastIndex),
        });
      }

      // Replace node with parts
      if (parts.length > 1) {
        parent.children.splice(index, 1, ...parts);
      }
    });
  };
}

// In MessageBubble component
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkGraphObjects]}
  components={{
    graphObject: ({ data }) => (
      <GraphObjectBadge
        objectType="unknown"
        objectKey={data.objectKey}
        name={data.name}
      />
    ),
    // ... other components
  }}
>
  {textContent}
</ReactMarkdown>;
```

### Phase 3: MCP Integration (Future)

#### 3.1 MCP Server for Knowledge Graph

Create MCP server that exposes knowledge graph as a resource:

**File**: `tools/mcp-servers/knowledge-graph/index.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'knowledge-graph',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Register search tool
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'search_knowledge_base') {
    const { query, limit } = request.params.arguments;

    // Call unified search API
    const response = await fetch('http://localhost:3002/api/search/unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });

    return { content: await response.text() };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### 3.2 Register MCP Server with OpenCode

**File**: `.vscode/mcp.json`

```json
{
  "mcpServers": {
    "knowledge-graph": {
      "command": "node",
      "args": ["tools/mcp-servers/knowledge-graph/index.js"],
      "env": {
        "API_BASE_URL": "http://localhost:3002"
      }
    }
  }
}
```

## Benefits

### Context Enrichment

- AI has access to full knowledge base
- Can reference specific decisions, concepts, entities
- Understands relationships between objects

### Rich UI Rendering

- Graph objects rendered as interactive badges
- Users can click to explore in graph viewer
- Visual distinction between different object types

### Scalability

- Tool-based approach works with any LLM
- MCP enables sharing across different AI tools
- Unified search handles growing knowledge base efficiently

## Testing Strategy

### Unit Tests

- Test search tool with various queries
- Test graph rendering with different object types
- Test mention parsing and badge rendering

### Integration Tests

- Test full flow: user query → search → AI response → badge rendering
- Test with different conversation contexts
- Test error handling (search failures, missing objects)

### E2E Tests

- Test chat interface with knowledge base queries
- Test clicking on graph object badges
- Test relationship exploration

## Performance Considerations

### Search Performance

- Limit search results to 5-10 items (configurable)
- Use RRF fusion for balanced results
- Cache frequent queries (future enhancement)

### Streaming Performance

- LangGraph streams tool calls
- Frontend renders progressively
- No blocking during search execution

### Token Budget

- Search results formatted concisely for LLM
- Relationship expansion limited to 1 depth, 3 per node
- Token usage tracked and logged

## Security Considerations

### Tenant Isolation

- Search tool receives org/project context
- RLS policies enforce data isolation
- User scopes validated before search

### Search Scope

- Only users with `search:read` and `graph:search:read` can use tool
- Debug information hidden by default
- Rate limiting on search API (future enhancement)

## Migration Path

### Phase 1 (Current): Local Tool

1. ✅ UrlBadge component created
2. ⏳ Create ChatSearchTool
3. ⏳ Integrate with LangGraph
4. ⏳ Test end-to-end

### Phase 2: Enhanced Rendering

1. ⏳ Create GraphObjectBadge
2. ⏳ Add mention detection
3. ⏳ Add relationship tooltips
4. ⏳ Link to graph explorer

### Phase 3: MCP Integration

1. ⏳ Create MCP server
2. ⏳ Test with OpenCode
3. ⏳ Document for other AI tools
4. ⏳ Add monitoring and metrics

## Related Documentation

- `apps/server/src/modules/unified-search/README.md` - Unified search architecture
- `apps/server/src/modules/graph-search/README.md` - Graph search details
- `docs/architecture/rag-pipeline.md` - RAG pipeline overview
- `docs/testing/AI_AGENT_GUIDE.md` - Testing guidelines
