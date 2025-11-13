# Quick Start: Adding "Show me recent decisions" to MCP Chat

## The Problem

**Currently**: MCP only handles **metadata** queries
- ✅ "Tell me about the Decision type" (shows properties, relationships)
- ❌ "Show me recent decisions" (actual data - not implemented)

**Goal**: Enable natural language **data queries** for entity instances

## Solution Overview

### 3 Components Needed

1. **New MCP Tools** - Backend endpoints to query data
2. **Updated Detector** - Recognize data query patterns  
3. **LLM Context** - Inform LLM about available entities

## How It Works

### Flow Diagram
```
User: "Show me recent decisions"
    ↓
MCP Tool Detector: Matches "entity-query" intent
    ↓
Suggests: query_entities tool
    ↓
Args: { type_name: "Decision", limit: 10 }
    ↓
MCP Server: Queries kb.graph_objects table
    ↓
Returns: 10 Decision instances with properties
    ↓
Chat Controller: Formats results for LLM
    ↓
LLM: Generates human-friendly response
    ↓
User sees: "Here are your 10 most recent decisions: 1. AI Strategy (Oct 20)..."
```

### How LLM Knows About "Decision" Objects

**Option A: System Prompt (Recommended)**
```typescript
// When conversation starts, call list_entity_types
const types = await mcpClient.callTool('list_entity_types', {});

// Include in system prompt
systemPrompt = `
You can query these entity types:
- Decision: Important choices (42 instances)
- Project: Work initiatives (18 instances)  
- Document: Knowledge artifacts (156 instances)

When users ask "show X" or "list X", use the query_entities tool.
`;
```

**Option B: Discovery Tool**
```
User: "What can I query?"
LLM: Calls list_entity_types tool
LLM: "You can query: Decision (42), Project (18), Document (156)"
```

## Implementation Checklist

### 1. Add MCP Tools (2 hours)
**File**: `apps/server/src/modules/mcp/mcp-server.controller.ts`

- [ ] Add `list_entity_types` endpoint
  - Queries `kb.type_registry` table
  - Returns: `{ types: [{ name, description, count }] }`
  
- [ ] Add `query_entities` endpoint
  - Queries `kb.graph_objects` table
  - Input: `{ type_name, limit, offset, sort_by, sort_order }`
  - Returns: `{ entities: [...], pagination: {...} }`
  
- [ ] Register tools in `tools/list` response
- [ ] Add scope checks (`schema:read` for list, `data:read` for query)

### 2. Update Detector (1 hour)
**File**: `apps/server/src/modules/chat/mcp-tool-detector.service.ts`

- [ ] Add `'entity-query'` to intent types
- [ ] Add pattern with keywords:
  ```typescript
  keywords: [
    'show decisions', 'list decisions', 'recent decisions',
    'show projects', 'list projects', 'recent projects',
    'show documents', 'list documents', 'recent documents'
  ]
  ```
- [ ] Update `buildArguments()` to extract:
  - Entity type ("Decision", "Project", etc.)
  - Limit ("show 5 decisions" → limit: 5)
  - Sort preference ("recent" → sort: desc)

### 3. Inform LLM (30 min)
**File**: `apps/server/src/modules/chat/chat-generation.service.ts`

- [ ] Add `availableEntityTypes` to `PromptBuildOptions`
- [ ] Update `buildPrompt()` to include entity types in system prompt
- [ ] Format entity list for LLM context

### 4. Update Controller (1 hour)
**File**: `apps/server/src/modules/chat/chat.controller.ts`

- [ ] Fetch entity types on conversation start
- [ ] Handle `entity-query` and `entity-list` intents
- [ ] Add `formatEntityQueryResult()` method
- [ ] Update SSE badge text: "Querying entities..."

### 5. Test (30 min)

- [ ] "What entities can I query?" → Lists all types
- [ ] "Show me recent decisions" → Returns last 10 decisions
- [ ] "List the last 5 projects" → Returns 5 projects
- [ ] "Show documents" → Returns documents
- [ ] Verify badges appear and MCP events sent

**Total Time**: ~5 hours

## Example Queries After Implementation

### Discovery Queries
```
✅ "What entities can I query?"
✅ "What data is available?"
✅ "What types of objects exist?"

Response: "You can query: Decision (42), Project (18), Document (156)..."
```

### Data Queries
```
✅ "Show me recent decisions"
✅ "List the last 5 decisions"
✅ "Show all projects"
✅ "List documents"
✅ "Get recent documents"

Response: Actual entity instances with properties
```

### Mixed Queries
```
✅ "Tell me about the Decision type" → Metadata (existing)
✅ "Show me recent decisions" → Data (new)
✅ "What is schema version?" → Metadata (existing)
```

## Testing After Implementation

### Test 1: Entity Discovery
```bash
# Open chat
curl -X POST http://localhost:3001/chat/stream \
  -H "Authorization: Bearer e2e-all" \
  -H "X-Org-ID: <org-id>" \
  -H "X-Project-ID: <project-id>" \
  -d '{"message": "What entities can I query?"}'

# Expected SSE:
# data: {"type":"mcp_tool","tool":"list_entity_types","status":"started"}
# data: {"type":"mcp_tool","tool":"list_entity_types","status":"completed","result":{...}}
# data: {"type":"token","token":"You"}
# ... (LLM response with entity list)
```

### Test 2: Data Query
```bash
curl -X POST http://localhost:3001/chat/stream \
  -H "Authorization: Bearer e2e-all" \
  -d '{"message": "Show me recent decisions"}'

# Expected SSE:
# data: {"type":"mcp_tool","tool":"query_entities","status":"started"}
# data: {"type":"mcp_tool","tool":"query_entities","status":"completed","result":{...}}
# data: {"type":"token","token":"Here"}
# ... (LLM response with decision list)
```

### Test 3: Frontend Test
```
1. Open: http://localhost:5175/admin/apps/chat/c/new
2. Type: "What entities can I query?"
3. Expected: Badge "Loading entity types..." → Response with list
4. Type: "Show me recent decisions"
5. Expected: Badge "Querying entities..." → Response with decisions
```

## Security Considerations

### Scope Requirements
- `list_entity_types`: Requires `schema:read` scope
- `query_entities`: Requires `data:read` scope

### Data Protection
- Always query within tenant context (org/project)
- Respect RLS policies
- Limit query results (max 50 per query)
- Consider redacting sensitive properties

### Rate Limiting
- Consider adding rate limits for data queries
- Cache entity type lists per conversation
- Log expensive queries for monitoring

## Performance Tips

1. **Add Database Indexes**:
   ```sql
   CREATE INDEX idx_graph_objects_type_created 
   ON kb.graph_objects(type_id, created_at DESC);
   
   CREATE INDEX idx_graph_objects_type_updated 
   ON kb.graph_objects(type_id, updated_at DESC);
   ```

2. **Cache Entity Types**:
   ```typescript
   // Cache for 5 minutes
   const cachedTypes = await cache.get('entity-types', async () => {
       return await mcpClient.callTool('list_entity_types', {});
   }, { ttl: 300 });
   ```

3. **Limit Property Size**:
   ```typescript
   // Don't send huge property objects to LLM
   if (JSON.stringify(entity.properties).length > 1000) {
       entity.properties = { truncated: true, summary: '...' };
   }
   ```

## Future Enhancements

### Phase 2: Advanced Queries
```
✅ "Show decisions with status=approved"
✅ "List projects created last week"
✅ "Find documents containing 'AI strategy'"
```

### Phase 3: Aggregations
```
✅ "How many decisions do we have?"
✅ "Count projects by status"
✅ "Average time to complete decisions"
```

### Phase 4: Relationships
```
✅ "Show tasks for Project X"
✅ "Find people who worked on Decision Y"
✅ "List all documents related to Project Z"
```

## Summary

To enable **"Show me recent decisions"** queries:

1. **Add 2 new MCP tools**: `list_entity_types` + `query_entities`
2. **Update detector**: Add `entity-query` intent pattern
3. **Inform LLM**: Include entity types in system prompt
4. **Test**: Verify queries work end-to-end

**Result**: Users can naturally query data through chat! 🎉

See `docs/MCP_CHAT_DATA_QUERIES_IMPLEMENTATION.md` for detailed code examples and full implementation guide.
