# Spec: Batching Optimization

## MODIFIED Requirements

### Requirement: Semantic Chunk Sizing

The system MUST produce meaningful semantic chunks that are generally larger than single sentences.

#### Scenario: Minimum Chunk Size

- **Given** a list of sentences
- **When** chunking is performed
- **Then** the system MUST NOT split chunks smaller than `min_chunk_size` (e.g. 500 chars) UNLESS a very strong semantic shift is detected (threshold > 0.85) OR the document ends.

### Requirement: LLM Context Utilization

The system MUST utilize the LLM's context window efficiently by processing multiple semantic chunks in a single request.

#### Scenario: Batch Processing

- **Given** 100 semantic chunks of ~500 characters each
- **When** extracting entities
- **Then** the system MUST aggregate them into batches of approximately `MAX_BATCH_TOKENS` (e.g. 8000 tokens)
- **And** perform extraction on the aggregated text in parallel
- **And** return combined results
