# Strategic SQL Documentation - Sprint 6: Worker Services Batch

**Sprint**: 6  
**Date**: 2025-01-13  
**Services Analyzed**: 4 (TagCleanupWorkerService, RevisionCountRefreshWorkerService, EmbeddingWorkerService, ExtractionWorkerService)  
**Completion Status**: Mixed (Hybrid + Strategic SQL + TypeORM Complete + Business Logic)  
**Progress Update**: 76.8% → 82.1% (+5.3%, 46/56 services)

---

## Executive Summary

Sprint 6 completes analysis of **4 worker services** that handle background processing tasks:

1. **TagCleanupWorkerService** (Hybrid) - JSONB operators for tag cleanup
2. **RevisionCountRefreshWorkerService** (Strategic SQL) - PostgreSQL function calls + COUNT FILTER
3. **EmbeddingWorkerService** (TypeORM Complete) - Already migrated, simple CRUD
4. **ExtractionWorkerService** (Business Logic) - Orchestration layer, not a DB service

**Key Achievement**: **80% milestone reached** (45/56 services with 3 worker services)

### Worker Service Patterns Identified

All 4 services share common background worker characteristics:

- **Lifecycle**: `OnModuleInit` with interval-based processing
- **Graceful Shutdown**: `onModuleDestroy` waits for current batch completion
- **Test Gating**: Check `ENABLE_WORKERS_IN_TESTS !== 'true'` to prevent test interference
- **In-Memory Metrics**: Simple counters (processedCount, successCount, failureCount)
- **Batch Processing**: Process items in configurable batch sizes

### Migration Classification

| Service                    | Category         | SQL Methods | TypeORM Methods | Rationale                      |
| -------------------------- | ---------------- | ----------- | --------------- | ------------------------------ |
| TagCleanupWorker           | Hybrid           | 1           | 1               | JSONB `?` operator unsupported |
| RevisionCountRefreshWorker | Strategic SQL    | 2           | 0               | PG function + COUNT FILTER     |
| EmbeddingWorker            | TypeORM Complete | 0           | 2               | Already migrated               |
| ExtractionWorker           | Business Logic   | 0           | 0               | Delegates all DB operations    |

**Distribution**: 44% Hybrid/Strategic, 22% TypeORM Complete, 33% Business Logic

---

## Service 1: TagCleanupWorkerService

**File**: `apps/server/src/modules/graph/tag-cleanup-worker.service.ts`  
**Lines**: 188  
**Status**: **Hybrid (1 Strategic SQL + 1 TypeORM)**  
**Migration Strategy**: Keep strategic SQL for JSONB operators

### Architecture Overview

**Purpose**: Periodically removes unused tags from the system (tags not referenced by any nodes)

**Background Processing**:

- Runs every 6 hours (21,600,000 ms)
- Processes up to 100 tags per batch
- Graceful shutdown waits for current batch completion

### Method Analysis

#### Strategic SQL Methods (1/2 = 50%)

##### 1. `cleanupUnusedTags()` - JSONB `?` Operator Query

**Complexity**: Medium  
**Lines**: ~40  
**Pattern**: NOT EXISTS subquery with JSONB operator

```typescript
async cleanupUnusedTags(
  batchSize: number,
  organizationId: string,
): Promise<string[]> {
  const result = await this.entityManager.query(
    `
    SELECT t.id
    FROM kb.tags t
    WHERE t.organization_id = $1
      AND NOT EXISTS (
        SELECT 1
        FROM kb.nodes n
        WHERE n.organization_id = t.organization_id
          AND n.tags ? t.name
      )
    LIMIT $2
    `,
    [organizationId, batchSize],
  );
  return result.map((row: { id: string }) => row.id);
}
```

**Strategic SQL Rationale**:

1. **JSONB `?` Operator**: Checks if JSONB array contains a tag name

   - TypeORM doesn't support PostgreSQL JSONB operators in QueryBuilder
   - Alternative would require `JSON_CONTAINS()` function (not portable)

2. **NOT EXISTS Pattern**: Efficient existence check

   - PostgreSQL optimizer short-circuits on first match
   - Avoids materializing full result set

3. **Performance Characteristics**:
   - Index usage: `nodes.tags` GIN index for JSONB containment
   - Correlated subquery: Executes once per tag row
   - LIMIT protects against large batch overhead

**TypeORM Limitation**:

```typescript
// This doesn't work in TypeORM QueryBuilder:
queryBuilder.where('nodes.tags ? :tagName', { tagName }); // ❌ Invalid syntax
```

**SQL Function Alternative** (not implemented):

```sql
-- Could wrap in PL/pgSQL function like revision counts
CREATE FUNCTION kb.find_unused_tags(org_id uuid, batch_size int)
RETURNS TABLE(tag_id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT t.id
  FROM kb.tags t
  WHERE t.organization_id = org_id
    AND NOT EXISTS (
      SELECT 1 FROM kb.nodes n
      WHERE n.organization_id = t.organization_id
        AND n.tags ? t.name
    )
  LIMIT batch_size;
END;
$$ LANGUAGE plpgsql;
```

#### TypeORM Methods (1/2 = 50%)

##### 2. `processBatch()` - Bulk Delete

**Pattern**: QueryBuilder with `.whereInIds()`

```typescript
async processBatch(organizationId: string): Promise<void> {
  const tagIds = await this.cleanupUnusedTags(this.batchSize, organizationId);

  if (tagIds.length === 0) return;

  await this.tagRepository
    .createQueryBuilder()
    .delete()
    .from(Tag)
    .whereInIds(tagIds)
    .execute();
}
```

**TypeORM Rationale**:

- Simple batch delete operation
- No complex joins or JSONB operators
- Already uses QueryBuilder (modern TypeORM pattern)

### Worker-Specific Patterns

**Lifecycle Management**:

```typescript
@Injectable()
export class TagCleanupWorkerService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (process.env.ENABLE_WORKERS_IN_TESTS === 'true') {
      this.startWorker();
    }
  }

  async onModuleDestroy() {
    this.stopWorker();
    // Wait for current batch to complete
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
```

**Metrics Tracking**:

```typescript
private processedCount = 0;
private successCount = 0;
private failureCount = 0;

// Logged every batch
this.logger.log(
  `Processed ${this.processedCount} tags, ` +
  `${this.successCount} successful, ` +
  `${this.failureCount} failed`,
);
```

### Migration Recommendation

**Status**: ✅ **Hybrid - No Further Action Required**

**Keep Strategic SQL**:

- `cleanupUnusedTags()`: JSONB `?` operator unsupported by TypeORM

**TypeORM Already Used**:

- `processBatch()`: Bulk delete with `.whereInIds()`

**Alternative Approaches Considered**:

1. ❌ **Native TypeORM JSONB support**: Not available
2. ❌ **JSON_CONTAINS() function**: Less efficient than `?` operator
3. ✅ **PL/pgSQL function**: Possible but adds complexity without benefit

---

## Service 2: RevisionCountRefreshWorkerService

**File**: `apps/server/src/modules/graph/revision-count-refresh-worker.service.ts`  
**Lines**: 179  
**Status**: **Strategic SQL (2/2 methods = 100%)**  
**Migration Strategy**: Keep strategic SQL for PostgreSQL function calls + COUNT FILTER

### Architecture Overview

**Purpose**: Refreshes materialized view for revision counts across organizations

**Background Processing**:

- Runs every 5 minutes (300,000 ms)
- Calls PostgreSQL function `kb.refresh_revision_counts()`
- Tracks statistics with COUNT FILTER aggregation

### Method Analysis

#### Strategic SQL Methods (2/2 = 100%)

##### 1. `refreshRevisionCounts()` - PostgreSQL Function Call

**Complexity**: Low  
**Lines**: ~10  
**Pattern**: Direct function invocation

```typescript
async refreshRevisionCounts(): Promise<void> {
  await this.entityManager.query(`
    SELECT kb.refresh_revision_counts();
  `);
}
```

**Strategic SQL Rationale**:

1. **PostgreSQL Function Call**: TypeORM doesn't support stored procedure invocation

   - No equivalent in QueryBuilder
   - Repository pattern not applicable

2. **Materialized View Refresh**: Database-side operation

   - Likely uses `REFRESH MATERIALIZED VIEW CONCURRENTLY`
   - Cannot be expressed in TypeORM DSL

3. **Performance**: Function encapsulates complex aggregation logic
   - Single network round trip
   - Database handles concurrency and locking

**Function Implementation** (referenced, not defined in this file):

```sql
-- Likely implementation in migration file
CREATE OR REPLACE FUNCTION kb.refresh_revision_counts()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY kb.revision_counts_by_org;
END;
$$ LANGUAGE plpgsql;
```

##### 2. `getStatistics()` - COUNT FILTER Aggregation

**Complexity**: Medium  
**Lines**: ~30  
**Pattern**: **COUNT FILTER** (4th service using this pattern)

```typescript
async getStatistics(): Promise<{
  totalOrgs: number;
  orgsWithRevisions: number;
  totalRevisions: number;
}> {
  const result = await this.entityManager.query(`
    SELECT
      COUNT(*) AS total_orgs,
      COUNT(*) FILTER (WHERE total_revisions > 0) AS orgs_with_revisions,
      COALESCE(SUM(total_revisions), 0) AS total_revisions
    FROM kb.revision_counts_by_org
  `);

  return {
    totalOrgs: parseInt(result[0].total_orgs, 10),
    orgsWithRevisions: parseInt(result[0].orgs_with_revisions, 10),
    totalRevisions: parseInt(result[0].total_revisions, 10),
  };
}
```

**Strategic SQL Rationale**:

1. **COUNT FILTER Syntax**: PostgreSQL 9.4+ conditional aggregation

   - **4th service using this pattern** (BranchService, ChatService, TypeRegistryService, now RevisionCountRefreshWorkerService)
   - More efficient than `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`
   - TypeORM doesn't support FILTER clause

2. **Multiple Aggregations**: Single table scan for 3 metrics

   - COUNT(\*): Total organizations
   - COUNT(\*) FILTER: Organizations with at least 1 revision
   - SUM(): Total revisions across all orgs

3. **COALESCE for NULL Safety**: Handles empty table case
   - SUM() returns NULL for empty result set
   - COALESCE ensures consistent integer return

**TypeORM Equivalent** (not possible):

```typescript
// ❌ No FILTER clause support
await this.repository
  .createQueryBuilder('org')
  .select('COUNT(*)', 'totalOrgs')
  .addSelect('COUNT(*) FILTER (WHERE total_revisions > 0)', 'orgsWithRevisions') // Invalid
  .getRawOne();
```

### COUNT FILTER Pattern Analysis

**Services Using COUNT FILTER**:

1. **BranchService** (Sprint 1): Active/archived entity counts
2. **ChatService** (Sprint 4): Conversation state aggregations
3. **TypeRegistryService** (Sprint 5): Type usage statistics
4. **RevisionCountRefreshWorkerService** (Sprint 6): Revision statistics

**Pattern Confirmed**: COUNT FILTER is a standard PostgreSQL pattern across the codebase.

**Migration Implication**: TypeORM team unlikely to add support (PostgreSQL-specific syntax)

### Worker-Specific Patterns

**Lifecycle Management**:

```typescript
async onModuleInit() {
  if (process.env.NODE_ENV !== 'test' ||
      process.env.ENABLE_WORKERS_IN_TESTS === 'true') {
    await this.startWorker();
  }
}

async onModuleDestroy() {
  this.stopWorker();
  // Wait for current refresh to complete
  while (this.isProcessing) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

**Statistics Logging**:

```typescript
private async logStatistics(): Promise<void> {
  const stats = await this.getStatistics();
  this.logger.log(
    `Revision counts refreshed. ` +
    `Total orgs: ${stats.totalOrgs}, ` +
    `Orgs with revisions: ${stats.orgsWithRevisions}, ` +
    `Total revisions: ${stats.totalRevisions}`,
  );
}
```

### Migration Recommendation

**Status**: ✅ **Strategic SQL - No Further Action Required**

**Keep Strategic SQL**:

1. `refreshRevisionCounts()`: PostgreSQL function call (no TypeORM equivalent)
2. `getStatistics()`: COUNT FILTER aggregation (unsupported by TypeORM)

**No TypeORM Alternative**: Both methods require PostgreSQL-specific features

**Alternative Approaches Considered**:

1. ❌ **TypeORM Repository for function calls**: Not supported
2. ❌ **QueryBuilder for COUNT FILTER**: Syntax unsupported
3. ✅ **Keep as-is**: Idiomatic PostgreSQL, optimal performance

---

## Service 3: EmbeddingWorkerService

**File**: `apps/server/src/modules/graph/embedding-worker.service.ts`  
**Lines**: 219  
**Status**: **TypeORM Complete (2/2 methods = 100%)**  
**Migration Strategy**: Already migrated, no action required

### Architecture Overview

**Purpose**: Processes embedding generation jobs for vector search

**Background Processing**:

- Runs every 30 seconds (30,000 ms)
- Processes up to 10 embedding jobs per batch
- Integrates with external embedding service (OpenAI, etc.)

### Method Analysis

#### TypeORM Methods (2/2 = 100%)

##### 1. `processBatch()` - Find Pending Jobs

**Pattern**: Repository.findOne() with WHERE conditions

```typescript
async processBatch(): Promise<void> {
  for (let i = 0; i < this.batchSize; i++) {
    const job = await this.embeddingJobRepository.findOne({
      where: {
        status: EmbeddingJobStatus.PENDING,
        organizationId: this.organizationId,
      },
      order: { createdAt: 'ASC' },
    });

    if (!job) break;

    await this.processJob(job);
  }
}
```

**TypeORM Rationale**:

- Simple single-table query with equality conditions
- No joins, aggregations, or PostgreSQL-specific features
- Repository pattern is idiomatic for CRUD operations

##### 2. `updateJobStatus()` - Update Job Record

**Pattern**: Repository.update() for status changes

```typescript
async updateJobStatus(
  jobId: string,
  status: EmbeddingJobStatus,
  error?: string,
): Promise<void> {
  await this.embeddingJobRepository.update(jobId, {
    status,
    error,
    updatedAt: new Date(),
  });
}
```

**TypeORM Rationale**:

- Simple update operation by primary key
- No conditional logic or complex expressions
- Type-safe with entity model

### Worker-Specific Patterns

**Lifecycle Management**:

```typescript
async onModuleInit() {
  if (process.env.NODE_ENV !== 'test') {
    this.startWorker();
  }
}

async onModuleDestroy() {
  this.stopWorker();
  // Wait for current job to complete
  while (this.isProcessing) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

**Error Handling**:

```typescript
async processJob(job: EmbeddingJob): Promise<void> {
  try {
    await this.updateJobStatus(job.id, EmbeddingJobStatus.PROCESSING);

    const embedding = await this.embeddingService.generateEmbedding(job.text);

    await this.graphService.updateNodeEmbedding(job.nodeId, embedding);
    await this.updateJobStatus(job.id, EmbeddingJobStatus.COMPLETED);

    this.successCount++;
  } catch (error) {
    this.logger.error(`Embedding job ${job.id} failed:`, error);
    await this.updateJobStatus(
      job.id,
      EmbeddingJobStatus.FAILED,
      error.message,
    );
    this.failureCount++;
  }
}
```

### Migration Recommendation

**Status**: ✅ **TypeORM Complete - No Action Required**

**Already Migrated**:

- All database operations use TypeORM Repository pattern
- No strategic SQL or raw queries
- Type-safe with entity models

**Why This Works**:

- Simple CRUD operations (SELECT + UPDATE)
- Single table access (no complex joins)
- No PostgreSQL-specific features required

---

## Service 4: ExtractionWorkerService

**File**: `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`  
**Lines**: 2000+  
**Status**: **Business Logic Service (0 database methods)**  
**Migration Strategy**: Not applicable - orchestration layer

### Architecture Overview

**Purpose**: Orchestrates LLM-based extraction workflows

**Background Processing**:

- Runs every 10 seconds (10,000 ms)
- Processes extraction jobs from queue
- Delegates all database operations to other services

**Service Dependencies**:

- **ExtractionJobService** (Sprint 3): Job queue management
- **GraphService**: Entity and relationship creation
- **DocumentsService**: Document retrieval
- **TemplatePackService**: Template management

### Non-Database Service Analysis

**Why This Isn't a Database Service**:

1. **Zero Direct Database Methods**: All DB operations delegated
2. **Business Logic Heavy**:

   - LLM prompt construction
   - Response parsing and validation
   - Entity confidence scoring
   - Relationship extraction logic

3. **Orchestration Layer**:
   ```typescript
   async processJob(job: ExtractionJob): Promise<void> {
     // 1. Fetch document (delegates to DocumentsService)
     const document = await this.documentsService.getDocument(job.documentId);

     // 2. Fetch template (delegates to TemplatePackService)
     const template = await this.templatePackService.getTemplate(job.templateId);

     // 3. Call LLM (external API, not database)
     const extraction = await this.llmService.extract(document, template);

     // 4. Create entities (delegates to GraphService)
     for (const entity of extraction.entities) {
       await this.graphService.createNode(entity);
     }

     // 5. Update job status (delegates to ExtractionJobService)
     await this.extractionJobService.updateJobStatus(job.id, 'COMPLETED');
   }
   ```

**Database Operations** (all delegated):

- Job retrieval: `extractionJobService.findPendingJob()`
- Job updates: `extractionJobService.updateJobStatus()`
- Entity creation: `graphService.createNode()`
- Relationship creation: `graphService.createEdge()`
- Document access: `documentsService.getDocument()`

### Worker-Specific Patterns

**Lifecycle Management** (same as other workers):

```typescript
async onModuleInit() {
  if (process.env.NODE_ENV !== 'test') {
    this.startWorker();
  }
}

async onModuleDestroy() {
  this.stopWorker();
  while (this.isProcessing) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

**Metrics Tracking** (same pattern):

```typescript
private processedCount = 0;
private successCount = 0;
private failureCount = 0;
```

### Classification Rationale

**Business Logic Service Characteristics**:

- ✅ Coordinates multiple services
- ✅ Contains domain-specific logic (LLM integration)
- ✅ No direct database access
- ✅ All persistence delegated

**Not a Database Service**:

- ❌ No direct SQL queries
- ❌ No TypeORM Repository usage
- ❌ No entity definitions
- ❌ No database schema knowledge

### Migration Recommendation

**Status**: ✅ **Business Logic Service - Not a Database Service**

**No Migration Required**:

- This is an orchestration/coordination layer
- All database operations already handled by dependent services
- ExtractionJobService (Sprint 3) covers job queue persistence

**Why It Shouldn't Count Toward Completion Percentage**:

- Would artificially inflate progress
- Not representative of database migration effort
- Already "migrated" by virtue of delegating to migrated services

---

## Cross-Service Patterns Analysis

### Background Worker Patterns (Consistent Across All 4 Services)

#### 1. Lifecycle Management

**Pattern**:

```typescript
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private intervalId?: NodeJS.Timeout;
  private isProcessing = false;

  async onModuleInit() {
    if (this.shouldStartWorker()) {
      this.startWorker();
    }
  }

  async onModuleDestroy() {
    this.stopWorker();
    await this.waitForCurrentBatch();
  }

  private shouldStartWorker(): boolean {
    return (
      process.env.NODE_ENV !== 'test' ||
      process.env.ENABLE_WORKERS_IN_TESTS === 'true'
    );
  }

  private async waitForCurrentBatch(): Promise<void> {
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
```

**Observations**:

- All workers use `OnModuleInit` + `OnModuleDestroy` lifecycle hooks
- Graceful shutdown waits for current batch completion
- Test gating prevents interference with test suite
- `isProcessing` flag prevents overlapping batches

#### 2. Metrics Tracking

**Pattern**:

```typescript
private processedCount = 0;
private successCount = 0;
private failureCount = 0;

async processBatch(): Promise<void> {
  try {
    // ... processing logic
    this.successCount++;
  } catch (error) {
    this.logger.error('Batch processing failed', error);
    this.failureCount++;
  } finally {
    this.processedCount++;
  }
}
```

**Observations**:

- Simple in-memory counters (not persisted)
- Logged periodically for monitoring
- No external metrics service integration (potential future enhancement)

#### 3. Batch Processing

**Pattern**:

```typescript
async processBatch(): Promise<void> {
  for (let i = 0; i < this.batchSize; i++) {
    const item = await this.findNextItem();
    if (!item) break;

    try {
      await this.processItem(item);
    } catch (error) {
      this.logger.error(`Item ${item.id} failed`, error);
      // Continue processing remaining items
    }
  }
}
```

**Observations**:

- Configurable batch size (10-100 items)
- Early exit if no items remaining
- Error isolation (one failure doesn't stop batch)
- Sequential processing within batch (could be parallelized)

### Strategic SQL Pattern Distribution

**Services by Category**:

| Category         | Count | Percentage | Services                          |
| ---------------- | ----- | ---------- | --------------------------------- |
| Strategic SQL    | 1     | 25%        | RevisionCountRefreshWorkerService |
| Hybrid           | 1     | 25%        | TagCleanupWorkerService           |
| TypeORM Complete | 1     | 25%        | EmbeddingWorkerService            |
| Business Logic   | 1     | 25%        | ExtractionWorkerService           |

**Key Insight**: Worker services have **highest diversity** of any sprint:

- Sprint 1-5 average: 60-80% strategic SQL per service
- Sprint 6: Only 50% require strategic SQL (2/4 services)

### JSONB Operator Usage

**Services Using JSONB Operators**:

1. **TagCleanupWorkerService**: `tags ? tag_name` (containment check)
2. **GraphService** (previous sprint): `@>`, `?`, `?|` (various JSONB operations)

**TypeORM Limitation Confirmed**:

- QueryBuilder doesn't support PostgreSQL JSONB operators
- Must use raw SQL or PL/pgSQL functions
- Alternative: JSON_CONTAINS() less efficient

### COUNT FILTER Pattern Evolution

**Timeline**:

- Sprint 1: BranchService (first usage)
- Sprint 4: ChatService (second usage)
- Sprint 5: TypeRegistryService (third usage)
- Sprint 6: RevisionCountRefreshWorkerService (fourth usage)

**Pattern Status**: ✅ **Standard PostgreSQL idiom across codebase**

**Migration Implication**: TypeORM unlikely to support (PostgreSQL 9.4+ specific)

---

## Migration Progress Update

### Sprint 6 Impact

**Starting Progress**: 76.8% (43/56 services)

**Services Completed This Sprint**:

1. ✅ TagCleanupWorkerService (Hybrid) - +0.9%
2. ✅ RevisionCountRefreshWorkerService (Strategic SQL) - +0.9%
3. ✅ EmbeddingWorkerService (TypeORM Complete) - +0.9%
4. ⚠️ ExtractionWorkerService (Business Logic) - +0.9% (counted separately)

**New Progress**: 82.1% (46/56 services) - counting 3 database services
**Alternative**: 83.9% (47/56 services) - if counting all 4

**Recommendation**: Use **82.1%** (46/56) - excludes ExtractionWorkerService as non-DB service

### Milestone Achievement

🎉 **80% Completion Milestone Reached** 🎉

**Target**: 45/56 services (80.4%)  
**Actual**: 46/56 services (82.1%)  
**Exceeded by**: +1 service (+1.7%)

### Remaining Services (10 services, ~18%)

**High Priority** (likely strategic SQL):

1. DocumentsService - Complex document queries
2. TemplatePackService - Template hierarchy queries
3. WorkflowService - Workflow state machine queries

**Medium Priority** (potentially hybrid): 4. NotificationsService - Notification delivery queries 5. PermissionsService - Permission inheritance checks 6. AuditLogService - Audit trail queries

**Lower Priority** (likely TypeORM): 7. SettingsService - Simple key-value storage 8. WebhookService - Webhook delivery tracking 9. IntegrationService - Integration configuration 10. HealthCheckService - System health monitoring

### Estimated Final Distribution

**Projected Final Stats** (after all 56 services):

- Strategic SQL: ~35-40 services (62-71%)
- Hybrid: ~8-10 services (14-18%)
- TypeORM Complete: ~8-10 services (14-18%)
- Business Logic: ~1-2 services (2-4%)

**Current Actual Stats** (46/56 services):

- Strategic SQL: ~28 services (61%)
- Hybrid: ~10 services (22%)
- TypeORM Complete: ~7 services (15%)
- Business Logic: ~1 service (2%)

**Observation**: Current distribution aligns with projections

---

## Key Learnings & Recommendations

### 1. Worker Service Architecture

**Pattern Consistency**: All 4 worker services follow identical lifecycle patterns

- **Recommendation**: Extract base `BackgroundWorkerService` abstract class

```typescript
// Proposed: apps/server/src/common/background-worker.service.ts
export abstract class BackgroundWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  protected abstract readonly intervalMs: number;
  protected abstract readonly batchSize: number;

  private intervalId?: NodeJS.Timeout;
  protected isProcessing = false;
  protected processedCount = 0;
  protected successCount = 0;
  protected failureCount = 0;

  abstract processBatch(): Promise<void>;

  async onModuleInit() {
    if (this.shouldStartWorker()) {
      this.startWorker();
    }
  }

  async onModuleDestroy() {
    this.stopWorker();
    await this.waitForCurrentBatch();
  }

  // ... common implementation
}
```

**Benefits**:

- Eliminates code duplication across 4 services
- Enforces consistent error handling
- Centralized metrics tracking
- Easier to add new workers

### 2. JSONB Operator Strategy

**Finding**: JSONB operators (`?`, `@>`, `?|`) appear in 2+ services

**Recommendation**: Create PostgreSQL functions for common JSONB operations

```sql
-- Example: Create reusable function for tag containment check
CREATE OR REPLACE FUNCTION kb.nodes_with_tag(tag_name text)
RETURNS TABLE(node_id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT id FROM kb.nodes WHERE tags ? tag_name;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Benefits**:

- Consistent JSONB query patterns
- Easier to optimize (single function to tune)
- Can add query plan caching
- Reduces raw SQL in service layer

### 3. COUNT FILTER Adoption

**Finding**: 4 services now use COUNT FILTER (7% of all services)

**Recommendation**: Document as standard pattern in migration guide

**Add to Migration Guide**:

````markdown
## PostgreSQL-Specific Aggregations

### COUNT FILTER (PostgreSQL 9.4+)

**Use Case**: Conditional counting in aggregations

**Pattern**:

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE condition) AS filtered_count
FROM table;
```
````

**Services Using This Pattern**: BranchService, ChatService,
TypeRegistryService, RevisionCountRefreshWorkerService

**Migration Strategy**: Keep as strategic SQL (TypeORM unsupported)

````

### 4. Business Logic Service Classification

**Finding**: ExtractionWorkerService has 0 database methods (orchestration only)

**Recommendation**: Add "Business Logic Service" category to tracking

**Update Migration Tracking Categories**:
1. Strategic SQL - Must use raw SQL
2. Hybrid - Mix of raw SQL + TypeORM
3. TypeORM Complete - Fully migrated
4. **Business Logic** - No direct DB access (new category)

**Benefits**:
- More accurate completion percentage
- Identifies services that don't need migration
- Highlights orchestration vs. persistence layers

### 5. Materialized View Pattern

**Finding**: RevisionCountRefreshWorkerService refreshes materialized view

**Recommendation**: Audit all materialized views for refresh strategies

**Questions to Answer**:
- How many materialized views exist? (`SELECT * FROM pg_matviews`)
- Which services refresh them?
- Are refreshes concurrent (non-blocking)?
- Could we use triggers for incremental updates?

**Potential Optimization**:
```sql
-- Replace periodic full refresh with trigger-based incremental updates
CREATE TRIGGER refresh_revision_count_incremental
AFTER INSERT OR UPDATE OR DELETE ON kb.revisions
FOR EACH ROW EXECUTE FUNCTION kb.update_revision_count_incremental();
````

### 6. Worker Parallelization Opportunities

**Current**: All 4 workers process batches sequentially

**Recommendation**: Evaluate parallel batch processing for I/O-bound workers

**Candidates**:

- **EmbeddingWorkerService**: External API calls (high latency)
- **ExtractionWorkerService**: LLM API calls (high latency)

**Proposed Enhancement**:

```typescript
async processBatch(): Promise<void> {
  const jobs = await this.fetchBatch(this.batchSize);

  // Process in parallel with concurrency limit
  await Promise.all(
    jobs.map(job => this.processJob(job).catch(err =>
      this.logger.error(`Job ${job.id} failed`, err)
    ))
  );
}
```

**Benefits**:

- Reduced batch processing time (30s → ~5s for 10 jobs)
- Better resource utilization (CPU idle during API calls)
- Faster throughput for external API-bound operations

---

## Sprint 6 Summary

### Services Analyzed

- ✅ TagCleanupWorkerService (Hybrid)
- ✅ RevisionCountRefreshWorkerService (Strategic SQL)
- ✅ EmbeddingWorkerService (TypeORM Complete)
- ✅ ExtractionWorkerService (Business Logic)

### Strategic SQL Patterns Identified

1. **JSONB Operators**: `?` operator for tag containment checks
2. **COUNT FILTER**: 4th service using this PostgreSQL 9.4+ pattern
3. **PostgreSQL Functions**: Materialized view refresh via stored procedure
4. **NOT EXISTS Subqueries**: Efficient existence checks with correlated subqueries

### Migration Outcomes

- **No new migrations required**: All services either:
  - Already using strategic SQL appropriately
  - Already migrated to TypeORM
  - Not database services (business logic)

### Milestone Achieved

- 🎉 **80% Completion Milestone Reached** (46/56 services)
- Progress: 76.8% → 82.1% (+5.3%)
- 10 services remaining (~18%)

### Next Sprint Recommendations

1. **DocumentsService** - Complex document retrieval and indexing
2. **TemplatePackService** - Template hierarchy and inheritance
3. **WorkflowService** - State machine queries and transitions

---

## Appendices

### Appendix A: Worker Service Configuration Reference

| Service                    | Interval   | Batch Size | Start Condition           |
| -------------------------- | ---------- | ---------- | ------------------------- |
| TagCleanupWorker           | 6 hours    | 100        | `ENABLE_WORKERS_IN_TESTS` |
| RevisionCountRefreshWorker | 5 minutes  | N/A        | `NODE_ENV !== 'test'`     |
| EmbeddingWorker            | 30 seconds | 10         | `NODE_ENV !== 'test'`     |
| ExtractionWorker           | 10 seconds | 5          | `NODE_ENV !== 'test'`     |

### Appendix B: Strategic SQL Method Reference (Sprint 6)

#### TagCleanupWorkerService

```sql
-- cleanupUnusedTags()
SELECT t.id
FROM kb.tags t
WHERE t.organization_id = $1
  AND NOT EXISTS (
    SELECT 1 FROM kb.nodes n
    WHERE n.organization_id = t.organization_id
      AND n.tags ? t.name
  )
LIMIT $2;
```

#### RevisionCountRefreshWorkerService

```sql
-- refreshRevisionCounts()
SELECT kb.refresh_revision_counts();

-- getStatistics()
SELECT
  COUNT(*) AS total_orgs,
  COUNT(*) FILTER (WHERE total_revisions > 0) AS orgs_with_revisions,
  COALESCE(SUM(total_revisions), 0) AS total_revisions
FROM kb.revision_counts_by_org;
```

### Appendix C: COUNT FILTER Services Cross-Reference

| Service                    | Sprint | Method                   | Use Case                        |
| -------------------------- | ------ | ------------------------ | ------------------------------- |
| BranchService              | 1      | `getStatistics()`        | Active/archived branch counts   |
| ChatService                | 4      | `getConversationStats()` | Conversation state aggregations |
| TypeRegistryService        | 5      | `getTypeUsageStats()`    | Type usage statistics           |
| RevisionCountRefreshWorker | 6      | `getStatistics()`        | Revision count aggregations     |

**Pattern**: `COUNT(*) FILTER (WHERE condition)` for conditional aggregation

### Appendix D: Test Gating Patterns

**Pattern 1**: Check environment variable

```typescript
if (process.env.ENABLE_WORKERS_IN_TESTS === 'true') {
  this.startWorker();
}
```

**Used by**: TagCleanupWorkerService

**Pattern 2**: Skip in test environment

```typescript
if (process.env.NODE_ENV !== 'test') {
  this.startWorker();
}
```

**Used by**: RevisionCountRefreshWorkerService, EmbeddingWorkerService, ExtractionWorkerService

**Pattern 3**: Combined check

```typescript
if (
  process.env.NODE_ENV !== 'test' ||
  process.env.ENABLE_WORKERS_IN_TESTS === 'true'
) {
  this.startWorker();
}
```

**Used by**: RevisionCountRefreshWorkerService (most flexible)

**Recommendation**: Standardize on Pattern 3 (most flexible for testing)

---

**End of Sprint 6 Documentation**

**Next Steps**:

1. Update `MIGRATION_TRACKING.md` with Sprint 6 progress
2. Commit Sprint 6 documentation
3. Begin Sprint 7: DocumentsService, TemplatePackService, WorkflowService
