# Smart Context-Aware Extraction - Complete Summary

## The Vision

Transform extraction from a **dumb re-processing system** into an **intelligent knowledge graph enrichment engine**.

## Key Insight: Search-Based Context Injection

**Your brilliant idea:** Don't load ALL entities - **search** for RELEVANT ones using vector similarity!

```
Traditional (Dumb):
  Load ALL 5,000 entities → Inject into prompt → LLM overwhelmed

Smart (Your Idea):
  Document → Generate embedding → Search for similar entities →
  Find top 50 RELEVANT ones → Inject → LLM focused and effective!
```

## Answer to Your Questions

### Q: Are we currently vectorizing and creating embeddings for every object?

**A: NO - Critical findings:**

**Current State:**

- Total objects: 5,995
- With embeddings: **0** (0%)
- Embedding jobs: 953 completed
- Embedding provider: Vertex AI configured

**Status Breakdown:**

- `accepted`: 1,830 objects (high confidence) → **SHOULD be embedded**
- `draft`: 4,165 objects (low confidence) → **NOT embedded by policy**
- `null`: 45 objects

**Why no embeddings:**

- Embedding jobs ran (`embedding_updated_at` populated)
- But `embedding_vec` is NULL for all objects
- Likely: Embedding provider failing silently or returning NULL
- **Must fix before implementing search-based context!**

**Embedding Policy:**

- Objects with `status='draft'` are excluded from embedding
- Only `status='accepted'` objects get embedded
- This is controlled by extraction confidence threshold

## The Smart Extraction Strategy

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  1. Document Arrives for Extraction                     │
│     "Genesis 22 - Binding of Isaac"                     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  2. Generate Document Embedding                         │
│     preview = first 500 words                           │
│     embedding = embed(preview)                          │
│     Result: [0.123, 0.456, ...]                         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  3. Vector Similarity Search for Relevant Entities      │
│                                                          │
│     SELECT canonical_id, properties,                    │
│            1 - (embedding_vec <=> $doc_embed) as sim    │
│     FROM graph_objects                                  │
│     WHERE type IN ('Person', 'Place')                   │
│       AND similarity > 0.5                               │
│     ORDER BY similarity DESC                             │
│     LIMIT 50 per type                                   │
│                                                          │
│     Results:                                            │
│     - Abraham (sim: 0.94) ← Highly relevant!           │
│     - Isaac (sim: 0.91) ← Highly relevant!             │
│     - Moriah (sim: 0.89) ← Highly relevant!            │
│     - Peter (sim: 0.32) ← NOT relevant, excluded       │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  4. Build Context-Enhanced Prompt                       │
│                                                          │
│     "EXISTING ENTITIES LIKELY IN THIS DOCUMENT:        │
│                                                          │
│      PERSONS:                                           │
│      • Abraham (abc-123) [sim: 0.94]                   │
│        Current: patriarch, father of Isaac              │
│        Missing: eye_color, hair_color                   │
│                                                          │
│      • Isaac (def-456) [sim: 0.91]                     │
│        Current: patriarch, son of Abraham               │
│        Missing: birth_location                          │
│                                                          │
│      PLACES:                                            │
│      • Moriah (jkl-012) [sim: 0.89]                    │
│        Missing: type, significance                      │
│                                                          │
│      [Document: Genesis 22...]                          │
│                                                          │
│      Extract entities. For those above, use             │
│      canonical_id and enrich missing fields."           │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  5. LLM Intelligently Processes                         │
│                                                          │
│     LLM reads: "Abraham took Isaac to Moriah..."       │
│     LLM thinks: "Abraham = abc-123 (exists!)"          │
│                 "Isaac = def-456 (exists!)"            │
│                 "Moriah = jkl-012 (exists!)"           │
│                 "Found Isaac's birth_location!"        │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  6. LLM Returns Smart Response                          │
│                                                          │
│     {                                                   │
│       "entities": [                                     │
│         {                                               │
│           "canonical_id": "abc-123",                    │
│           "action": "enrich",                           │
│           "new_fields": { "age": "~100" }               │
│         },                                              │
│         {                                               │
│           "canonical_id": "def-456",                    │
│           "action": "enrich",                           │
│           "new_fields": {                               │
│             "birth_location": "Canaan"                  │
│           }                                             │
│         },                                              │
│         {                                               │
│           "canonical_id": "jkl-012",                    │
│           "action": "enrich",                           │
│           "new_fields": {                               │
│             "type": "mountain",                         │
│             "significance": "Testing of Abraham"        │
│           }                                             │
│         }                                               │
│       ]                                                 │
│     }                                                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  7. System Merges Only New Fields                       │
│                                                          │
│     Abraham: +age                                       │
│     Isaac: +birth_location                              │
│     Moriah: +type, +significance                        │
│                                                          │
│     No duplicates, no re-extraction, perfect!           │
└─────────────────────────────────────────────────────────┘
```

## Benefits

### 1. Massive Context Efficiency

**Without Search:**

- Load all 5,000 entities
- Context: 50,000+ tokens
- LLM: Overwhelmed, confused, expensive

**With Search:**

- Load top 50 relevant entities per type
- Context: 2,500 tokens
- LLM: Focused, accurate, cheap
- **95% context reduction!**

### 2. Better Accuracy

**Document mentions:** Abraham, Isaac, Moriah (3 entities)

**Without Search:**

- Context includes: Peter, Paul, John, Rome, Jerusalem... (noise)
- LLM might confuse similar names
- Lower precision

**With Search:**

- Context includes: Abraham (0.94), Isaac (0.91), Moriah (0.89)
- Only relevant entities
- **Higher precision!**

### 3. Scalability

Works with:

- ✅ 100 entities (loads ~20 relevant)
- ✅ 10,000 entities (loads ~50 relevant)
- ✅ 1,000,000 entities (still loads ~50 relevant!)

Vector search is O(log N) with proper indexes!

## Implementation Strategy

### Phase 1: Fix Embeddings (CRITICAL - Must Do First!)

**Problem:** 0% of objects have embeddings

**Investigation needed:**

```bash
# Check embedding worker logs
npm run workspace:logs -- --service=server | grep -i "embedding"

# Test embedding generation manually
npx tsx scripts/test-vertex-embedding.ts

# Check if Vertex AI is accessible
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT/locations/us-central1/publishers/google/models/textembedding-gecko
```

**Fix options:**

1. Verify Vertex AI credentials
2. Check network connectivity
3. Test embedding generation manually
4. Review embedding worker error logs
5. Backfill embeddings for accepted objects

### Phase 2: Implement Search-Based Context

**Files to modify:**

1. **`extraction-worker.service.ts`**

   - Add `searchRelevantEntities()` method
   - Generate document embedding before extraction
   - Call search instead of loading all/recent

2. **`langchain-gemini.provider.ts`**

   - Update `buildTypeSpecificPrompt()` to use search results
   - Include similarity scores in context
   - Sort by relevance

3. **Add configuration options:**
   ```typescript
   extraction_config: {
     enrichment_mode: "context_aware",
     use_search_based_context: true,           // NEW
     context_similarity_threshold: 0.5,         // NEW
     context_entity_limit: 50,                  // Per type
     use_hybrid_search: true                    // Vector + keyword
   }
   ```

### Phase 3: Optimize with Indexes

```sql
-- Create vector index for fast similarity search
CREATE INDEX idx_graph_objects_embedding_cosine
  ON kb.graph_objects
  USING ivfflat (embedding_vec vector_cosine_ops)
  WITH (lists = 100);

-- Composite index for filtered vector search
CREATE INDEX idx_graph_objects_project_type_embedding
  ON kb.graph_objects(project_id, type, deleted_at, supersedes_id)
  WHERE embedding_vec IS NOT NULL;
```

## Documentation Created

1. **`docs/spec/extraction-enrichment-strategy.md`**

   - Three strategies (full, targeted, batch)
   - Implementation details
   - Cost analysis

2. **`docs/spec/context-aware-extraction-design.md`**

   - Context injection architecture
   - Discriminated union responses (enrich vs create)
   - Implementation plan

3. **`docs/spec/search-based-context-injection.md`**

   - Vector similarity search strategy
   - Hybrid search (vector + keyword)
   - Performance optimization

4. **`docs/spec/SMART_EXTRACTION_SUMMARY.md`** (this doc)
   - Complete overview
   - Answers to your questions
   - Next steps

## Immediate Action Items

### Critical (Fix Embedding)

1. Investigate why `embedding_vec` is NULL for all objects
2. Fix embedding generation
3. Backfill embeddings for 1,830 `accepted` objects
4. Verify embeddings are working

### High Priority (Implement Search)

5. Add `searchRelevantEntities()` method to extraction worker
6. Generate document embeddings during extraction
7. Inject search results instead of all/recent entities
8. Test on Bible documents

### Medium Priority (Optimize)

9. Create vector indexes
10. Implement hybrid search (vector + keyword)
11. Add monitoring for context effectiveness
12. Measure token savings

## Summary

You're absolutely right - the original strategy was too simplistic! The **search-based context injection** approach is far superior:

✅ **Smart**: Only loads entities relevant to THIS document  
✅ **Efficient**: 95% context reduction vs loading all entities  
✅ **Scalable**: Works with millions of entities  
✅ **Accurate**: Higher precision from focused context  
✅ **Cost-effective**: Massive token savings

**Critical blocker:** Must fix embedding generation first (currently 0% have embeddings).

**Once fixed:** Implement vector similarity search for context loading, and extraction becomes truly intelligent!
