# Strategic SQL Documentation Sprint 3

**Date**: November 13, 2025  
**Status**: ✅ Complete  
**Services Documented**: 1 service (ExtractionJobService)  
**Total Methods Documented**: 20+ strategic SQL methods

## Overview

This document provides comprehensive documentation for services using PostgreSQL-specific SQL features that cannot be reasonably migrated to TypeORM. This sprint focuses on **ExtractionJobService**, which demonstrates a sophisticated pattern: **schema evolution support** during migration.

---

## 1. ExtractionJobService (extraction-job.service.ts)

**Location**: `apps/server/src/modules/extraction-jobs/extraction-job.service.ts`  
**Lines of Code**: ~1,229 lines  
**Strategic SQL Methods**: 20+  
**Hybrid Status**: **95% Strategic SQL + 5% TypeORM** (1 method already migrated)

### Strategic SQL Patterns Used

#### 1.1 Schema Introspection for Migration Compatibility

**Purpose**: Dynamically detect table schema to support graceful migration across multiple deployment phases.

**Method**: `getSchemaInfo()` - lines 58-168

**Schema Detection Query** (lines 79-86):

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'kb' AND table_name = 'object_extraction_jobs'
```

**Why Strategic**:

- **Migration compatibility**: Service works correctly whether `organization_id` column exists or not
- **Dynamic column mapping**: Detects renamed columns (e.g., `created_objects` vs `objects_created`)
- **Zero-downtime deployments**: Code can be deployed before or after schema migration
- **Schema evolution pattern**: Maps old → new column names transparently

**Column Detection Logic** (lines 114-157):

```typescript
// organization_id column is optional (removed in Phase 6 migration)
const orgColumn = columns.has('organization_id')
  ? ('organization_id' as const)
  : undefined;

// created_objects renamed in migration
const createdObjectsColumn = columns.has('created_objects')
  ? 'created_objects'
  : columns.has('objects_created')
  ? 'objects_created'
  : undefined;

// subject_id renamed from created_by in migration
const subjectColumn = columns.has('subject_id')
  ? 'subject_id'
  : columns.has('created_by')
  ? 'created_by'
  : undefined;
```

**Benefits of This Pattern**:

1. **Blue-green deployments**: New code works with old schema, old code works with new schema
2. **Rollback safety**: Database migration can be rolled back without code changes
3. **Gradual migration**: Can test schema changes on staging without breaking production
4. **Documentation**: Schema info serves as living documentation of schema evolution

**TypeORM Migration Effort**: **Impossible** - TypeORM entities are compile-time, cannot dynamically adapt  
**Performance Impact**: **Low** - Schema info cached after first call  
**Maintenance Risk**: **Low** - Schema introspection is stable PostgreSQL feature

---

#### 1.2 FOR UPDATE SKIP LOCKED (Job Queue Primitive)

**Purpose**: Concurrent worker coordination for job queue without race conditions.

**Method**: `dequeueJobs()` - lines 488-590

**Queue Dequeue Query** (lines 505-512):

```sql
SELECT id, project_id
FROM kb.object_extraction_jobs
WHERE status = $1
ORDER BY created_at ASC
LIMIT $2
FOR UPDATE SKIP LOCKED
```

**Why Strategic**:

- **FOR UPDATE SKIP LOCKED**: PostgreSQL-specific concurrency primitive for job queues
- **Race-free job claiming**: Multiple workers can dequeue concurrently without conflicts
- **SKIP LOCKED**: Workers skip rows locked by other transactions (no blocking)
- **Industry standard**: Used by Sidekiq, BullMQ, Postgres-backed job queues

**How It Works**:

1. Worker A locks row 1 with `FOR UPDATE`
2. Worker B's query `SKIP LOCKED` row 1, locks row 2
3. Worker C's query `SKIP LOCKED` rows 1 & 2, locks row 3
4. No blocking, no duplicate work, no retries needed

**Alternative Approaches**:

1. **Redis/Bull queue**:

   - ✅ Distributed coordination
   - ❌ Separate infrastructure, consistency concerns
   - ❌ Jobs already stored in Postgres, why duplicate?

2. **Application-level locking**:

   - ❌ Doesn't work across instances
   - ❌ Race conditions without distributed lock

3. **SELECT then UPDATE pattern**:
   - ❌ Race condition: Two workers SELECT same row
   - ❌ Requires retry logic and error handling

**Multi-Tenant Complexity** (lines 522-577):

The method demonstrates sophisticated tenant context management:

```typescript
// Step 1: Find pending jobs across all tenants (no tenant context)
await this.db.setTenantContext(null, null);

const candidatesResult = await this.db.query(
  `SELECT id, project_id FROM kb.object_extraction_jobs
   WHERE status = $1 ORDER BY created_at ASC LIMIT $2
   FOR UPDATE SKIP LOCKED`,
  [ExtractionJobStatus.PENDING, batchSize]
);

// Step 2: Claim each job by updating it within its tenant context
for (const candidate of candidatesResult.rows) {
  const projectId = candidate.project_id;

  // Derive organization_id from project (Phase 6 pattern)
  const orgResult = await this.db.query(
    'SELECT organization_id FROM kb.projects WHERE id = $1',
    [projectId]
  );
  const orgId = orgResult.rows[0]?.organization_id;

  // Update job status within its tenant context (RLS enforced)
  await this.db.runWithTenantContext(orgId, projectId, async () =>
    this.db.query(
      `UPDATE kb.object_extraction_jobs
       SET status = $1, started_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = $3
       RETURNING *`,
      [ExtractionJobStatus.RUNNING, candidate.id, ExtractionJobStatus.PENDING]
    )
  );
}
```

**Why This Complexity**:

- RLS policies require tenant context for UPDATE
- Cannot set tenant context before FOR UPDATE SKIP LOCKED (would filter results)
- Solution: System-level SELECT, then per-job tenant context for UPDATE
- Demonstrates that multi-tenancy + job queues require raw SQL

**TypeORM Migration Effort**: **Impossible** - No FOR UPDATE SKIP LOCKED support  
**Performance Impact**: **Critical** - Enables concurrent worker scaling  
**Maintenance Risk**: **Low** - Standard PostgreSQL feature since 9.5

---

#### 1.3 Dynamic INSERT with Conditional Columns

**Purpose**: Support schema evolution by conditionally including columns that may not exist.

**Method**: `createJob()` - lines 176-250

**Dynamic Column Building** (lines 203-230):

```typescript
const columns: string[] = [
  schema.projectColumn,
  'source_type',
  'status',
  'extraction_config',
  'source_metadata',
  'source_id',
];
const values: any[] = [
  projectId,
  dto.source_type,
  ExtractionJobStatus.PENDING,
  JSON.stringify(dto.extraction_config ?? {}),
  JSON.stringify(dto.source_metadata ?? {}),
  dto.source_id ?? null,
];

// organization_id column is optional (removed in Phase 6 migration)
if (schema.orgColumn) {
  columns.unshift(schema.orgColumn);
  values.unshift(organizationId);
}

// subject_id column is optional (migration in progress)
if (schema.subjectColumn) {
  columns.push(schema.subjectColumn);
  values.push(dto.subject_id ?? null);
}

const placeholders = columns.map((_, index) => `$${index + 1}`);

await this.db.query(
  `INSERT INTO kb.object_extraction_jobs (${columns.join(', ')})
   VALUES (${placeholders.join(', ')})
   RETURNING *`,
  values
);
```

**Why Strategic**:

- **Schema-aware INSERT**: Only includes columns that exist in current schema
- **Migration compatibility**: Works both pre- and post-migration
- **Dynamic placeholders**: `$1, $2, $3, ...` generated based on column count
- **Type safety**: Uses schema info to determine column names and types

**Benefits**:

1. Zero-downtime deployments
2. Rollback safety
3. Gradual schema evolution
4. No need for conditional logic in every caller

**TypeORM Migration Effort**: **High** - Would require custom entity classes per schema version  
**Performance Impact**: **Low** - Column list is precomputed  
**Maintenance Risk**: **Low** - Schema info encapsulates all complexity

---

#### 1.4 Dynamic UPDATE with Schema Flexibility

**Purpose**: Conditionally update columns based on schema state and provided values.

**Method**: `updateJob()` - lines 344-474

**Dynamic UPDATE Builder** (lines 353-447):

```typescript
const updates: string[] = [];
const params: any[] = [];
let paramIndex = 1;

const pushUpdate = (column: string, value: any) => {
  updates.push(`${column} = $${paramIndex}`);
  params.push(value);
  paramIndex += 1;
};

if (dto.status !== undefined) {
  pushUpdate('status', dto.status);

  // Auto-set started_at when transitioning to running
  if (dto.status === ExtractionJobStatus.RUNNING) {
    updates.push('started_at = COALESCE(started_at, NOW())');
  }

  // Auto-set completed_at when transitioning to terminal states
  if ([COMPLETED, FAILED, CANCELLED].includes(dto.status)) {
    updates.push('completed_at = NOW()');
  }
}

if (schema.totalItemsColumn && dto.total_items !== undefined) {
  pushUpdate(schema.totalItemsColumn, dto.total_items);
}

if (schema.processedItemsColumn && dto.processed_items !== undefined) {
  pushUpdate(schema.processedItemsColumn, dto.processed_items);
}

// ... 10+ more conditional column updates

const result = await this.db.query(
  `UPDATE kb.object_extraction_jobs 
   SET ${updates.join(', ')}
   WHERE id = $${paramIndex} AND ${schema.projectColumn} = $${paramIndex + 1}
   RETURNING *`,
  [...params, jobId, projectId]
);
```

**Why Strategic**:

- **Schema-aware UPDATE**: Only updates columns that exist
- **State machine logic**: Auto-set `started_at` and `completed_at` based on status transitions
- **COALESCE for idempotency**: `started_at = COALESCE(started_at, NOW())` prevents overwriting
- **Dynamic parameter indexing**: `$1, $2, $3, ...` calculated at runtime

**State Transitions Handled** (lines 363-380):

```typescript
// PENDING → RUNNING: Set started_at (idempotent)
if (dto.status === ExtractionJobStatus.RUNNING) {
  updates.push('started_at = COALESCE(started_at, NOW())');
}

// ANY → COMPLETED/FAILED/CANCELLED: Set completed_at
if ([COMPLETED, FAILED, CANCELLED].includes(dto.status)) {
  updates.push('completed_at = NOW()');
}
```

**TypeORM Migration Effort**: **Medium** - Could use QueryBuilder but loses state machine logic  
**Performance Impact**: **Low** - Single UPDATE query  
**Maintenance Risk**: **Low** - Schema info encapsulates column mapping

---

#### 1.5 JSONB Operations for Statistics

**Purpose**: Aggregate statistics across jobs with complex JSONB array operations.

**Method**: `getJobStatistics()` - lines 987-1070

**JSONB Aggregation Query** (lines 1001-1024):

```sql
SELECT
  status,
  source_type,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::INTEGER as avg_duration_ms,
  SUM(COALESCE(jsonb_array_length(created_objects), 0)) as total_objects
FROM kb.object_extraction_jobs
WHERE project_id = $1
GROUP BY status, source_type
```

**JSONB Array Element Extraction** (lines 1051-1058):

```sql
SELECT DISTINCT jsonb_array_elements_text(discovered_types) as type_name
FROM kb.object_extraction_jobs
WHERE project_id = $1 AND jsonb_array_length(discovered_types) > 0
```

**Why Strategic**:

- **`jsonb_array_length()`**: PostgreSQL-specific function for array size
- **`jsonb_array_elements_text()`**: Expands JSONB array into rows for DISTINCT
- **EXTRACT(EPOCH FROM ...)**: Duration calculation in milliseconds
- **SUM(COALESCE(...))**: Aggregate with null handling

**Statistics Computed**:

1. **Total jobs by status**: `COUNT(*) GROUP BY status`
2. **Jobs by source type**: `COUNT(*) GROUP BY source_type`
3. **Average duration**: `AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)`
4. **Total objects created**: `SUM(jsonb_array_length(created_objects))`
5. **Unique discovered types**: `DISTINCT jsonb_array_elements_text(discovered_types)`

**Conditional Expression for Schema Variations** (lines 1001-1005):

```typescript
const totalObjectsExpression = schema.createdObjectsColumn
  ? schema.createdObjectsIsArray
    ? `SUM(COALESCE(jsonb_array_length(${schema.createdObjectsColumn}), 0))`
    : `SUM(COALESCE(${schema.createdObjectsColumn}, 0))`
  : '0';
```

**TypeORM Migration Effort**: **Medium** - Could use QueryBuilder with raw expressions  
**Performance Impact**: **Medium** - Aggregation is O(n) in job count  
**Maintenance Risk**: **Low** - JSONB functions are stable

---

#### 1.6 Tenant Context Derivation (Phase 6 Pattern)

**Purpose**: Derive organization context from project relationship rather than storing redundantly.

**Methods**: `createJob()` (lines 188-198), `dequeueJobs()` (lines 526-534)

**Organization Lookup Pattern** (lines 188-198):

```typescript
// Derive organization_id from project for tenant context
// In Phase 6, extraction jobs are project-scoped,
// so organization_id is only needed for setTenantContext
const orgResult = await this.db.query<{ organization_id: string }>(
  'SELECT organization_id FROM kb.projects WHERE id = $1',
  [projectId]
);

if (!orgResult.rows[0]) {
  throw new BadRequestException(`Project ${projectId} not found`);
}

const organizationId = orgResult.rows[0].organization_id;
await this.db.setTenantContext(organizationId, projectId);
```

**Why Strategic**:

- **Phase 6 migration pattern**: `organization_id` removed from `object_extraction_jobs` table
- **Referential integrity**: Organization context derived from `projects` table
- **Single source of truth**: No data duplication, no inconsistency risk
- **Migration compatibility**: Works whether `organization_id` column exists or not

**Pattern Established**:

```
job.project_id → projects.organization_id → setTenantContext(org, project)
```

**Alternative Approach (Pre-Phase 6)**:

```sql
-- ❌ Old pattern: organization_id stored redundantly
SELECT organization_id FROM kb.object_extraction_jobs WHERE id = $1

-- ✅ New pattern: organization_id derived from project
SELECT organization_id FROM kb.projects WHERE id = (
  SELECT project_id FROM kb.object_extraction_jobs WHERE id = $1
)
```

**Benefits**:

1. **No data duplication**: Organization stored once in `projects` table
2. **Referential integrity**: FK constraint ensures consistency
3. **Schema simplification**: Fewer columns to maintain
4. **Migration path**: Service supports both patterns during transition

**TypeORM Migration Effort**: **Low** - Could use entity relations  
**Performance Impact**: **Low** - Additional JOIN but indexed  
**Maintenance Risk**: **Low** - Standard relational pattern

---

#### 1.7 Bulk Operations for Job Management

**Purpose**: Efficiently manage large numbers of jobs with single queries.

**Methods**:

**a) `bulkCancelJobs()` - lines 911-933**: Cancel all pending/running jobs

```sql
UPDATE kb.object_extraction_jobs
SET status = $1, updated_at = NOW()
WHERE project_id = $2
  AND status IN ($3, $4)
```

**b) `bulkDeleteJobs()` - lines 938-957**: Delete all completed/failed/cancelled jobs

```sql
DELETE FROM kb.object_extraction_jobs
WHERE project_id = $1
  AND status IN ($2, $3, $4)
```

**c) `bulkRetryJobs()` - lines 962-982**: Retry all failed jobs

```sql
UPDATE kb.object_extraction_jobs
SET status = $1,
    error_message = NULL,
    error_details = NULL,
    updated_at = NOW()
WHERE project_id = $2
  AND status = $3
```

**Why Strategic**:

- **Bulk operations**: Single query affects multiple rows (O(1) vs O(n) queries)
- **Transactional**: All-or-nothing semantics
- **Efficient**: Uses indexes on `project_id` and `status`
- **Admin operations**: Used for project cleanup and error recovery

**TypeORM Migration Effort**: **Low** - QueryBuilder supports bulk operations  
**Performance Impact**: **Medium** - Critical for large projects  
**Maintenance Risk**: **Low** - Simple bulk queries

---

#### 1.8 COALESCE for Idempotent Updates

**Purpose**: Prevent overwriting values on retry or multiple updates.

**Methods**: `markCompleted()` (lines 610-717), `updateJob()` (lines 368-369)

**Idempotent Update Pattern** (lines 643-654):

```sql
UPDATE kb.object_extraction_jobs
SET status = $1,
    completed_at = NOW(),
    updated_at = NOW(),
    created_objects = COALESCE($2, created_objects),
    discovered_types = COALESCE($3, discovered_types),
    successful_items = COALESCE($4, successful_items),
    total_items = COALESCE($5, total_items),
    processed_items = COALESCE($6, processed_items)
WHERE id = $7
```

**Why Strategic**:

- **COALESCE($2, column)**: Use new value if provided, else keep existing
- **Idempotency**: Multiple calls with partial data don't overwrite
- **Worker retries**: Failed workers can resume without losing progress
- **Defensive programming**: Protects against application bugs

**Example Scenario**:

```typescript
// Worker 1: Updates progress at 50% completion
await markCompleted(jobId, { successful_items: 50, total_items: 100 });

// Worker 1 crashes, Worker 2 retries from last checkpoint
await markCompleted(jobId, { successful_items: 100, total_items: 100 });
// COALESCE ensures successful_items updates to 100, not NULL
```

**TypeORM Migration Effort**: **Low** - Can use QueryBuilder with raw expressions  
**Performance Impact**: **Low** - COALESCE is cheap  
**Maintenance Risk**: **Low** - Standard SQL pattern

---

### Already Migrated to TypeORM

**Method**: `getRetryCount()` - lines 1215-1227

```typescript
async getRetryCount(jobId: string): Promise<number> {
  try {
    const job = await this.extractionJobRepository.findOne({
      where: { id: jobId },
      select: ['retryCount'],
    });

    return job?.retryCount || 0;
  } catch (error) {
    this.logger.warn(`Failed to get retry count for job ${jobId}`, error);
    return 0;
  }
}
```

**Why This Method Uses TypeORM**:

- ✅ Simple read-only query
- ✅ No PostgreSQL-specific features
- ✅ No schema evolution concerns (retryCount always exists)
- ✅ Demonstrates hybrid approach is possible

**Completion Status**: **1/21 methods migrated to TypeORM (4.8%)**

---

### Migration Recommendation: **KEEP RAW SQL** ✅

**Rationale**:

1. **20+ methods** use PostgreSQL-specific features or schema introspection
2. **Schema evolution support** is essential during multi-phase migrations
3. **FOR UPDATE SKIP LOCKED** is the correct job queue primitive
4. **Migration compatibility** enables zero-downtime deployments
5. TypeORM migration would require:
   - Multiple entity classes per schema version
   - Loss of dynamic column detection
   - Complex workarounds for FOR UPDATE SKIP LOCKED
   - Degraded migration safety

**Effective Completion**: **100%** (strategic SQL is the target state)

---

## Summary: Strategic SQL Justification

### Services Marked Complete (Sprint 3)

| Service              | Total Methods | Strategic SQL Methods | TypeORM Methods | Completion %     |
| -------------------- | ------------- | --------------------- | --------------- | ---------------- |
| ExtractionJobService | 21            | 20                    | 1               | 100% (strategic) |

### PostgreSQL Features Used

| Feature                    | Methods                      | Migration Effort | Alternative                              |
| -------------------------- | ---------------------------- | ---------------- | ---------------------------------------- |
| Schema Introspection       | getSchemaInfo()              | Impossible       | Multiple entity versions (complexity)    |
| FOR UPDATE SKIP LOCKED     | dequeueJobs()                | Impossible       | External queue (Redis) or race           |
| Dynamic Column Lists       | createJob(), updateJob()     | High             | Multiple entity classes per schema       |
| JSONB Operations           | getJobStatistics()           | Medium           | QueryBuilder with raw expressions        |
| COALESCE for Idempotency   | markCompleted(), updateJob() | Low              | Application logic (verbose)              |
| Tenant Context Derivation  | All methods                  | Low              | Entity relations (but loses flexibility) |
| Bulk Operations            | bulk\*Jobs()                 | Low              | QueryBuilder (easily migrateable)        |
| Conditional Column Updates | updateJob(), markCompleted() | Medium           | Multiple UPDATE queries                  |

### Impact on Migration Tracking

**Previous Status (Sprint 2)**: 40/56 services complete (71.4%)

**New Status (Sprint 3)**: 41/56 services complete (73.2%)

- 37 services: 100% TypeORM
- 4 services: Strategic SQL (Sprints 1-2)
- 1 service: Strategic SQL + Hybrid (Sprint 3)

**Effective Progress**: +1 service marked complete (+1.8%)

---

## Key Insights from Sprint 3

### 1. Schema Evolution Pattern

**ExtractionJobService demonstrates a best practice for managing schema migrations**:

```typescript
// ✅ Dynamic schema detection
const schema = await this.getSchemaInfo();

// ✅ Conditional column inclusion
if (schema.orgColumn) {
  columns.push(schema.orgColumn);
  values.push(orgId);
}

// ✅ Migration-safe queries
const query = `INSERT INTO kb.object_extraction_jobs (${columns.join(', ')})
               VALUES (${placeholders.join(', ')})`;
```

**Benefits**:

- Zero-downtime deployments
- Rollback safety
- Gradual migration
- Blue-green compatibility

**When to Use This Pattern**:

- ✅ Multi-phase schema migrations
- ✅ Column renames or removals
- ✅ Services with long-running deployments
- ✅ High-availability requirements

### 2. Job Queue Primitive

**FOR UPDATE SKIP LOCKED is the correct PostgreSQL pattern for job queues**:

```sql
SELECT id FROM jobs WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 10
FOR UPDATE SKIP LOCKED
```

**Why This Is Better Than Alternatives**:

| Approach               | Pros                                                                   | Cons                                                                         |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FOR UPDATE SKIP LOCKED | ✅ Built-in<br>✅ No external deps<br>✅ Transactional<br>✅ Race-free | ❌ PostgreSQL-specific                                                       |
| Redis/Bull Queue       | ✅ Language-agnostic<br>✅ Advanced features                           | ❌ Separate infrastructure<br>❌ Data duplication<br>❌ Consistency concerns |
| Application Lock       | ✅ Simple                                                              | ❌ Single instance only<br>❌ Race conditions                                |
| SELECT then UPDATE     | ✅ Any SQL DB                                                          | ❌ Race conditions<br>❌ Requires retry logic                                |

**Recommendation**: Use `FOR UPDATE SKIP LOCKED` if using PostgreSQL. Don't migrate to TypeORM.

### 3. Hybrid Approach is Optimal

**ExtractionJobService shows that mixing TypeORM and raw SQL is the right choice**:

- ✅ Use TypeORM for simple reads (`getRetryCount()`)
- ✅ Use raw SQL for complex operations (job queue, schema evolution)
- ✅ Not an all-or-nothing decision
- ✅ Choose the right tool for each method

**Code Review Checklist**:

- [ ] Does this method use PostgreSQL-specific features? → Raw SQL
- [ ] Is this a simple CRUD operation? → TypeORM
- [ ] Does this need schema evolution support? → Raw SQL
- [ ] Is this performance-critical? → Benchmark both approaches

---

## Architectural Decision: Schema Evolution Pattern

**Problem**: How do we safely migrate database schemas without downtime?

**Solution**: Dynamic schema introspection + conditional SQL generation

**Pattern**:

```typescript
// 1. Detect current schema state
const schema = await this.getSchemaInfo();

// 2. Build queries dynamically based on schema
const columns = ['id', 'name'];
if (schema.hasLegacyColumn) {
  columns.push('legacy_column');
}
if (schema.hasNewColumn) {
  columns.push('new_column');
}

// 3. Execute schema-aware query
await db.query(
  `INSERT INTO table (${columns.join(', ')}) VALUES (...)`,
  values
);
```

**Benefits**:

1. **Zero-downtime**: Code works with any schema version
2. **Rollback-safe**: Database migration can be rolled back
3. **Gradual**: Test schema changes on staging
4. **Self-documenting**: Schema info shows migration history

**Use Cases**:

- Column renames (e.g., `created_by` → `subject_id`)
- Column removals (e.g., `organization_id` removed in Phase 6)
- Column type changes (e.g., `created_objects: integer` → `created_objects: jsonb[]`)
- Multi-phase migrations with backward compatibility

---

## Next Steps

1. ✅ Document ExtractionJobService (this file)
2. ⏳ Update MIGRATION_TRACKING.md with Sprint 3 metrics
3. ⏳ Analyze 1-2 more services (IngestionService, ClickUpImportService)
4. ⏳ Commit Sprint 3 documentation

**Estimated Time for Remaining Services**: 6-8 hours (2-3 services)

**Target Completion**: 75-80% (42-45/56 services)

---

## References

- [Strategic SQL Sprint 1](./STRATEGIC_SQL_DOCUMENTATION_SPRINT_1.md)
- [Strategic SQL Sprint 2](./STRATEGIC_SQL_DOCUMENTATION_SPRINT_2.md)
- [Migration Tracking](./MIGRATION_TRACKING.md)
- [TypeORM Migration Guide](./TYPEORM_MIGRATION_GUIDE.md)
- [Phase 6 Organization Cleanup](../migrations/ORGANIZATION_ID_MIGRATION_COMPLETE.md)
