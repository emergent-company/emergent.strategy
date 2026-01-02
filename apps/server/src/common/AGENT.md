# Common Utilities - AI Agent Guide

This guide documents shared backend utilities in `apps/server/src/common/`. These utilities provide cross-cutting concerns for all NestJS modules.

## Quick Reference

| Category       | Key Exports                                                 | When to Use                                  |
| -------------- | ----------------------------------------------------------- | -------------------------------------------- |
| **Decorators** | `@RequireProjectId`, `@RequireUserId`, `@ApiStandardErrors` | Extract request context, document API errors |
| **Database**   | `DatabaseService`, `hybridSearch`, `acquireAdvisoryLock`    | All database operations, RLS-aware queries   |
| **Job Queue**  | `BaseJobQueueService`                                       | Background job processing with retry         |
| **Chunking**   | `ChunkingStrategyFactory`                                   | Document text splitting for embeddings       |
| **Pipes**      | `UuidParamPipe`                                             | Validate UUID route parameters               |
| **Filters**    | `GlobalHttpExceptionFilter`                                 | Consistent error responses                   |
| **Middleware** | `ViewAsMiddleware`                                          | Superadmin impersonation                     |

---

## 1. Decorators (`decorators/`)

### Project Context Decorator

Extracts tenant context from request headers. **REQUIRED** for most endpoints.

```typescript
import { RequireProjectId, ProjectContext } from '@/common/decorators';

@Get()
async list(@RequireProjectId() ctx: ProjectContext) {
  // ctx.projectId is guaranteed to exist
  // ctx.orgId is optional unless requireOrg: true
  return this.service.list(ctx.projectId);
}

// Require both org and project
@Post()
async create(@RequireProjectId({ requireOrg: true }) ctx: ProjectContext) {
  return this.service.create(ctx.projectId, ctx.orgId!);
}
```

### Optional Project Context

For endpoints where tenant context is optional:

```typescript
import { OptionalProjectId, OptionalProjectContext } from '@/common/decorators';

@Get()
async list(@OptionalProjectId() ctx: OptionalProjectContext) {
  if (ctx.projectId) {
    return this.service.listForProject(ctx.projectId);
  }
  return this.service.listAll();
}
```

### User Context Decorators

```typescript
import { RequireUserId, RequireUserSubject, UserSubjectContext } from '@/common/decorators';

// Get internal database UUID
@Get('profile')
async getProfile(@RequireUserId() userId: string) {
  return this.profileService.get(userId);
}

// Get external Zitadel subject (for auth provider operations)
@Post('delete-account')
async deleteAccount(@RequireUserSubject() user: UserSubjectContext) {
  // user.subject = Zitadel external ID
  // user.email = optional email from token
  return this.deletionService.delete(user.subject);
}
```

### API Standard Errors

Documents common error responses in OpenAPI. Apply to controllers or methods:

```typescript
import { ApiStandardErrors } from '@/common/decorators';

@Controller('objects')
@ApiStandardErrors({ notFound: true })  // Adds 400, 401, 403, 404, 500
export class ObjectsController {
  // ...
}

// Or per-method
@Get(':id')
@ApiStandardErrors({ notFound: true })
async findOne(@Param('id') id: string) { ... }
```

| Option         | Default | Description          |
| -------------- | ------- | -------------------- |
| `notFound`     | `false` | Include 404 response |
| `unauthorized` | `true`  | Include 401 response |
| `forbidden`    | `true`  | Include 403 response |

---

## 2. Database Service (`database/`)

### Core Database Service

The `DatabaseService` is the **primary database access layer**. It handles:

- Connection pooling via TypeORM
- Row-Level Security (RLS) context management
- Automatic migrations on startup
- Tenant isolation

```typescript
import { DatabaseService } from '@/common/database/database.service';

@Injectable()
export class MyService {
  constructor(private readonly db: DatabaseService) {}

  // Simple query
  async findAll() {
    const result = await this.db.query<MyRow>(
      'SELECT * FROM kb.my_table WHERE project_id = $1',
      [projectId]
    );
    return result.rows;
  }

  // Query with not-found handling
  async findOne(id: string) {
    return this.db.queryOneOrFail<MyRow>(
      'SELECT * FROM kb.my_table WHERE id = $1',
      [id],
      `Entity ${id} not found`
    );
  }

  // Transaction with automatic rollback
  async createWithRelations(data: CreateDto) {
    return this.db.withTransaction(async (client) => {
      const obj = await client.query('INSERT INTO kb.objects ...', [...]);
      await client.query('INSERT INTO kb.relationships ...', [...]);
      return obj.rows[0];
    });
  }
}
```

### Setting Tenant Context

RLS policies filter data based on session variables. Set context before queries:

```typescript
// Set for subsequent queries (persists until changed)
await this.db.setTenantContext(orgId, projectId);

// Run function with temporary context (auto-restores after)
const result = await this.db.runWithTenantContext(projectId, async () => {
  return await this.db.query('SELECT * FROM kb.objects');
});
```

### SQL Pattern Utilities

#### Hybrid Search

Combines lexical (FTS) and vector (embedding) search with score fusion:

```typescript
import {
  hybridSearch,
  HybridSearchConfig,
} from '@/common/database/sql-patterns';

const results = await hybridSearch<ChunkResult>(this.db, {
  lexicalQuery: `
    SELECT id, document_id, text, ts_rank(tsv, websearch_to_tsquery('simple', $1)) as score
    FROM kb.chunks
    WHERE tsv @@ websearch_to_tsquery('simple', $1)
    ORDER BY score DESC LIMIT $2
  `,
  lexicalParams: [query, limit * 2],
  vectorQuery: `
    SELECT id, document_id, text, (1 - (embedding <=> $1::vector)) as score
    FROM kb.chunks
    ORDER BY embedding <=> $1::vector LIMIT $2
  `,
  vectorParams: [vectorString, limit * 2],
  lexicalWeight: 0.55, // Favor lexical slightly
  vectorWeight: 0.45,
  normalization: 'zscore', // or 'minmax'
  applySigmoid: true, // Bound scores to [0,1]
});
```

#### Advisory Locks

Prevent race conditions in concurrent operations:

```typescript
import { acquireAdvisoryLock, acquireAdvisoryLockInTransaction } from '@/common/database/sql-patterns';

// Full transaction management
const client = await this.db.getClient();
try {
  const tag = await acquireAdvisoryLock(
    client,
    `tag|${projectId}|${name.toLowerCase()}`,  // Lock key
    async () => {
      // Check for duplicates inside lock
      const existing = await client.query('SELECT id FROM kb.tags WHERE ...');
      if (existing.rowCount) throw new ConflictException('exists');

      // Insert (protected by lock)
      return await client.query('INSERT INTO kb.tags ...', [...]);
    }
  );
} finally {
  await client.release();
}

// When already in a transaction
await acquireAdvisoryLockInTransaction(client, 'resource-key', async () => {
  // Critical section
});
```

---

## 3. Job Queue (`job-queue/`)

### Base Job Queue Service

Abstract class for background job processing with:

- Idempotent enqueue (no duplicate active jobs)
- Atomic dequeue with `FOR UPDATE SKIP LOCKED`
- Exponential backoff retries
- Stale job recovery

```typescript
import {
  BaseJobQueueService,
  JobQueueConfig,
  BaseJobEntity,
  BaseJobRow,
} from '@/common/job-queue';

interface MyJobEntity extends BaseJobEntity {
  targetId: string;
}

interface MyJobRow extends BaseJobRow {
  target_id: string;
}

@Injectable()
export class MyJobsService extends BaseJobQueueService<MyJobEntity, MyJobRow> {
  constructor(
    @InjectRepository(MyJobEntity) repository: Repository<MyJobEntity>,
    dataSource: DataSource,
    db: DatabaseService
  ) {
    super(repository, dataSource, db, {
      tableName: 'kb.my_jobs',
      entityIdField: 'targetId', // Entity property name
      entityIdColumn: 'target_id', // Database column name
      maxAttempts: 5, // Max retries before permanent failure
      baseRetryDelaySec: 60, // Initial retry delay
      maxRetryDelaySec: 3600, // Max retry delay (1 hour)
    });
  }

  protected toRow(entity: MyJobEntity): MyJobRow {
    return {
      ...this.toBaseRow(entity),
      target_id: entity.targetId,
    };
  }
}
```

### Using the Job Queue

```typescript
// Enqueue a job (idempotent)
const job = await this.jobsService.enqueue(entityId, {
  priority: 10, // Higher = more urgent
  scheduleAt: new Date(Date.now() + 60000), // Delay 1 minute
});

// Worker: dequeue batch
const jobs = await this.jobsService.dequeue(10);
for (const job of jobs) {
  try {
    await this.processJob(job);
    await this.jobsService.markCompleted(job.id);
  } catch (error) {
    await this.jobsService.markFailed(job.id, error);
  }
}

// Recovery: reset stale jobs stuck in 'processing'
const recovered = await this.jobsService.recoverStaleJobs(10); // 10 minutes threshold

// Statistics
const stats = await this.jobsService.stats();
// { pending: 5, processing: 2, failed: 1, completed: 100 }
```

---

## 4. Chunking Utilities (`utils/chunking/`)

### Chunking Strategy Factory

Split documents for embedding generation:

```typescript
import {
  ChunkingStrategyFactory,
  ChunkingOptions,
} from '@/common/utils/chunking';

// Get strategy by name
const strategy = ChunkingStrategyFactory.getStrategy('sentence');

// Chunk text
const chunks = strategy.chunk(documentText, {
  maxChunkSize: 1200, // Max chars per chunk
  minChunkSize: 100, // Prevent tiny chunks
});

// Each chunk has:
// - text: string
// - startOffset: number (position in original)
// - endOffset: number
// - boundaryType: 'character' | 'sentence' | 'paragraph' | 'section'
```

### Available Strategies

| Strategy    | Boundary                 | Best For                     |
| ----------- | ------------------------ | ---------------------------- |
| `character` | Fixed character count    | Default, backward compatible |
| `sentence`  | Sentence endings (`.!?`) | Prose, articles              |
| `paragraph` | Double newlines, headers | Structured documents         |

```typescript
// Check valid strategy
if (ChunkingStrategyFactory.isValidStrategy(userInput)) {
  const strategy = ChunkingStrategyFactory.getStrategy(userInput);
}

// List available
const strategies = ChunkingStrategyFactory.getAvailableStrategies();
// ['character', 'sentence', 'paragraph']
```

---

## 5. Pipes (`pipes/`)

### UUID Parameter Validation

Validates UUID format before hitting database (avoids 22P02 errors):

```typescript
import { UuidParamPipe } from '@/common/pipes/uuid-param.pipe';

@Get(':id')
async findOne(
  @Param('id', new UuidParamPipe({ paramName: 'id' })) id: string
) {
  // id is guaranteed to be valid UUID format, lowercased
}

// Nullable variant
@Get()
async list(
  @Query('parent', new UuidParamPipe({ nullable: true, paramName: 'parent' }))
  parentId?: string
) {
  // parentId may be undefined
}
```

---

## 6. Filters (`filters/`)

### Global HTTP Exception Filter

Standardizes all error responses to envelope format:

```json
{
  "error": {
    "code": "not-found",
    "message": "Entity abc123 not found",
    "details": { ... }
  }
}
```

**Auto-applied globally** - no action needed. Error codes:

| Status | Code                                 |
| ------ | ------------------------------------ |
| 400    | `bad-request` or `validation-failed` |
| 401    | `unauthorized`                       |
| 403    | `forbidden`                          |
| 404    | `not-found`                          |
| 409    | `conflict`                           |
| 422    | `validation-failed`                  |
| 429    | `rate-limited`                       |
| 500    | `internal`                           |
| 503    | `upstream-unavailable`               |

5xx errors are automatically logged to `logs/errors.log` with full context.

---

## 7. Middleware (`middleware/`)

### View-As Middleware

Enables superadmin user impersonation via `X-View-As-User-ID` header:

```typescript
// Middleware sets req.viewAsUser and req.superadminUser
// Use in guards/services:
const effectiveUserId = req.viewAsUser?.id ?? req.user.id;
```

Requirements:

- Authenticated user must be superadmin
- Target user must exist
- Header must be valid UUID

---

## 8. Interceptors (`interceptors/`)

### HTTP Logger Interceptor

Logs all HTTP requests to `logs/server/server.http.log`:

```
2025-01-02T12:00:00.000Z 127.0.0.1 POST /api/objects 201 45ms "Mozilla/5.0..." [req-abc123]
```

Configuration:

- `HTTP_LOG_ENABLED=false` - Disable logging
- `HTTP_LOG_PATH=/custom/path.log` - Custom log path

---

## 9. Configuration (`config/`)

### AppConfigService

Centralized configuration access. Key properties:

```typescript
@Injectable()
export class MyService {
  constructor(private readonly config: AppConfigService) {}

  async process() {
    // Database
    if (this.config.skipDb) return; // SKIP_DB=true

    // Embeddings
    if (this.config.embeddingsEnabled) {
      const dim = this.config.embeddingDimension; // 1536 default
    }

    // Chat/LLM
    if (this.config.chatModelEnabled) {
      const projectId = this.config.gcpProjectId;
    }

    // Extraction pipeline
    const mode = this.config.extractionPipelineMode; // 'single_pass' | 'langgraph'
    const chunkSize = this.config.extractionChunkSize; // 30000 default

    // Observability
    if (this.config.langfuseEnabled) {
      // Use langfuse tracing
    }
  }
}
```

---

## Decision Table: Which Utility to Use

| Scenario                             | Utility                                             |
| ------------------------------------ | --------------------------------------------------- |
| Need project/org from headers        | `@RequireProjectId` decorator                       |
| Need authenticated user ID           | `@RequireUserId` decorator                          |
| Database query with tenant isolation | `DatabaseService.query()` with `setTenantContext()` |
| Query that must return 1 row         | `DatabaseService.queryOneOrFail()`                  |
| Transaction with multiple writes     | `DatabaseService.withTransaction()`                 |
| Prevent duplicate inserts            | `acquireAdvisoryLock()`                             |
| Search with lexical + vector         | `hybridSearch()`                                    |
| Background job processing            | Extend `BaseJobQueueService`                        |
| Split document for embeddings        | `ChunkingStrategyFactory.getStrategy()`             |
| Validate UUID route param            | `UuidParamPipe`                                     |
| Document API error responses         | `@ApiStandardErrors`                                |

---

## Anti-Patterns

| Anti-Pattern                          | Correct Approach                       |
| ------------------------------------- | -------------------------------------- |
| Raw `this.dataSource.query()`         | Use `DatabaseService.query()` for RLS  |
| Manual header extraction              | Use `@RequireProjectId` decorator      |
| Duplicating error response docs       | Use `@ApiStandardErrors`               |
| `catch(e) {}` in job handlers         | Use `markFailed()` for retry logic     |
| `WHERE id = '${id}'`                  | Parameterized: `WHERE id = $1`, `[id]` |
| Skipping advisory lock for uniqueness | Use `acquireAdvisoryLock()`            |
| Custom UUID validation                | Use `UuidParamPipe`                    |

---

## File Index

```
common/
├── config/
│   ├── config.module.ts       # ConfigModule provider
│   ├── config.schema.ts       # Zod schema for env vars
│   └── config.service.ts      # AppConfigService
├── database/
│   ├── database.module.ts     # DatabaseModule provider
│   ├── database.service.ts    # DatabaseService (main DB access)
│   └── sql-patterns/
│       ├── advisory-lock.util.ts  # Advisory lock helpers
│       ├── hybrid-search.util.ts  # Hybrid search fusion
│       └── index.ts
├── decorators/
│   ├── api-standard-errors.ts    # @ApiStandardErrors
│   ├── project-context.decorator.ts  # @RequireProjectId, @OptionalProjectId, @RequireUserId
│   └── index.ts
├── filters/
│   └── http-exception.filter.ts  # GlobalHttpExceptionFilter
├── interceptors/
│   ├── http-logger.interceptor.ts     # Request logging
│   ├── activity-tracking.interceptor.ts
│   ├── caching.interceptor.ts
│   ├── database-readiness.interceptor.ts
│   ├── tracing.interceptor.ts
│   └── view-as-response.interceptor.ts
├── job-queue/
│   ├── base-job-queue.service.ts  # BaseJobQueueService
│   └── index.ts
├── middleware/
│   ├── view-as.middleware.ts      # ViewAsMiddleware
│   └── response-debug.middleware.ts
├── pipes/
│   └── uuid-param.pipe.ts         # UuidParamPipe
├── utils/
│   ├── chunking/
│   │   ├── character-chunking.strategy.ts
│   │   ├── chunking-strategy.factory.ts
│   │   ├── chunking.types.ts
│   │   ├── paragraph-chunking.strategy.ts
│   │   ├── sentence-chunking.strategy.ts
│   │   └── index.ts
│   ├── chunker.service.ts
│   ├── hash.service.ts
│   ├── timing.utils.ts
│   ├── utils.module.ts
│   └── index.ts
└── tracing/
    ├── tracing.module.ts
    └── index.ts
```
