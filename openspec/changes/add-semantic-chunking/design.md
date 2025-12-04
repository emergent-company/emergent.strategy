## Context

The ingestion pipeline currently uses a simple character-based chunker that splits text at fixed 1200-character boundaries. This naive approach:

- Breaks sentences mid-word, creating meaningless embedding vectors
- Destroys paragraph structure, losing semantic context
- Ignores document structure (headings, lists, sections)
- Reduces retrieval quality for semantic search

Documents in this system are often structured (chapters, numbered sections, legal clauses, meeting notes) where preserving natural boundaries significantly improves both embedding quality and search relevance.

**Stakeholders:** Users who ingest structured documents and rely on semantic search for retrieval.

**Constraints:**

- Must be backward compatible (existing chunks remain valid)
- Must not significantly increase ingestion time
- Must work with existing embedding pipeline (768-dimension Gemini embeddings)
- Chunk size must respect embedding model context limits

## Goals / Non-Goals

**Goals:**

- Implement sentence-preserving chunking strategy
- Implement paragraph/section-preserving chunking strategy
- Allow per-document strategy selection via API
- Maintain backward compatibility with character-based chunking as default
- Store chunking metadata for debugging and re-processing

**Non-Goals:**

- AI-based semantic chunking (e.g., embedding similarity between sentences)
- Document format-specific chunkers (PDF, DOCX, HTML-aware)
- Automatic strategy selection based on document type
- Re-chunking existing documents (can be done via separate migration if needed)

## Decisions

### Decision 1: Strategy Pattern for Chunking

**What:** Implement chunking strategies as interchangeable classes implementing a common interface.

**Why:** Clean separation of concerns, easy to add new strategies, testable in isolation.

**Interface:**

```typescript
interface ChunkingStrategy {
  name: string;
  chunk(text: string, options: ChunkingOptions): ChunkResult[];
}

interface ChunkingOptions {
  maxChunkSize: number; // Max characters per chunk (default: 1200)
  minChunkSize?: number; // Min characters (prevent tiny chunks, default: 100)
}

interface ChunkResult {
  text: string;
  startOffset: number; // Character offset in original document
  endOffset: number;
  boundaryType: 'sentence' | 'paragraph' | 'character' | 'section';
}
```

**Alternatives considered:**

- Single function with strategy enum - Less extensible, harder to test
- LangChain splitters only - Adds dependency, less control over behavior

### Decision 2: Three Initial Strategies

**Strategy: `character` (default)**

- Current behavior: split at fixed character boundaries
- Use case: Binary/encoded data, backward compatibility
- Boundary markers: none

**Strategy: `sentence`**

- Split at sentence boundaries (`.!?` followed by space or newline)
- Respects maxChunkSize by combining sentences up to limit
- Falls back to character split for sentences exceeding maxChunkSize
- Use case: Prose, articles, descriptions

**Strategy: `paragraph`**

- Split at paragraph boundaries (`\n\n` or blank lines)
- Optionally detect markdown headers (`^#+\s`) as section boundaries
- Combines paragraphs up to maxChunkSize
- Falls back to sentence split for paragraphs exceeding limit
- Use case: Structured documents, chapters, sections

### Decision 3: API Contract

**Ingestion endpoint extension:**

```typescript
// POST /ingest/upload, POST /ingest/url
{
  // existing fields...
  chunkingStrategy?: 'character' | 'sentence' | 'paragraph';
  chunkingOptions?: {
    maxChunkSize?: number;   // 100-10000, default 1200
    minChunkSize?: number;   // 10-1000, default 100
  };
}
```

**Why:** Optional fields preserve backward compatibility. Reasonable defaults match current behavior.

### Decision 5: Retrieval-Time Context Expansion (Future Enhancement)

**What:** Instead of physical overlap during ingestion, support dynamic context expansion at retrieval time.

**Rationale:** Physical overlap duplicates storage and fixes context size at ingestion time. Since chunks already have `document_id` + `chunk_index`, we can fetch neighboring chunks dynamically during retrieval.

**Proposed context model (separate change):**

```typescript
// Extraction context for a chunk
interface ExtractionContext {
  primaryChunk: ChunkText; // Extract FROM this only

  // Context for understanding (do NOT extract from these)
  context: {
    positionalChunks?: ChunkText[]; // prev/next N chunks by index
    semanticChunks?: ChunkText[]; // N most similar chunks by embedding
    relatedObjects?: GraphObject[]; // N most similar already-extracted objects
  };
}

// Configuration options
interface ContextExpansionOptions {
  positionalCount?: number; // default: 1 (prev + next)
  semanticChunkCount?: number; // default: 3
  relatedObjectCount?: number; // default: 10
  objectSimilarityThreshold?: number; // default: 0.7, min similarity to include
}
```

**Benefits:**

- No duplicated storage
- Flexible context window based on query complexity
- Semantic neighbors can find related content anywhere in document (not just adjacent)
- Can combine positional + semantic for best coverage

**Decision 5a: Vector-Filtered Object Context**

When a document has many extracted objects (potentially hundreds), passing all of them to the LLM is:

- Wasteful (most are irrelevant to current chunk)
- Expensive (token costs)
- Noisy (dilutes relevant context)

**Solution:** Use vector similarity to select only objects semantically related to the current chunk.

```
Current chunk embedding → cosine similarity → all document objects
                                            ↓
                              Top N objects (similarity > threshold)
```

This enables:

1. **Deduplication** - LLM sees existing objects, avoids re-extracting them
2. **Relationship discovery** - Can link new entities to relevant existing ones
3. **Consistency** - Uses existing naming/typing conventions from related objects
4. **Bounded context** - Fixed token budget regardless of document size

**Decision 5b: Incremental Object Enrichment**

Existing objects should be provided with **full data** (all properties), and the LLM should:

1. **Return object with `id` + only NEW properties** if the primary chunk contains additional information
2. **Skip the object entirely** if no new data was found (do NOT echo back unchanged objects)

**Schema Convention for Updates:**

```
If `id` is present  → partial update (only new properties required, schema validation relaxed)
If `id` is absent   → new entity (full schema validation applies)
```

This enables incremental enrichment across chunks:

```
Chunk 1 extracts (new entity, no id):
  { "type": "Requirement", "name": "OAuth 2.0",
    "description": "Must support OAuth" }
  → System creates object with id "obj-123"

Chunk 5 (OAuth 2.0 in related objects context):
  Primary chunk mentions: "OAuth tokens must expire within 1 hour"
  → Returns: { "id": "obj-123", "expiration": "1 hour" }
             ↑ id present = update   ↑ only NEW property
  → System merges into existing object

Chunk 8 (OAuth 2.0 in related objects context):
  Primary chunk has no new info about OAuth
  → Returns: nothing (skip this object entirely)
  → No unnecessary updates, no wasted tokens
```

**Critical: Extraction Scope Constraint**

When using context expansion for extraction tasks, the LLM prompt MUST clearly distinguish between:

- **Primary chunk:** The chunk being processed - extract entities FROM this chunk only
- **Context chunks:** Neighboring chunks provided for understanding - do NOT extract from these
- **Existing objects:** Provided with full data - enrich with new properties if found, otherwise skip

Example prompt structure:

```
You are extracting entities from a document chunk.

=== PRIMARY CHUNK (extract from this) ===
{primary_chunk_text}

=== CONTEXT CHUNKS (for understanding only, do NOT extract) ===
[Previous]: {prev_chunk_text}
[Next]: {next_chunk_text}
[Related]: {semantic_chunk_1}

=== EXISTING OBJECTS (full data - enrich if new info found, skip if not) ===
{
  "id": "obj-123",
  "name": "OAuth 2.0 Protocol",
  "type": "Requirement",
  "description": "System must support OAuth 2.0 for authentication",
  "priority": "high"
}
{
  "id": "obj-456",
  "name": "Zitadel IdP",
  "type": "Component",
  "description": "Identity provider for authentication",
  "version": "2.x"
}

Instructions:
1. Extract NEW entities from the PRIMARY CHUNK (follow schema, no id field)
2. For EXISTING OBJECTS: if the primary chunk contains NEW information,
   return ONLY: { "id": "<existing-id>", "<new_property>": "<value>" }
3. Do NOT repeat existing properties - only include newly discovered ones
4. Do NOT return existing objects if no new information was found
5. Create relationships between new and existing objects where appropriate
6. Use context chunks to understand references but do NOT extract from them

Response format:
- New entity:    { "type": "Requirement", "name": "...", "description": "..." }
- Update:        { "id": "obj-123", "expiration": "1 hour" }  ← id + NEW properties only
- No new info:   (don't include in response)
```

This prevents:

- Duplicate extraction
- Unnecessary object echoing
- Wasted tokens on unchanged data

While enabling:

- Incremental enrichment across chunks
- Property discovery from different document sections
- Consistent object identity via ID reference
- Relaxed schema validation for partial updates (id present = only new fields needed)

**Decision 5c: Sequential Chunk Processing with Embedding Dependencies**

Chunks within a single document MUST be processed sequentially (one at a time) for this algorithm to work correctly.

**Why sequential:**

```
Parallel (broken):
  Chunk 1 ──→ Extracts "OAuth 2.0" (obj-123)
  Chunk 2 ──→ Extracts "OAuth 2.0" (obj-456)  ← duplicate!
  Chunk 3 ──→ Extracts "OAuth 2.0" (obj-789)  ← duplicate!
  (chunks don't see each other's extracted objects)

Sequential (correct):
  Chunk 1 ──→ Extracts "OAuth 2.0" (obj-123)
                ↓ saved to DB
  Chunk 2 ──→ Sees obj-123 in context → enriches with new properties
                ↓ merged
  Chunk 3 ──→ Sees enriched obj-123 → no new info → skip
```

**Processing order:** Chunks should be processed in `chunk_index` order (document order) to maximize context coherence - earlier chunks establish entities, later chunks enrich them.

**Parallelism scope:** Different documents CAN be processed in parallel, but chunks within a single document must be sequential.

```
Document A: Chunk 1 → Chunk 2 → Chunk 3  (sequential)
Document B: Chunk 1 → Chunk 2            (sequential)
            ↑                    ↑
            └── can run in parallel ──┘
```

**Embedding Dependencies:**

Extraction jobs MUST wait for embeddings to be created before processing can begin. This is required for:

1. **Chunk embeddings** - needed to find semantically similar chunks within the document
2. **Object embeddings** - needed to find semantically related existing objects

```
Pipeline order:

1. Ingest document
      ↓
2. Create chunks (with chunking strategy)
      ↓
3. Generate chunk embeddings ──────────────┐
      ↓                                    │
4. Start extraction job                    │
      ↓                                    │
   For each chunk (sequential):            │
      ├─ Query similar chunks (needs ──────┘
      │    chunk embeddings)
      ├─ Query similar objects (needs ─────┐
      │    object embeddings)              │
      ├─ Extract with context              │
      ├─ Save new objects                  │
      └─ Generate object embeddings ───────┘
            ↓
         Next chunk
```

**Implementation options:**

1. **Synchronous:** Ingestion waits for embeddings before returning (simpler, slower response)
2. **Job queue:** Extraction job polls/waits for embedding job completion (async, more complex)
3. **Event-driven:** Embedding completion triggers extraction start (cleanest, requires pub/sub)

**Decision 5d: Object Provenance Tracking**

Track which chunk(s) contributed to each object property using a separate provenance table.

**Schema:**

```sql
CREATE TABLE kb.object_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES kb.chunks(id) ON DELETE CASCADE,
  property_name TEXT NOT NULL,           -- which property was extracted/updated
  operation TEXT NOT NULL,               -- 'created' | 'updated'
  schema_version TEXT NOT NULL,          -- schema version used for this extraction
  extracted_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for common queries
  CONSTRAINT uq_object_chunk_property UNIQUE (object_id, chunk_id, property_name)
);

CREATE INDEX idx_provenance_object ON kb.object_provenance(object_id);
CREATE INDEX idx_provenance_chunk ON kb.object_provenance(chunk_id);
CREATE INDEX idx_provenance_schema ON kb.object_provenance(schema_version);
```

**Example data:**

```
| object_id | chunk_id | property_name | operation | schema_version | extracted_at        |
|-----------|----------|---------------|-----------|----------------|---------------------|
| obj-123   | chunk-1  | name          | created   | v1             | 2024-01-01 10:00:00 |
| obj-123   | chunk-1  | description   | created   | v1             | 2024-01-01 10:00:00 |
| obj-123   | chunk-5  | expiration    | updated   | v2             | 2024-01-15 10:05:00 |
| obj-123   | chunk-5  | validation    | updated   | v2             | 2024-01-15 10:05:00 |
```

**Enables:**

1. **Provenance queries:** "Which chunks contributed to this object?"

   ```sql
   SELECT DISTINCT c.* FROM kb.chunks c
   JOIN kb.object_provenance p ON p.chunk_id = c.id
   WHERE p.object_id = 'obj-123';
   ```

2. **Impact analysis:** "Which objects came from this chunk?"

   ```sql
   SELECT DISTINCT o.* FROM kb.graph_objects o
   JOIN kb.object_provenance p ON p.object_id = o.id
   WHERE p.chunk_id = 'chunk-1';
   ```

3. **Property-level source:** "Where did this property value come from?"

   ```sql
   SELECT c.text, p.schema_version FROM kb.chunks c
   JOIN kb.object_provenance p ON p.chunk_id = c.id
   WHERE p.object_id = 'obj-123' AND p.property_name = 'expiration';
   ```

4. **Schema version queries:** "Which properties were extracted with old schema?"

   ```sql
   SELECT object_id, property_name, schema_version
   FROM kb.object_provenance
   WHERE schema_version < 'v2';
   ```

5. **Re-extraction triggers:** "Find chunks to re-process with new schema"

   ```sql
   SELECT DISTINCT chunk_id FROM kb.object_provenance
   WHERE schema_version != 'v2';  -- current schema version
   ```

6. **UI navigation:** Click object property → see source chunk AND schema version used.

**Decision 5e: Schema Version Tracking**

Extraction jobs MUST always fetch the current schema at job start time, not use a cached version. This ensures schema changes are immediately reflected in new extraction runs.

**Requirements:**

1. **Fresh schema fetch:** Each extraction job fetches schema from database/config at start
2. **No schema caching:** Schema is not cached between extraction jobs
3. **Schema version in provenance:** Track which schema version was used for extraction

**Extended provenance table:**

```sql
ALTER TABLE kb.object_provenance
  ADD COLUMN schema_version TEXT;  -- e.g., "v2", hash, or timestamp
```

**Example provenance with schema tracking:**

```
| object_id | chunk_id | property_name | operation | schema_version | extracted_at |
|-----------|----------|---------------|-----------|----------------|--------------|
| obj-123   | chunk-1  | name          | created   | v1             | 2024-01-01   |
| obj-123   | chunk-1  | description   | created   | v1             | 2024-01-01   |
| obj-123   | chunk-5  | expiration    | updated   | v2             | 2024-01-15   |
```

**Re-extraction on schema change:**

When schema changes (new properties added, types modified), users can trigger re-extraction:

```
Schema v1: { Requirement: { name, description } }
Schema v2: { Requirement: { name, description, priority, owner } }  ← new fields

Re-extraction job:
  - Processes all chunks again with v2 schema
  - Existing objects enriched with new properties (priority, owner)
  - Provenance tracks: extracted with schema_version = "v2"
```

**Implementation notes:**

- Schema version can be: explicit version string, content hash, or last-modified timestamp
- Extraction job logs which schema version it used
- API can expose "re-extract with current schema" endpoint for documents/projects

**Deferred to:** Separate change proposal `add-retrieval-context-expansion`

### Decision 4: Metadata Storage

**What:** Add optional `metadata` JSONB column to `kb.chunks` table.

**Schema:**

```sql
ALTER TABLE kb.chunks ADD COLUMN metadata JSONB DEFAULT NULL;
```

**Content:**

```json
{
  "strategy": "sentence",
  "startOffset": 0,
  "endOffset": 1150,
  "boundaryType": "sentence"
}
```

**Why:** Enables debugging, analytics, and potential re-chunking. JSONB allows flexible extension.

**Alternative:** Separate columns - More rigid, harder to extend.

## Risks / Trade-offs

| Risk                        | Impact                                                          | Mitigation                                           |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| Sentence detection accuracy | Medium - Edge cases (abbreviations, URLs) may break incorrectly | Use proven regex patterns, allow override            |
| Performance impact          | Low - Extra parsing adds minimal overhead                       | Benchmark before/after, cache compiled regex         |
| Chunk size variance         | Medium - Semantic chunks have variable sizes                    | Set reasonable min/max, fall back to character split |
| API complexity              | Low - Optional parameters don't burden simple use cases         | Good defaults, clear documentation                   |

## Migration Plan

1. **Phase 1:** Add `metadata` column to chunks table (nullable, no migration of existing data)
2. **Phase 2:** Implement strategies in `ChunkerService`, default to `character`
3. **Phase 3:** Update DTOs and ingestion service to accept strategy parameter
4. **Phase 4:** Add tests and documentation

**Rollback:** Remove DTO fields, revert service changes. No database rollback needed (column is nullable).

## Open Questions

1. ~~Should we add overlap support?~~ **No** - replaced with retrieval-time context expansion (see Decision 5). Physical overlap duplicates storage; dynamic neighbor fetching is more flexible.
2. ~~Should paragraph strategy detect markdown headers?~~ **Yes**, treat `^#+\s` as section boundaries.
3. Should we expose a "preview" endpoint to see how a document would be chunked before ingestion? **Deferred** - can add later if needed.
