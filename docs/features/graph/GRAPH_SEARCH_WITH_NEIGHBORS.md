# Graph Search with Neighbors - Implementation Guide

**Date**: 2025-10-21  
**Feature**: Vector-based graph object search with neighbor expansion

## Overview

This feature enables **semantic search over graph objects** with automatic neighbor expansion, similar to document citation retrieval but for the knowledge graph. It combines:

1. **Full-text search** (FTS) using PostgreSQL's `websearch_to_tsquery`
2. **Vector similarity search** using `searchSimilar` method (pgvector)
3. **Relationship traversal** to find connected objects

## What is `searchSimilar`?

### Purpose
`searchSimilar` finds objects that are **semantically similar** to a given object by comparing their embedding vectors.

### How It Works

```typescript
// 1. Fetch the embedding vector of the source object
const vecRes = await this.db.query<{ embedding_vec: any }>(
    'SELECT embedding_vec FROM kb.graph_objects WHERE id=$1', 
    [objectId]
);

// 2. Use pgvector's cosine distance operator (<->) to find similar vectors
const sql = `
    SELECT id, org_id, project_id, branch_id, 
           (embedding_vec <=> $2::vector) AS distance
    FROM kb.graph_objects
    WHERE embedding_vec IS NOT NULL
      AND id <> $1  -- Exclude self
    ORDER BY embedding_vec <=> $2::vector
    LIMIT $3
`;
```

### Key Concepts

**Cosine Distance (`<->` operator)**:
- Measures angle between two vectors (0.0 = identical, 2.0 = opposite)
- Lower distance = more similar
- Common thresholds:
  - `0.0-0.2`: Very similar (same topic/concept)
  - `0.2-0.5`: Moderately similar (related concepts)
  - `0.5-1.0`: Loosely related
  - `> 1.0`: Unrelated

**Why Use searchSimilar?**:
- **Find related objects** without explicit relationships
- **Discover implicit connections** (e.g., two decisions about authentication)
- **Content-based recommendations** (e.g., "show me similar patterns")
- **Context expansion** for LLM prompts (provide related knowledge)

### Example Use Cases

1. **Show related decisions**:
   ```typescript
   // User views "Decision: Use JWT for auth"
   const similar = await searchSimilar(decisionId, { 
       limit: 5, 
       maxDistance: 0.3 
   });
   // Returns: "Decision: Token refresh strategy", "Document: OAuth2 spec", etc.
   ```

2. **Find similar documents**:
   ```typescript
   // User reading "API Design Guidelines"
   const similar = await searchSimilar(docId, { 
       limit: 10, 
       type: 'Document' 
   });
   // Returns other documents about API design, REST patterns, etc.
   ```

3. **Discover implicit patterns**:
   ```typescript
   // Object: "Pattern: Repository Pattern"
   const similar = await searchSimilar(patternId, { limit: 5 });
   // Returns: "Pattern: Unit of Work", "Pattern: Active Record", etc.
   ```

## The `searchObjectsWithNeighbors` Method

### Signature

```typescript
async searchObjectsWithNeighbors(
    queryText: string,
    opts: {
        limit?: number;              // Max primary results (default 10, max 100)
        includeNeighbors?: boolean;  // Whether to fetch neighbors (default false)
        maxNeighbors?: number;       // Max neighbors per result (default 5, max 20)
        maxDistance?: number;        // Similarity threshold (default 0.5)
        projectId?: string;          // Filter by project
        orgId?: string;              // Filter by org
        branchId?: string | null;    // Filter by branch
        types?: string[];            // Filter by object types
        labels?: string[];           // Filter by labels
    }
): Promise<{
    primaryResults: GraphObjectDto[];
    neighbors: Record<string, GraphObjectDto[]>;  // Key: object ID, Value: neighbors
}>
```

### Algorithm

```
1. PRIMARY SEARCH (FTS-based for now)
   ↓
   Query: "authentication patterns"
   ↓
   FTS Match → [Object A, Object B, Object C]

2. FOR EACH PRIMARY RESULT (if includeNeighbors=true)
   ↓
   Object A
   ├─ a. SIMILAR OBJECTS (searchSimilar)
   │  ├─ Find objects with similar embeddings
   │  ├─ maxDistance threshold (e.g., 0.5)
   │  └─ Result: [Object D, Object E]
   │
   └─ b. CONNECTED OBJECTS (relationships)
      ├─ Outgoing: A → B
      ├─ Incoming: C → A
      └─ Result: [Object B, Object C]
   
   ↓
   Combine + Deduplicate → neighbors[A] = [B, C, D, E]

3. RETURN
   {
     primaryResults: [A, B, C],
     neighbors: {
       A: [B, C, D, E],
       B: [...],
       C: [...]
     }
   }
```

### Neighbor Sources

For each primary result, neighbors come from **TWO sources**:

#### 1. Semantic Similarity (Vector-based)
```typescript
const similarResults = await vectorSearch.searchSimilar(obj.id, {
    limit: Math.ceil(maxNeighbors / 2),  // Half the quota
    maxDistance: 0.5,                     // Similarity threshold
    projectId,
    orgId
});
```

**What it finds**: Objects with similar *content* (similar embeddings)
- Not explicitly connected
- Similar topics, concepts, or patterns
- Example: "Authentication Decision" → "Authorization Decision"

#### 2. Direct Relationships (Graph-based)
```typescript
// Outgoing relationships (A → B)
const outgoing = await searchRelationships({ src_id: obj.id, limit: maxNeighbors });

// Incoming relationships (C → A)
const incoming = await searchRelationships({ dst_id: obj.id, limit: maxNeighbors });
```

**What it finds**: Objects with explicit *relationships*
- Graph edges (depends_on, implements, references, etc.)
- Example: "Decision: Use JWT" → depends_on → "Pattern: Token Refresh"

## Integration with Chat

### How It's Similar to Document Citations

**Document Search** (existing):
```typescript
// Chat retrieves relevant document chunks
const citations = await retrieveCitations(userMessage, topK, orgId, projectId);

// LLM gets context:
// [Chunk 1: "JWT tokens expire after 1 hour..."]
// [Chunk 2: "Use refresh tokens to extend sessions..."]
```

**Graph Object Search** (new):
```typescript
// Chat retrieves relevant graph objects + neighbors
const { primaryResults, neighbors } = await searchObjectsWithNeighbors(
    userMessage,
    { limit: 5, includeNeighbors: true, maxNeighbors: 3 }
);

// LLM gets context:
// [Primary: Decision "Use JWT auth"]
//   - Neighbor: Pattern "Token Refresh"
//   - Neighbor: Document "Security Best Practices"
//   - Neighbor: Decision "OAuth2 integration"
```

### Usage in Chat Service

```typescript
async generateChatResponse(message: string, conversationId: string) {
    // 1. Retrieve document citations (existing)
    const citations = await this.retrieveCitations(message, 10, orgId, projectId);
    
    // 2. Retrieve graph objects with neighbors (new)
    const graphContext = await this.graphService.searchObjectsWithNeighbors(
        message,
        {
            limit: 5,
            includeNeighbors: true,
            maxNeighbors: 3,
            projectId,
            orgId
        }
    );
    
    // 3. Build enhanced context for LLM
    const context = [
        ...citations.map(c => `[Document Chunk] ${c.text}`),
        ...graphContext.primaryResults.map(obj => 
            `[${obj.type}] ${obj.properties.name}: ${obj.properties.description}`
        ),
        // Include neighbors for richer context
        ...Object.entries(graphContext.neighbors).flatMap(([objId, neighbors]) =>
            neighbors.map(n => `  Related: [${n.type}] ${n.properties.name}`)
        )
    ].join('\n\n');
    
    // 4. Send to LLM
    const response = await this.llm.generateResponse(message, context);
    
    return response;
}
```

### Benefits for Chat

1. **Richer Context**: Beyond documents, include decisions, patterns, people, systems
2. **Discovery**: Find implicit connections LLM might not see from documents alone
3. **Structured Knowledge**: Graph objects have typed relationships vs unstructured text
4. **Provenance**: Track which objects influenced the answer (like citations)

## API Endpoint (Proposed)

### Request
```http
POST /graph/search-with-neighbors
Content-Type: application/json

{
  "query": "authentication and authorization patterns",
  "limit": 10,
  "includeNeighbors": true,
  "maxNeighbors": 5,
  "maxDistance": 0.4,
  "types": ["Decision", "Pattern", "Document"],
  "projectId": "..."
}
```

### Response
```json
{
  "primaryResults": [
    {
      "id": "uuid-1",
      "type": "Decision",
      "key": "use-jwt-auth",
      "properties": {
        "name": "Use JWT for Authentication",
        "description": "Implement JWT-based stateless authentication...",
        "_extraction_confidence": 0.92
      },
      "labels": ["accepted"],
      "status": "accepted",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "neighbors": {
    "uuid-1": [
      {
        "id": "uuid-2",
        "type": "Pattern",
        "key": "token-refresh",
        "properties": {
          "name": "Token Refresh Pattern",
          "description": "Strategy for refreshing JWT tokens..."
        },
        "status": "accepted"
      },
      {
        "id": "uuid-3",
        "type": "Document",
        "key": "security-best-practices",
        "properties": {
          "name": "Security Best Practices",
          "description": "Comprehensive security guidelines..."
        },
        "status": "accepted"
      }
    ]
  }
}
```

## Performance Considerations

### Query Complexity

**Per Primary Result**:
- 1x `searchSimilar` query (vector distance calculation)
- 2x relationship queries (outgoing + incoming)
- N x `getObject` calls (where N = unique neighbor IDs)

**Example** (5 primary results, 5 neighbors each):
- 5 vector similarity searches
- 10 relationship queries
- ~25 object fetches (assuming some overlap)
- **Total: ~40 queries**

### Optimization Strategies

1. **Limit Primary Results**: Default to 10, max 100
2. **Limit Neighbors**: Default to 5 per object, max 20
3. **Distance Threshold**: Only fetch neighbors within maxDistance (default 0.5)
4. **Batch Object Fetches**: Could group neighbor IDs and fetch in batches
5. **Caching**: Cache frequently accessed objects/relationships

### When to Use `includeNeighbors`

**Use neighbors** (richer context, higher cost):
- Chat responses (need comprehensive context)
- Detail views (show related objects)
- Discovery features ("users also viewed")

**Skip neighbors** (faster, lower cost):
- Search results pages (just list objects)
- Auto-complete (only need primary matches)
- Low-latency requirements

## Testing

### Unit Tests

```typescript
describe('searchObjectsWithNeighbors', () => {
  it('should find objects by FTS', async () => {
    const result = await service.searchObjectsWithNeighbors('authentication', {
      limit: 5,
      includeNeighbors: false
    });
    expect(result.primaryResults.length).toBeLessThanOrEqual(5);
    expect(result.neighbors).toEqual({});
  });

  it('should include neighbors when requested', async () => {
    const result = await service.searchObjectsWithNeighbors('JWT', {
      limit: 3,
      includeNeighbors: true,
      maxNeighbors: 5
    });
    expect(result.primaryResults.length).toBeGreaterThan(0);
    for (const obj of result.primaryResults) {
      expect(result.neighbors[obj.id]).toBeDefined();
      expect(result.neighbors[obj.id].length).toBeLessThanOrEqual(5);
    }
  });

  it('should respect maxDistance threshold', async () => {
    const result = await service.searchObjectsWithNeighbors('security', {
      maxDistance: 0.3,  // Very strict
      includeNeighbors: true
    });
    // Neighbors should be highly similar only
  });
});
```

### Integration Tests

```typescript
it('should find semantic neighbors via searchSimilar', async () => {
  // Create objects with similar content
  const obj1 = await createObject({ 
    type: 'Decision', 
    properties: { name: 'Use JWT authentication' },
    status: 'accepted'
  });
  const obj2 = await createObject({ 
    type: 'Decision', 
    properties: { name: 'Implement OAuth2 flow' },
    status: 'accepted'
  });

  // Wait for embeddings
  await processEmbeddingJobs();

  // Search should find both + neighbors
  const result = await service.searchObjectsWithNeighbors('authentication', {
    includeNeighbors: true
  });

  expect(result.primaryResults.some(r => r.id === obj1.id)).toBe(true);
  expect(result.neighbors[obj1.id]).toContainEqual(
    expect.objectContaining({ id: obj2.id })
  );
});
```

## Future Enhancements

1. **Hybrid Search**: Combine vector + FTS scores (RRF fusion like document search)
2. **Query Embeddings**: Generate embeddings from query text for true vector search
3. **Relationship Filtering**: Filter neighbors by relationship type (e.g., only `depends_on`)
4. **Neighbor Ranking**: Rank neighbors by relevance score (distance + relationship strength)
5. **Caching**: Cache neighbor expansions for frequently accessed objects
6. **Batch API**: Accept multiple queries, return results in single call

## Summary

**searchSimilar**: Finds objects with similar content (vector-based)
- Input: Object ID
- Output: Objects with close embedding vectors
- Use: Discover implicit connections, content recommendations

**searchObjectsWithNeighbors**: Comprehensive graph search
- Input: Query text
- Output: Primary matches + their neighbors (semantic + relational)
- Use: Chat context, discovery features, rich detail views

**Benefits**:
- Richer LLM context for chat (beyond just document chunks)
- Discover related objects without explicit relationships
- Structured knowledge graph integration with chat
- Similar pattern to document citations (familiar UX)

---

**Next Steps**:
1. ✅ Add status-based embedding (only 'accepted' objects get embedded)
2. ✅ Implement `searchObjectsWithNeighbors` in GraphService
3. 🔜 Add controller endpoint: `POST /graph/search-with-neighbors`
4. 🔜 Integrate with ChatService for enhanced context
5. 🔜 Add tests and performance benchmarks
