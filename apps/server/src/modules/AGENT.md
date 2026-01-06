# NestJS Module Patterns for AI Assistants

This document helps AI assistants understand the backend module architecture and follow established patterns.

**Total modules: 45** (see full list in "Existing Modules" section below)

## Module Architecture

Each feature follows the **Module → Controller → Service → Repository** pattern:

```
modules/
├── documents/
│   ├── documents.module.ts      # Module definition
│   ├── documents.controller.ts  # HTTP endpoints
│   ├── documents.service.ts     # Business logic
│   └── dto/                     # Request/Response DTOs
│       ├── document.dto.ts
│       └── create-document.dto.ts
```

## Module Structure Pattern

```typescript
// feature.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureController } from './feature.controller';
import { FeatureService } from './feature.service';
import { Feature } from '../../entities/feature.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Feature]), // Register entities
    AuthModule, // Auth for guards
    // Other dependent modules
  ],
  controllers: [FeatureController],
  providers: [FeatureService],
  exports: [FeatureService], // Export if other modules need it
})
export class FeatureModule {}
```

## Controller Pattern

```typescript
// feature.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiBody } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import {
  RequireProjectId,
  ProjectContext,
} from '../../common/decorators/project-context.decorator';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { FeatureService } from './feature.service';
import { FeatureDto } from './dto/feature.dto';

@ApiTags('Features')
@Controller('features')
@UseGuards(AuthGuard, ScopesGuard)
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Get()
  @ApiOkResponse({ type: FeatureDto, isArray: true })
  @ApiStandardErrors()
  @Scopes('features:read')
  async list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @RequireProjectId() ctx?: ProjectContext
  ) {
    const n = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)
      : 100;
    return this.featureService.list(n, cursor, { projectId: ctx!.projectId });
  }

  @Get(':id')
  @ApiOkResponse({ type: FeatureDto })
  @ApiStandardErrors()
  @Scopes('features:read')
  async get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    const item = await this.featureService.get(id, {
      projectId: ctx.projectId,
    });
    if (!item) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Feature not found' },
      });
    }
    return item;
  }

  @Post()
  @ApiBody({ type: CreateFeatureDto })
  @ApiOkResponse({ type: FeatureDto })
  @ApiStandardErrors()
  @Scopes('features:write')
  async create(
    @Body() body: CreateFeatureDto,
    @RequireProjectId() ctx: ProjectContext
  ) {
    return this.featureService.create(body, { projectId: ctx.projectId });
  }
}
```

## Service Pattern

```typescript
// feature.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { Feature } from '../../entities/feature.entity';
import { FeatureDto } from './dto/feature.dto';

@Injectable()
export class FeatureService {
  private readonly logger = new Logger(FeatureService.name);

  constructor(
    @InjectRepository(Feature)
    private readonly featureRepository: Repository<Feature>,
    private readonly dataSource: DataSource,
    private readonly db: DatabaseService // For RLS-aware queries
  ) {}

  async list(
    limit = 100,
    cursor?: string,
    filter?: { projectId?: string }
  ): Promise<{ items: FeatureDto[]; nextCursor: string | null }> {
    // Use DatabaseService for RLS context
    const queryFn = async () => {
      const result = await this.db.query(
        `SELECT * FROM kb.features ORDER BY created_at DESC LIMIT $1`,
        [limit + 1]
      );
      return result.rows;
    };

    const rows = filter?.projectId
      ? await this.db.runWithTenantContext(filter.projectId, queryFn)
      : await queryFn();

    // ... cursor pagination logic
    return { items: rows.map(this.mapRow), nextCursor: null };
  }

  async get(
    id: string,
    filter?: { projectId?: string }
  ): Promise<FeatureDto | null> {
    const queryFn = async () => {
      const result = await this.db.query(
        `SELECT * FROM kb.features WHERE id = $1`,
        [id]
      );
      return result.rows[0] || null;
    };

    const row = filter?.projectId
      ? await this.db.runWithTenantContext(filter.projectId, queryFn)
      : await queryFn();

    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: any): FeatureDto {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      // ... map other fields
    };
  }
}
```

## DTO Pattern

```typescript
// dto/feature.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class FeatureDto {
  @ApiProperty({ example: 'uuid-here' })
  id!: string;

  @ApiProperty({ example: 'Feature Name' })
  name!: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ required: false, nullable: true, example: 'Optional field' })
  description?: string | null;
}

// dto/create-feature.dto.ts
import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class CreateFeatureDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}
```

## Key Patterns to Follow

### 1. Always Use Guards

```typescript
@UseGuards(AuthGuard, ScopesGuard)  // On class or method
@Scopes('resource:read')            // Required scopes
```

### 2. Use Project Context

```typescript
// Get project context for multi-tenant queries
@RequireProjectId() ctx: ProjectContext

// Use in service calls
await this.service.list({ projectId: ctx.projectId });
```

### 3. Use DatabaseService for RLS

```typescript
// ✅ CORRECT: Use DatabaseService for RLS-aware queries
const result = await this.db.runWithTenantContext(projectId, async () => {
  return this.db.query('SELECT * FROM kb.table WHERE ...');
});

// ❌ WRONG: Direct repository queries bypass RLS
const result = await this.featureRepository.find();
```

### 4. Error Responses

```typescript
// ✅ CORRECT: Standard error format
throw new NotFoundException({
  error: { code: 'not-found', message: 'Feature not found' },
});

throw new BadRequestException({
  error: { code: 'bad-request', message: 'Invalid input' },
});

// ❌ WRONG: Plain error messages
throw new NotFoundException('Not found');
```

### 5. Cursor Pagination

```typescript
// Service method
async list(limit: number, cursor?: { createdAt: string; id: string }) {
  // Fetch limit + 1 to detect hasMore
  const rows = await this.query(limit + 1, cursor);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({
        createdAt: slice[slice.length - 1].created_at,
        id: slice[slice.length - 1].id,
      })).toString('base64url')
    : null;

  return { items: slice, nextCursor };
}

// Controller
@Get()
async list(@Query('cursor') cursor?: string) {
  const decoded = cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString()) : undefined;
  return this.service.list(100, decoded);
}
```

### 6. API Documentation

```typescript
@ApiTags('Features')                    // Group in Swagger
@ApiOkResponse({ type: FeatureDto })    // Response type
@ApiBody({ type: CreateFeatureDto })    // Request body type
@ApiStandardErrors()                    // Standard error responses
@ApiParam({ name: 'id', description: 'Feature UUID' })
@ApiQuery({ name: 'limit', required: false })
```

## Existing Modules (Reference)

### Core Domain

| Module             | Description                  | Key Patterns                            |
| ------------------ | ---------------------------- | --------------------------------------- |
| `documents`        | Document CRUD + chunking     | Cursor pagination, RLS, extraction jobs |
| `chunks`           | Document chunk management    | Embedding jobs, vector storage          |
| `graph`            | Knowledge graph CRUD         | Complex queries, versioning, branches   |
| `graph-search`     | Graph traversal & search     | BFS/DFS traversal, relationship queries |
| `search`           | Vector/lexical search        | Hybrid search, embeddings               |
| `unified-search`   | Cross-entity search          | Search across docs, objects, chunks     |
| `external-sources` | External document sources    | URL ingestion, sync workers             |
| `ingestion`        | Document processing pipeline | Chunking, extraction orchestration      |

### Authentication & Authorization

| Module          | Description              | Key Patterns                     |
| --------------- | ------------------------ | -------------------------------- |
| `auth`          | Token validation         | Guards, Zitadel integration      |
| `auth-password` | Password management      | Reset flows, validation          |
| `superadmin`    | System-wide admin access | SuperadminGuard, email templates |

### Multi-tenancy

| Module     | Description             | Key Patterns              |
| ---------- | ----------------------- | ------------------------- |
| `orgs`     | Organization management | Multi-tenant, memberships |
| `projects` | Project management      | Org scoping, members      |
| `invites`  | Membership invitations  | Token-based invite flow   |

### Chat & AI

| Module              | Description                | Key Patterns                    |
| ------------------- | -------------------------- | ------------------------------- |
| `chat`              | AI chat conversations      | SSE streaming, Langfuse tracing |
| `chat-sdk`          | Vercel AI SDK integration  | Tool use, structured output     |
| `chat-ui`           | Chat message rendering     | Frontend-friendly responses     |
| `llm`               | LLM provider abstraction   | Vertex AI, model selection      |
| `langfuse`          | Observability integration  | Tracing, prompt management      |
| `object-refinement` | Interactive object editing | Chat-based refinement, prompts  |

### Extraction & Processing

| Module            | Description             | Key Patterns                       |
| ----------------- | ----------------------- | ---------------------------------- |
| `extraction-jobs` | Background extraction   | Job queue, status tracking         |
| `discovery-jobs`  | Document discovery      | Auto-discovery, LLM classification |
| `embeddings`      | Vector embedding jobs   | Batch processing, retry logic      |
| `type-registry`   | Object type schemas     | Per-project type configuration     |
| `verification`    | Extraction verification | NLI, LLM judge, exact match        |

### Email System

| Module                   | Description               | Key Patterns                  |
| ------------------------ | ------------------------- | ----------------------------- |
| `email`                  | Email sending service     | Resend integration, templates |
| `user-email-preferences` | Email preference settings | Opt-in/opt-out management     |

### Notifications & Tasks

| Module          | Description               | Key Patterns                     |
| --------------- | ------------------------- | -------------------------------- |
| `notifications` | User notification inbox   | In-app notifications, read state |
| `tasks`         | Merge suggestions & tasks | AI-generated suggestions         |
| `releases`      | Release notes management  | Version announcements            |

### Agents (Background Automation)

| Module   | Description                 | Key Patterns                |
| -------- | --------------------------- | --------------------------- |
| `agents` | Scheduled background agents | Cron scheduling, agent runs |

### Integrations

| Module         | Description              | Key Patterns                          |
| -------------- | ------------------------ | ------------------------------------- |
| `integrations` | Third-party integrations | Encrypted settings, provider registry |
| `clickup`      | ClickUp integration      | OAuth, webhook, document import       |

### User Management

| Module          | Description             | Key Patterns              |
| --------------- | ----------------------- | ------------------------- |
| `user`          | Current user operations | Profile, preferences      |
| `users`         | User admin operations   | User listing, management  |
| `user-profile`  | Profile management      | Avatar, display name      |
| `user-activity` | Activity tracking       | Recent items, audit trail |

### Infrastructure

| Module        | Description           | Key Patterns              |
| ------------- | --------------------- | ------------------------- |
| `events`      | SSE event streaming   | Real-time notifications   |
| `health`      | Health checks         | Database, service health  |
| `monitoring`  | System monitoring     | Process logs, metrics     |
| `settings`    | App settings          | Per-project configuration |
| `client-logs` | Browser error logging | Frontend error capture    |
| `mcp`         | MCP server endpoints  | Model Context Protocol    |
| `openapi`     | API documentation     | Swagger/OpenAPI spec      |

### Template Management

| Module           | Description                | Key Patterns         |
| ---------------- | -------------------------- | -------------------- |
| `template-packs` | Object type template packs | Seed data, studio UI |

## Common Decorators

| Decorator              | Import                      | Usage               |
| ---------------------- | --------------------------- | ------------------- |
| `@RequireProjectId()`  | `project-context.decorator` | Get project context |
| `@Scopes('...')`       | `scopes.decorator`          | Required scopes     |
| `@ApiStandardErrors()` | `api-standard-errors`       | Standard error docs |
| `@Public()`            | `auth.guard`                | Skip auth           |

## Common Services

| Service            | Usage                                        |
| ------------------ | -------------------------------------------- |
| `DatabaseService`  | RLS-aware queries via `runWithTenantContext` |
| `HashService`      | Content hashing                              |
| `LangfuseService`  | AI observability tracing                     |
| `AppConfigService` | Environment config                           |
| `EventsService`    | SSE event emission                           |

## Common Mistakes

| Mistake                    | Correct Approach                                   |
| -------------------------- | -------------------------------------------------- |
| Direct repository queries  | Use `DatabaseService.runWithTenantContext` for RLS |
| Missing guards             | Always add `@UseGuards(AuthGuard, ScopesGuard)`    |
| Plain exceptions           | Use `{ error: { code, message } }` format          |
| Manual JSON response       | Return typed DTOs, let NestJS serialize            |
| Missing OpenAPI decorators | Add `@ApiProperty`, `@ApiResponse`, etc.           |
| Hardcoded limits           | Use `@Query('limit')` with validation              |
