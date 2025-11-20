# Change: Add Unified Hybrid Search Tests and Endpoint

## Why

The system has robust hybrid search capabilities for both document chunks (`/search`) and graph objects (`/graph/search`), but lacks:

1. **Comprehensive E2E tests** that validate hybrid search quality with real data fixtures
2. **Tests for context retrieval quality** - verifying that search returns relevant objects with relationships and supporting text
3. **A unified endpoint** combining graph object search with document chunk search for rich AI-powered use cases (chat context, knowledge retrieval)

Current state:

- Hybrid search tests exist but are minimal (basic smoke tests, no quality validation)
- Graph relationship tests exist but don't validate search integration
- No tests verify combined graph + text retrieval performance
- No single endpoint provides both structured (graph objects) and unstructured (text chunks) context

## What Changes

### 1. Add Comprehensive Hybrid Search Tests

Create E2E tests that validate:

- **Document chunk hybrid search** with known fixtures and deterministic assertions
- **Graph object hybrid search** with seeded graph data
- **Graph search with relationship expansion** (traverse/expand integration)
- **Quality metrics**: relevance, ranking, performance benchmarks, context completeness

### 2. Create Unified Search Endpoint

Add new endpoint: `POST /search/unified` that combines:

- Graph object search (hybrid: lexical + vector over object properties)
- Document chunk search (hybrid: lexical + vector over text)
- Relationship expansion for graph objects
- Single JSON response with both structured and unstructured results

Response format:

```json
{
  "query": "string",
  "graphResults": {
    "objects": [
      {
        "object_id": "uuid",
        "type": "string",
        "fields": {},
        "score": 0.0,
        "relationships": []
      }
    ],
    "meta": { "total": 0, "lexical_score": 0.0, "vector_score": 0.0 }
  },
  "textResults": {
    "chunks": [
      {
        "id": "uuid",
        "snippet": "string",
        "score": 0.0,
        "source_document_id": "uuid"
      }
    ],
    "meta": { "mode": "hybrid", "total": 0 }
  },
  "meta": { "query_time_ms": 0, "total_results": 0 }
}
```

## Impact

- **Affected specs**:
  - New capability: `unified-search` (search combining graph + text)
  - Modified: `database-access` (add unified search tests)
- **Affected code**:

  - Add: `apps/server/src/modules/search/unified-search.service.ts`
  - Add: `apps/server/src/modules/search/unified-search.controller.ts`
  - Add: `apps/server/src/modules/search/dto/unified-search-*.dto.ts`
  - Add: `apps/server/tests/e2e/search.unified.e2e.spec.ts`
  - Add: `apps/server/tests/e2e/search.hybrid-quality.e2e.spec.ts`
  - Add: `apps/server/tests/e2e/graph-search.relationships.e2e.spec.ts`

- **Test coverage**: Significantly improves hybrid search validation and quality assurance
- **API surface**: One new public endpoint with `search:read` scope
- **Performance**: Unified endpoint may be slower than individual searches (needs optimization)
- **No breaking changes**: All existing endpoints remain unchanged
