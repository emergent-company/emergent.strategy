# DatabaseService Pattern: Multi-Tenant RLS Infrastructure

**Status:** Production  
**Category:** Multi-Tenancy, Security, Database Access  
**Last Updated:** 2024

## Table of Contents

1. [Overview](#overview)
2. [Why DatabaseService Exists](#why-databaseservice-exists)
3. [Core Features](#core-features)
4. [When to Use DatabaseService vs TypeORM](#when-to-use-databaseservice-vs-typeorm)
5. [Architecture](#architecture)
6. [Usage Patterns](#usage-patterns)
7. [RLS Context Management](#rls-context-management)
8. [Common Use Cases](#common-use-cases)
9. [Testing with DatabaseService](#testing-with-databaseservice)
10. [Best Practices](#best-practices)
11. [Anti-Patterns](#anti-patterns)
12. [Troubleshooting](#troubleshooting)

---

## Overview

**DatabaseService** is the foundational multi-tenant infrastructure layer that provides automatic Row-Level Security (RLS) enforcement for all database operations in the application.

**Key Insight:** DatabaseService is NOT redundant with TypeORM. While TypeORM provides type-safe CRUD operations, DatabaseService provides the critical tenant isolation layer that prevents data leakage between organizations and projects.

### Quick Comparison

| Feature                          | TypeORM DataSource | DatabaseService                   |
| -------------------------------- | ------------------ | --------------------------------- |
| Type-safe entities               | ✅ Yes             | ❌ No                             |
| QueryBuilder                     | ✅ Yes             | ❌ No                             |
| Raw SQL execution                | ✅ Yes             | ✅ Yes                            |
| **Automatic RLS context**        | ❌ No              | ✅ Yes                            |
| **Request isolation**            | ❌ No              | ✅ Yes (AsyncLocalStorage)        |
| **Tenant context API**           | ❌ No              | ✅ Yes                            |
| **PostgreSQL-specific features** | Limited            | ✅ Advisory locks, pgcrypto, etc. |
| **Role management**              | ❌ No              | ✅ Switches to non-bypass role    |

---

## Why DatabaseService Exists

### The Multi-Tenant Challenge

In a multi-tenant SaaS application, **data isolation is critical**:

```typescript
// ❌ DANGER: Without RLS, this returns ALL users across ALL organizations!
const users = await userRepository.find();

// ✅ SAFE: RLS ensures only users from current tenant are returned
await db.setTenantContext(orgId, projectId);
const users = await userRepository.find(); // Automatically filtered!
```

### Problems DatabaseService Solves

1. **Automatic Tenant Context Propagation**

   - Every query automatically runs with correct organization/project context
   - No need to add `WHERE organization_id = ?` to every query

2. **Request Isolation via AsyncLocalStorage**

   - Concurrent requests don't interfere with each other's tenant context
   - Critical for test isolation and production safety

3. **Security Enforcement**

   - Switches from bypass role to `app_rls` role (non-bypass)
   - PostgreSQL enforces RLS policies at the database level
   - Even if application code has bugs, database prevents data leakage

4. **PostgreSQL-Specific Features**

   - Advisory locks for distributed locking
   - pgcrypto for encryption/decryption
   - Full-text search, vector operations, LATERAL joins, etc.

5. **Operational Safety**
   - Automatic migration execution on startup
   - Health check endpoints for RLS policy verification
   - Policy drift detection and reconciliation

---

## Core Features

### 1. Automatic RLS Context Application

**File:** `apps/server/src/common/database/database.service.ts:313-380`

Every call to `db.query()` or `db.getClient()` automatically applies the current tenant context:

```typescript
async query(text, params) {
  // Get current tenant context from AsyncLocalStorage or fallback
  const store = this.tenantContextStorage.getStore();
  const orgId = store?.orgId ?? this.currentOrgId ?? null;
  const projectId = store?.projectId ?? this.currentProjectId ?? null;

  const client = await this.pool.connect();
  try {
    // Automatically apply RLS context before EVERY query
    await client.query(
      'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
      [
        'app.current_organization_id', orgId ?? '',
        'app.current_project_id', projectId ?? '',
        'row_security', 'on'
      ]
    );

    // Execute user query with RLS enforced
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
```

**What happens under the hood:**

1. Connection is acquired from pool
2. PostgreSQL session variables are set:
   - `app.current_organization_id` → Used by RLS policies
   - `app.current_project_id` → Used by RLS policies
   - `row_security` → Ensures RLS is ON
3. User query executes (RLS automatically filters results)
4. Connection returns to pool

### 2. AsyncLocalStorage for Request Isolation

**File:** `apps/server/src/common/database/database.service.ts:72`

```typescript
private readonly tenantContextStorage = new AsyncLocalStorage<TenantStore>();
```

**Why this matters:**

```typescript
// Request A: Setting context for Org1
await db.setTenantContext('org1', 'project1');

// Request B: Setting context for Org2 (happens concurrently!)
await db.setTenantContext('org2', 'project2');

// Request A: Query executes
const result = await db.query('SELECT * FROM documents');
// ✅ Returns only Org1 documents (not affected by Request B!)
```

Without AsyncLocalStorage, Request B would overwrite Request A's context → **data leakage**.

### 3. Tenant Context Management API

#### Set Tenant Context (Persistent)

```typescript
// Set global fallback context (survives across async boundaries)
await db.setTenantContext(orgId, projectId);

// Clear tenant context (wildcard access - for bootstrap/testing)
await db.setTenantContext(null, null);
```

#### Run With Tenant Context (Scoped)

```typescript
// Temporarily switch context for a specific operation
await db.runWithTenantContext(orgId, projectId, async () => {
  // All queries here use orgId/projectId
  await db.query('SELECT ...');

  // Can nest contexts!
  await db.runWithTenantContext(otherOrgId, otherProjectId, async () => {
    // Inner context takes precedence
  });

  // Automatically restored to outer context after inner block
});
```

**Use cases:**

- Background jobs operating across multiple tenants
- Admin operations needing to read from different organizations
- Testing scenarios requiring context switching

### 4. Role-Based Security

**File:** `apps/server/src/common/database/database.service.ts:478-569`

On startup, DatabaseService switches from the configured (often bypass) role to `app_rls`:

```typescript
async switchToRlsApplicationRole() {
  // Check current role
  const currentRole = await this.pool.query(
    'SELECT rolbypassrls as bypass, rolsuper as super, rolname as user FROM pg_roles WHERE rolname = current_user'
  );

  if (!currentRole.bypass && !currentRole.super) {
    // Already using non-bypass role, no switch needed
    return;
  }

  // Create app_rls role if it doesn't exist
  await this.pool.query(
    `CREATE ROLE app_rls LOGIN PASSWORD '${appRlsPassword}'`
  );

  // Grant necessary privileges
  await this.pool.query('GRANT USAGE ON SCHEMA kb TO app_rls');
  await this.pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kb TO app_rls');

  // Recreate pool with app_rls role
  this.pool = new Pool({
    host: this.config.dbHost,
    port: this.config.dbPort,
    user: 'app_rls',        // Non-bypass role!
    password: appRlsPassword,
    database: this.config.dbName,
  });
}
```

**Why this matters:**

- Superuser roles have `BYPASSRLS` flag → RLS policies are ignored
- `app_rls` role does NOT have `BYPASSRLS` → RLS policies are enforced
- Even if `setTenantContext()` is forgotten, database prevents cross-tenant access

### 5. Migration Management

**File:** `apps/server/src/common/database/database.service.ts:244-311`

```typescript
async runMigrations() {
  const dataSource = await import('../../typeorm.config');
  await dataSource.initialize();

  const migrations = await dataSource.runMigrations({
    transaction: 'all' // All migrations in single transaction
  });

  if (migrations.length === 0) {
    this.logger.log('✓ Database schema is up to date');
  } else {
    this.logger.log(`✓ Applied ${migrations.length} migration(s)`);
    migrations.forEach(m => this.logger.log(`  - ${m.name}`));
  }
}
```

**Benefits:**

- Consistent schema across all environments
- No manual migration commands needed
- Application won't start with incomplete schema
- Retry logic for database readiness (Docker containers, CI/CD)

### 6. Health Check & Policy Verification

**File:** `apps/server/src/common/database/database.service.ts:576-616`

```typescript
async getRlsPolicyStatus() {
  const res = await this.pool.query(
    `SELECT policyname FROM pg_policies
     WHERE schemaname='kb'
     AND tablename IN ('graph_objects','graph_relationships')`
  );

  const expected = [
    'graph_objects_select',
    'graph_objects_insert',
    'graph_objects_update',
    'graph_objects_delete',
    'graph_relationships_select',
    'graph_relationships_insert',
    'graph_relationships_update',
    'graph_relationships_delete',
  ];

  const ok = expected.every(policy => res.rows.find(r => r.policyname === policy));

  return { policies_ok: ok, count: res.rows.length };
}
```

**Used by:**

- `/health` endpoint to verify RLS policies are active
- Monitoring/alerting to detect policy drift
- CI/CD to ensure correct database configuration

---

## When to Use DatabaseService vs TypeORM

### Decision Tree

```
┌─────────────────────────────────────┐
│ Do you need multi-tenant isolation? │
└────────────┬────────────────────────┘
             │
             ├─── YES ──────────────────────────────────┐
             │                                          │
             ├─ Simple CRUD?                            │
             │  → Use TypeORM Repository                │
             │    (RLS automatically enforced)          │
             │                                          │
             ├─ Complex PostgreSQL features?            │
             │  → Use DatabaseService.query()           │
             │    (Advisory locks, pgcrypto, etc.)      │
             │                                          │
             └─ Need both?                              │
                → Hybrid: TypeORM + DatabaseService     │
                  (Most common pattern)                 │
                                                        │
             ├─── NO ───────────────────────────────────┘
             │
             ├─ Pre-authentication operations?
             │  → Use DatabaseService.getPool()
             │    (Bypass RLS for user creation)
             │
             └─ Other system operations?
                → Use DatabaseService with null context
```

### Use DatabaseService When:

✅ **Query needs RLS enforcement** (99% of application queries)

```typescript
// Automatically filtered by organization/project
const result = await db.query(
  'SELECT * FROM kb.graph_objects WHERE type = $1',
  ['Document']
);
```

✅ **PostgreSQL advisory locks needed**

```typescript
// Distributed locking for tag name uniqueness
await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
  `tag|${projectId}|${name.toLowerCase()}`,
]);
```

✅ **PostgreSQL-specific functions required**

```typescript
// Encryption with pgcrypto
const result = await db.query(
  `SELECT encode(pgp_sym_encrypt($1::text, $2::text), 'base64') as encrypted`,
  [data, encryptionKey]
);

// Full-text search
const result = await db.query(
  `SELECT * FROM kb.chunks WHERE tsv @@ websearch_to_tsquery('simple', $1)`,
  [searchQuery]
);

// Vector similarity search
const result = await db.query(
  `SELECT *, embedding <=> $1 AS distance FROM kb.embeddings ORDER BY distance LIMIT 10`,
  [queryVector]
);
```

✅ **Complex queries with CTEs, LATERAL joins, window functions**

```typescript
// Recursive graph traversal
const result = await db.query(
  `
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, 1 as depth FROM kb.graph_objects WHERE id = $1
    UNION ALL
    SELECT g.id, g.parent_id, a.depth + 1 
    FROM kb.graph_objects g
    JOIN ancestors a ON g.id = a.parent_id
  )
  SELECT * FROM ancestors
`,
  [startNodeId]
);
```

✅ **Queue operations with row locking**

```typescript
// Claim next embedding job (SKIP LOCKED prevents contention)
const job = await db.query(
  `SELECT * FROM kb.embedding_jobs 
   WHERE status = 'pending' 
   ORDER BY created_at 
   FOR UPDATE SKIP LOCKED 
   LIMIT 1`
);
```

### Use TypeORM Repository When:

✅ **Simple CRUD operations with type safety**

```typescript
// Type-safe entity operations (RLS still enforced!)
const document = await documentRepository.findOne({
  where: { id: documentId },
});

const newDoc = documentRepository.create({
  title: 'New Document',
  content: 'Content here',
});
await documentRepository.save(newDoc);
```

✅ **Need entity relationships and eager loading**

```typescript
const project = await projectRepository.findOne({
  where: { id: projectId },
  relations: ['organization', 'members', 'documents'],
});
```

✅ **QueryBuilder for dynamic query construction**

```typescript
const results = await documentRepository
  .createQueryBuilder('doc')
  .where('doc.title ILIKE :search', { search: `%${query}%` })
  .andWhere('doc.status = :status', { status: 'active' })
  .orderBy('doc.created_at', 'DESC')
  .take(limit)
  .getMany();
```

### Hybrid Approach (Most Common)

**Example:** TagService uses both TypeORM AND DatabaseService

**File:** `apps/server/src/modules/graph/tag.service.ts:40-80`

```typescript
async create(projectId: string, dto: CreateTagDto) {
  const client = await this.db.getClient(); // DatabaseService for transaction + lock
  try {
    await client.query('BEGIN');

    // PostgreSQL advisory lock (DatabaseService feature)
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
      [`tag|${projectId}|${name.toLowerCase()}`]
    );

    // Check uniqueness with raw SQL (DatabaseService)
    const existing = await client.query(
      'SELECT id FROM kb.tags WHERE project_id=$1 AND LOWER(name)=LOWER($2)',
      [projectId, name]
    );
    if (existing.rowCount) throw new BadRequestException('tag_name_exists');

    // Insert using TypeORM (type safety!)
    const tag = this.tagRepository.create({
      projectId,
      productVersionId: dto.product_version_id,
      name: dto.name,
      description: dto.description || null,
    });
    const savedTag = await this.tagRepository.save(tag);

    await client.query('COMMIT');
    return savedTag;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Why hybrid?**

- Advisory lock requires DatabaseService (PostgreSQL-specific)
- Entity creation uses TypeORM (type safety + validation)
- Transaction management via DatabaseService client
- RLS automatically enforced throughout

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     NestJS Application                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Service    │  │   Service    │  │   Service    │     │
│  │   Layer      │  │   Layer      │  │   Layer      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         │                  │                  │              │
│         ├──────────────────┴──────────────────┤              │
│         │                                     │              │
│         ▼                                     ▼              │
│  ┌─────────────────┐              ┌─────────────────┐      │
│  │  DatabaseService│              │ TypeORM Repository│     │
│  │                 │              │                   │     │
│  │ • RLS Context   │◄─────────────│ Uses same pool    │     │
│  │ • Tenant Mgmt   │              │ (RLS enforced!)   │     │
│  │ • Raw SQL       │              │ • Type-safe CRUD  │     │
│  │ • Advisory Locks│              │ • QueryBuilder    │     │
│  │ • Transactions  │              │ • Relations       │     │
│  └────────┬────────┘              └─────────┬─────────┘     │
│           │                                 │               │
│           └────────────┬────────────────────┘               │
│                        │                                    │
└────────────────────────┼────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  PostgreSQL Database │
              │                      │
              │  • RLS Policies      │
              │  • app_rls Role      │
              │  • pgcrypto          │
              │  • Advisory Locks    │
              │  • Full-text Search  │
              └──────────────────────┘
```

### Request Flow with RLS

```
1. HTTP Request arrives
   │
   ├─→ Auth Guard extracts user
   │
   ├─→ Controller determines orgId/projectId
   │
   ├─→ DatabaseService.setTenantContext(orgId, projectId)
   │   │
   │   └─→ Stored in AsyncLocalStorage
   │
   ├─→ Service method calls db.query() or repository.find()
   │   │
   │   ├─→ DatabaseService.query() intercepts
   │   │   │
   │   │   ├─→ Gets connection from pool
   │   │   │
   │   │   ├─→ Sets PostgreSQL session variables:
   │   │   │   • SET app.current_organization_id = 'org123'
   │   │   │   • SET app.current_project_id = 'proj456'
   │   │   │   • SET row_security = on
   │   │   │
   │   │   └─→ Executes user query
   │   │
   │   └─→ PostgreSQL RLS policies filter results:
   │       • WHERE organization_id = current_setting('app.current_organization_id')
   │       • WHERE project_id = current_setting('app.current_project_id')
   │
   └─→ Response returned (only tenant's data!)
```

### AsyncLocalStorage Context Hierarchy

```typescript
// Root context (e.g., HTTP request handler)
await db.setTenantContext('org1', 'project1');

await db.query('...'); // Uses org1/project1

// Nested context (e.g., background task)
await db.runWithTenantContext('org2', 'project2', async () => {
  await db.query('...'); // Uses org2/project2

  // Double-nested context
  await db.runWithTenantContext('org3', 'project3', async () => {
    await db.query('...'); // Uses org3/project3
  });

  await db.query('...'); // Restored to org2/project2
});

await db.query('...'); // Restored to org1/project1
```

---

## Usage Patterns

### Pattern 1: Simple RLS-Enforced Query

```typescript
@Injectable()
export class SearchService {
  constructor(private readonly db: DatabaseService) {}

  async search(query: string, limit: number) {
    // RLS automatically enforced - only returns current tenant's chunks
    const result = await this.db.query(
      `SELECT id, document_id, chunk_index, text
       FROM kb.chunks
       WHERE tsv @@ websearch_to_tsquery('simple', $1)
       ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', $1)) DESC
       LIMIT $2`,
      [query, limit]
    );
    return result.rows;
  }
}
```

**File:** `apps/server/src/modules/search/search.service.ts:50-60`

### Pattern 2: Transaction with Advisory Lock

```typescript
@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag) private readonly tagRepository: Repository<Tag>,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  async create(projectId: string, dto: CreateTagDto) {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // Advisory lock prevents race conditions on tag name
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
        `tag|${projectId}|${dto.name.toLowerCase()}`,
      ]);

      // Check if tag already exists
      const existing = await client.query(
        'SELECT id FROM kb.tags WHERE project_id=$1 AND LOWER(name)=LOWER($2)',
        [projectId, dto.name]
      );
      if (existing.rowCount) {
        throw new BadRequestException('tag_name_exists');
      }

      // Create using TypeORM for type safety
      const tag = this.tagRepository.create({
        projectId,
        name: dto.name,
        description: dto.description,
      });
      const saved = await this.tagRepository.save(tag);

      await client.query('COMMIT');
      return saved;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
```

**File:** `apps/server/src/modules/graph/tag.service.ts:40-90`

**Why this pattern?**

- Advisory lock serializes concurrent tag creation attempts
- Prevents duplicate tag names even under high concurrency
- TypeORM provides type safety for entity creation
- RLS ensures tag belongs to correct project

### Pattern 3: Cross-Tenant Operation (Admin/Background Job)

```typescript
@Injectable()
export class ExtractionWorkerService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async processExtractionJobs() {
    // Get all pending jobs across ALL tenants (wildcard context)
    await this.db.setTenantContext(null, null);

    const jobs = await this.db.query(`
      SELECT id, organization_id, project_id, source_id
      FROM kb.extraction_jobs
      WHERE status = 'pending'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 10
    `);

    // Process each job in its own tenant context
    for (const job of jobs.rows) {
      await this.db.runWithTenantContext(
        job.organization_id,
        job.project_id,
        async () => {
          // All queries here are scoped to this job's tenant
          await this.processJob(job);
        }
      );
    }
  }

  private async processJob(job: any) {
    // This query only sees data for current job's tenant
    const source = await this.db.query(
      'SELECT * FROM kb.documents WHERE id = $1',
      [job.source_id]
    );
    // ... process job
  }
}
```

**File:** `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts:115-180`

**Why this pattern?**

- Background workers operate across multiple tenants
- `setTenantContext(null, null)` gives wildcard access to find jobs
- `runWithTenantContext()` ensures each job processes only its own data
- Automatic context restoration after each job

### Pattern 4: Pre-Authentication (Bypass RLS)

```typescript
@Injectable()
export class UserProfileService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async createOrFindUserProfile(zitadelUserId: string, email: string) {
    // Use raw pool - no RLS context exists yet (user not authenticated!)
    const pool = this.db.getPool();
    if (!pool) throw new Error('Database offline');

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM core.user_profiles WHERE zitadel_user_id = $1',
      [zitadelUserId]
    );

    if (existing.rowCount) {
      return existing.rows[0];
    }

    // Create new user profile (no RLS context needed)
    const newUser = await pool.query(
      `INSERT INTO core.user_profiles (zitadel_user_id, email)
       VALUES ($1, $2)
       RETURNING id`,
      [zitadelUserId, email]
    );

    return newUser.rows[0];
  }
}
```

**Why this pattern?**

- User authentication happens BEFORE tenant context exists
- `getPool()` provides direct pool access (bypasses RLS)
- Used only for `core.user_profiles` table (no RLS policies)
- Once authenticated, normal RLS context is established

### Pattern 5: Encryption/Decryption with pgcrypto

```typescript
@Injectable()
export class EncryptionService {
  constructor(private readonly db: DatabaseService) {}

  async encrypt(settings: IntegrationSettings): Promise<string> {
    const settingsJson = JSON.stringify(settings);

    // Uses PostgreSQL pgcrypto extension
    const result = await this.db.query<{ encrypted: string }>(
      `SELECT encode(
         pgp_sym_encrypt($1::text, $2::text),
         'base64'
       ) as encrypted`,
      [settingsJson, this.encryptionKey]
    );

    return result.rows[0].encrypted;
  }

  async decrypt(encryptedData: string): Promise<IntegrationSettings> {
    const result = await this.db.query<{ decrypted: string }>(
      `SELECT pgp_sym_decrypt(
         decode($1, 'base64'),
         $2::text
       )::text as decrypted`,
      [encryptedData, this.encryptionKey]
    );

    return JSON.parse(result.rows[0].decrypted);
  }
}
```

**File:** `apps/server/src/modules/integrations/encryption.service.ts:71-115`

**Why this pattern?**

- PostgreSQL pgcrypto provides hardware-accelerated AES-256 encryption
- Encryption happens at database level (never in transit)
- No need to bring crypto libraries into application code
- RLS still enforced (encrypted settings belong to tenant)

### Pattern 6: Queue Operations with Row Locking

```typescript
@Injectable()
export class EmbeddingJobsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async claimNextJob(): Promise<EmbeddingJobRow | null> {
    // SKIP LOCKED prevents multiple workers from locking same row
    const result = await this.db.query<EmbeddingJobRow>(
      `UPDATE kb.embedding_jobs
       SET status = 'processing',
           started_at = NOW()
       WHERE id = (
         SELECT id
         FROM kb.embedding_jobs
         WHERE status = 'pending'
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`
    );

    return result.rows[0] || null;
  }
}
```

**File:** `apps/server/src/modules/graph/embedding-jobs.service.ts:200-215`

**Why this pattern?**

- `FOR UPDATE SKIP LOCKED` enables optimistic concurrency
- Multiple workers can claim jobs without blocking each other
- RLS ensures workers only claim jobs from their tenant
- No application-level locking needed

### Pattern 7: Complex Graph Traversal

```typescript
@Injectable()
export class GraphService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async findCommonAncestor(sourceVersionId: string, targetVersionId: string) {
    // Recursive CTE for graph traversal
    const sql = `
      WITH RECURSIVE source_anc AS (
        SELECT id, parent_id, 1 as depth
        FROM kb.graph_objects
        WHERE id = $1
        UNION ALL
        SELECT g.id, g.parent_id, s.depth + 1
        FROM kb.graph_objects g
        JOIN source_anc s ON g.id = s.parent_id
        WHERE s.depth < $3
      ),
      target_anc AS (
        SELECT id, parent_id, 1 as depth
        FROM kb.graph_objects
        WHERE id = $2
        UNION ALL
        SELECT g.id, g.parent_id, t.depth + 1
        FROM kb.graph_objects g
        JOIN target_anc t ON g.id = t.parent_id
        WHERE t.depth < $3
      )
      SELECT s.id
      FROM source_anc s
      JOIN target_anc t ON s.id = t.id
      ORDER BY s.depth + t.depth
      LIMIT 1
    `;

    const result = await this.db.query<{ id: string }>(sql, [
      sourceVersionId,
      targetVersionId,
      maxDepth,
    ]);

    return result.rows[0]?.id || null;
  }
}
```

**File:** `apps/server/src/modules/graph/graph.service.ts:80-115`

**Why this pattern?**

- Recursive CTEs enable efficient graph traversal
- PostgreSQL handles complex tree operations natively
- RLS ensures only tenant's graph nodes are traversed
- Significantly faster than application-level recursion

---

## RLS Context Management

### Setting Context in Controllers

```typescript
@Controller('projects')
export class ProjectsController {
  constructor(private readonly db: DatabaseService) {}

  @Get(':projectId/documents')
  async listDocuments(@Param('projectId') projectId: string, @Req() req: any) {
    // Extract tenant context from authenticated request
    const orgId = req.user.organizationId;

    // Set RLS context for all subsequent queries
    await this.db.setTenantContext(orgId, projectId);

    // All queries now automatically filtered by orgId/projectId
    return this.documentsService.findAll();
  }
}
```

### Using Guards for Automatic Context

```typescript
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extract from route params or user token
    const orgId = request.params.orgId || request.user.organizationId;
    const projectId = request.params.projectId;

    // Set context before controller method executes
    await this.db.setTenantContext(orgId, projectId);

    return true;
  }
}

// Apply to controllers
@Controller('projects')
@UseGuards(TenantContextGuard)
export class ProjectsController {
  // Context automatically set for all methods
}
```

### Context Lifecycle

```typescript
// 1. Request arrives → Auth guard extracts user
// 2. Tenant guard sets RLS context
await db.setTenantContext(orgId, projectId);

// 3. Context stored in AsyncLocalStorage (request-scoped)
// 4. All queries in this async context use orgId/projectId

// 5. Nested operations can temporarily switch context
await db.runWithTenantContext(otherOrgId, otherProjectId, async () => {
  // Inner context
});

// 6. Context restored after nested block
// 7. Context cleared when request completes (AsyncLocalStorage cleanup)
```

---

## Common Use Cases

### Use Case 1: Multi-Tenant SaaS

**Scenario:** Organization "Acme Corp" has projects "Project A" and "Project B". Users should only see data from their own projects.

```typescript
// User makes request to Project A
await db.setTenantContext('acme-corp', 'project-a');

// Query returns ONLY Project A documents (RLS enforced)
const docs = await db.query('SELECT * FROM kb.documents');
// Returns: [doc1, doc2, doc3] (all belong to project-a)

// Switch to Project B
await db.setTenantContext('acme-corp', 'project-b');

const moreDocs = await db.query('SELECT * FROM kb.documents');
// Returns: [doc4, doc5] (all belong to project-b)
```

### Use Case 2: Background Job Processing

**Scenario:** Extraction worker processes jobs from multiple tenants.

```typescript
async processJobs() {
  // Wildcard context to find all jobs
  await db.setTenantContext(null, null);

  const jobs = await db.query(`
    SELECT id, organization_id, project_id
    FROM kb.extraction_jobs
    WHERE status = 'pending'
  `);

  // Process each job in its own context
  for (const job of jobs.rows) {
    await db.runWithTenantContext(job.organization_id, job.project_id, async () => {
      await this.processJob(job.id);
    });
  }
}
```

### Use Case 3: Admin Operations

**Scenario:** Super admin needs to view data across all organizations for support/debugging.

```typescript
// Clear tenant context for admin operations
await db.setTenantContext(null, null);

// Query returns ALL documents across ALL tenants
const allDocs = await db.query('SELECT * FROM kb.documents');

// Drill into specific tenant for debugging
await db.setTenantContext('org123', 'proj456');
const tenantDocs = await db.query('SELECT * FROM kb.documents');
```

⚠️ **Security Note:** Admin endpoints should have strict access controls!

### Use Case 4: Testing with Tenant Isolation

**Scenario:** E2E tests need isolated tenant contexts to prevent interference.

```typescript
describe('DocumentService', () => {
  it('should isolate tenant data', async () => {
    // Test A: Create document in Tenant 1
    await db.setTenantContext('org1', 'proj1');
    const doc1 = await service.create({ title: 'Doc1' });

    // Test B: Create document in Tenant 2
    await db.setTenantContext('org2', 'proj2');
    const doc2 = await service.create({ title: 'Doc2' });

    // Verify isolation
    await db.setTenantContext('org1', 'proj1');
    const org1Docs = await service.findAll();
    expect(org1Docs).toHaveLength(1);
    expect(org1Docs[0].title).toBe('Doc1');

    await db.setTenantContext('org2', 'proj2');
    const org2Docs = await service.findAll();
    expect(org2Docs).toHaveLength(1);
    expect(org2Docs[0].title).toBe('Doc2');
  });
});
```

**See:** `docs/patterns/TESTING_TYPEORM.md` for comprehensive testing patterns.

---

## Testing with DatabaseService

### Unit Tests: Mock DatabaseService

```typescript
describe('SearchService', () => {
  let service: SearchService;
  let mockDb: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    mockDb = {
      query: jest.fn(),
      setTenantContext: jest.fn(),
      runWithTenantContext: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should execute search query with RLS', async () => {
    mockDb.query.mockResolvedValue({
      rows: [
        { id: 'chunk1', text: 'Result 1' },
        { id: 'chunk2', text: 'Result 2' },
      ],
      rowCount: 2,
    } as any);

    const results = await service.search('test query', 10);

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      ['test query', 10]
    );
    expect(results).toHaveLength(2);
  });
});
```

### Integration Tests: Real DatabaseService

```typescript
describe('DocumentService (Integration)', () => {
  let service: DocumentService;
  let db: DatabaseService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [DatabaseModule, TypeOrmModule.forRoot(testConfig)],
      providers: [DocumentService],
    }).compile();

    service = module.get(DocumentService);
    db = module.get(DatabaseService);
  });

  beforeEach(async () => {
    // Set up test tenant context
    await db.setTenantContext('test-org', 'test-project');
  });

  it('should isolate documents by tenant', async () => {
    // Create document in Tenant A
    await db.setTenantContext('org-a', 'proj-a');
    const docA = await service.create({ title: 'Doc A' });

    // Create document in Tenant B
    await db.setTenantContext('org-b', 'proj-b');
    const docB = await service.create({ title: 'Doc B' });

    // Verify Tenant A only sees their document
    await db.setTenantContext('org-a', 'proj-a');
    const docsA = await service.findAll();
    expect(docsA).toHaveLength(1);
    expect(docsA[0].id).toBe(docA.id);

    // Verify Tenant B only sees their document
    await db.setTenantContext('org-b', 'proj-b');
    const docsB = await service.findAll();
    expect(docsB).toHaveLength(1);
    expect(docsB[0].id).toBe(docB.id);
  });
});
```

### E2E Tests: Full RLS Stack

```typescript
describe('Documents API (E2E)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let authToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    db = module.get(DatabaseService);

    // Authenticate as test user
    authToken = await getTestAuthToken('test-user@example.com');
  });

  it('should enforce RLS on document list', async () => {
    // Seed data for two tenants
    await db.setTenantContext('org1', 'proj1');
    await db.query('INSERT INTO kb.documents (id, title) VALUES ($1, $2)', [
      'doc1',
      'Org1 Doc',
    ]);

    await db.setTenantContext('org2', 'proj2');
    await db.query('INSERT INTO kb.documents (id, title) VALUES ($1, $2)', [
      'doc2',
      'Org2 Doc',
    ]);

    // Request as Org1 user (auth token includes orgId/projectId claims)
    const response = await request(app.getHttpServer())
      .get('/api/projects/proj1/documents')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Should only see Org1 document
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe('doc1');
  });
});
```

---

## Best Practices

### ✅ DO: Set Tenant Context Early

```typescript
// ✅ GOOD: Set context in guard/interceptor before business logic
@Injectable()
export class TenantContextGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    await this.db.setTenantContext(
      request.user.organizationId,
      request.params.projectId
    );
    return true;
  }
}
```

### ✅ DO: Use runWithTenantContext for Temporary Switches

```typescript
// ✅ GOOD: Context automatically restored after block
await db.runWithTenantContext(otherOrgId, otherProjectId, async () => {
  await service.doSomething();
});
// Original context restored here
```

### ✅ DO: Use Wildcard Context for Cross-Tenant Operations

```typescript
// ✅ GOOD: Clear context for admin/background operations
await db.setTenantContext(null, null);
const allJobs = await db.query(
  'SELECT * FROM kb.extraction_jobs WHERE status = $1',
  ['pending']
);
```

### ✅ DO: Use TypeORM for Simple CRUD

```typescript
// ✅ GOOD: Type-safe CRUD (RLS still enforced!)
const document = await documentRepository.findOne({ where: { id: docId } });
document.title = 'Updated Title';
await documentRepository.save(document);
```

### ✅ DO: Use DatabaseService for PostgreSQL Features

```typescript
// ✅ GOOD: Advisory lock, pgcrypto, full-text search
await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
const results = await db.query(
  'SELECT * FROM kb.chunks WHERE tsv @@ websearch_to_tsquery($1)',
  [query]
);
```

### ✅ DO: Release Clients in Finally Blocks

```typescript
// ✅ GOOD: Always release in finally
const client = await db.getClient();
try {
  await client.query('BEGIN');
  // ... operations
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release(); // Always release!
}
```

### ✅ DO: Test Tenant Isolation

```typescript
// ✅ GOOD: Verify RLS isolation in tests
it('should isolate tenant data', async () => {
  await db.setTenantContext('org1', 'proj1');
  const doc1 = await service.create({ title: 'Doc1' });

  await db.setTenantContext('org2', 'proj2');
  const docs = await service.findAll();

  expect(docs).not.toContainEqual(expect.objectContaining({ id: doc1.id }));
});
```

---

## Anti-Patterns

### ❌ DON'T: Forget to Set Tenant Context

```typescript
// ❌ BAD: No tenant context set - returns ALL data!
const documents = await documentRepository.find();

// ✅ GOOD: Set context first
await db.setTenantContext(orgId, projectId);
const documents = await documentRepository.find();
```

### ❌ DON'T: Hardcode Tenant IDs in Queries

```typescript
// ❌ BAD: Hardcoding organization_id defeats RLS purpose
const docs = await db.query(
  'SELECT * FROM kb.documents WHERE organization_id = $1',
  [orgId]
);

// ✅ GOOD: Let RLS handle filtering
await db.setTenantContext(orgId, projectId);
const docs = await db.query('SELECT * FROM kb.documents');
```

**Why?** RLS policies are enforced at database level. Hardcoding IDs:

- Duplicates filtering logic
- Can diverge from RLS policy definitions
- Doesn't leverage database security

### ❌ DON'T: Use SET SESSION Instead of SET LOCAL

```typescript
// ❌ BAD: Session-level variables persist across transactions
await client.query("SET SESSION app.current_organization_id = 'org1'");

// ✅ GOOD: Transaction-level variables auto-reset
await client.query(
  "SELECT set_config('app.current_organization_id', 'org1', false)"
);
```

**Why?** `SET SESSION` persists for entire connection lifetime. With connection pooling, subsequent requests reuse connections → wrong tenant context!

### ❌ DON'T: Forget to Release Clients

```typescript
// ❌ BAD: Client never released - pool exhaustion!
const client = await db.getClient();
await client.query('BEGIN');
// ... operations
await client.query('COMMIT');
// Oops, forgot client.release()!

// ✅ GOOD: Always release in finally
const client = await db.getClient();
try {
  await client.query('BEGIN');
  // ... operations
  await client.query('COMMIT');
} finally {
  client.release();
}
```

### ❌ DON'T: Mix Database Connections

```typescript
// ❌ BAD: Using different pool than DatabaseService
import { Pool } from 'pg';
const myPool = new Pool({
  /* config */
});
const result = await myPool.query('SELECT * FROM kb.documents');
// RLS not enforced!

// ✅ GOOD: Use DatabaseService (RLS enforced)
const result = await db.query('SELECT * FROM kb.documents');
```

### ❌ DON'T: Bypass RLS Without Reason

```typescript
// ❌ BAD: Using raw pool for business logic
const pool = db.getPool();
const docs = await pool.query('SELECT * FROM kb.documents');
// No RLS enforcement!

// ✅ GOOD: Use raw pool only for pre-auth operations
const pool = db.getPool();
const user = await pool.query(
  'SELECT id FROM core.user_profiles WHERE zitadel_user_id = $1',
  [zitadelUserId]
);
```

**When to use `getPool()`:**

- User authentication (before tenant context exists)
- System health checks
- Database migrations
- **Never for business logic!**

### ❌ DON'T: Assume Context Persists Across Async Boundaries

```typescript
// ❌ BAD: Context may not persist
await db.setTenantContext('org1', 'proj1');

setTimeout(async () => {
  // Context lost! AsyncLocalStorage not propagated
  await db.query('SELECT * FROM kb.documents');
}, 1000);

// ✅ GOOD: Use runWithTenantContext for explicit scope
await db.runWithTenantContext('org1', 'proj1', async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await db.query('SELECT * FROM kb.documents');
});
```

---

## Troubleshooting

### Problem: Queries Return Empty Results

**Symptoms:**

```typescript
const docs = await documentRepository.find();
console.log(docs); // []
```

**Possible Causes:**

1. **Tenant context not set**

   ```typescript
   // Check current context
   const client = await db.getClient();
   const result = await client.query(`
     SELECT current_setting('app.current_organization_id', true),
            current_setting('app.current_project_id', true)
   `);
   console.log(result.rows[0]);
   // { current_setting: '', current_setting: '' } ← Empty = wildcard context
   ```

   **Fix:** Set tenant context before queries

   ```typescript
   await db.setTenantContext(orgId, projectId);
   ```

2. **Wrong tenant context**

   ```typescript
   await db.setTenantContext('wrong-org', 'wrong-project');
   const docs = await documentRepository.find(); // Empty (no docs in this tenant)
   ```

   **Fix:** Verify orgId/projectId are correct

3. **RLS policies too restrictive**

   ```typescript
   // Check if RLS policy allows SELECT
   const policies = await db.query(`
     SELECT * FROM pg_policies 
     WHERE schemaname = 'kb' AND tablename = 'documents'
   `);
   console.log(policies.rows);
   ```

   **Fix:** Review RLS policy definitions in migrations

### Problem: Tests Interfere with Each Other

**Symptoms:**

```typescript
it('test A', async () => {
  await db.setTenantContext('org1', 'proj1');
  const doc = await service.create({ title: 'Doc A' });
});

it('test B', async () => {
  await db.setTenantContext('org2', 'proj2');
  const docs = await service.findAll();
  console.log(docs); // Contains doc from test A! ❌
});
```

**Cause:** Tests not properly isolated (shared database state)

**Fix 1:** Use transactions for test isolation

```typescript
beforeEach(async () => {
  await db.query('BEGIN');
});

afterEach(async () => {
  await db.query('ROLLBACK');
});
```

**Fix 2:** Use unique tenant IDs per test

```typescript
it('test A', async () => {
  const orgId = `test-org-${uuidv4()}`;
  await db.setTenantContext(orgId, 'proj1');
  // ...
});
```

**Fix 3:** Clean up test data

```typescript
afterEach(async () => {
  await db.setTenantContext('test-org', 'test-proj');
  await db.query('DELETE FROM kb.documents');
});
```

### Problem: Connection Pool Exhausted

**Symptoms:**

```
Error: Connection pool exhausted
  at Pool.connect()
```

**Cause:** Clients not released after use

**Fix:** Always release clients in `finally` blocks

```typescript
const client = await db.getClient();
try {
  await client.query('BEGIN');
  // ... operations
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release(); // ← Critical!
}
```

**Debug:** Check active connections

```typescript
const active = await db.query(`
  SELECT count(*) FROM pg_stat_activity 
  WHERE datname = current_database()
`);
console.log('Active connections:', active.rows[0].count);
```

### Problem: RLS Not Enforced (Returns All Data)

**Symptoms:**

```typescript
await db.setTenantContext('org1', 'proj1');
const docs = await documentRepository.find();
console.log(docs.length); // 1000+ (all tenants' documents!)
```

**Possible Causes:**

1. **Using bypass role**

   ```typescript
   const role = await db.query(
     'SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user'
   );
   console.log(role.rows[0]);
   // { current_user: 'postgres', rolbypassrls: true } ← BYPASS!
   ```

   **Fix:** Ensure `switchToRlsApplicationRole()` completed successfully

   ```typescript
   // Check logs for:
   // [DatabaseService] Now running as role 'app_rls' (bypass=false)
   ```

2. **RLS not enabled on table**

   ```typescript
   const rlsStatus = await db.query(`
     SELECT tablename, rowsecurity 
     FROM pg_tables 
     WHERE schemaname = 'kb' AND tablename = 'documents'
   `);
   console.log(rlsStatus.rows[0]);
   // { tablename: 'documents', rowsecurity: false } ← RLS DISABLED!
   ```

   **Fix:** Enable RLS in migration

   ```sql
   ALTER TABLE kb.documents ENABLE ROW LEVEL SECURITY;
   ALTER TABLE kb.documents FORCE ROW LEVEL SECURITY;
   ```

3. **Missing RLS policies**

   ```typescript
   const policies = await db.query(`
     SELECT * FROM pg_policies 
     WHERE schemaname = 'kb' AND tablename = 'documents'
   `);
   console.log(policies.rows); // [] ← NO POLICIES!
   ```

   **Fix:** Create RLS policies in migration

   ```sql
   CREATE POLICY documents_select ON kb.documents FOR SELECT
   USING (organization_id = current_setting('app.current_organization_id')::uuid);
   ```

### Problem: AsyncLocalStorage Context Lost

**Symptoms:**

```typescript
await db.setTenantContext('org1', 'proj1');

setTimeout(async () => {
  const docs = await db.query('SELECT * FROM kb.documents');
  console.log(docs.rows); // All documents (context lost!)
}, 100);
```

**Cause:** AsyncLocalStorage doesn't propagate through `setTimeout`/`setInterval`

**Fix:** Use `runWithTenantContext` for explicit scope

```typescript
await db.runWithTenantContext('org1', 'proj1', async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const docs = await db.query('SELECT * FROM kb.documents');
  console.log(docs.rows); // Correct (context preserved)
});
```

### Problem: Migration Fails on Startup

**Symptoms:**

```
[DatabaseService] ✗ Database migrations failed after 5000ms
Error: Migration "AddRlsPolicies1234567890" failed
```

**Possible Causes:**

1. **Database not ready**

   - Docker container still starting
   - Network connectivity issues

   **Fix:** Increase wait timeout

   ```typescript
   await this.waitForDatabase(maxAttempts: 60); // Wait up to 60 seconds
   ```

2. **Migration syntax error**

   ```sql
   -- Migration file has SQL syntax error
   CREATE TABLE kb.documents (
     id uuid PRIMARY KEY,
     title text NOT NULL
     -- Missing comma! ❌
     content text
   );
   ```

   **Fix:** Test migration locally first

   ```bash
   npm run migration:run
   ```

3. **Migration already applied manually**

   ```
   Error: relation "kb.documents" already exists
   ```

   **Fix:** Skip migrations if needed

   ```bash
   SKIP_MIGRATIONS=1 npm start
   ```

---

## Summary

### DatabaseService Provides

✅ **Automatic RLS enforcement** - Every query filtered by tenant  
✅ **Request isolation** - AsyncLocalStorage prevents context clobbering  
✅ **Security by default** - Database enforces policies even if code has bugs  
✅ **PostgreSQL features** - Advisory locks, pgcrypto, full-text search  
✅ **Operational safety** - Migrations, health checks, policy verification

### When to Use Each Tool

| Task                 | Use                       | Why                       |
| -------------------- | ------------------------- | ------------------------- |
| Simple CRUD          | TypeORM Repository        | Type safety + convenience |
| Complex SQL          | DatabaseService           | PostgreSQL features + RLS |
| Transactions + Locks | DatabaseService           | Advisory locks + RLS      |
| Encryption           | DatabaseService           | pgcrypto extension        |
| Graph Traversal      | DatabaseService           | Recursive CTEs + RLS      |
| Queue Operations     | DatabaseService           | SKIP LOCKED + RLS         |
| Pre-Authentication   | DatabaseService.getPool() | No RLS context yet        |

### Key Takeaways

1. **DatabaseService is NOT redundant with TypeORM** - it provides critical multi-tenant infrastructure
2. **Always set tenant context** before business logic executes
3. **Use AsyncLocalStorage** for request isolation (already built-in!)
4. **Test tenant isolation** to prevent data leakage bugs
5. **Release clients** in finally blocks to prevent pool exhaustion
6. **Prefer hybrid approach** (TypeORM + DatabaseService) for best of both worlds

---

## Related Documentation

- [STRATEGIC_SQL_PATTERNS.md](./STRATEGIC_SQL_PATTERNS.md) - When and how to use raw SQL
- [TESTING_TYPEORM.md](./TESTING_TYPEORM.md) - Comprehensive testing patterns
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Developer guidelines and decision trees
- [TYPEORM_MIGRATION_SUMMARY.md](../migrations/TYPEORM_MIGRATION_SUMMARY.md) - Migration strategy and progress

---

**Questions or Issues?**

If you encounter problems not covered in this guide:

1. Check existing patterns in services like GraphService, SearchService, TagService
2. Review RLS policy definitions in recent migrations
3. Ask in team chat or create a GitHub issue

**Remember:** When in doubt, set tenant context early and use DatabaseService for PostgreSQL-specific features!
