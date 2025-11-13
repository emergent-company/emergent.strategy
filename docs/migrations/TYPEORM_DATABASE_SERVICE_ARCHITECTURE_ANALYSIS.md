# TypeORM + DatabaseService Architecture Analysis

## Executive Summary

**Date**: 2024-11-13  
**Status**: ✅ RECOMMENDATION - KEEP BOTH SERVICES AS-IS  
**Effort to Consolidate**: 3-5 days (HIGH)  
**Risk**: MODERATE-HIGH  
**Value**: LOW

### TL;DR

Our current dual-architecture (TypeORM + DatabaseService) is **intentional and optimal**. Consolidation would provide minimal benefits while introducing significant risks to our RLS security model.

---

## Current Architecture

### 1. TypeORM DataSource (Primary ORM)

**Location**: `apps/server/src/typeorm.config.ts`, `apps/server/src/modules/app.module.ts:38-59`

**Configuration**:

```typescript
TypeOrmModule.forRootAsync({
  imports: [AppConfigModule],
  useFactory: (configService: AppConfigService) => ({
    type: 'postgres',
    host: configService.dbHost,
    port: configService.dbPort,
    username: configService.dbUser,
    password: configService.dbPassword,
    database: configService.dbName,
    entities,
    synchronize: false,
    autoLoadEntities: true,
    migrationsRun: process.env.SKIP_MIGRATIONS !== '1',
  }),
});
```

**Connection Pool**: Managed by TypeORM internally (pg.Pool under the hood)

**Usage Pattern**:

- Services inject `DataSource` directly via constructor
- Repository pattern via `@InjectRepository(Entity)`
- Raw SQL queries via `dataSource.query()` for PostgreSQL-specific features
- **18 services** use this pattern

**Key Services Using DataSource**:

```
NotificationsService    TypeRegistryService       MonitoringService
DocumentsService        IntegrationsService       ClickUpImportService
OrgsService             TagService                EmbeddingJobsService
RevisionCountWorker     ProductVersionService     BranchService
ExtractionJobService    EntityLinkingService      ProjectsService
TemplatePackService     McpToolSelectorService    InvitesService
```

### 2. DatabaseService (RLS + Raw SQL)

**Location**: `apps/server/src/common/database/database.service.ts`

**Connection Pool**: Custom `pg.Pool` instance (lines 50, 126-132)

**Core Responsibilities**:

1. **Row-Level Security (RLS)** enforcement via session variables
2. **Role switching** from bypass role → `app_rls` role
3. **Tenant context management** via `AsyncLocalStorage`
4. **Migration runner** (uses TypeORM DataSource temporarily, lines 244-311)
5. **Raw SQL queries** with automatic RLS context injection

**Key Methods**:

```typescript
// Set session variables before EVERY query
query<T>(text: string, params?: any[]): Promise<QueryResult<T>>
getClient(): Promise<PoolClient>
setTenantContext(orgId?: string, projectId?: string): Promise<void>
runWithTenantContext<T>(orgId, projectId, fn): Promise<T>
```

**RLS Context Injection** (lines 332-380):

```typescript
// Before every query, set PostgreSQL session variables
await client.query(
  'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
  [
    'app.current_organization_id',
    effectiveOrg,
    'app.current_project_id',
    effectiveProject,
    'row_security',
    'on',
  ]
);
```

---

## Question 1: Can We Reuse TypeORM's Connection Pool?

### Answer: YES, but with significant trade-offs

TypeORM's DataSource exposes several methods for raw SQL execution:

### Option A: `dataSource.query()` (Simple Raw SQL)

```typescript
const result = await dataSource.query(
  'SELECT * FROM users WHERE name = $1 AND age = $2',
  ['John', 24]
);
```

**Pros**:

- ✅ Uses TypeORM's connection pool
- ✅ Supports parameterized queries ($1, $2 syntax)
- ✅ No separate pool to manage

**Cons**:

- ❌ **No control over which connection from pool** - different query = different connection
- ❌ **Session variables don't persist** across queries
- ❌ **Breaks RLS** if we set `app.current_organization_id` on Connection A, then next query runs on Connection B

### Option B: `dataSource.createQueryRunner()` (Connection Control)

```typescript
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();

try {
  // Set session variables on THIS specific connection
  await queryRunner.query(
    'SELECT set_config($1,$2,false), set_config($3,$4,false)',
    ['app.current_organization_id', orgId, 'app.current_project_id', projectId]
  );

  // Execute query on SAME connection
  const result = await queryRunner.query('SELECT * FROM graph_objects');
} finally {
  await queryRunner.release(); // Return connection to pool
}
```

**Pros**:

- ✅ Uses TypeORM's connection pool
- ✅ **Controls which connection** - session variables persist
- ✅ Can maintain RLS across multiple queries
- ✅ Transaction support built-in

**Cons**:

- ❌ More verbose API (connect/release boilerplate)
- ❌ Must manually manage `queryRunner.release()` - memory leaks if forgotten
- ❌ **HIGH REFACTOR EFFORT** - DatabaseService has 17 methods using `this.pool`

---

## Question 2: Should We Consolidate Connection Management?

### Analysis: Minimal Value, High Risk

#### Current State (Dual Architecture)

**TypeORM DataSource Connection Pool**:

- Purpose: TypeORM entities, repositories, migrations
- Users: 18 services using `@InjectRepository()` or `DataSource.query()`
- Connection count: ~20 connections (default TypeORM pool size)

**DatabaseService pg.Pool**:

- Purpose: RLS-enforced raw SQL queries
- Users: ChatService, AuthService, PermissionService (RLS-critical operations)
- Connection count: ~10 connections (estimated based on usage)
- **Critical**: Ensures session variables persist across related queries

**Total Connection Overhead**: ~30 connections to PostgreSQL

#### Consolidated Architecture (Single Pool via QueryRunner)

**Proposed Change**: Refactor DatabaseService to use `DataSource.createQueryRunner()`

**Changes Required**:

```typescript
class DatabaseService {
  constructor(private readonly dataSource: DataSource) {} // Inject TypeORM DataSource

  async query<T>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Set RLS context on this specific connection
      await queryRunner.query(
        'SELECT set_config($1,$2,false), set_config($3,$4,false)',
        [
          'app.current_organization_id',
          this.currentOrgId ?? '',
          'app.current_project_id',
          this.currentProjectId ?? '',
        ]
      );

      // Execute user query on same connection
      return await queryRunner.query(text, params);
    } finally {
      await queryRunner.release(); // CRITICAL: Must always release
    }
  }

  async getClient(): Promise<QueryRunner> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    // Caller must call queryRunner.release()
    return queryRunner;
  }
}
```

**Files to Modify**:

1. `apps/server/src/common/database/database.service.ts` (963 lines)

   - Replace `pg.Pool` with `DataSource.createQueryRunner()`
   - Update `query()` method (lines 313-380)
   - Update `getClient()` method (lines 382-431)
   - Update `onModuleInit()` to not create separate pool (lines 110-181)
   - Update `switchToRlsApplicationRole()` - MORE COMPLEX (lines 478-569)

2. All services using `DatabaseService.getClient()`:
   - ChatService (lines 397-426) - transaction with multi-INSERT
   - PermissionService - RLS enforcement checks
   - AuthService - token introspection

**Risk Areas**:

```typescript
// OLD (current)
const client = await this.db.getClient();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO graph_objects ...');
  await client.query('INSERT INTO chat_messages ...');
  await client.query('COMMIT');
} finally {
  client.release(); // Release pg.PoolClient
}

// NEW (consolidated)
const queryRunner = await this.db.getClient();
try {
  await queryRunner.startTransaction();
  await queryRunner.query('INSERT INTO graph_objects ...');
  await queryRunner.query('INSERT INTO chat_messages ...');
  await queryRunner.commitTransaction();
} finally {
  await queryRunner.release(); // Release TypeORM QueryRunner
}
```

**Breaking Change**: API change from `PoolClient` → `QueryRunner` affects all callers

---

## Question 3: How Does TypeORM Use PostgreSQL Driver?

### Answer: TypeORM wraps `pg` driver internally

**TypeORM's Connection Hierarchy**:

```
DataSource
  └─ ConnectionPool (internal)
      └─ pg.Pool (PostgreSQL driver)
          └─ pg.PoolClient[] (individual connections)
```

**When you call**:

- `dataSource.query()` → Gets random connection from pool, executes, releases immediately
- `dataSource.createQueryRunner()` → Gets dedicated connection, you control lifecycle
- `repository.find()` → Uses query builder internally → random connection from pool

**Key Insight**: TypeORM's `DataSource` already has a `pg.Pool` internally - we're just creating a **second** `pg.Pool` in DatabaseService.

---

## Recommendation: KEEP BOTH SERVICES AS-IS

### Rationale

#### 1. **RLS Security Model Works Perfectly**

Our current architecture **guarantees** session variables persist across related queries:

```typescript
// DatabaseService ensures SAME connection for multi-step operations
const client = await this.db.getClient();
try {
  // Session vars set ONCE on this specific connection
  await this.db.setTenantContext(orgId, projectId);

  // ALL subsequent queries use SAME connection = RLS works
  const objects = await client.query('SELECT * FROM graph_objects');
  const rels = await client.query('SELECT * FROM graph_relationships');
} finally {
  client.release();
}
```

Consolidating to TypeORM QueryRunner provides **no security improvement** - just a different API for the same behavior.

#### 2. **Connection Pool Overhead is Negligible**

- Total connections: ~30
- PostgreSQL default `max_connections`: 100-200
- Our usage: **15-30% of available connections**
- Savings from consolidation: ~10 connections = **5-10% improvement**
- **Not a bottleneck**

#### 3. **High Refactor Risk, Low Value**

**Effort**: 3-5 days

- Refactor DatabaseService to use QueryRunner (1 day)
- Update all services using `getClient()` (1 day)
- Update role switching logic in `switchToRlsApplicationRole()` (1 day)
- Testing RLS behavior across all services (1-2 days)

**Risk**:

- Breaking RLS enforcement if session variables don't propagate correctly
- Subtle bugs in transaction handling (BEGIN/COMMIT/ROLLBACK)
- Memory leaks if QueryRunner not released properly

**Value**:

- Save ~10 database connections (~5% reduction)
- Cleaner architecture (subjective)
- **No functional improvements**

#### 4. **Clear Separation of Concerns**

**TypeORM DataSource**: ORM operations, entity management, migrations  
**DatabaseService**: RLS enforcement, tenant context, PostgreSQL-specific features

This separation makes the codebase **easier to understand** and **safer to modify**.

---

## Alternative: Enhance Documentation

Instead of consolidating, we should:

### 1. Document the Architecture Decision

Create `docs/architecture/DATABASE_CONNECTION_STRATEGY.md` explaining:

- Why we have two connection pools
- When to use TypeORM vs DatabaseService
- RLS enforcement requirements

### 2. Create Service Selection Guide

```markdown
## When to Use TypeORM

✅ Entity CRUD operations (User, Project, Document, etc.)
✅ Simple queries with QueryBuilder
✅ Queries on single tenant (RLS context already set by middleware)
✅ Read-heavy operations with caching

## When to Use DatabaseService

✅ Cross-tenant queries (admin operations)
✅ Multi-step operations requiring session variable persistence
✅ PostgreSQL-specific features (pgvector, advisory locks, JSONB operators)
✅ Operations before tenant context is established (authentication)
```

### 3. Add Code Examples

Add inline comments in services showing **why** they use DatabaseService vs TypeORM:

```typescript
// ChatService.ts
export class ChatService {
  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepository: Repository<ChatConversation>,
    private readonly db: DatabaseService, // For RLS + pgvector hybrid search
  ) {}

  async hybridSearch(...) {
    // Use DatabaseService - needs pgvector <=> operator + RLS context
    return this.db.query(`
      SELECT obj.id, obj.data->>'name' as name,
             (obj.embedding <=> $1::vector) as distance
      FROM kb.graph_objects obj
      WHERE obj.organization_id = current_setting('app.current_organization_id')
      ORDER BY distance LIMIT 10
    `, [queryEmbedding]);
  }
}
```

---

## Conclusion

**Keep the dual-architecture**. It's not technical debt - it's a deliberate design that:

1. ✅ Ensures RLS security
2. ✅ Separates concerns cleanly
3. ✅ Minimizes connection pool overhead (~30 connections = non-issue)
4. ✅ Allows PostgreSQL-specific features

**Consolidation would be refactoring for the sake of "purity"**, not for solving a real problem.

---

## Appendix: Services Using Each Pattern

### TypeORM DataSource Only (10 services)

1. `ChunksService` - Repository pattern only
2. `EmbeddingPolicyService` - Repository pattern only
3. `AuditService` - Repository pattern only
4. `ClickUpImportLoggerService` - Repository pattern only
5. `MonitoringLoggerService` - Repository pattern only
6. `UserProfileService` - Repository pattern only
7. `SettingsController` - Repository pattern only
8. `ClickUpWebhookHandler` - Repository pattern only
9. `PostgresCacheService` - Repository pattern only
10. `UserDeletionService` - Repository pattern only

### TypeORM DataSource + Raw SQL (18 services)

1. `NotificationsService` - COUNT FILTER aggregation
2. `InvitesService` - Complex join queries
3. `TypeRegistryService` - GROUP BY aggregations
4. `MonitoringService` - Cost aggregation subqueries
5. `DocumentsService` - LATERAL joins
6. `IntegrationsService` - BYTEA handling
7. `ClickUpImportService` - Dynamic UPSERT, JSONB operators
8. `OrgsService` - Transaction management
9. `TagService` - Advisory locks
10. `TagCleanupWorkerService` - JSONB ? operator
11. `RevisionCountRefreshWorker` - PostgreSQL function calls
12. `ProductVersionService` - Complex queries
13. `BranchService` - Complex queries
14. `ExtractionJobService` - Complex queries
15. `EntityLinkingService` - pgvector search
16. `ProjectsService` - Transaction management
17. `McpToolSelectorService` - GROUP BY aggregation
18. `EmbeddingJobsService` - Batch operations

### DatabaseService Only (3 services)

1. `ChatService` - pgvector + RLS + transactions
2. `PermissionService` - RLS enforcement checks
3. `AuthService` - Pre-tenant-context operations

### Both TypeORM + DatabaseService (3 services)

1. `ChatService` - Repositories for entities, DatabaseService for vector search
2. `DocumentsService` - Repositories for entities, DataSource for LATERAL joins
3. `EntityLinkingService` - Repositories for entities, DataSource for vector search

**Total Services Analyzed**: 31

---

## References

- `apps/server/src/common/database/database.service.ts` - DatabaseService implementation
- `apps/server/src/typeorm.config.ts` - TypeORM DataSource configuration
- `apps/server/src/modules/app.module.ts:38-59` - TypeORM module setup
- TypeORM Documentation: https://github.com/typeorm/typeorm/blob/master/docs/
- PostgreSQL Row-Level Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
