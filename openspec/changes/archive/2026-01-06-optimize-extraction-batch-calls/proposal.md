# Change: Optimize Extraction with Semantic Chunking & Batching

## Why

The current extraction system faces two primary bottlenecks:

1.  **Inefficient API Usage**: It processes document content by making one LLM call per entity type per chunk. For a document with 5 entity types, this results in 5x the necessary API calls, increasing cost and latency.
2.  **Context Fragmentation**: Current fixed-size or recursive character chunking arbitrarily splits text. If an entity's description straddles a 500-token boundary, the LLM fails to extract it correctly ("Lost-in-the-Middle" or broken context).

We need a system that respects the semantic boundaries of the text and maximizes the utility of every LLM inference call.

## What Changes

### 1. Implement Semantic Chunking

Replace the current fixed-size/recursive splitter with **Semantic Chunking**.

- **How**: Use an embedding model (e.g., `text-embedding-004`) to measure cosine similarity between sequential sentences.
- **Logic**: Only split the text when similarity drops below a threshold (indicating a topic shift).
- **Benefit**: Ensures that "chunks" represent complete thoughts/contexts, significantly improving extraction recall.

### 2. Consolidate Extraction (Batching)

Move from "One Call Per Type" to **"One Call Per Chunk"**.

- **Unified Schema**: Define a single, comprehensive **Zod** schema that includes all target entity types (e.g., `z.object({ people: [...], dates: [...], liabilities: [...] })`).
- **Single Pass**: Pass this unified schema to the LLM for each semantic chunk.
- **Benefit**: Reduces API calls by ~80% (for 5 types) and leverage's the model's ability to see relationships between different entity types in the same context.

### 3. Map-Reduce Architecture

Formalize the extraction flow using a Map-Reduce pattern:

- **Map**: Parallel processing of semantic chunks using **Gemini 2.5 Flash** with strict Zod validation.
- **Reduce**: Aggregation of results, deduplication of identical entities, and merging of partial matches.

## Impact

**Affected specs:**

- `entity-extraction` (new spec to document this architecture)

**Affected code:**

- `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`: Update orchestration logic.
- `apps/server/src/modules/extraction-jobs/llm/*`: Implement Semantic Chunking logic and Zod schema consolidation.

**Dependencies:**

- Requires an embedding provider (likely `text-embedding-004` or similar).
- `zod` for schema validation (already in use).
- **Gemini 2.5 Flash** model access.

**Benefits:**

- **Higher Recall**: Semantic chunks prevent entities from being split.
- **Lower Cost**: Fewer API calls and efficient model usage (`Gemini 2.5 Flash`) due to strict Zod constraining.
- **Better Latency**: Parallel execution of fewer total requests.

**Risks:**

- **Embedding Cost**: Semantic chunking adds an embedding step, but this is negligible compared to the savings on Generation tokens.
- **Schema Complexity**: A massive unified schema might confuse smaller models. _Mitigation: If schema exceeds token limits, group types into logical "Domain Batches" (e.g., "Legal" vs "General")._
