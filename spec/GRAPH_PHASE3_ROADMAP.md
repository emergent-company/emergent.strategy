# Dynamic Object Graph - Phase 3+ Roadmap

**Status**: Phase 1 & 2 Complete  
**Created**: 2025-09-30  
**Purpose**: Outline remaining enhancements and advanced features

---

## Executive Summary

All **critical and high-priority features** for the dynamic object graph system are complete and production-ready. This document outlines Phase 3+ enhancements that can be prioritized based on actual usage patterns and performance needs.

---

## Completed Foundation (Phases 1 & 2)

✅ **Core Infrastructure**
- Versioned objects and relationships with schema validation
- Multi-tenant RLS with strict mode
- Content hashing and structured diff generation (29/29 tests passing)
- Canonical ID versioning chains
- Soft delete with restoration

✅ **Branching & Merging**
- Full Git-like branching with lineage tracking
- Lazy branch fallback resolution (recursive CTE)
- Merge conflict detection (Added/FastForward/Conflict/Unchanged)
- Merge provenance tracking

✅ **Release Management**
- Product version snapshots
- Snapshot list and retrieval with pagination
- Release diff comparison
- Tags system (full CRUD with 6 endpoints)

✅ **Query & Search**
- BFS traversal with filtering
- Full-text search with GIN index
- Vector embedding infrastructure
- Hybrid search (lexical + vector)

✅ **Multiplicity Enforcement**
- Application-layer enforcement with advisory locks
- Error code `relationship_multiplicity_violation` with side indication
- Comprehensive test coverage

---

## Phase 3 Priorities (Next 3-6 Months)

### 1. Embedding Production Readiness (HIGH)
**Current State**: Infrastructure operational with placeholder dimension (32)  
**Goal**: Migrate to production embedding dimension (1536)  
**Impact**: Enables high-quality semantic search  
**Estimated Effort**: 1 week

**Tasks**:
- [ ] Add `EMBEDDING_DIMENSION` environment variable (default: 1536)
- [ ] Create migration script to:
  - Create new `embedding_vec_new vector(1536)` column
  - Backfill existing embeddings (re-run embedding worker)
  - Drop old column, rename new column
- [ ] Update embedding provider interfaces
- [ ] Add dimension validation in embedding job service
- [ ] Document migration procedure

**Technical Considerations**:
- Zero-downtime migration strategy (run dual columns during transition)
- Embedding job queue prioritization for re-embedding
- Monitor disk space during migration
- Consider incremental migration (batch by project_id)

---

### 2. Policy-Driven Selective Embedding (MEDIUM)
**Current State**: All objects get embedded indiscriminately  
**Goal**: Control which objects get embeddings based on type/labels/size  
**Impact**: Reduces embedding costs and improves search quality  
**Estimated Effort**: 2 weeks

**Tasks**:
- [ ] Add `embedding_policy` JSONB column to `kb.graph_objects`
- [ ] Create `kb.embedding_policies` table:
  ```sql
  CREATE TABLE kb.embedding_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    max_property_size INT DEFAULT 10000, -- skip if properties > this
    required_labels TEXT[] DEFAULT '{}',
    excluded_labels TEXT[] DEFAULT '{}',
    relevant_paths TEXT[] DEFAULT '{}', -- JSON Pointer paths to embed
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, object_type)
  );
  ```
- [ ] Update embedding worker to check policy before queuing
- [ ] Add `/graph/embedding-policies` CRUD endpoints
- [ ] Implement field masking for sensitive properties (use `relevant_paths`)

**Default Policy** (if not specified):
- Embed all objects with `properties` size < 100KB
- Include all fields
- No label restrictions

---

### 3. Advanced Traversal Features (MEDIUM)
**Current State**: Basic BFS traversal with depth/type/label filters  
**Goal**: Support complex graph queries  
**Impact**: Enables sophisticated knowledge graph applications  
**Estimated Effort**: 3 weeks

#### 3a. Phased Traversal (edgePhases)
Allow users to specify traversal phases:
```json
{
  "startNodes": ["node1", "node2"],
  "edgePhases": [
    {
      "relationshipTypes": ["depends_on"],
      "direction": "outbound",
      "maxDepth": 2
    },
    {
      "relationshipTypes": ["implemented_by"],
      "direction": "inbound",
      "maxDepth": 1
    }
  ]
}
```

**Tasks**:
- [ ] Add `EdgePhaseDto` interface
- [ ] Implement phase-based BFS in `graph.service.ts`
- [ ] Add phase context to response (which phase found each node)
- [ ] Update OpenAPI documentation
- [ ] Write acceptance tests

#### 3b. Property Predicate Filtering
Filter nodes/edges based on property values:
```json
{
  "nodeFilter": {
    "path": "/status",
    "operator": "equals",
    "value": "active"
  },
  "edgeFilter": {
    "path": "/confidence",
    "operator": "greaterThan",
    "value": 0.7
  }
}
```

**Tasks**:
- [ ] Add `PredicateDto` interface (path, operator, value)
- [ ] Support operators: equals, notEquals, contains, greaterThan, lessThan, in, matches (regex)
- [ ] Implement JSONB path evaluation in SQL or post-filter
- [ ] Add predicate validation
- [ ] Document predicate syntax

#### 3c. Path Enumeration (returnPaths)
Return full paths from start node to each result:
```json
{
  "returnPaths": true,
  "maxPathsPerNode": 3
}
```

Response includes:
```json
{
  "node": {...},
  "paths": [
    ["node1", "edge1", "node2", "edge2", "node3"],
    ["node1", "edge3", "node3"]
  ]
}
```

**Tasks**:
- [ ] Track path ancestry during BFS
- [ ] Add path serialization
- [ ] Implement path limit per node
- [ ] Consider path compression (shared prefix elimination)

#### 3d. Temporal Validity Filtering
Filter based on temporal fields (`valid_from`, `valid_until`, `created_at`, `updated_at`):
```json
{
  "temporalFilter": {
    "asOf": "2025-09-30T00:00:00Z",
    "field": "valid_from" // or "created_at"
  }
}
```

**Tasks**:
- [ ] Add temporal validity columns (optional)
- [ ] Implement point-in-time queries
- [ ] Support temporal range queries
- [ ] Document temporal semantics

---

### 4. Hybrid Search Enhancements (MEDIUM-LOW)
**Current State**: Basic weighted fusion of lexical + vector scores  
**Goal**: Production-grade hybrid search with score normalization  
**Impact**: Improves search quality and relevance  
**Estimated Effort**: 2 weeks

#### 4a. Score Normalization (z-score)
Normalize lexical and vector scores before fusion:
```typescript
z_lex = (score_lex - mean_lex) / std_lex
z_vec = (score_vec - mean_vec) / std_vec
final = w_lex * sigmoid(z_lex) + w_vec * sigmoid(z_vec)
```

**Tasks**:
- [ ] Collect score statistics (mean, std) per channel
- [ ] Implement z-score normalization
- [ ] Add sigmoid transformation for bounded range
- [ ] Make weights configurable per query
- [ ] Add telemetry for score distributions

#### 4b. Path Summaries
Include relationship context in search results:
```json
{
  "object": {...},
  "path_summary": "Related to Decision D1 via 'implements' → connected to Meeting M3 via 'discussed_in'"
}
```

**Tasks**:
- [ ] Define path summary template per relationship type
- [ ] Generate summaries during result assembly
- [ ] Limit summary depth (default: 2 hops)
- [ ] Cache summaries for frequently accessed nodes

#### 4c. Salience-Based Field Pruning
Reduce context size by pruning low-salience fields:
```
retain_fields = (explicitly requested) ∪ topK(salience) ∪ mandatory_core(title,type)
```

**Tasks**:
- [ ] Define salience scoring (TF-IDF, query term presence)
- [ ] Implement field pruning in context assembly
- [ ] Add `fieldStrategy: 'full' | 'salient'` query parameter
- [ ] Truncate large text fields to `FIELD_TOKEN_MAX` (128 tokens)

---

### 5. Observability & Telemetry (LOW)
**Current State**: Basic RLS verification, minimal logging  
**Goal**: Production-grade monitoring and debugging  
**Impact**: Faster issue detection and performance optimization  
**Estimated Effort**: 1 week

**Tasks**:
- [ ] Add graph operation metrics (Prometheus format):
  - Traversal latency histograms (by depth)
  - Merge conflict rates
  - Embedding job queue depth
  - Search result set sizes
- [ ] Track graph statistics:
  - Branching factor per object type
  - Average relationship density
  - Version chain lengths
- [ ] Add slow query logging for traversals > threshold
- [ ] Export metrics via `/metrics` endpoint
- [ ] Create Grafana dashboard templates

**Key Metrics**:
| Metric | Type | Labels |
|--------|------|--------|
| `graph_traversal_duration_ms` | Histogram | depth, truncated |
| `graph_merge_conflicts_total` | Counter | project_id, source_branch |
| `graph_embedding_queue_depth` | Gauge | status |
| `graph_search_results_count` | Histogram | search_type |

---

### 6. Governance & Compliance (LOW)
**Current State**: Multi-tenant RLS, no fine-grained policies  
**Goal**: Per-type authorization and retention policies  
**Impact**: Enhanced security and compliance  
**Estimated Effort**: 2 weeks

#### 6a. Per-Type Authorization Policies
Define which roles can create/read/update objects of specific types:
```sql
CREATE TABLE kb.type_authorization_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  object_type TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','read','update','delete')),
  required_role TEXT NOT NULL, -- 'admin','editor','viewer'
  UNIQUE(project_id, object_type, operation)
);
```

**Tasks**:
- [ ] Create policy table
- [ ] Add policy check in graph service CRUD
- [ ] Create `/graph/type-policies` management endpoints
- [ ] Add policy inheritance (global → project override)

#### 6b. Historical Version Retention Policy
Define how long to keep old versions:
```sql
CREATE TABLE kb.version_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  object_type TEXT NULL, -- NULL = default for all types
  retain_versions INT DEFAULT 10, -- keep last N versions
  retain_days INT DEFAULT 90, -- or keep for N days
  archive_to_cold_storage BOOLEAN DEFAULT false,
  UNIQUE(project_id, object_type)
);
```

**Tasks**:
- [ ] Create policy table
- [ ] Implement version cleanup job (cron or manual trigger)
- [ ] Add `archived` flag to objects
- [ ] Create archive export format (JSONL)
- [ ] Document restoration procedure

#### 6c. Sensitive Field Redaction
Automatically redact sensitive fields in embeddings and search results:
```sql
CREATE TABLE kb.redaction_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('regex','json_path')),
  pattern TEXT NOT NULL, -- regex or JSON Pointer
  replacement TEXT DEFAULT '[REDACTED]',
  applies_to TEXT[] DEFAULT '{"embeddings","search"}', -- where to apply
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Tasks**:
- [ ] Create redaction patterns table
- [ ] Apply redactions in embedding worker
- [ ] Apply redactions in search results
- [ ] Add `/graph/redaction-patterns` management endpoints
- [ ] Support common patterns (SSN, credit card, email)

---

### 7. Performance Optimizations (DEFERRED)
**Current Status**: All performance targets exceeded (p50 < 150ms target vs 4-15ms actual)  
**Trigger Conditions**: Implement only if/when targets are missed

#### Potential Optimizations:
- **Generated columns for change paths**: Index JSON Pointer paths for fast conflict detection
- **Materialized path views**: Pre-compute common traversal patterns
- **Read replicas**: Offload read-heavy traversal queries
- **External graph database**: Evaluate Apache AGE or Neo4j if complexity exceeds PostgreSQL capabilities
- **Caching layer**: Add Redis for frequently accessed subgraphs

**Decision**: Defer until benchmarks show degradation

---

## Implementation Strategy

### Prioritization Framework
Prioritize based on:
1. **User demand** (feature requests, pain points)
2. **Technical debt** (embedding dimension, table naming)
3. **Performance** (only if metrics show degradation)
4. **Compliance** (if regulatory requirements emerge)

### Development Workflow
1. Create feature branch
2. Write acceptance tests first (TDD)
3. Implement feature
4. Update OpenAPI schema
5. Add migration if schema changes
6. Update documentation
7. PR review + merge

### Testing Requirements
- Unit tests for business logic
- Integration tests for database interactions
- E2E tests for API endpoints
- Performance tests for latency-sensitive features

---

## Risk Assessment

| Feature | Risk Level | Mitigation |
|---------|------------|------------|
| Embedding dimension migration | MEDIUM | Test on staging, rollback plan, incremental |
| Advanced traversal | LOW | Feature flag, gradual rollout |
| Per-type authorization | MEDIUM | Comprehensive test matrix, audit log |
| External graph DB migration | HIGH | Only if absolutely necessary, extensive testing |

---

## Success Metrics

Track these KPIs to measure Phase 3 success:
- **Embedding quality**: Semantic search precision@10
- **Query performance**: p95 latency by depth
- **Cost efficiency**: Embedding job cost per object
- **User satisfaction**: Search relevance feedback
- **System health**: Error rate, queue depth

---

## Conclusion

The dynamic object graph system has a **solid foundation** ready for production use. Phase 3 enhancements should be driven by **actual usage patterns** rather than speculative needs. Start with embedding production readiness (highest ROI), then prioritize based on user feedback.

**Next Review**: Q1 2026 or upon hitting performance/scale triggers
