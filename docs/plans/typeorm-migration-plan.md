# TypeORM Migration Plan

**Date**: November 7, 2025  
**Purpose**: Replace current custom database layer with TypeORM for better maintainability and developer experience

---

## Executive Summary

### Current Problems

❌ **Manual SQL migrations** that fail on schema conflicts  
❌ **No type safety** between TypeScript code and database schema  
❌ **Custom database service** with manual query building  
❌ **Migration tracking issues** - Two systems (DatabaseService vs scripts)  
❌ **Schema validation needed** because no ORM ensures schema matches code  
❌ **Manual entity management** - No automatic CRUD operations  
❌ **Complex debugging** - Raw SQL errors are hard to trace  

### TypeORM Benefits

✅ **Automatic migrations** - Generate from entity changes  
✅ **Type safety** - Entities are TypeScript classes, compile-time checking  
✅ **Repository pattern** - Built-in CRUD operations  
✅ **Query builder** - Type-safe query construction  
✅ **Relations** - Automatic joins and eager/lazy loading  
✅ **Migration management** - Proper tracking, up/down migrations  
✅ **NestJS integration** - First-class support via @nestjs/typeorm  
✅ **Developer experience** - Less boilerplate, more productivity  

---

## Current Architecture Analysis

### Database Layer (Current)

**Files**:
- `apps/server/src/common/database/database.service.ts` (707 lines)
- `apps/server/src/common/database/database.module.ts`
- `scripts/run-migrations.ts` (194 lines)
- `scripts/validate-schema.ts` (custom validation)
- `apps/server/migrations/0001_init.sql` (155KB SQL file)

**Issues**:
1. **Custom pool management** - Manual PostgreSQL client handling
2. **Raw SQL queries** - No type safety, error-prone
3. **Manual RLS** - Custom row-level security implementation
4. **Two migration systems** - DatabaseService + scripts/run-migrations.ts
5. **No entity models** - Data access scattered across services
6. **Manual schema validation** - Required custom tooling

### Example Current Code

```typescript
// Current approach - raw SQL
const result = await this.pool.query(
  'SELECT * FROM kb.documents WHERE project_id = $1',
  [projectId]
);

// No type safety, manual mapping
const documents = result.rows.map(row => ({
  id: row.id,
  filename: row.filename,
  // ... manual mapping
}));
```

---

## TypeORM Architecture (Proposed)

### Core Components

#### 1. Entities (TypeScript Classes)

```typescript
// apps/server/src/entities/document.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Chunk } from './chunk.entity';

@Entity({ schema: 'kb', name: 'documents' })
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ nullable: true })
  filename?: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ nullable: true })
  contentHash?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Chunk, chunk => chunk.document)
  chunks: Chunk[];
}
```

#### 2. TypeORM Module Configuration

```typescript
// apps/server/src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('POSTGRES_HOST'),
        port: configService.get('POSTGRES_PORT'),
        username: configService.get('POSTGRES_USER'),
        password: configService.get('POSTGRES_PASSWORD'),
        database: configService.get('POSTGRES_DB'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false, // NEVER true in production
        logging: configService.get('NODE_ENV') === 'development',
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

#### 3. Repository Injection

```typescript
// apps/server/src/modules/documents/documents.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from '../../entities/document.entity';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
  ) {}

  async findAll(): Promise<Document[]> {
    return await this.documentRepository.find({
      relations: ['chunks'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Document> {
    return await this.documentRepository.findOne({
      where: { id },
      relations: ['chunks'],
    });
  }

  async create(data: Partial<Document>): Promise<Document> {
    const document = this.documentRepository.create(data);
    return await this.documentRepository.save(document);
  }
}
```

#### 4. TypeORM Migrations (TypeScript)

```typescript
// apps/server/src/migrations/1699999999999-InitialSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1699999999999 implements MigrationInterface {
  name = 'InitialSchema1699999999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM generates this automatically from entity definitions
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "kb"`);
    await queryRunner.query(`CREATE TABLE "kb"."documents" (...)`);
    // ... all other tables
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "kb"."documents"`);
    await queryRunner.query(`DROP SCHEMA "kb"`);
  }
}
```

---

## Migration Strategy

### Phase 1: Setup TypeORM (Week 1)

**Tasks**:
1. Install dependencies
   ```bash
   npm install @nestjs/typeorm typeorm pg
   ```

2. Create DataSource configuration
   - File: `apps/server/src/data-source.ts`
   - Configure for PostgreSQL
   - Set entity and migration paths

3. Create base entities for existing tables
   - Convert 8 critical tables to TypeORM entities
   - Start with: Document, Chunk, ObjectExtractionJob

4. Generate initial migration from entities
   ```bash
   npm run typeorm migration:generate src/migrations/InitialSchema
   ```

5. Compare generated migration with current schema
   - Ensure no data loss
   - Test in development

**Deliverables**:
- TypeORM configured in NestJS
- 8 entity classes created
- Initial migration generated and tested
- Documentation updated

### Phase 2: Migrate Services (Week 2-3)

**Tasks**:
1. Update DatabaseModule to use TypeOrmModule
2. Replace custom DatabaseService with TypeORM repositories
3. Update services to use repository pattern:
   - DocumentsService
   - ChunksService
   - ExtractionJobsService
   - AuthService (introspection cache)

4. Replace raw SQL queries with QueryBuilder
5. Implement custom repositories where needed
6. Add transactions using TypeORM decorators

**Before/After Example**:

```typescript
// BEFORE (Current)
const result = await this.pool.query(
  `SELECT d.*, COUNT(c.id) as chunk_count 
   FROM kb.documents d 
   LEFT JOIN kb.chunks c ON c.document_id = d.id 
   WHERE d.project_id = $1 
   GROUP BY d.id`,
  [projectId]
);

// AFTER (TypeORM)
const documents = await this.documentRepository
  .createQueryBuilder('doc')
  .leftJoinAndSelect('doc.chunks', 'chunk')
  .where('doc.projectId = :projectId', { projectId })
  .loadRelationCountAndMap('doc.chunkCount', 'doc.chunks')
  .getMany();
```

**Deliverables**:
- All services migrated to TypeORM
- Raw SQL eliminated
- Type-safe queries throughout
- Tests passing

### Phase 3: Advanced Features (Week 4)

**Tasks**:
1. Implement entity subscribers for lifecycle hooks
2. Add query result caching
3. Implement soft deletes with @DeleteDateColumn
4. Add optimistic locking with @VersionColumn
5. Implement multi-tenancy with query scopes
6. Add database seeding with TypeORM

**Deliverables**:
- Advanced TypeORM features implemented
- Performance optimizations applied
- Comprehensive testing

### Phase 4: Cleanup & Documentation (Week 5)

**Tasks**:
1. Remove old database.service.ts
2. Remove custom migration runner (scripts/run-migrations.ts)
3. Remove schema validation script (now handled by TypeORM)
4. Update all documentation
5. Create migration guide for team
6. Performance testing and optimization

**Deliverables**:
- Legacy code removed
- Documentation complete
- Team trained on TypeORM

---

## Entity Mapping (Current Schema → TypeORM)

### Critical Entities

#### 1. Document Entity
```typescript
@Entity({ schema: 'kb', name: 'documents' })
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ nullable: true })
  filename?: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ nullable: true })
  contentHash?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Chunk, chunk => chunk.document, { cascade: true })
  chunks: Chunk[];

  @OneToMany(() => ObjectExtractionJob, job => job.document)
  extractionJobs: ObjectExtractionJob[];
}
```

#### 2. Chunk Entity
```typescript
@Entity({ schema: 'kb', name: 'chunks' })
export class Chunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  documentId: string;

  @Column('int')
  chunkIndex: number;

  @Column('text')
  text: string;

  @Column({
    type: 'vector',
    length: 768,
    nullable: true,
  })
  embedding?: number[];

  @Column({
    type: 'tsvector',
    nullable: true,
    generatedType: 'STORED',
    asExpression: "to_tsvector('simple', text)",
  })
  tsv?: any;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Document, document => document.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Index()
  @Column('uuid')
  documentId: string;
}
```

#### 3. ObjectExtractionJob Entity
```typescript
@Entity({ schema: 'kb', name: 'object_extraction_jobs' })
export class ObjectExtractionJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  tenantId: string;

  @Column('uuid')
  organizationId: string;

  @Column('uuid')
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  documentId?: string;

  @Column({ type: 'varchar', default: 'full_extraction' })
  jobType: string;

  @Column({ 
    type: 'enum',
    enum: ['pending', 'running', 'processing', 'completed', 'requires_review', 'failed', 'cancelled'],
    default: 'pending'
  })
  status: string;

  @Column({ type: 'jsonb', default: '{}' })
  extractionConfig: object;

  @Column({ type: 'int', default: 0 })
  objectsCreated: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Document)
  @JoinColumn({ name: 'document_id' })
  document?: Document;

  @Index()
  @Column('varchar')
  status: string;

  @Index()
  @Column('uuid')
  projectId: string;
}
```

---

## Benefits Analysis

### Developer Experience

**Before TypeORM**:
```typescript
// Manual query building
const query = `
  INSERT INTO kb.documents (id, filename, content, content_hash, created_at, updated_at)
  VALUES ($1, $2, $3, $4, NOW(), NOW())
  RETURNING *
`;
const result = await this.pool.query(query, [id, filename, content, hash]);
const document = result.rows[0];
```

**After TypeORM**:
```typescript
// Clean, type-safe
const document = this.documentRepository.create({
  filename,
  content,
  contentHash: hash,
});
await this.documentRepository.save(document);
```

### Type Safety

**Before**:
- ❌ No compile-time checking of column names
- ❌ No validation of data types
- ❌ Manual result mapping
- ❌ SQL injection risks

**After**:
- ✅ Compile-time errors for wrong column names
- ✅ TypeScript types match database types
- ✅ Automatic result mapping to entities
- ✅ Parameterized queries by default

### Migrations

**Before**:
- ❌ Write SQL by hand
- ❌ No automatic generation
- ❌ Schema conflicts common
- ❌ Two different migration systems

**After**:
- ✅ Auto-generate from entity changes: `npm run migration:generate`
- ✅ Type-safe migration classes
- ✅ Single migration system
- ✅ Automatic tracking

---

## Implementation Plan

### Step 1: Install & Configure (Day 1)

```bash
# Install TypeORM packages
npm install @nestjs/typeorm typeorm

# TypeORM is already peer-dependent on pg, so no additional driver needed
```

**Create DataSource config**:
```typescript
// apps/server/src/typeorm.config.ts
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  username: process.env.POSTGRES_USER || 'spec',
  password: process.env.POSTGRES_PASSWORD || 'spec',
  database: process.env.POSTGRES_DB || 'spec',
  entities: ['src/**/*.entity{.ts,.js}'],
  migrations: ['src/migrations/*{.ts,.js}'],
  synchronize: false,
});
```

**Add TypeORM scripts to package.json**:
```json
{
  "scripts": {
    "typeorm": "typeorm-ts-node-commonjs",
    "migration:generate": "npm run typeorm -- migration:generate src/migrations/Migration -d src/typeorm.config.ts",
    "migration:run": "npm run typeorm -- migration:run -d src/typeorm.config.ts",
    "migration:revert": "npm run typeorm -- migration:revert -d src/typeorm.config.ts",
    "migration:show": "npm run typeorm -- migration:show -d src/typeorm.config.ts"
  }
}
```

### Step 2: Create Entities (Day 2-3)

**Entity structure**:
```
apps/server/src/
  entities/
    document.entity.ts
    chunk.entity.ts
    object-extraction-job.entity.ts
    graph-embedding-job.entity.ts
    auth-introspection-cache.entity.ts
    tag.entity.ts
    graph-object.entity.ts
    graph-relationship.entity.ts
  entities/index.ts  // Export all entities
```

**Template**:
```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity({ schema: 'kb', name: 'table_name' })
@Index(['column1', 'column2'])
export class EntityName {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  field: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

### Step 3: Generate Initial Migration (Day 4)

```bash
# Generate migration from entities
npm run migration:generate InitialSchema

# This creates: src/migrations/{timestamp}-InitialSchema.ts
# Contains SQL to create tables matching entities
```

**Review and adjust**:
- Check generated SQL matches current schema
- Add custom indexes if needed
- Verify no data loss

### Step 4: Update App Module (Day 5)

```typescript
// apps/server/src/app.module.ts
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        ...config.getDatabaseConfig(),
        entities,
        migrationsRun: true, // Auto-run on startup
        logging: ['error', 'warn', 'migration'],
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Step 5: Migrate Services (Day 6-10)

**Priority order**:
1. DocumentsService - Most used
2. ChunksService - Related to documents
3. ExtractionJobsService - Job queue
4. AuthService - Introspection cache
5. GraphService - Objects and relationships
6. TagService - Tag management

**Per service**:
- Import `TypeOrmModule.forFeature([Entity])`
- Inject repository with `@InjectRepository()`
- Replace raw SQL with repository methods
- Update tests

### Step 6: Remove Legacy Code (Day 11-12)

**Delete**:
- ❌ `database.service.ts` (custom pool management)
- ❌ `scripts/run-migrations.ts` (use TypeORM CLI)
- ❌ `scripts/validate-schema.ts` (TypeORM validates schema)
- ❌ `apps/server/migrations/*.sql` (move to archive)

**Update**:
- Workspace start validation (simpler with TypeORM)
- Documentation
- Team guides

---

## Key Decisions

### 1. Migration Generation Strategy

**Approach**: Generate from entity changes
```bash
# After modifying entities
npm run migration:generate AddUserRole

# TypeORM compares entities vs database
# Generates only the differences
```

**Benefits**:
- No manual SQL writing
- Type-safe migrations
- Automatic diffing

### 2. Synchronize Setting

**Decision**: `synchronize: false` in all environments

**Reason**:
- Auto-sync can cause data loss
- Migrations give full control
- Proper audit trail

### 3. Migration Timing

**Decision**: Run migrations on app startup via `migrationsRun: true`

**Benefits**:
- Zero-touch deployment
- No manual migration step
- Workspace validation still runs as safety net

### 4. Entity Organization

**Decision**: Single `entities/` directory with index export

**Structure**:
```
entities/
  document.entity.ts
  chunk.entity.ts
  ...
  index.ts  // export * from './document.entity'; ...
```

---

## Risk Mitigation

### Risk 1: Data Loss During Migration

**Mitigation**:
1. Create full database backup before migration
2. Test migration on development database first
3. Use staging environment for validation
4. Have rollback plan ready

**Rollback**:
```bash
npm run migration:revert
# OR restore from backup
psql -U spec -d spec < backup.sql
```

### Risk 2: Downtime During Deployment

**Mitigation**:
1. Make entities match current schema exactly (no schema changes initially)
2. Deploy TypeORM alongside current system
3. Gradually switch services over
4. Zero schema changes until all services migrated

### Risk 3: Learning Curve

**Mitigation**:
1. Team training sessions (2 hours)
2. Comprehensive documentation
3. Code examples for common patterns
4. Pair programming for first migrations

---

## Testing Strategy

### Unit Tests

```typescript
describe('DocumentsService', () => {
  let service: DocumentsService;
  let repository: Repository<Document>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getRepositoryToken(Document),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    repository = module.get(getRepositoryToken(Document));
  });

  it('should find all documents', async () => {
    const mockDocuments = [{ id: '1', filename: 'test.txt' }];
    jest.spyOn(repository, 'find').mockResolvedValue(mockDocuments as any);

    const result = await service.findAll();
    expect(result).toEqual(mockDocuments);
  });
});
```

### Integration Tests

```typescript
describe('DocumentsService (Integration)', () => {
  let app: INestApplication;
  let service: DocumentsService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          database: 'test',
          entities: [Document, Chunk],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Document, Chunk]),
      ],
      providers: [DocumentsService],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    
    service = module.get(DocumentsService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.dropDatabase();
    await app.close();
  });

  it('should create and find document', async () => {
    const doc = await service.create({ filename: 'test.txt' });
    const found = await service.findOne(doc.id);
    expect(found.filename).toBe('test.txt');
  });
});
```

---

## Performance Considerations

### Query Optimization

**Use QueryBuilder for complex queries**:
```typescript
// Optimized with select, join, and where
const results = await this.documentRepository
  .createQueryBuilder('doc')
  .select(['doc.id', 'doc.filename', 'doc.createdAt'])
  .leftJoinAndSelect('doc.chunks', 'chunk')
  .where('doc.projectId = :projectId', { projectId })
  .andWhere('doc.createdAt > :since', { since: lastWeek })
  .orderBy('doc.createdAt', 'DESC')
  .take(100)
  .getMany();
```

**Use indexes**:
```typescript
@Entity()
@Index(['projectId', 'status'])
@Index(['createdAt'])
export class ObjectExtractionJob {
  // ...
}
```

### Caching

```typescript
TypeOrmModule.forRoot({
  // ...
  cache: {
    type: 'redis',
    options: {
      host: 'localhost',
      port: 6379,
    },
    duration: 60000, // 1 minute
  },
})

// Use in queries
const documents = await this.documentRepository.find({
  cache: true,
});
```

---

## Comparison: Current vs TypeORM

| Feature | Current | TypeORM | Improvement |
|---------|---------|---------|-------------|
| **Type Safety** | ❌ None | ✅ Full | Catch errors at compile time |
| **Migrations** | ❌ Manual SQL | ✅ Auto-generated | 80% less code |
| **Query Building** | ❌ String concat | ✅ Type-safe builder | No SQL injection |
| **Relations** | ❌ Manual joins | ✅ Automatic | Simpler code |
| **Testing** | ❌ Hard to mock | ✅ Easy mocking | Better tests |
| **Documentation** | ❌ Scattered | ✅ Entities = docs | Self-documenting |
| **Validation** | ❌ Custom script | ✅ Built-in | Less maintenance |
| **Code Volume** | 707 lines | ~200 lines | 70% reduction |

---

## Estimated Effort

### Development Time

| Phase | Duration | Developer Days |
|-------|----------|----------------|
| Phase 1: Setup | 1 week | 3 days |
| Phase 2: Services | 2 weeks | 8 days |
| Phase 3: Advanced | 1 week | 3 days |
| Phase 4: Cleanup | 1 week | 2 days |
| **Total** | **5 weeks** | **16 days** |

### Team Requirements

- 1 senior developer (TypeORM experience)
- 1 mid-level developer
- Part-time DevOps support

---

## Success Criteria

✅ All 8 critical tables have TypeORM entities  
✅ All services use repository pattern (no raw SQL)  
✅ Migrations auto-generate from entity changes  
✅ All tests passing (unit + integration)  
✅ No performance degradation (same or better)  
✅ Documentation complete  
✅ Team trained on TypeORM  
✅ Legacy code removed  
✅ Zero-touch deployment works  

---

## Recommendation

**Proceed with TypeORM migration** because:

1. **Long-term maintainability** - Easier to maintain and extend
2. **Type safety** - Catch bugs at compile time
3. **Developer productivity** - Less boilerplate, more features
4. **Industry standard** - Well-documented, large community
5. **NestJS native** - First-class integration
6. **Current pain points** - Solves migration and validation issues

**ROI**: 2-3 weeks of migration work will save months of maintenance and prevent production issues.

---

## Next Steps

1. **Review and approve plan** - Team discussion
2. **Create spike** - 2-day POC with Document entity
3. **Full implementation** - Follow 5-week plan
4. **Training** - 2-hour TypeORM session for team
5. **Go-live** - Gradual rollout with monitoring

---

## Appendix: Quick Start Commands

```bash
# Install
npm install @nestjs/typeorm typeorm

# Create entity
npx typeorm entity:create src/entities/MyEntity

# Generate migration from entities
npm run migration:generate src/migrations/MyMigration

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Show migration status
npm run migration:show
```

