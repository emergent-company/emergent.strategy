# MCP Chat Integration Design

**Date**: October 20, 2025  
**Phase**: Post-Phase 4 (Authentication Complete)  
**Goal**: Integrate MCP schema tools into the built-in chat system to enable natural language queries about the knowledge graph structure

---

## Executive Summary

Enable users to ask questions about their knowledge graph schema through the chat interface. The AI assistant will use MCP tools to discover schema information, explain relationships, and help users understand their data model.

**Example User Interactions**:
- "What types of objects are in my knowledge base?"
- "Show me the recent changes to the schema"
- "What relationships can I create between Documents and Projects?"
- "What's the structure of the Team object type?"

---

## Current Architecture Analysis

### Chat Flow (Existing)

```
User Input → Chat Controller → Chat Service → Chat Generation Service
                ↓                    ↓                    ↓
         Persistence       [DEPRECATED]         LLM (Vertex AI)
        (Conversations)   Citation Retrieval    Gemini 2.5 Pro
                          (Hybrid Search)
```

**Key Components**:

1. **ChatController** (`chat.controller.ts`):
   - `POST /chat/stream` - Main streaming endpoint
   - `POST /chat/conversations` - Create conversation
   - `GET /chat/{id}/stream` - Stream existing conversation
   - Authorization: `@Scopes('chat:use')`
   - SSE (Server-Sent Events) streaming

2. **ChatService** (`chat.service.ts`):
   - Conversation CRUD
   - Message persistence
   - ⚠️ **Citation retrieval** (hybrid search: vector + full-text) - **TO BE DISABLED**

3. **ChatGenerationService** (`chat-generation.service.ts`):
   - Wraps Vertex AI with configurable model (via `VERTEX_AI_MODEL` env var)
   - Default models: `gemini-1.5-flash-latest`, `gemini-1.5-pro-002`, `gemini-2.0-flash-exp`
   - `generateStreaming()` - Token-by-token streaming
   - Prompt assembly
   - Model configured through `AppConfigService.vertexAiModel`

**Current Generation Flow** (DEPRECATED):
```typescript
1. User sends message
2. Controller retrieves citations via hybrid search (RRF: vector similarity + full-text)
   → Searches kb.chunks table
   → Combines vector distance ranking + full-text ranking
   → Returns top-K document chunks
3. Controller assembles prompt: citations + context + user question
4. Generation service calls Vertex AI
5. Tokens streamed back via SSE
```

**⚠️ Important: Citation Retrieval Will Be Disabled**

The current `retrieveCitations()` method uses hybrid search (RRF) to find relevant document chunks. This will be **disabled during MCP integration** because:

1. **Wrong Context Source**: We want the LLM to use **graph structure** (objects, relationships), not raw document chunks
2. **Future Vision**: Replace with graph search → LLM responds with discovered objects and their relationships
3. **Cleaner Integration**: Avoid confusion between document-based RAG and graph-based knowledge

**Migration Plan**:
- Phase 1: Disable citation retrieval, rely only on MCP schema context
- Phase 2: Keep disabled while building graph query capabilities
- Phase 3: Replace with graph search when MCP data tools are ready

---

## MCP Integration Design

### Architecture

```
User Question → Chat Controller → MCP Tool Detector → Tool Router
                      ↓                                      ↓
           [Citations DISABLED]                   MCP Schema/Data Tools
                      ↓                                      ↓
           Vertex AI Generation ← Schema Context ← MCP Service
```

**Changes from Current System**:
1. ❌ **Remove**: `retrieveCitations()` calls (hybrid search disabled)
2. ✅ **Add**: MCP tool detection and routing
3. ✅ **Add**: Schema context injection into prompts
4. 🔮 **Future**: Graph query execution → structured object responses

### New Components

#### 1. MCP Tool Detector
**Purpose**: Analyze user message to determine if MCP tools should be invoked

**Location**: `apps/server/src/modules/chat/mcp-tool-detector.service.ts`

**Logic**:
```typescript
interface ToolDetectionResult {
    shouldUseMcp: boolean;
    detectedIntent: 'schema-version' | 'schema-changes' | 'type-info' | 'relationship-info' | 'none';
    confidence: number;
}

// Keyword-based detection (Phase 1 - Simple)
const schemaKeywords = [
    'schema', 'structure', 'types', 'objects', 'relationships',
    'what types', 'show types', 'list types', 'available types',
    'recent changes', 'changelog', 'updates', 'what changed',
    'version', 'schema version'
];

// LLM-based detection (Phase 2 - Advanced)
// Use lightweight classification model to detect intent
```

#### 2. MCP Tool Router
**Purpose**: Execute appropriate MCP tool based on detected intent

**Location**: `apps/server/src/modules/chat/mcp-tool-router.service.ts`

**Methods**:
```typescript
async getSchemaVersion(projectId: string, orgId: string): Promise<SchemaVersionInfo>
async getSchemaChangelog(projectId: string, orgId: string, since?: string): Promise<ChangelogEntry[]>
async getTypeInfo(projectId: string, orgId: string, typeName: string): Promise<TypeDefinition>
async searchTypes(projectId: string, orgId: string, query: string): Promise<TypeSummary[]>
```

#### 3. Enhanced Chat Generation
**Modify**: `apps/server/src/modules/chat/chat-generation.service.ts`

**Configuration Note**: The service uses `this.config.vertexAiModel` which reads from `VERTEX_AI_MODEL` environment variable. This can be any Vertex AI model (e.g., `gemini-1.5-flash-latest`, `gemini-1.5-pro-002`, `gemini-2.0-flash-exp`).

**New Method**: `generateWithTools()`

```typescript
interface ToolContext {
    schemaVersion?: string;
    availableTypes?: string[];
    recentChanges?: ChangelogEntry[];
}

async generateWithTools(
    userMessage: string,
    toolContext: ToolContext,
    onToken: (token: string) => void
): Promise<string> {
    // Assemble enhanced prompt with tool results
    const systemPrompt = `You are a helpful assistant with access to the user's knowledge graph schema.
    
Schema Version: ${toolContext.schemaVersion || 'unknown'}
Available Types: ${(toolContext.availableTypes || []).join(', ')}
Recent Changes: ${JSON.stringify(toolContext.recentChanges || [])}

Answer the user's question using this schema information.`;
    
    const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}`;
    
    return this.generateStreaming(fullPrompt, onToken);
}
```

---

## Implementation Plan

### Phase 1: Schema Query Integration (Week 1)

#### Step 1.0: Disable Citation Retrieval (30 minutes) ⭐ NEW
- Comment out all `retrieveCitations()` calls in ChatController
- Remove citation context from prompt assembly
- Update SSE events to not include citations
- Add feature flag: `CHAT_ENABLE_CITATIONS=0` (default off)

```typescript
// Before (line ~248 in chat.controller.ts)
citations = await this.chat.retrieveCitations(userQuestion, 4, orgId, projectId, null);
const contextSnippet = citations.slice(0, 3).map(c => c.text).join('\n---\n');
const prompt = `Context:\n${contextSnippet}\n\nQuestion: ${userQuestion}`;

// After
// citations = await this.chat.retrieveCitations(...); // DISABLED - will be replaced with graph search
const citations: any[] = []; // Keep variable for backward compatibility
const prompt = `You are a helpful assistant for querying knowledge graphs. Answer based on schema information provided.\n\nQuestion: ${userQuestion}`;
```

#### Step 1.1: Create MCP Tool Detector (2 hours)
- Keyword-based intent detection
- Confidence scoring
- Unit tests

#### Step 1.2: Create MCP Tool Router (2 hours)
- Inject `McpService` (already exists from Phase 4)
- Implement routing logic
- Handle authentication (pass through user token)
- Error handling

#### Step 1.3: Modify Chat Controller (3 hours)
- Add MCP tool detection step before generation
- Invoke tool router if MCP intent detected
- Inject tool results into generation context
- Stream tool invocation progress to client

```typescript
// New SSE event types
interface MCPToolInvocationEvent {
    type: 'mcp_tool';
    tool: 'schema-version' | 'schema-changelog' | 'type-info';
    status: 'started' | 'completed' | 'error';
    result?: any;
    error?: string;
}
```

#### Step 1.4: Update Chat Generation Service (2 hours)
- Add `generateWithTools()` method
- Enhance prompt with schema context
- Maintain backward compatibility

#### Step 1.5: Testing (3 hours)
- Unit tests for detector
- Unit tests for router
- E2E tests for chat with MCP tools
- Example conversations

### Phase 2: UI Integration (Week 2)

#### Step 2.1: Update Chat UI (Admin) (4 hours)
- Display MCP tool invocation status
- Show "Checking schema..." loading state
- Render structured schema responses (tables, lists)
- Handle tool errors gracefully

**UI States**:
```typescript
interface MCPToolState {
    isInvoking: boolean;
    toolName: string | null;
    result: any;
    error: string | null;
}
```

**Visual Design**:
- Inline tool status: "🔍 Checking schema version..."
- Success badge: "✅ Found 12 object types"
- Error badge: "⚠️ Schema access failed"

#### Step 2.2: Add Chat Examples (2 hours)
- Pre-fill example questions in chat UI
- "Try asking" section with MCP-enabled queries
- Tooltips explaining schema features

#### Step 2.3: Enhanced Message Rendering (2 hours)
- Syntax highlighting for schema JSON
- Collapsible schema sections
- Copy-to-clipboard for schema definitions

### Phase 3: Advanced Features (Week 3)

#### Step 3.1: LLM-Based Intent Detection (4 hours)
- Replace keyword detection with lightweight classifier
- Use configurable Vertex AI model (via `VERTEX_AI_MODEL` env var) for fast intent classification
- Consider using a faster model like `gemini-1.5-flash-latest` for intent detection
- Reduce false positives

#### Step 3.2: Multi-Turn Schema Conversations (3 hours)
- Maintain schema context across conversation
- Cache schema version to avoid repeated calls
- Update cache on schema changes

#### Step 3.3: Graph Data Querying (5 hours) 🔮 FUTURE VISION
**Context**: Replace the old citation retrieval system with graph-based search

**Vision**:
- User asks: "Show me all Projects related to Document X"
- System translates natural language → graph query
- Execute query against graph database
- LLM formats results with object details + relationships

**Implementation Strategy**:
1. Wait for MCP data tools to be implemented (Phase 5+ of MCP roadmap)
2. Create graph query translator service
3. Execute queries respecting user permissions
4. Format results as structured object data (not raw text chunks)
5. LLM generates natural language response from structured data

**Example Response Format**:
```json
{
  "objects": [
    { "id": "proj-123", "type": "Project", "name": "Q4 Planning", "status": "active" },
    { "id": "doc-456", "type": "Document", "title": "Product Roadmap", "created_at": "2025-10-15" }
  ],
  "relationships": [
    { "from": "doc-456", "to": "proj-123", "type": "belongs_to", "properties": { "role": "planning_doc" } }
  ]
}
```

**Benefits Over Old Citation System**:
- ✅ Structured data instead of unstructured text chunks
- ✅ Relationship context (not just content similarity)
- ✅ Object-level permissions (not document chunks)
- ✅ Graph traversal capabilities (multi-hop queries)
- ✅ Better for reasoning about connections

---

## Citation Retrieval → Graph Search Transition

### Current System (To Be Disabled)

**Hybrid Search (RRF - Reciprocal Rank Fusion)**:
```sql
WITH vec AS (
    -- Vector similarity ranking (embedding <=> query_embedding)
    SELECT id, 1.0 / (ROW_NUMBER() + 60) AS rrf
    FROM kb.chunks
    ORDER BY embedding <=> query_vector
    LIMIT topK
),
lex AS (
    -- Full-text ranking (tsvector @@ tsquery)
    SELECT id, 1.0 / (ROW_NUMBER() + 60) AS rrf
    FROM kb.chunks
    WHERE tsv @@ websearch_query
    ORDER BY ts_rank(tsv, websearch_query) DESC
    LIMIT topK
)
-- Combine scores and return top results
SELECT * FROM (vec UNION ALL lex)
GROUP BY id ORDER BY SUM(rrf) DESC
```

**Problems**:
1. Returns **unstructured text chunks** (not objects)
2. No **relationship context** (just content similarity)
3. **Document-centric** (not knowledge graph oriented)
4. Chunks can span multiple entities without structure

### Future System (Graph Search)

**Natural Language → Graph Query**:
```typescript
User: "Show me Projects related to the Product Roadmap document"

System Translation:
1. Detect entities: "Product Roadmap" (Document)
2. Detect relationship: "related to"
3. Detect target type: "Projects"

Graph Query:
{
  match: {
    type: "Document",
    name: "Product Roadmap"
  },
  traverse: {
    relationship: "related_to",
    direction: "outbound",
    targetType: "Project"
  }
}

Response (structured):
{
  source: { id: "doc-123", type: "Document", name: "Product Roadmap" },
  targets: [
    { id: "proj-456", type: "Project", name: "Q4 Planning" },
    { id: "proj-789", type: "Project", name: "Product Launch" }
  ],
  relationships: [
    { from: "doc-123", to: "proj-456", type: "supports", properties: {} },
    { from: "doc-123", to: "proj-789", type: "documents", properties: {} }
  ]
}

LLM Response:
"The Product Roadmap document is related to 2 projects:
- Q4 Planning (supports)
- Product Launch (documents)
Would you like to explore any of these relationships further?"
```

**Benefits**:
- ✅ **Structured**: Objects with types, properties, relationships
- ✅ **Contextual**: Relationship semantics (not just "similar content")
- ✅ **Graph-aware**: Multi-hop traversal, path finding
- ✅ **Permissions**: Object-level access control
- ✅ **Reasoning**: LLM can reason about structure

### Transition Strategy

**Phase 1 (Week 1)**: Disable citations, add schema context only
```typescript
// No document chunks
// Only schema information (types, relationships, version)
const prompt = `Schema: ${schemaContext}\n\nQuestion: ${userQuestion}`;
```

**Phase 2 (Week 2-3)**: Build graph query infrastructure
- Design natural language → query translator
- Implement permission-aware graph queries
- Test with simple queries ("find objects of type X")

**Phase 3 (Week 4+)**: Replace citations with graph results
```typescript
// Graph-based context (structured)
const graphResults = await this.graphSearch.execute(query, userId);
const structuredContext = JSON.stringify(graphResults);
const prompt = `Graph Results: ${structuredContext}\n\nQuestion: ${userQuestion}`;
```

**Phase 4 (Future)**: Advanced graph reasoning
- Multi-hop traversal ("Projects → Documents → Tags")
- Path finding ("How is X related to Y?")
- Aggregation ("Count all Documents in Project Z")

---

## Authorization Strategy

### Scope Requirements

| User Action | Required Scopes | MCP Tool Called |
|-------------|-----------------|-----------------|
| Ask about schema version | `chat:use`, `schema:read` | `GET /mcp/schema/version` |
| Ask about schema changes | `chat:use`, `schema:read` | `GET /mcp/schema/changelog` |
| Query graph data (future) | `chat:use`, `data:read` | `GET /mcp/data/query` |
| Modify graph (future) | `chat:use`, `data:write` | `POST /mcp/data/create` |

### Token Forwarding

```typescript
// In ChatController
const userToken = req.headers.authorization; // "Bearer <token>"

// Pass to MCP Tool Router
const schemaVersion = await mcpRouter.getSchemaVersion(
    projectId,
    orgId,
    userToken // Forward user's token
);

// MCP Tool Router calls MCP endpoints with user's token
const response = await fetch('/mcp/schema/version', {
    headers: {
        'Authorization': userToken,
        'X-Org-ID': orgId,
        'X-Project-ID': projectId
    }
});
```

**Benefit**: MCP authentication automatically enforced - users without `schema:read` scope get 403 error

---

## SSE Event Flow

### Current Events
```typescript
{ type: 'meta', conversationId: string, citations: Citation[] }
{ type: 'token', token: string }
{ type: 'error', error: string }
{ type: 'done' }
```

### New Events (Phase 1)
```typescript
// Tool invocation started
{
    type: 'mcp_tool',
    tool: 'schema-version',
    status: 'started'
}

// Tool completed successfully
{
    type: 'mcp_tool',
    tool: 'schema-version',
    status: 'completed',
    result: {
        version: '57c52257693ae983',
        updated_at: '2025-10-20T22:45:11.234Z'
    }
}

// Tool failed
{
    type: 'mcp_tool',
    tool: 'schema-version',
    status: 'error',
    error: 'Insufficient permissions (schema:read required)'
}

// Enhanced meta with schema context
{
    type: 'meta',
    conversationId: string,
    citations: Citation[],
    schemaContext: {
        version: string,
        typeCount: number,
        lastModified: string
    }
}
```

---

## Example Conversations

### Example 1: Schema Version Query

**User**: "What version of the schema am I using?"

**System Flow**:
```
1. MCP Tool Detector: shouldUseMcp=true, intent='schema-version', confidence=0.95
2. MCP Tool Router: getSchemaVersion(projectId, orgId, userToken)
3. SSE Event: { type: 'mcp_tool', tool: 'schema-version', status: 'started' }
4. MCP Call: GET /mcp/schema/version (authenticated)
5. SSE Event: { type: 'mcp_tool', status: 'completed', result: {...} }
6. Enhanced Prompt: "Schema version is 57c52257693ae983, last updated Oct 20, 2025"
7. Generation: Vertex AI generates friendly response
8. SSE Events: Token stream
9. SSE Event: { type: 'done' }
```

**Assistant Response**:
> You're currently using schema version `57c52257693ae983`, which was last updated on October 20, 2025. This version includes 12 object types and 25 relationship types. Would you like to see what changed in the latest version?

### Example 2: Recent Changes Query

**User**: "What changed in the schema recently?"

**System Flow**:
```
1. MCP Tool Detector: shouldUseMcp=true, intent='schema-changes', confidence=0.90
2. MCP Tool Router: getSchemaChangelog(projectId, orgId, userToken, since='7d')
3. MCP Call: GET /mcp/schema/changelog?since=2025-10-13
4. Tool Result: [ { added: ['Team'], modified: ['Document'], ... } ]
5. Enhanced Prompt includes changelog
6. Generation with context
```

**Assistant Response**:
> Here are the recent changes to your schema (past 7 days):

> **Added**:
> - Team object type (Oct 18)
> - Document → Team relationship (Oct 19)

> **Modified**:
> - Document: Added `status` property (Oct 17)
> - Project: Updated description field length (Oct 15)

> **Removed**:
> - Legacy `Task` type (Oct 16 - deprecated)

### Example 3: Type Information Query

**User**: "Tell me about the Document type"

**System Flow**:
```
1. MCP Tool Detector: shouldUseMcp=true, intent='type-info'
2. Extract type name: "Document"
3. MCP Tool Router: getTypeInfo(projectId, orgId, 'Document', userToken)
4. MCP Call: GET /mcp/types/Document/schema (future endpoint)
5. Tool Result: Full type definition JSON
6. Generation with structured schema
```

**Assistant Response**:
> The **Document** type represents files and content in your knowledge base.

> **Properties**:
> - `title` (string, required) - Document title
> - `content` (text) - Full document content
> - `created_at` (datetime) - When document was created
> - `status` (enum) - One of: draft, published, archived

> **Relationships**:
> - Can be related to: Project, Team, Tag
> - Can contain: Section, Paragraph

---

## Error Handling

### Scenario 1: User Lacks MCP Scopes

```typescript
// MCP Call returns 403
{
    type: 'mcp_tool',
    tool: 'schema-version',
    status: 'error',
    error: 'You need schema:read permission to view schema information. Contact your administrator.'
}

// Generation continues WITHOUT schema context
// Assistant: "I don't have access to your schema information. Please contact your administrator for access."
```

### Scenario 2: MCP Service Unavailable

```typescript
// MCP Call fails (network/service error)
{
    type: 'mcp_tool',
    tool: 'schema-version',
    status: 'error',
    error: 'Schema service temporarily unavailable'
}

// Fallback to regular chat (no schema context)
// Assistant: "I'm having trouble accessing the schema right now. I can still help with general questions!"
```

### Scenario 3: Invalid Tool Parameters

```typescript
// User asks about non-existent type
MCP Call: GET /mcp/types/InvalidType/schema → 404

{
    type: 'mcp_tool',
    tool: 'type-info',
    status: 'error',
    error: 'Type "InvalidType" not found. Available types: Document, Project, Team, ...'
}

// Assistant includes available types in response
```

---

## Performance Considerations

### Caching Strategy

1. **Schema Version** - Cache for 5 minutes
   - Key: `schema:version:${projectId}`
   - Invalidate on schema changes

2. **Type Definitions** - Cache for 15 minutes
   - Key: `schema:type:${projectId}:${typeName}`
   - Invalidate on type modifications

3. **Changelog** - Cache for 1 minute
   - Key: `schema:changelog:${projectId}:${since}`
   - Shorter TTL due to frequent updates

### Latency Budget

| Operation | Target | Max Acceptable |
|-----------|--------|----------------|
| MCP Tool Detection | < 10ms | 50ms |
| MCP Tool Invocation | < 100ms | 500ms |
| Schema Version Call | < 50ms | 200ms |
| Total Chat Latency | < 500ms | 2s |

**Optimization**:
- Parallel tool calls when possible
- Fail fast on MCP errors (don't block generation)
- Stream tool results as they arrive

---

## Testing Strategy

### Unit Tests

1. **MCP Tool Detector** (`mcp-tool-detector.service.spec.ts`):
   - Test keyword matching
   - Test confidence scoring
   - Test edge cases (ambiguous queries)

2. **MCP Tool Router** (`mcp-tool-router.service.spec.ts`):
   - Mock MCP service responses
   - Test token forwarding
   - Test error handling

### E2E Tests

1. **Chat with MCP Tools** (`chat-mcp-integration.e2e.spec.ts`):
   - User asks schema question → MCP tool invoked
   - Verify SSE events sent
   - Verify generation includes schema context
   - Test with/without `schema:read` scope

2. **Authorization** (`chat-mcp-auth.e2e.spec.ts`):
   - User without `schema:read` → 403 error
   - Error message rendered correctly
   - Chat continues without schema context

---

## Migration Path

### Phase 1 (Week 1) - Foundation
- ✅ No breaking changes
- ✅ Backward compatible with existing chat
- ✅ MCP tools optional (only if detected)
- ✅ Existing chat functionality unchanged

### Phase 2 (Week 2) - UI Enhancements
- Opt-in for users (feature flag)
- Gradual rollout
- Collect feedback

### Phase 3 (Week 3) - Advanced Features
- Enable by default
- Add more tool types (data querying)
- Performance optimizations

---

## Success Metrics

1. **Adoption**: % of chat messages that invoke MCP tools
2. **Accuracy**: % of MCP-detected intents correctly classified
3. **Performance**: Average tool invocation latency
4. **Errors**: % of MCP tool calls resulting in errors
5. **User Satisfaction**: Feedback on schema-aware responses

---

## Related Documentation

- [MCP Phase 4 Complete](./MCP_PHASE4_AUTH_COMPLETE.md) - Authentication foundation
- [Security Scopes Reference](../SECURITY_SCOPES.md) - Scope definitions
- [Chat Architecture](../RUNBOOK.md#chat-system) - Existing chat system

---

## Next Steps

1. Review & approve design
2. Create implementation tasks
3. Start Phase 1 development
4. Weekly check-ins on progress

**Estimated Timeline**: 3 weeks for complete integration
**Risk Level**: Low (optional feature, no breaking changes)
**Dependencies**: None (MCP Phase 4 complete)
