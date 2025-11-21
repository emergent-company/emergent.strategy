# Chat SDK Search Integration Testing Guide

## Overview

The Chat SDK integrates with the Unified Search service to provide AI-powered search over:

- **Graph Objects**: Concepts, decisions, requirements, entities (via Graph Search)
- **Document Chunks**: Text content from uploaded documents (via Text Search)

The search tool is automatically provided to the LLM when a `projectId` is present in the request.

## Architecture

```
Chat Request (with projectId)
    ↓
ChatSdkService
    ↓
Creates search_knowledge_base tool
    ↓
LangGraph Agent (decides when to call tool)
    ↓
UnifiedSearchService
    ├── GraphSearchService (graph objects)
    └── SearchService (document chunks)
    ↓
Results fused using RRF (Reciprocal Rank Fusion)
    ↓
Formatted results returned to LLM
    ↓
LLM incorporates search results in response
```

## Prerequisites

### 1. Test Data Setup

To properly test search integration, you need:

1. **Organization and Project** created
2. **Documents uploaded** to the project
3. **Graph objects created** (concepts, decisions, requirements, etc.)
4. **Embeddings indexed** for both documents and graph objects

**Quick Setup:**

```bash
# Seed some test documents (example - adjust as needed)
npm run seed:documents

# Or manually upload documents via the UI at http://localhost:5176/documents
```

### 2. Environment Configuration

Ensure these are set in your `.env`:

```bash
# Vertex AI credentials (required for LangGraph)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
VERTEX_AI_PROJECT_ID=your-gcp-project
VERTEX_AI_LOCATION=us-central1

# Database (for unified search)
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Server URL
API_BASE=http://localhost:3002
```

## Testing Methods

### Method 1: Automated API E2E Test

**Location:** `apps/server/tests/e2e/chat-sdk-search.e2e-spec.ts`

**Run:**

```bash
nx run server:test-e2e
```

**What it tests:**

- ✅ Conversation creation with projectId
- ✅ Chat streaming without projectId (search disabled)
- ✅ Chat streaming with projectId (search enabled)
- ✅ Message persistence
- ✅ Draft text persistence

**Limitations:**

- Does not parse SSE stream to verify tool calls
- Does not verify search results quality
- Best for regression testing API contracts

### Method 2: Manual Testing Script

**Location:** `scripts/test-chat-sdk-search.mjs`

**Run:**

```bash
node scripts/test-chat-sdk-search.mjs
```

**What it tests:**

- ✅ Full authentication flow
- ✅ Project setup
- ✅ Conversation creation
- ✅ Chat with and without search
- ✅ Conversation history verification

**Check server logs for:**

```
[ChatSDK] Creating search tool for project <uuid> in org <uuid>
[UnifiedSearchService] Executing unified search for query: "..."
[UnifiedSearchService] Graph results: X, Text results: Y
```

### Method 3: Browser Testing (Recommended for UX)

**Steps:**

1. **Start services:**

   ```bash
   nx run workspace-cli:workspace:start
   ```

2. **Open browser:**

   ```bash
   npm run chrome:debug
   # Or manually navigate to http://localhost:5176
   ```

3. **Login with test credentials:**

   ```
   Email: test@example.com
   Password: TestPassword123!
   ```

4. **Navigate to Chat SDK:**

   - Go to `/chat-sdk` page
   - Select a project from the dropdown (IMPORTANT!)

5. **Test search queries:**

   **Queries that SHOULD trigger search:**

   - "What documents do we have about authentication?"
   - "What decisions have been made about the API design?"
   - "Show me requirements related to user management"
   - "Find concepts related to security"

   **Queries that should NOT trigger search:**

   - "Hello, how are you?"
   - "What is 2+2?"
   - "Write me a poem"

6. **Verify search was used:**

   **Option A: Check server logs**

   ```bash
   nx run workspace-cli:workspace:logs -- --service=server --follow
   ```

   Look for:

   ```
   [ChatSDK] Creating search tool for project...
   [UnifiedSearchService] Executing unified search...
   ```

   **Option B: Check AI response**

   - Does the response mention specific documents or objects from your project?
   - Does it cite sources with document names or object keys?
   - Is the answer grounded in your data vs. generic knowledge?

### Method 4: Direct API Testing with curl

**Without projectId (search disabled):**

```bash
curl -X POST http://localhost:3002/api/chat-sdk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "What documents do we have?"}
    ]
  }'
```

**With projectId (search enabled):**

```bash
curl -X POST http://localhost:3002/api/chat-sdk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "What documents do we have about authentication?"}
    ],
    "projectId": "your-project-uuid",
    "conversationId": "your-conversation-uuid"
  }'
```

## Understanding Search Tool Behavior

### When the Tool is Available

The `search_knowledge_base` tool is created and passed to LangGraph **only when:**

1. Request includes a valid `projectId`
2. The project exists and has a valid `organizationId`

**Code reference:** `apps/server/src/modules/chat-sdk/chat-sdk.service.ts:111-130`

### When the Tool is Called

LangGraph's agent autonomously decides whether to call the search tool based on:

- **User query intent**: Does it seem like a knowledge lookup?
- **Context**: Is the answer likely in the knowledge base?
- **Necessity**: Does the LLM already know the answer from general knowledge?

**Example:**

- ✅ "What are our authentication requirements?" → Likely calls search
- ❌ "What is JWT?" → Likely uses general knowledge, no search needed

### Search Tool Parameters

**Schema:** `apps/server/src/modules/chat-sdk/tools/chat-search.tool.ts:57-62`

```typescript
{
  query: string,           // Required: search query
  limit: number,           // Optional: max results (default 5, max 10)
  includeGraph: boolean,   // Optional: include graph objects (default true)
  includeText: boolean,    // Optional: include document chunks (default true)
}
```

**Fusion Strategy:** RRF (Reciprocal Rank Fusion)

- Works well for combining different score scales
- Balances graph and text results effectively

**Relationship Expansion:**

- `maxDepth: 1` - Only immediate relationships
- `maxNeighbors: 3` - Max 3 relationships per object
- `direction: 'both'` - Incoming and outgoing edges

## Debugging Common Issues

### Issue: "Search tool not being called"

**Possible causes:**

1. No `projectId` in request → Check frontend is passing project context
2. Project has no organization → Check database relationship
3. LLM decided search wasn't needed → Try more specific queries
4. LangGraph service not initialized → Check Vertex AI credentials

**Debug steps:**

```bash
# Check server logs
nx run workspace-cli:workspace:logs -- --service=server

# Look for this line (tool was created):
[ChatSDK] Creating search tool for project <uuid> in org <uuid>

# If missing, projectId wasn't provided or org lookup failed
```

### Issue: "Search returns no results"

**Possible causes:**

1. No documents uploaded
2. No embeddings indexed
3. Query doesn't match indexed content
4. Wrong project context

**Debug steps:**

```bash
# Check if documents exist
curl http://localhost:3002/api/documents \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check if graph objects exist
curl http://localhost:3002/api/graph/objects \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test unified search directly
curl -X POST http://localhost:3002/api/unified-search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "authentication",
    "limit": 10
  }'
```

### Issue: "Poor search result quality"

**Tuning options:**

1. **Adjust fusion weights** (`apps/server/src/modules/chat-sdk/tools/chat-search.tool.ts:90`):

   ```typescript
   weights: { graphWeight: 0.6, textWeight: 0.4 }
   // Increase graphWeight to prioritize structured data
   // Increase textWeight to prioritize document chunks
   ```

2. **Change fusion strategy**:

   ```typescript
   fusionStrategy: UnifiedSearchFusionStrategy.RRF; // Default
   // Alternatives: WEIGHTED, INTERLEAVE, GRAPH_FIRST, TEXT_FIRST
   ```

3. **Adjust result limit**:
   ```typescript
   limit: 5; // Default (max 10)
   // More results = more context but higher token usage
   ```

## Performance Benchmarks

**Expected search latency:**

- Graph search: 50-200ms
- Text search: 100-300ms
- Relationship expansion: 20-100ms
- Total unified search: 200-500ms

**Token usage:**

- Search tool definition: ~200 tokens
- Search results (5 items): ~500-1000 tokens
- Total overhead: ~700-1200 tokens per search call

## Testing Checklist

Before deploying search integration:

- [ ] API e2e tests pass (`nx run server:test-e2e`)
- [ ] Manual script test passes (`node scripts/test-chat-sdk-search.mjs`)
- [ ] Browser test with real user query works
- [ ] Search tool is created when projectId is provided
- [ ] Search tool is NOT created when projectId is missing
- [ ] Search results are relevant to user query
- [ ] LLM incorporates search results in response
- [ ] Conversation history is saved correctly
- [ ] Server logs show search tool invocations
- [ ] Performance is acceptable (<500ms for search)

## Future Improvements

### Short-term

- [ ] Add SSE stream parser to e2e tests for tool call verification
- [ ] Create seed script for realistic test data
- [ ] Add search quality metrics (precision, recall)

### Long-term

- [ ] A/B test different fusion strategies
- [ ] Implement search result caching
- [ ] Add search analytics (queries, results, relevance)
- [ ] Support filters (date range, document type, etc.)
- [ ] Implement federated search (external sources)

## Related Documentation

- [Unified Search Service](/apps/server/src/modules/unified-search/README.md)
- [Graph Search Service](/apps/server/src/modules/graph-search/README.md)
- [AI Agent Testing Guide](/docs/testing/AI_AGENT_GUIDE.md)
- [Chat SDK Architecture](/docs/architecture/chat-sdk.md)
