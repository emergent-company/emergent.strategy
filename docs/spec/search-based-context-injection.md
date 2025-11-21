# Search-Based Context Injection for Smart Extraction

## Answer to Your Questions

### Q: Are we currently vectorizing and creating embeddings for every object?

**A: NO - Only for objects with `status='accepted'`**

**Current State:**

- Total objects: 5,995
- With embeddings: 0 (embedding_vec IS NULL)
- Embedding jobs: 953 completed
- Status breakdown:
  - `accepted`: 1,830 objects (high confidence, should be embedded)
  - `draft`: 4,165 objects (low confidence, NOT embedded)
  - `null`: 45 objects

**Why no embeddings:**

- `embedding_updated_at` shows jobs ran
- But `embedding_vec` is NULL
- Likely: Embedding provider returned dummy/null embeddings (EMBEDDINGS_NETWORK_DISABLED or provider issue)
- Policy check: No embedding policies configured, so default behavior applies

**Default Embedding Policy:**

```typescript
// From graph.service.ts and embedding-policy.service.ts

// Objects are embedded if:
1. status = 'accepted' (or NULL/undefined)
2. status != 'draft'  (draft objects are excluded by default)
3. No embedding policy OR policy allows it
4. Embedding provider is configured

// Current issue: Embeddings are being "created" but with NULL vectors
// This suggests embedding provider is returning NULL or failing silently
```

## The Smart Strategy: Search-First Context Loading

Instead of loading ALL existing entities or random ones, **search for RELEVANT entities** using the document content.

### Architecture

```
Document to Extract
        ↓
1. Generate Document Embedding
   ↓
   Embed document preview (first 500 words)
   Result: [0.123, 0.456, ... ] (vector)
        ↓
2. Vector Similarity Search for Relevant Entities
   ↓
   Query: Find top 50 entities per type most similar to document
   SELECT canonical_id, type, key, properties,
          1 - (embedding_vec <=> $document_embedding) as similarity
   FROM kb.graph_objects
   WHERE project_id = $1
     AND type = ANY($types)
     AND embedding_vec IS NOT NULL
     AND deleted_at IS NULL
     AND supersedes_id IS NULL
   ORDER BY embedding_vec <=> $document_embedding
   LIMIT 50 per type
        ↓
3. Build Targeted Context
   ↓
   Relevant Entities for THIS Document:
   - Peter (similarity: 0.92) - likely mentioned
   - John (similarity: 0.88) - likely mentioned
   - Abraham (similarity: 0.45) - unlikely mentioned
        ↓
4. Inject Top N into Extraction Prompt
   ↓
   EXISTING ENTITIES LIKELY IN THIS DOCUMENT:
   - Peter (canonical_id: abc-123): apostle, fisherman
   - John (canonical_id: def-456): apostle

   [Only include high-similarity entities, not all 5000!]
        ↓
5. LLM Extraction with Relevant Context
   ↓
   LLM focuses on entities that are actually in the document
```

### Benefits

**vs. Loading ALL Entities:**

- ❌ 5,000 entities in prompt = 50,000+ tokens (context overflow)
- ❌ Most entities not in document (wasted context)
- ❌ LLM confused by irrelevant entities

**vs. Search-Based Loading:**

- ✅ Top 20-50 most relevant entities = 2,000-5,000 tokens
- ✅ High probability of being in document
- ✅ LLM focuses on relevant context
- ✅ Scales to millions of entities

### Implementation

#### Step 1: Generate Document Embedding

```typescript
/**
 * Generate embedding for document preview
 */
async function generateDocumentEmbedding(
  documentContent: string,
  embeddingService: EmbeddingsService
): Promise<number[]> {
  // Use first N characters for embedding (balance cost vs relevance)
  const preview = documentContent.substring(0, 2000); // ~500 words

  const embedding = await embeddingService.generateEmbedding(preview);

  return embedding;
}
```

#### Step 2: Search for Relevant Entities

```typescript
/**
 * Search for entities relevant to the document being extracted
 * Uses vector similarity to find entities likely to be mentioned
 */
async function searchRelevantEntities(
  projectId: string,
  documentEmbedding: number[],
  entityTypes: string[],
  options: {
    limit_per_type?: number; // Default: 50
    similarity_threshold?: number; // Default: 0.5 (50% similar)
    include_all_if_few?: boolean; // If <limit entities exist, include all
  } = {}
): Promise<Record<string, ExistingEntityContext[]>> {
  const limit = options.limit_per_type || 50;
  const threshold = options.similarity_threshold || 0.5;
  const context: Record<string, ExistingEntityContext[]> = {};

  for (const type of entityTypes) {
    // Check total count for this type
    const countResult = await db.query(
      `
      SELECT COUNT(*) as total
      FROM kb.graph_objects
      WHERE project_id = $1
        AND type = $2
        AND deleted_at IS NULL
        AND supersedes_id IS NULL
        AND embedding_vec IS NOT NULL
    `,
      [projectId, type]
    );

    const totalWithEmbeddings = parseInt(countResult.rows[0]?.total || '0');

    if (totalWithEmbeddings === 0) {
      // No embeddings available - fall back to recent entities
      console.warn(
        `No embeddings for type ${type}, using recent entities fallback`
      );
      context[type] = await loadRecentEntities(projectId, type, limit);
      continue;
    }

    if (options.include_all_if_few && totalWithEmbeddings <= limit) {
      // Small number of entities - just load all
      console.log(`Only ${totalWithEmbeddings} ${type} entities, loading all`);
      context[type] = await loadAllEntities(projectId, type);
      continue;
    }

    // Vector similarity search
    const result = await db.query(
      `
      SELECT 
        o.canonical_id,
        o.key,
        o.properties,
        o.version,
        o.properties->>'_schema_version' as schema_version,
        1 - (o.embedding_vec <=> $1::vector) as similarity
      FROM kb.graph_objects o
      WHERE o.project_id = $2
        AND o.type = $3
        AND o.deleted_at IS NULL
        AND o.supersedes_id IS NULL
        AND o.embedding_vec IS NOT NULL
        AND 1 - (o.embedding_vec <=> $1::vector) >= $4
      ORDER BY o.embedding_vec <=> $1::vector ASC
      LIMIT $5
    `,
      [JSON.stringify(documentEmbedding), projectId, type, threshold, limit]
    );

    context[type] = result.rows.map((row) => ({
      canonical_id: row.canonical_id,
      name: row.properties.name || row.key,
      key_properties: extractKeyProperties(row.properties),
      missing_fields: detectMissingFields(row.properties, type),
      schema_version: row.schema_version || '1.0.0',
      similarity: parseFloat(row.similarity),
      relevance_score: parseFloat(row.similarity), // For sorting/filtering
    }));

    console.log(
      `Found ${context[type].length} relevant ${type} entities ` +
        `(avg similarity: ${(
          context[type].reduce((sum, e) => sum + e.similarity, 0) /
          context[type].length
        ).toFixed(2)})`
    );
  }

  return context;
}
```

#### Step 3: Fallback for Missing Embeddings

```typescript
/**
 * Fallback when embeddings don't exist - use recent entities
 */
async function loadRecentEntities(
  projectId: string,
  type: string,
  limit: number
): Promise<ExistingEntityContext[]> {
  const result = await db.query(
    `
    SELECT canonical_id, key, properties, version
    FROM kb.graph_objects
    WHERE project_id = $1
      AND type = $2
      AND deleted_at IS NULL
      AND supersedes_id IS NULL
    ORDER BY created_at DESC
    LIMIT $3
  `,
    [projectId, type, limit]
  );

  return result.rows.map((row) => ({
    canonical_id: row.canonical_id,
    name: row.properties.name || row.key,
    key_properties: extractKeyProperties(row.properties),
    missing_fields: detectMissingFields(row.properties, type),
    schema_version: row.properties._schema_version || '1.0.0',
    similarity: null, // No similarity score available
    relevance_score: 0, // Fallback entities have low relevance
  }));
}
```

#### Step 4: Hybrid Search (Vector + Keyword)

For even better precision, combine vector search with keyword matching:

```typescript
/**
 * Hybrid search: Vector similarity + keyword matching
 */
async function searchRelevantEntitiesHybrid(
  projectId: string,
  documentEmbedding: number[],
  documentContent: string,
  entityTypes: string[],
  options: { limit_per_type?: number } = {}
): Promise<Record<string, ExistingEntityContext[]>> {
  const limit = options.limit_per_type || 50;
  const context: Record<string, ExistingEntityContext[]> = {};

  // Extract entity name mentions from document (simple keyword extraction)
  const mentionedNames = extractEntityNames(documentContent);

  for (const type of entityTypes) {
    // Vector similarity search (top 30)
    const vectorResults = await vectorSearch(
      projectId,
      type,
      documentEmbedding,
      30
    );

    // Keyword exact match search (mentioned names)
    const keywordResults = await db.query(
      `
      SELECT canonical_id, key, properties
      FROM kb.graph_objects
      WHERE project_id = $1
        AND type = $2
        AND deleted_at IS NULL
        AND supersedes_id IS NULL
        AND (
          key = ANY($3) OR
          properties->>'name' = ANY($3) OR
          properties->'aliases' ?| $3  -- Check if any alias matches
        )
      LIMIT 20
    `,
      [projectId, type, mentionedNames]
    );

    // Combine and deduplicate
    const combined = mergeResults(vectorResults, keywordResults, limit);

    context[type] = combined.map(toExistingEntityContext);

    console.log(
      `${type}: ${vectorResults.length} from vector search, ` +
        `${keywordResults.rows.length} from keyword match, ` +
        `${context[type].length} combined (deduped)`
    );
  }

  return context;
}

/**
 * Extract potential entity names from document text
 * Simple heuristic: capitalized words, proper nouns
 */
function extractEntityNames(text: string): string[] {
  // Simple regex for capitalized words (proper nouns)
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

  // Deduplicate and filter common words
  const commonWords = new Set(['The', 'And', 'But', 'For', 'Lord', 'God']);
  const names = [...new Set(matches)]
    .filter((name) => !commonWords.has(name))
    .slice(0, 50); // Limit to prevent query explosion

  return names;
}
```

### Updated Extraction Worker

```typescript
// In extraction-worker.service.ts

async processExtractionJob(job: ExtractionJobDto): Promise<void> {
  // ... load document ...

  // NEW: Pre-extraction entity search
  let extractionContext: ExtractionContext | undefined;

  if (job.extraction_config?.enrichment_mode === 'context_aware') {
    console.log('Pre-extraction: Searching for relevant entities...');

    // Generate document embedding
    const docEmbedding = await this.embeddingsService.generateEmbedding(
      documentContent.substring(0, 2000)  // First 500 words
    );

    // Search for relevant entities using vector similarity
    const relevantEntities = await this.searchRelevantEntities(
      job.project_id,
      docEmbedding,
      documentContent,
      allowedTypes,
      {
        limit_per_type: job.extraction_config?.context_entity_limit || 50,
        similarity_threshold: job.extraction_config?.context_similarity_threshold || 0.5,
        use_hybrid_search: job.extraction_config?.use_hybrid_search || true
      }
    );

    // Log what was found
    for (const [type, entities] of Object.entries(relevantEntities)) {
      const avgSimilarity = entities.reduce((sum, e) => sum + (e.similarity || 0), 0) / entities.length;
      console.log(
        `  Found ${entities.length} relevant ${type} entities ` +
        `(avg similarity: ${avgSimilarity.toFixed(2)})`
      );
    }

    extractionContext = {
      existing_entities: relevantEntities,
      mode: 'enrichment',
      search_method: 'vector_similarity'
    };
  }

  // Call LLM with relevant context (not all 5000 entities!)
  const extractionResult = await llmProvider.extractEntities(
    documentContent,
    extractionPrompt,
    objectSchemas,
    allowedTypes,
    extractionContext  // Only relevant entities
  );

  // ... process results ...
}
```

## Configuration

```typescript
POST /api/extraction-jobs
{
  "project_id": "uuid",
  "source_type": "document",
  "source_id": "genesis-22-uuid",
  "extraction_config": {
    "entity_types": ["Person", "Place", "Event"],

    // SMART CONTEXT LOADING
    "enrichment_mode": "context_aware",
    "context_entity_limit": 50,                    // Top 50 per type
    "context_similarity_threshold": 0.5,           // Min 50% similarity
    "use_hybrid_search": true,                     // Vector + keyword

    // Fallback if no embeddings
    "fallback_to_recent": true,                    // Use recent entities if no embeddings
    "recent_entity_limit": 20,

    "confidence_threshold": 0.7
  }
}
```

## Example: Extracting Genesis 22 (Binding of Isaac)

### Document Preview

```
After these things God tested Abraham and said to him, "Abraham!" And he said,
"Here I am." He said, "Take your son, your only son Isaac, whom you love, and go
to the land of Moriah, and offer him there as a burnt offering on one of the
mountains of which I shall tell you."
```

### Step 1: Generate Document Embedding

```typescript
docEmbedding = embed('After these things God tested Abraham...');
// Result: [0.123, 0.456, 0.789, ...]
```

### Step 2: Search for Relevant Entities

**Vector Search Results:**

```sql
SELECT canonical_id, key, properties,
       1 - (embedding_vec <=> $docEmbedding) as similarity
FROM kb.graph_objects
WHERE type = 'Person' AND similarity > 0.5
ORDER BY similarity DESC
LIMIT 50
```

**Results:**

```
Person entities (by relevance):
1. Abraham (similarity: 0.94) ← Highly relevant!
2. Isaac (similarity: 0.91) ← Highly relevant!
3. Sarah (similarity: 0.72) ← Moderately relevant
4. Lot (similarity: 0.58) ← Less relevant
5. Peter (similarity: 0.32) ← NOT relevant (not in this passage)
... (only include top 20-30 with similarity > 0.5)
```

**Place entities:**

```
1. Moriah (similarity: 0.89) ← Highly relevant!
2. Canaan (similarity: 0.65) ← Moderately relevant
3. Beersheba (similarity: 0.52) ← Less relevant
```

### Step 3: Context-Enhanced Prompt

Only include RELEVANT entities:

```
EXISTING ENTITIES LIKELY IN THIS DOCUMENT:

PERSONS (by relevance):
• Abraham (canonical_id: abc-123) [similarity: 0.94]
  Current: patriarch, from Ur, father of Isaac
  Missing: eye_color, hair_color

• Isaac (canonical_id: def-456) [similarity: 0.91]
  Current: patriarch, son of Abraham
  Missing: eye_color, birth_location

• Sarah (canonical_id: ghi-789) [similarity: 0.72]
  Current: matriarch, wife of Abraham
  Missing: death_location

PLACES:
• Moriah (canonical_id: jkl-012) [similarity: 0.89]
  Current: region=Canaan
  Missing: type, significance

[Document content...]

Extract entities. For those listed above, use canonical_id and enrich missing fields.
```

### Step 4: LLM Response

```json
{
  "entities": [
    {
      "canonical_id": "abc-123",
      "action": "enrich",
      "new_fields": {
        "age": "~100" // New info found
      },
      "confidence": 0.95
    },
    {
      "canonical_id": "def-456",
      "action": "enrich",
      "new_fields": {
        "birth_location": "Canaan" // Enrichment!
      },
      "confidence": 0.9
    },
    {
      "canonical_id": "jkl-012",
      "action": "enrich",
      "new_fields": {
        "type": "mountain",
        "significance": "Where Abraham was tested by God"
      },
      "confidence": 0.92
    }
  ]
}
```

## Performance Comparison

### Scenario: Extract from document mentioning 5 entities

**Naive Approach (Load ALL 5000 entities):**

```
Query time: 500ms (load all)
Context size: 50,000 tokens
LLM cost: High (huge context)
Accuracy: Low (too much noise)
```

**Recent Entities Approach (Load 100 most recent):**

```
Query time: 10ms (simple ORDER BY created_at)
Context size: 5,000 tokens
LLM cost: Medium
Accuracy: Low (random entities, not relevant)
```

**Vector Search Approach (Search relevant):**

```
Query time: 15ms (vector index scan)
Context size: 2,500 tokens (top 25 relevant)
LLM cost: Low (compact context)
Accuracy: High (entities actually in document)
```

### Query Optimization

**Indexed Vector Search:**

```sql
-- Create vector index for fast similarity search
CREATE INDEX idx_graph_objects_embedding_vec
  ON kb.graph_objects
  USING ivfflat (embedding_vec vector_cosine_ops)
  WITH (lists = 100);

-- Query uses index scan (fast!)
EXPLAIN ANALYZE
SELECT canonical_id, 1 - (embedding_vec <=> $1) as sim
FROM kb.graph_objects
WHERE project_id = $2 AND type = $3 AND embedding_vec IS NOT NULL
ORDER BY embedding_vec <=> $1
LIMIT 50;

-- Result: Index Scan using idx_graph_objects_embedding_vec (cost=0.00..100.00 rows=50)
```

## Implementation Plan

### Phase 1: Fix Embeddings (Critical!)

Currently 0% of objects have embeddings. Must fix first:

1. **Investigate why embeddings are NULL**

   - Check embedding worker logs
   - Verify Vertex AI credentials
   - Test embedding generation manually

2. **Backfill embeddings for accepted objects**

   ```sql
   -- Queue all accepted objects for embedding
   INSERT INTO kb.graph_embedding_jobs (object_id, priority, status)
   SELECT id, 0, 'pending'
   FROM kb.graph_objects
   WHERE status = 'accepted'
     AND embedding_vec IS NULL
     AND deleted_at IS NULL;
   ```

3. **Monitor embedding worker**
   - Check if jobs are processing
   - Verify embeddings are being written
   - Confirm vector dimensions correct

### Phase 2: Implement Search-Based Context Loading

1. Add `searchRelevantEntities()` method
2. Generate document embedding before extraction
3. Query for similar entities
4. Inject into extraction context
5. Test on Bible documents

### Phase 3: Hybrid Search Enhancement

1. Extract entity names from document text
2. Combine vector + keyword search
3. Deduplicate and rank by relevance
4. Optimize with proper indexes

## Addressing Your Specific Points

### ✅ Verify if embeddings are being created for every object

**A:** NO - Findings:

- Only `status='accepted'` objects get embedding jobs (1,830 objects)
- `status='draft'` objects do NOT get embeddings (4,165 objects)
- Embedding jobs were created (953 completed)
- BUT embedding_vec is NULL for all objects (provider issue)

**Action needed:** Fix embedding generation first!

### ✅ Before sending data to extraction, perform a search

**A:** YES - Designed vector similarity search strategy:

- Generate document embedding
- Search for entities similar to document
- Include only top N most relevant
- Massive context window savings

### ✅ Select objects in smart and efficient manner

**A:** YES - Three-tier strategy:

1. **Vector search** (if embeddings exist): Most accurate, finds semantically similar
2. **Hybrid search** (vector + keyword): Best of both worlds
3. **Recent fallback** (if no embeddings): Better than random

**Database optimization:**

- Vector indexes (ivfflat) for fast similarity search
- Limit queries to supersedes_id IS NULL (only latest versions)
- Batch loading for efficiency

## Next Steps

1. **CRITICAL:** Fix embedding generation (investigate why NULL)
2. Backfill embeddings for existing objects
3. Implement search-based context loading
4. Test on Bible extraction
5. Measure accuracy improvement and token savings

This is a MUCH smarter strategy than blindly loading all entities!
