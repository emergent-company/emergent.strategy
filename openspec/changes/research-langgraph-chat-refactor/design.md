# Design: LangGraph UI Chat Refactor

## Overview

This document captures architectural considerations, design decisions, and technical findings from researching the feasibility of refactoring our chat functionality to use LangGraph UI with MCP integration.

**Note:** This is a living document that will be populated during the research phase. Initial sections outline questions and considerations; later sections will document findings and decisions.

## Current Architecture (Baseline)

### System Components

```
┌─────────────────┐
│  React Frontend │
│  (apps/admin)   │
│                 │
│  - ChatPage     │
│  - useChat hook │
│  - SSE handling │
└────────┬────────┘
         │ HTTP/SSE
         │
┌────────▼────────┐
│  NestJS API     │
│  (apps/server)  │
│                 │
│  ChatController │
│  ChatService    │
│  ChatGeneration │
│  McpClient      │
└────────┬────────┘
         │
    ┌────┼─────┐
    │    │     │
┌───▼──┐ │  ┌──▼─────────┐
│ PG + │ │  │ LangChain/ │
│Vector│ │  │ Gemini API │
└──────┘ │  └────────────┘
         │
    ┌────▼────────┐
    │ MCP Tools   │
    │ (schema,    │
    │  future:    │
    │  data)      │
    └─────────────┘
```

### Data Flow (Current)

1. User types message in React chat UI
2. Frontend sends POST to `/chat/stream` via SSE
3. ChatController orchestrates:
   - MCP tool detection (keyword-based)
   - Optional MCP tool invocation
   - Graph/document search for context
   - LangChain prompt building
   - Streaming response via SSE
4. Frontend receives SSE frames (tokens, citations, objects)
5. React components render chat bubbles with embedded objects

### Current Pain Points

1. **Custom UI Development:** Every chat feature requires React component work
2. **Streaming Complexity:** SSE frame handling, reconnection logic, parsing
3. **Object Rendering:** Manual serialization and UI component mapping
4. **Tool Integration:** Custom MCP client with manual plumbing
5. **Scalability:** Chat logic tightly coupled to main API server

## Proposed Architecture (Research Target)

### High-Level Vision (Separate Chat App)

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  React Admin App        │     │  Chat App (NEW)          │
│  (apps/admin)           │     │  (apps/chat)             │
│                         │     │                          │
│  - Existing features    │     │  - Next.js frontend      │
│  - Imports libs/shared-ui│    │  - useStream() hook      │
│                         │     │  - LoadExternalComponent │
└─────────────────────────┘     └───────────┬──────────────┘
                                            │ HTTP + SSE
                                ┌───────────▼──────────────┐
                                │  LangGraph Server        │
                                │  (Agent Server)          │
                                │                          │
                                │  - Graph nodes (TS)      │
                                │  - UI component bundler  │
                                │  - State persistence     │
                                │  - Tool execution        │
                                └───────────┬──────────────┘
                                            │
                   ┌────────────────────────┼─────────────┐
                   │                        │             │
              ┌────▼────┐            ┌─────▼──────┐  ┌──▼──────┐
              │ PG +    │            │ Redis OR   │  │ NestJS  │
              │ Vector  │            │ PG Queue?  │  │ API     │
              │         │            │ (TBD)      │  │ (RLS)   │
              └─────────┘            └────────────┘  └─────────┘
                                            ▲
                                            │
                              CRITICAL RESEARCH QUESTION:
                              Can we use PostgreSQL queue
                              instead of Redis?
```

### Shared UI Component Library

```
┌─────────────────────────────────────┐
│     libs/shared-ui/                 │
│                                     │
│  - DaisyUI components               │
│    • DocumentCard                   │
│    • CitationList                   │
│    • GraphNode                      │
│    • ChatMessage                    │
│  - Tailwind config                  │
│  - Common utilities                 │
└──────────┬──────────────────────────┘
           │ imported by
    ┌──────┴────────┐
    │               │
    ▼               ▼
apps/admin    apps/chat
```

### Key Design Questions

#### Q1: Redis Requirement (CRITICAL RESEARCH PRIORITY)

**Problem:** LangGraph Server documentation mentions Redis for task queue, but we only use PostgreSQL.

**Options:**

A. **Add Redis** (if truly required)

- Pros: Official support, proven, may be necessary
- Cons: New dependency, operational complexity, another service to manage

B. **PostgreSQL-Based Queue** (pgboss, graphile-worker)

- Pros: Reuse existing database, no new service
- Cons: May not be supported by LangGraph Server, performance concerns

C. **Custom PostgreSQL Queue** (LISTEN/NOTIFY)

- Pros: Minimal dependencies, full control
- Cons: Significant development effort, may not integrate with LangGraph

D. **In-Memory Queue** (development only)

- Pros: Simplest for prototype
- Cons: Not production-ready, loses tasks on restart

**Research Actions:**

1. Check LangGraph Server source code - is Redis hard requirement or configurable?
2. Look for PostgreSQL queue adapter or configuration options
3. Test LangGraph Server with pgboss as queue backend
4. If Redis is mandatory, assess operational impact and acceptance criteria

**Decision:** TBD during research Phase 1 (documentation review) and Phase 2 (prototype)

#### Q2: MCP Architecture

**Options:**

A. **Extend Existing MCP Server** (`apps/server/src/modules/mcp`)

- Add more tools for documents, graph, search
- Reuse authentication and service layer
- Keep MCP and REST API in same process

B. **Dedicated MCP Server** (new service)

- Standalone MCP server that calls REST API
- Clean separation of concerns
- Easier to scale independently

C. **LangGraph Embedded MCP** (if supported)

- MCP tools defined within LangGraph config
- Simplest integration but least flexible

**Decision:** TBD during research

#### Q2: Separate App Structure

**Decision:** Deploy as separate app (`apps/chat`) with shared UI library.

**Structure:**

```
apps/
  admin/                 # Existing React admin
  chat/                  # NEW: Chat app
    frontend/            # Next.js frontend
      src/
        app/             # Next.js app router
        components/      # Chat-specific components
    backend/             # LangGraph configuration
      langgraph.json     # Graph definitions
      src/
        agent/
          index.ts       # Graph nodes
          ui.tsx         # UI components (import from libs/shared-ui)
          tools.ts       # Tool definitions
libs/
  shared-ui/             # NEW: Shared DaisyUI components
    src/
      components/
        DocumentCard.tsx
        CitationList.tsx
        GraphNode.tsx
        ChatMessage.tsx
      styles/
        tailwind.config.js
```

**Benefits:**

- Clean separation of chat and admin concerns
- Independent deployment and scaling
- Can share UI components via Nx libs
- Different release cycles
- Easier to maintain and test

#### Q3: Database Access from LangGraph Nodes

**Decision:** Call NestJS API endpoints (Option B).

**Rationale:**

- Reuse existing RLS (row-level security) logic
- Avoid duplicating database access code
- NestJS handles org/project isolation
- Simpler authentication (JWT token in API calls)

**Approach:**

- LangGraph nodes receive JWT in graph config
- Nodes call NestJS API: `GET /api/documents/search?q=...`
- NestJS validates JWT and applies RLS
- Results returned to LangGraph node
- Node pushes UI message with results

## Research Findings

_This section will be populated during the research phase._

### LangGraph UI Capabilities

- **Deployment:** TBD
- **Configuration:** TBD
- **Customization:** TBD
- **Authentication:** TBD
- **Object Rendering:** TBD
- **Licensing/Cost:** TBD

### MCP Integration Patterns

- **Tool Design:** TBD
- **Authentication:** TBD
- **Multi-Tenancy:** TBD
- **Error Handling:** TBD

### Prototype Results

- **What Worked:** TBD
- **What Didn't Work:** TBD
- **Blockers:** TBD
- **Workarounds:** TBD

## Technical Specifications

_This section will be populated after prototype is built._

### MCP Tool Contracts

#### Example: Document Search Tool

```typescript
// TBD - will be defined during prototype
interface DocumentSearchTool {
  name: 'document_search';
  description: 'Search documents using semantic and lexical queries';
  inputSchema: {
    query: string;
    organization_id: string;
    project_id: string;
    limit?: number;
  };
  outputSchema: {
    documents: Array<{
      id: string;
      title: string;
      content_preview: string;
      similarity_score: number;
      citations: Array<{ chunk_id: string; text: string }>;
    }>;
  };
}
```

### Object Serialization Formats

#### Example: Document with Citations

```json
// TBD - will be defined during prototype
{
  "type": "document",
  "id": "doc-123",
  "title": "Product Requirements",
  "content_preview": "The system shall...",
  "metadata": {
    "created_at": "2025-11-19T10:00:00Z",
    "updated_at": "2025-11-19T12:00:00Z",
    "owner": "user-456"
  },
  "citations": [
    {
      "chunk_id": "chunk-789",
      "text": "The system shall provide...",
      "score": 0.89
    }
  ]
}
```

### Authentication Flow

```
TBD - will be documented after prototyping
```

### Deployment Configuration

```yaml
# TBD - will be defined after choosing deployment model
# Possible Docker Compose snippet:

services:
  chat-ui:
    build: ./apps/chat-langgraph
    ports:
      - '3001:3000'
    environment:
      - MCP_SERVER_URL=http://mcp-server:8080
      - AUTH_PROVIDER=zitadel
      - ZITADEL_ISSUER=${ZITADEL_ISSUER}
```

## Migration Strategy

_This section will be populated after feasibility assessment._

### Incremental Rollout

- **Phase 1:** TBD
- **Phase 2:** TBD
- **Phase 3:** TBD

### Data Migration

- **Conversations:** TBD
- **Messages:** TBD
- **User Preferences:** TBD

### Parallel Operation

- **Feature Flags:** TBD
- **Routing Strategy:** TBD
- **Monitoring:** TBD

### Rollback Plan

- **Triggers:** TBD
- **Procedures:** TBD
- **Data Reconciliation:** TBD

## Trade-Offs Analysis

_This section will be populated after completing research._

### Pros of Refactor

- TBD (e.g., better UI, less maintenance, more features)

### Cons of Refactor

- TBD (e.g., migration cost, learning curve, deployment complexity)

### Comparison Matrix

| Criterion             | Current | LangGraph UI | Notes |
| --------------------- | ------- | ------------ | ----- |
| Development Speed     | TBD     | TBD          | TBD   |
| UI Feature Richness   | TBD     | TBD          | TBD   |
| Deployment Complexity | TBD     | TBD          | TBD   |
| Maintenance Burden    | TBD     | TBD          | TBD   |
| Scalability           | TBD     | TBD          | TBD   |
| Customization         | TBD     | TBD          | TBD   |

## Alternatives Considered

_This section will be populated during research phase 1._

### Vercel AI SDK

- **Pros:** TBD
- **Cons:** TBD
- **Verdict:** TBD

### Chainlit

- **Pros:** TBD
- **Cons:** TBD
- **Verdict:** TBD

### Stay with Current Architecture

- **Improvements Needed:** TBD
- **Effort vs Refactor:** TBD
- **Verdict:** TBD

## Open Issues

_Track unresolved questions and blockers here._

1. **Issue:** Does LangGraph UI support React component embedding?

   - **Status:** Unresolved
   - **Blocker Severity:** Major
   - **Workaround:** TBD

2. **Issue:** How to maintain DaisyUI design system consistency?

   - **Status:** Unresolved
   - **Blocker Severity:** Minor
   - **Workaround:** TBD

3. **Issue:** What are LangGraph UI licensing costs at scale?
   - **Status:** Unresolved
   - **Blocker Severity:** Medium
   - **Workaround:** Evaluate open-source alternatives

## Decision Log

_Record key architectural decisions made during research._

| Date | Decision | Rationale | Alternatives |
| ---- | -------- | --------- | ------------ |
| TBD  | TBD      | TBD       | TBD          |

## References

- LangGraph UI Documentation: [TBD - add link during research]
- MCP Protocol Specification: https://modelcontextprotocol.io/
- Existing MCP Integration: `apps/server/src/modules/mcp/`
- Current Chat Implementation: `apps/server/src/modules/chat/`

## Next Steps

After completing research:

1. Populate all TBD sections with findings
2. Update comparison matrices with data
3. Document final architecture recommendation
4. Create follow-up change proposals if proceeding
