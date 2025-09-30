# Embedding Pipeline

This document describes the asynchronous embedding pipeline for graph objects.

## Overview
The system maintains *graph objects* with optional semantic vector embeddings to enable future hybrid lexical + vector search. Embeddings are produced asynchronously after object creation or patch.

Key components:
- `kb.graph_embedding_jobs` table: queue of embedding jobs.
- `EmbeddingJobsService`: enqueue, dequeue (atomic claim), markFailed (with backoff), markCompleted, stats.
- `EmbeddingWorkerService`: background worker polling for due jobs, generating embeddings via an injected `EmbeddingProvider`.
- `EmbeddingProvider` abstraction: pluggable strategy for embedding generation (dummy deterministic provider today, real model later).

## Job Lifecycle
States: `pending`, `processing`, `failed` (re-queued as `pending` with future `scheduled_at`), `completed`.
A uniqueness partial index prevents more than one active (`pending|processing`) job for the same object.

Dequeue ordering: priority DESC, then scheduled_at ASC.

Backoff policy: quadratic (attempt^2 * baseDelay) with base 60s (configurable in code) capped at 3600s.

## Worker
The worker:
1. Dequeues up to `EMBEDDING_WORKER_BATCH` jobs (default 5).
2. Loads each object; if missing, marks job failed with short backoff.
3. Extracts textual content (type, key, primitive leaf property values).
4. Passes text to `EmbeddingProvider.generate()`.
5. Stores resulting vector (`embedding BYTEA`) and sets `embedding_updated_at`.
6. Marks job completed.

On error: `markFailed` increments attempt_count and reschedules per backoff.

## Embedding Provider Abstraction
Interface: `EmbeddingProvider { generate(text: string): Promise<Buffer>; }`.

Current binding: `DummySha256EmbeddingProvider` (hash → 128 bytes) registered under DI token `EMBEDDING_PROVIDER` in `GraphModule`.

Future real provider (e.g., Vertex AI, OpenAI): implement the interface and conditionally bind based on env (e.g., presence of API key + model configuration). Tests remain deterministic because they rely on the dummy provider signature.

## Configuration & Environment
| Variable | Purpose | Default |
|----------|---------|---------|
| `GOOGLE_API_KEY` | Enables embeddings feature flag (currently not gating dummy provider generation, but controls enqueue on create/patch). | unset |
| `EMBEDDING_WORKER_INTERVAL_MS` | Interval between polling ticks. | 2000 |
| `EMBEDDING_WORKER_BATCH` | Max jobs claimed per batch. | 5 |
| `EMBEDDING_PROVIDER` | Selects concrete provider implementation: `dummy` (default) or `vertex` (alias `google`). | dummy |
| `VERTEX_EMBEDDING_MODEL` | Vertex AI embedding model id (e.g., `text-embedding-004`). | text-embedding-004 |
| `GOOGLE_VERTEX_PROJECT` | (Planned) Explicit GCP project for Vertex calls (falls back to implicit creds if omitted). | unset |
| `GOOGLE_VERTEX_LOCATION` | (Planned) Region, e.g. `us-central1`. | us-central1 |
| `EMBEDDINGS_NETWORK_DISABLED` | Force local deterministic embedding even if real provider selected/key present (CI determinism). | unset/false |

## Enqueue Rules
On object create / patch, if embeddings are enabled (`AppConfigService.embeddingsEnabled`) and object has no embedding, the service attempts `enqueue(object_id)`. Idempotency prevents duplicates.

## Testing Strategy
- `graph-embedding.enqueue.spec.ts`: create + patch enqueue behaviors (enabled / disabled).
- `embedding-worker.spec.ts`: successful embedding vector population.
- `embedding-worker.backoff.spec.ts`: failure path increments attempt_count and reschedules (uses forced extract error).
Tests directly call `processBatch()` for deterministic processing (bypasses timer).

### Deterministic Enqueue in Worker Tests
`embedding-worker.spec.ts` no longer relies on the implicit enqueue that occurs only when `embeddingsEnabled` is true. Instead it:
1. Stops the worker interval (`worker.stop()`) to avoid races with background polling.
2. Manually calls `jobs.enqueue(objectId)` after creating the test object.
3. Invokes `processBatch()` in a short retry loop to populate the embedding.

This isolates the test from environment flag ordering (e.g., other suites mutating `GOOGLE_API_KEY`) and removes flakiness observed when auto-enqueue sometimes skipped due to config state during parallel collection.

## Operational Considerations
- Scaling: For higher throughput, run multiple worker instances (SKIP LOCKED makes claims safe) or increase batch size.
- Observability: Add metrics (jobs dequeued, failures, avg processing ms) before production integration with real model provider.
- Retries: Consider poison queue / max attempts threshold (e.g., move to `failed` terminal state after N attempts) in a future iteration.

## Vector Store & Similarity Search

PostgreSQL `pgvector` extension is enabled during schema ensure (both minimal + full paths). A prototype column `embedding_vec vector(32)` has been added to `kb.graph_objects` along with an IVFFLAT cosine index:

```
ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS embedding_vec vector(32);
CREATE INDEX IF NOT EXISTS idx_graph_objects_embedding_vec ON kb.graph_objects USING ivfflat (embedding_vec vector_cosine_ops) WITH (lists=100);
```

Rationale:
- The historical `embedding BYTEA` column stores provider-specific raw bytes (e.g., fallback deterministic hash) for legacy/tests.
- `embedding_vec` is the structured vector used for similarity queries. Dimension (32) is intentionally small for fast test execution; can be expanded (e.g., 256/768) with a later migration once a real provider returns high-dim vectors.

Service: `GraphVectorSearchService` exposes two methods:
- `searchByVector(query: number[], { limit, minScore|maxDistance, type, orgId, projectId, branchId, keyPrefix, labelsAll, labelsAny })` – ad‑hoc nearest neighbor search (cosine distance `<=>`) with optional *hybrid metadata filtering*.
- `searchSimilar(objectId: string, { limit, minScore|maxDistance, type, orgId, projectId, branchId, keyPrefix, labelsAll, labelsAny })` – finds neighbors relative to the stored `embedding_vec` of an object (excluding itself) with full *hybrid metadata filtering parity*.

### API Endpoints

Two routes surface the vector functionality (scoped under `graph:read`):

| Method | Path | Body / Query Params | Description |
|--------|------|---------------------|-------------|
| POST | `/graph/objects/vector-search` | Body: `vector: number[]` (required) plus optional filters: `limit?`, `minScore?`/`maxDistance?`, `type?`, `orgId?`, `projectId?`, `branchId?`, `keyPrefix?`, `labelsAll?`, `labelsAny?` | Top‑K cosine neighbors for an arbitrary query vector with hybrid metadata filtering. |
| GET | `/graph/objects/:id/similar` | Query: `limit?`, `minScore?`/`maxDistance?`, `type?`, `orgId?`, `projectId?`, `branchId?`, `keyPrefix?`, `labelsAll?` (comma‑sep), `labelsAny?` (comma‑sep) | Neighbors of an existing object (excludes the object itself) with full hybrid filter support. |

Response shape (current): `[{ id: string, distance: number, orgId?: string, projectId?: string, branchId?: string }, ...]` ordered ascending by `distance` (cosine metric). Empty array returned if vector column/extension unavailable.

#### Hybrid Filter Semantics (POST /vector-search)
All filters are optional and can be combined (logical AND across categories):

| Field | Type | Predicate Applied | Notes |
|-------|------|-------------------|-------|
| `type` | string | `type = $1` | Exact match. |
| `orgId` | string | `org_id = $n` | Restrict to a single org. |
| `projectId` | string | `project_id = $n` | Restrict to a single project. |
| `branchId` | string | `branch_id = $n` | Restrict to a single branch. |
| `keyPrefix` | string | `key ILIKE prefix%` | Case‑insensitive prefix scan; `%` escaped internally. |
| `labelsAll` | string[] | `labels @> ARRAY[...]` | Array containment: candidate labels must include every label specified. |
| `labelsAny` | string[] | `labels && ARRAY[...]` | Array overlap: candidate must contain at least one label specified. |
| `minScore` / `maxDistance` | number | Post‑filter distances `<= value` | `maxDistance` is the preferred alias; if both supplied, `maxDistance` takes precedence. `minScore` retained for backward compatibility (acts as maximum distance threshold). |
| `limit` | number | `LIMIT $n` | Default implementation limit (code-defined) if omitted. |

Labels logic: When both `labelsAll` and `labelsAny` are supplied, **both** predicates apply (i.e., the result must contain all labels in `labelsAll` AND overlap at least one label in `labelsAny`).

#### Distance Metric & Threshold Naming (`minScore` vs `maxDistance`)
Cosine distance via pgvector (`<=>`) produces values in `[0, 2]` (for normalized vectors typically `[0,2]`, with perfect similarity at `0`). We keep rows whose distance `<= threshold`.

Historically the parameter was called `minScore`, which caused ambiguity (it is actually a *maximum allowable distance*). We introduced `maxDistance` as a clearer alias. Both are accepted; if both are present in a request `maxDistance` wins. Clients should migrate to `maxDistance`.

Example request:
```bash
curl -X POST https://api.example.com/graph/objects/vector-search \
	-H 'Authorization: Bearer <token>' \
	-H 'Content-Type: application/json' \
	-d '{
		"vector": [0.12, -0.03, 0.9, ...],
		"limit": 10,
		"type": "document",
		"projectId": "proj_123",
		"labelsAll": ["public", "english"],
		"labelsAny": ["faq", "guide"],
		"keyPrefix": "kb/",
		"minScore": 0.4
	}'
```

Example response:
```json
[
	{ "id": "obj_a", "distance": 0.1734, "orgId": "org_1", "projectId": "proj_123", "branchId": null },
	{ "id": "obj_b", "distance": 0.2011, "orgId": "org_1", "projectId": "proj_123", "branchId": null }
]
```


Design Notes:
- Graceful Degradation: If `pgvector` or the column is missing (older environments), methods return empty arrays and log a single warning instead of throwing.
- Index Strategy: IVFFLAT with `lists=100` chosen as a balanced default for small dev datasets; production tuning (lists, parallel build, HNSW) deferred.
- Filtering Layer: Hybrid *metadata → vector* filtering currently happens inside the SQL WHERE clause (cheap restrictive predicates) prior to distance ordering. `minScore` (max distance) is applied after ordering in memory.
- Backfill: Existing rows without `embedding_vec` remain queryable (they are simply excluded); a future migration will enqueue re-embed jobs to populate vectors.
- Naming: `maxDistance` is preferred; `minScore` remains a deprecated alias (soft) until removed in a future major version after client migration.

### Planned Enhancements
- Optional dual return fields: keep both `distance` and a derived `similarity = 1 - distance` once vectors are normalized.
- Rank fusion combining lexical BM25 + vector distance (weighted or reciprocal rank).
- Expose alias parameter `maxDistance` and mark `minScore` deprecated in API docs / OpenAPI once clients migrated.

Testing: `graph-vector.search.spec.ts` seeds synthetic vectors and validates ascending distance ordering (skips silently if column absent or DB offline).

## Migration Path to Real Provider
1. Implement `<Vendor>EmbeddingProvider`.
2. Bind provider conditionally in `GraphModule` based on env (e.g., `EMBEDDING_PROVIDER=vendor`).
3. Add streaming / batching optimization if provider supports multi-text embedding.
4. Introduce vector index (e.g., pgvector) and composite lexical + vector scoring in search service.

### Current Provider Selection Logic
```
if EMBEDDING_PROVIDER in ('vertex','google') and GOOGLE_API_KEY set:
	if EMBEDDINGS_NETWORK_DISABLED:
		return deterministic stub (vertex:offline)
	else:
		try real Vertex HTTP call
		on failure -> log once and fallback deterministic (vertex:fallback)
else:
	return DummySha256EmbeddingProvider (deterministic hash)
```

The dummy provider remains deterministic for tests; switching does not require code changes, only env adjustments.

## Future Enhancements
- Vector similarity endpoint & hybrid rank fusion.
	- Expose REST/GraphQL endpoints for top-K vector neighbors and combined lexical + vector scoring.
- Batch embedding for multi-object efficiency (Vertex supports batching instances).
- Dead-letter handling for persistent failures.
- Structured text extraction strategies (schema-aware extraction vs naive leaf concatenation).
- Embedding versioning + re-embed migrations.
 - Background backfill to populate `embedding_vec` from existing `embedding` or regenerate with higher-dimension model.
