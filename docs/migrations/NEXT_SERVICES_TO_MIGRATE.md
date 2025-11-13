# Next Services to Migrate - Priority Order

**Current Status**: 17/56 services (30.4%), 165/522 queries (31.6%)  
**Target**: 50% (28 services) - Need 11 more services

---

## Immediate Priorities - Complete Partial Services

### 1. EmbeddingJobsService (1 method remaining)

**File**: `apps/server/src/modules/graph/embedding-jobs.service.ts`  
**Remaining**: dequeue() method  
**Complexity**: High (FOR UPDATE SKIP LOCKED)  
**Recommendation**: Keep as raw SQL (PostgreSQL queue primitive)  
**Action**: Mark as "Complete - Strategic Raw SQL"

### 2. ProductVersionService (2 methods remaining)

**File**: `apps/server/src/modules/graph/product-version.service.ts`  
**Remaining**: create(), diffReleases()  
**Complexity**: High (bulk inserts, complex diff algorithm)  
**Recommendation**: Keep create() as raw SQL, migrate diffReleases() if possible  
**Estimated**: 1-2 hours

### 3. ChatService (4 methods remaining)

**File**: `apps/server/src/modules/chat/chat.service.ts`  
**Remaining**: listConversations(), getConversation(), createConversationIfNeeded(), retrieveCitations()  
**Complexity**: High (diagnostic logging, vector search)  
**Recommendation**: Keep diagnostics as raw SQL, migrate simple parts  
**Estimated**: 2-3 hours

### 4. BranchService (2 methods remaining)

**File**: `apps/server/src/modules/graph/branch.service.ts`  
**Remaining**: create(), ensureBranchLineage()  
**Complexity**: High (recursive lineage operations)  
**Recommendation**: Keep as raw SQL (recursive tree operations)  
**Action**: Mark as "Complete - Strategic Raw SQL"

---

## High Priority - New Services (Moderate Complexity)

### 5. TypeRegistryService (~7 queries)

**File**: `apps/server/src/modules/type-registry/type-registry.service.ts`  
**Methods**: 7 methods total  
**Complexity**: Moderate (GROUP BY with aggregations)  
**Entity**: Need to create ObjectTypeSchema-related entities  
**Estimated**: 2-3 hours  
**Impact**: High - type system foundation

**Approach**:

- Migrate simple getters (findById, etc)
- Keep complex GROUP BY queries as DataSource.query
- Create entities for object_type_schemas, project_object_type_registry

### 6. TemplatePackService (~15 queries)

**File**: `apps/server/src/modules/template-packs/template-pack.service.ts`  
**Methods**: 11 methods  
**Complexity**: Moderate  
**Estimated**: 2-4 hours  
**Impact**: Medium - template management

**Approach**:

- Create TemplatePack entity
- Migrate CRUD operations
- Keep complex seeding logic as needed

### 7. User Deletion Service (~10 queries)

**File**: `apps/server/src/modules/user/user-deletion.service.ts`  
**Methods**: 3 methods  
**Complexity**: Moderate (cascade deletes)  
**Estimated**: 1-2 hours  
**Impact**: Low - rarely used

---

## Medium Priority - Complex Services

### 8. ExtractionJobService (~30 queries)

**File**: `apps/server/src/modules/extraction-jobs/extraction-job.service.ts`  
**Methods**: 20 methods  
**Complexity**: High (job queue, workers, complex business logic)  
**Estimated**: 4-6 hours (multi-session)  
**Impact**: High - core extraction functionality

**Approach**:

- Session 1: Migrate simple CRUD (getById, delete, stats)
- Session 2: Migrate list/filter methods
- Session 3: Keep complex dequeue/processing as raw SQL
- Already has TypeORM imports in module

### 9. MonitoringService (~7 queries)

**File**: `apps/server/src/modules/monitoring/monitoring.service.ts`  
**Methods**: Multiple  
**Complexity**: Moderate (metrics aggregation)  
**Estimated**: 2-3 hours  
**Impact**: Medium - observability

### 10. DiscoveryJobService (~24 queries)

**File**: `apps/server/src/modules/discovery-jobs/discovery-job.service.ts`  
**Methods**: Many  
**Complexity**: High (similar to ExtractionJobService)  
**Estimated**: 4-6 hours (multi-session)  
**Impact**: Medium

---

## Lower Priority - Specialized Services

### 11. GraphVectorSearchService (~3 queries)

**File**: `apps/server/src/modules/graph/graph-vector-search.service.ts`  
**Complexity**: High (vector similarity with pgvector)  
**Recommendation**: Keep as raw SQL (pgvector operators)  
**Action**: Mark as "Complete - Strategic Raw SQL"

### 12. SearchService (~5 queries)

**File**: `apps/server/src/modules/search/search.service.ts`  
**Complexity**: High (full-text search, tsvector)  
**Recommendation**: Keep as raw SQL (PostgreSQL full-text)  
**Action**: Mark as "Complete - Strategic Raw SQL"

### 13. Integration Services

- ClickUpImportService - External API integration
- EncryptionService - PostgreSQL encryption functions
- Integration helpers

**Recommendation**: Low priority, keep as raw SQL where needed

---

## Very High Complexity - Multi-Session Approach

### 14. GraphService (~50 queries)

**File**: `apps/server/src/modules/graph/graph.service.ts`  
**Complexity**: Very High (core graph operations)  
**Estimated**: 6-10 hours (3-4 sessions)  
**Impact**: Very High - core functionality

**Approach**:

- Session 1: Analyze and plan, create strategy document
- Session 2: Migrate simple object CRUD
- Session 3: Migrate relationship CRUD
- Session 4: Migrate complex queries, keep raw SQL where needed

### 15. GraphObjectsService (~25 queries)

**File**: Multiple graph-related services  
**Complexity**: High (related to GraphService)  
**Estimated**: 3-4 hours  
**Approach**: Migrate after GraphService

---

## Worker Services (Can Batch Together)

**Pattern**: Most workers have similar patterns

- TagCleanupWorkerService (2 queries) - JSONB operations
- RevisionCountRefreshWorkerService (2 queries) - Calls PG function
- EmbeddingWorkerService (2 queries) - Job processing
- ExtractionWorkerService - Job processing

**Recommendation**:

- Batch migrate in single session
- Keep complex JSONB queries as raw SQL
- Estimated: 2-3 hours for all workers

---

## Recommended Migration Order

### Phase 1: Finish Partials (1-2 sessions)

1. Complete ProductVersionService diffReleases
2. Decide on marking queue services as "strategic raw SQL"

### Phase 2: Add Moderate Services (2-3 sessions)

3. TypeRegistryService
4. TemplatePackService
5. User deletion
6. Monitoring

**Target after Phase 2**: ~40% (22 services)

### Phase 3: Complex Services (4-6 sessions)

7. ExtractionJobService (multi-session)
8. DiscoveryJobService
9. Batch worker services

**Target after Phase 3**: ~48% (27 services)

### Phase 4: GraphService (3-4 sessions)

10. GraphService (dedicated multi-session)
11. GraphObjectsService

**Target after Phase 4**: 50%+ (28+ services)

### Phase 5: Remaining Services (8-12 sessions)

12-39. Integration, specialized, and utility services

**Final Target**: 100% (56 services)

---

## Quick Wins Available

**"Mark as Strategic Raw SQL"**:
Some services are already optimally implemented - using raw SQL for PostgreSQL-specific features is the RIGHT choice:

- GraphVectorSearchService (pgvector)
- SearchService (full-text search)
- EncryptionService (pgcrypto)
- Queue dequeue operations (SKIP LOCKED)

**Action**: Document these as "Complete - Strategic Raw SQL" rather than "To Migrate"

This would give us effective ~20-21 services "complete" (36-38%)

---

## Success Criteria

A service is "complete" when:

- ✅ All simple CRUD is TypeORM
- ✅ Complex queries use appropriate pattern (QueryBuilder or DataSource)
- ✅ PostgreSQL-specific features use raw SQL (documented)
- ✅ All methods work correctly
- ✅ No regression in functionality
- ✅ Tests pass

---

## Tools and Commands

```bash
# Find services with queries
find apps/server/src/modules -name "*.service.ts" -exec sh -c 'q=$(grep -c "db\.query" "$1"); if [ "$q" -gt 0 ]; then echo "$q $1"; fi' _ {} \; | sort -n

# Check specific service
grep -n "db.query" path/to/service.ts

# List all entities
ls apps/server/src/entities/

# Check migration status
npm run migration:show
```

---

## Notes for Future Sessions

- Services with <5 queries: Usually 30-60 min
- Services with 5-15 queries: Usually 1-2 hours
- Services with 15-30 queries: Usually 2-4 hours
- Services with 30+ queries: Multi-session (4-8 hours)

**GraphService alone**: Plan for 6-10 hours across 3-4 sessions

---

**Updated**: November 8, 2025  
**Next Review**: After completing Phase 1 or 2
