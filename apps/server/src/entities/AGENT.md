# TypeORM Entity Patterns

> **AI Assistants**: Read this BEFORE creating or modifying entities. Use existing patterns.

## Directory Structure

```
apps/server/src/entities/
├── AGENT.md                    # This file
├── document.entity.ts          # Document storage
├── chunk.entity.ts             # Document chunks with embeddings
├── project.entity.ts           # Projects (multi-tenant)
├── org.entity.ts               # Organizations
├── user-profile.entity.ts      # User profiles (core schema)
├── graph-object.entity.ts      # Knowledge graph objects
├── graph-relationship.entity.ts # Knowledge graph relationships
├── object-extraction-job.entity.ts # Background job tracking
└── ... (47 entities total)
```

## Database Schemas

The database uses multiple schemas:

| Schema   | Purpose               | Tables                                    |
| -------- | --------------------- | ----------------------------------------- |
| `kb`     | Knowledge base data   | documents, chunks, projects, graph\_\*    |
| `core`   | User management       | user_profiles, user_emails                |
| `public` | PostgreSQL extensions | pgvector, pg_trgm (managed by migrations) |

**IMPORTANT**: Always specify schema in `@Entity()` decorator.

## Entity Structure Pattern

### Basic Entity Template

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';

@Entity({ schema: 'kb', name: 'my_table_name' })
@Index(['projectId'])
export class MyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text' })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
```

## Naming Conventions

### Column Names

| TypeScript Property | Database Column     | Notes                              |
| ------------------- | ------------------- | ---------------------------------- |
| `projectId`         | `project_id`        | Always use `name:` option          |
| `createdAt`         | `created_at`        | Use `CreateDateColumn`             |
| `updatedAt`         | `updated_at`        | Use `UpdateDateColumn`             |
| `deletedAt`         | `deleted_at`        | Use `DeleteDateColumn` or `Column` |
| `contentHash`       | `content_hash`      | snake_case in DB                   |
| `extractionJobId`   | `extraction_job_id` | FK references                      |

### Table Names

```typescript
// CORRECT: snake_case, plural
@Entity({ schema: 'kb', name: 'documents' })
@Entity({ schema: 'kb', name: 'graph_objects' })
@Entity({ schema: 'core', name: 'user_profiles' })

// WRONG: camelCase or singular
@Entity({ schema: 'kb', name: 'Document' })     // Wrong
@Entity({ schema: 'kb', name: 'graphObjects' }) // Wrong
```

## Column Types

### Common Types

```typescript
// UUID (primary key)
@PrimaryGeneratedColumn('uuid')
id!: string;

// UUID (foreign key)
@Column({ name: 'project_id', type: 'uuid' })
projectId!: string;

// Text
@Column({ type: 'text' })
name!: string;

@Column({ type: 'text', nullable: true })
description!: string | null;

// Integer
@Column({ type: 'int', default: 0 })
retryCount!: number;

// Boolean
@Column({ type: 'boolean', default: false })
isActive!: boolean;

// Floating point
@Column({ type: 'real', nullable: true })
weight!: number | null;

// Timestamps
@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
createdAt!: Date;

@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
updatedAt!: Date;

@Column({ name: 'started_at', type: 'timestamptz', nullable: true })
startedAt!: Date | null;
```

### JSONB Columns

```typescript
// Generic JSON object
@Column({ type: 'jsonb', default: '{}' })
properties!: Record<string, any>;

// JSON array
@Column({ type: 'jsonb', default: '[]' })
logs!: any[];

// Nullable JSONB
@Column({ type: 'jsonb', nullable: true })
metadata!: Record<string, any> | null;

// Typed JSONB (define interface separately)
@Column({ type: 'jsonb', nullable: true })
extractionConfig!: {
  chunkSize?: number;
  method?: 'function_calling' | 'responseSchema';
  timeoutSeconds?: number;
} | null;
```

### Array Columns

```typescript
// Text array
@Column({ type: 'text', array: true, default: '{}' })
labels!: string[];

@Column({ name: 'enabled_types', type: 'text', array: true, default: '{}' })
enabledTypes!: string[];
```

### Vector / Embedding Columns

```typescript
// pgvector embedding (768 dimensions for Gemini text-embedding-004)
@Column({ type: 'vector', length: 768, nullable: true })
embedding!: number[] | null;

// Named embedding column
@Column({
  name: 'embedding_v2',
  type: 'vector',
  length: 768,
  nullable: true,
})
embeddingV2!: number[] | null;
```

### Full-Text Search Columns

```typescript
// tsvector for PostgreSQL full-text search
@Column({ type: 'tsvector', nullable: true })
tsv!: any | null;

@Column({ type: 'tsvector', nullable: true })
fts!: any | null;
```

### Binary Columns

```typescript
// Binary hash (SHA256)
@Column({ name: 'content_hash', type: 'bytea', nullable: true })
contentHash!: Buffer | null;
```

### Version Columns

```typescript
// Optimistic locking version
@VersionColumn({ type: 'int', default: 1 })
version!: number;
```

## Relations

### ManyToOne (FK to parent)

```typescript
// Standard pattern
@Column({ name: 'project_id', type: 'uuid' })
projectId!: string;

@ManyToOne(() => Project, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'project_id' })
project!: Project;

// Nullable relation
@Column({ name: 'document_id', type: 'uuid', nullable: true })
documentId!: string | null;

@ManyToOne(() => Document, { nullable: true })
@JoinColumn({ name: 'document_id' })
document!: Document | null;
```

### OneToMany (children collection)

```typescript
// Using string reference to avoid circular imports
@OneToMany('Chunk', 'document', { cascade: true })
chunks!: Chunk[];

// Import type only to avoid circular dependency
import type { Chunk } from './chunk.entity';
```

### Self-referential Relations

```typescript
// User deleting other records
@Column({ name: 'deleted_by', type: 'uuid', nullable: true })
deletedBy!: string | null;

@ManyToOne(() => UserProfile, { nullable: true })
@JoinColumn({ name: 'deleted_by' })
deletedByUser!: UserProfile | null;
```

### Cascade Rules

| Scenario                  | Use                    |
| ------------------------- | ---------------------- |
| Child deleted with parent | `onDelete: 'CASCADE'`  |
| Nullable FK, set to null  | `onDelete: 'SET NULL'` |
| Prevent deletion          | `onDelete: 'RESTRICT'` |

## Indexes

### Single Column Index

```typescript
@Entity({ schema: 'kb', name: 'documents' })
@Index(['projectId'])
@Index(['externalSourceId'])
export class Document { ... }
```

### Composite Index

```typescript
@Index(['projectId', 'branchId', 'type', 'key'], {
  unique: true,
  where: 'deleted_at IS NULL AND supersedes_id IS NULL AND key IS NOT NULL',
})
```

### Unique Index

```typescript
@Index(['zitadelUserId'], { unique: true })

// Partial unique index
@Index(['projectId', 'contentHash'], {
  unique: true,
  where: 'content_hash IS NOT NULL',
})
```

### Composite Index for Chunk Uniqueness

```typescript
@Index(['documentId', 'chunkIndex'], { unique: true })
```

## Soft Delete Pattern

```typescript
// Standard soft delete columns
@Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
deletedAt!: Date | null;

@Column({ name: 'deleted_by', type: 'uuid', nullable: true })
deletedBy!: string | null;

@ManyToOne(() => UserProfile, { nullable: true })
@JoinColumn({ name: 'deleted_by' })
deletedByUser!: UserProfile | null;

// OR use TypeORM's DeleteDateColumn (auto-managed)
@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
deletedAt!: Date | null;
```

## Type Unions (Status Fields)

```typescript
// Define type outside entity
export type DocumentSourceType =
  | 'upload'
  | 'url'
  | 'google_drive'
  | 'dropbox'
  | 'external';

// Use in column
@Column({ name: 'source_type', type: 'text', default: 'upload' })
sourceType!: DocumentSourceType;

// For job status (string union)
@Column({ type: 'text', default: 'queued' })
status!: string; // 'queued' | 'processing' | 'completed' | 'failed'
```

## Available Entities by Domain

### Documents & Content

| Entity           | Table               | Purpose                      |
| ---------------- | ------------------- | ---------------------------- |
| `Document`       | kb.documents        | Uploaded/ingested documents  |
| `Chunk`          | kb.chunks           | Document chunks + embeddings |
| `ExternalSource` | kb.external_sources | External integrations        |

### Knowledge Graph

| Entity              | Table                  | Purpose              |
| ------------------- | ---------------------- | -------------------- |
| `GraphObject`       | kb.graph_objects       | Graph nodes          |
| `GraphRelationship` | kb.graph_relationships | Graph edges          |
| `ObjectChunk`       | kb.object_chunks       | Object-chunk mapping |
| `Branch`            | kb.branches            | Version branches     |
| `BranchLineage`     | kb.branch_lineage      | Branch ancestry      |

### Multi-tenancy

| Entity                   | Table                       | Purpose         |
| ------------------------ | --------------------------- | --------------- |
| `Org`                    | kb.orgs                     | Organizations   |
| `Project`                | kb.projects                 | Projects        |
| `OrganizationMembership` | kb.organization_memberships | Org members     |
| `ProjectMembership`      | kb.project_memberships      | Project members |

### Users

| Entity                 | Table                       | Purpose       |
| ---------------------- | --------------------------- | ------------- |
| `UserProfile`          | core.user_profiles          | User accounts |
| `UserEmail`            | core.user_emails            | User emails   |
| `UserEmailPreferences` | core.user_email_preferences | Email prefs   |
| `Superadmin`           | core.superadmins            | Admin users   |

### Background Jobs

| Entity                | Table                     | Purpose              |
| --------------------- | ------------------------- | -------------------- |
| `ObjectExtractionJob` | kb.object_extraction_jobs | Extraction jobs      |
| `ObjectExtractionLog` | kb.object_extraction_logs | Job step logs        |
| `ChunkEmbeddingJob`   | kb.chunk_embedding_jobs   | Embedding jobs       |
| `GraphEmbeddingJob`   | kb.graph_embedding_jobs   | Graph embedding jobs |

### Chat

| Entity             | Table                 | Purpose       |
| ------------------ | --------------------- | ------------- |
| `ChatConversation` | kb.chat_conversations | Chat threads  |
| `ChatMessage`      | kb.chat_messages      | Chat messages |

### Configuration

| Entity                      | Table                           | Purpose           |
| --------------------------- | ------------------------------- | ----------------- |
| `ObjectTypeSchema`          | kb.object_type_schemas          | Type definitions  |
| `ProjectObjectTypeRegistry` | kb.project_object_type_registry | Per-project types |
| `EmbeddingPolicy`           | kb.embedding_policies           | Embedding config  |
| `Setting`                   | kb.settings                     | App settings      |

## Common Patterns

### Entity with Job Tracking

```typescript
@Entity({ schema: 'kb', name: 'my_jobs' })
@Index(['status'])
@Index(['projectId'])
export class MyJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text', default: 'queued' })
  status!: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
```

### Entity with Versioning (Graph Pattern)

```typescript
@Entity({ schema: 'kb', name: 'my_versioned_entity' })
export class MyVersionedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'canonical_id', type: 'uuid' })
  canonicalId!: string;

  @Column({ name: 'supersedes_id', type: 'uuid', nullable: true })
  supersedesId!: string | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @Column({ name: 'content_hash', type: 'bytea', nullable: true })
  contentHash!: Buffer | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

## Anti-Patterns (AVOID)

```typescript
// WRONG: Missing schema
@Entity('documents')
export class Document { ... }

// WRONG: camelCase table name
@Entity({ schema: 'kb', name: 'graphObjects' })

// WRONG: Missing name option for snake_case column
@Column({ type: 'uuid' })
projectId!: string; // Will create "projectId" column

// WRONG: Using Date type without timestamptz
@Column({ type: 'timestamp' }) // Use 'timestamptz'!
createdAt!: Date;

// WRONG: Circular import (use type import or string reference)
import { Chunk } from './chunk.entity'; // In document.entity.ts
@OneToMany(() => Chunk, ...)

// CORRECT: Type-only import
import type { Chunk } from './chunk.entity';
@OneToMany('Chunk', 'document', ...)
```

## Checklist for New Entities

- [ ] Schema specified: `@Entity({ schema: 'kb', name: '...' })`
- [ ] Table name is snake_case plural: `documents`, `graph_objects`
- [ ] All columns have `name:` for snake_case: `{ name: 'project_id' }`
- [ ] UUID columns use `type: 'uuid'`
- [ ] Timestamps use `type: 'timestamptz'`
- [ ] Foreign keys have matching `@ManyToOne` + `@JoinColumn`
- [ ] Indexes added for frequently queried columns
- [ ] Soft delete uses standard `deleted_at` / `deleted_by` pattern
- [ ] Non-null assertion (`!`) used for all properties (TypeORM manages initialization)
- [ ] Circular imports avoided using `type` imports or string references
