# TypeORM Migration Quick Reference Guide

**Purpose**: Guide for continuing the TypeORM migration from 30% to 100%

---

## How to Migrate a Service

### Step 1: Analyze the Service

```bash
# Count queries in the service
grep -c "db.query" apps/server/src/modules/path/service.ts

# Check service size
wc -l apps/server/src/modules/path/service.ts

# List all methods
grep -n "async.*(" apps/server/src/modules/path/service.ts
```

### Step 2: Check/Create Entity

Check if entity exists:

```bash
ls apps/server/src/entities/your-entity.entity.ts
```

If not, create entity following existing patterns:

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kb', name: 'table_name' })
export class YourEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
```

### Step 3: Update Service Constructor

```typescript
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { YourEntity } from '../../entities/your-entity.entity';

@Injectable()
export class YourService {
  constructor(
    @InjectRepository(YourEntity)
    private readonly yourRepo: Repository<YourEntity>,
    private readonly dataSource: DataSource,
    private readonly db: DatabaseService // Keep for compatibility
  ) {}
}
```

### Step 4: Update Module

```typescript
import { TypeOrmModule } from '@nestjs/typeorm';
import { YourEntity } from '../../entities/your-entity.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([YourEntity]),
    // ... other imports
  ],
  // ... rest of module
})
```

### Step 5: Migrate Methods

Choose pattern based on query complexity:

**Simple CRUD**:

```typescript
// Before
const result = await this.db.query('SELECT * FROM kb.table WHERE id = $1', [
  id,
]);
return result.rows[0];

// After
const entity = await this.yourRepo.findOne({ where: { id } });
return entity;
```

**With Filtering**:

```typescript
// Before
const result = await this.db.query(
  'SELECT * FROM kb.table WHERE user_id = $1 AND status = $2',
  [userId, status]
);

// After
const entities = await this.yourRepo.find({
  where: { userId, status },
});
```

**Complex Queries** (LATERAL joins, etc):

```typescript
// Keep using DataSource.query
const results = await this.dataSource.query(
  `
  SELECT ... FROM ... LEFT JOIN LATERAL ...
`,
  params
);
```

### Step 6: Build and Test

```bash
# Build
npm run build:server

# Restart
npx pm2 restart spec-server-2-server

# Test
curl http://localhost:3002/health

# Check logs
tail -50 apps/logs/server/error.log
```

---

## Common Patterns

### Pattern 1: Simple Find

```typescript
await repo.findOne({ where: { id, userId } });
await repo.find({ where: { status: 'active' }, order: { created: 'DESC' } });
```

### Pattern 2: Create and Save

```typescript
const entity = repo.create({ field: value });
const saved = await repo.save(entity);
```

### Pattern 3: Update

```typescript
// Option A: Load then save
const entity = await repo.findOne({ where: { id } });
entity.field = newValue;
await repo.save(entity);

// Option B: Direct update
await repo.update(id, { field: newValue });
```

### Pattern 4: Delete

```typescript
await repo.delete(id);
await repo.delete({ id, userId }); // compound key
```

### Pattern 5: Count

```typescript
await repo.count({ where: { status: 'pending' } });
```

### Pattern 6: QueryBuilder

```typescript
await repo
  .createQueryBuilder('e')
  .where('e.userId = :userId', { userId })
  .andWhere('e.createdAt > :date', { date })
  .orderBy('e.createdAt', 'DESC')
  .take(100)
  .getMany();
```

### Pattern 7: Bulk Update

```typescript
await repo
  .createQueryBuilder()
  .update(Entity)
  .set({ status: 'archived' })
  .where('userId = :userId', { userId })
  .execute();
```

### Pattern 8: TypeORM Operators

```typescript
import { MoreThan, LessThan, In } from 'typeorm';

await repo.find({
  where: {
    createdAt: MoreThan(date),
    status: In(['active', 'pending']),
  },
});
```

### Pattern 9: Transactions

```typescript
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  const entity = await queryRunner.manager.save(Entity, data);
  // More operations...
  await queryRunner.commitTransaction();
} catch (e) {
  await queryRunner.rollbackTransaction();
  throw e;
} finally {
  await queryRunner.release();
}
```

### Pattern 10: LATERAL Joins

```typescript
// Use DataSource.query for LATERAL (not supported by QueryBuilder)
const results = await this.dataSource.query(
  `
  SELECT d.*, ej.status
  FROM kb.documents d
  LEFT JOIN LATERAL (
    SELECT status FROM kb.extraction_jobs
    WHERE document_id = d.id
    ORDER BY created_at DESC LIMIT 1
  ) ej ON true
  WHERE d.id = $1
`,
  [id]
);
```

---

## When to Keep Raw SQL

**Always keep as raw SQL**:

1. Advisory locks: `pg_advisory_xact_lock()`
2. Queue operations: `FOR UPDATE SKIP LOCKED`
3. PostgreSQL intervals: `now() + interval '1 hour'`
4. Vector similarity: `embedding <=> $1::vector`
5. Full-text search: `tsv @@ websearch_to_tsquery()`
6. Recursive queries (WITH RECURSIVE)
7. Complex CTEs with multiple steps
8. PostgreSQL encryption functions

**Use DataSource.query for**:

- LATERAL joins
- Complex aggregations with multiple GROUP BY
- Dynamic SQL generation (but minimize)

---

## Common Pitfalls

### ❌ Don't: Include schema in JOIN

```typescript
// Wrong
.innerJoin('kb.organization_memberships', 'om', ...)

// Right
.innerJoin('organization_memberships', 'om', ...)
// OR use DataSource.query
```

### ❌ Don't: Use undefined where null expected

```typescript
// Wrong
entity.field = undefined;

// Right
entity.field = null;
```

### ❌ Don't: Forget to handle null → undefined

```typescript
// For DTOs, convert null to undefined
return {
  field: entity.field ?? undefined,
};
```

---

## Testing Checklist

After migrating a service:

- [ ] Build succeeds: `npm run build:server`
- [ ] No TypeScript errors
- [ ] Server restarts successfully
- [ ] Health check passes: `curl http://localhost:3002/health`
- [ ] No errors in logs: `tail apps/logs/server/error.log`
- [ ] API endpoints work (if testing manually)
- [ ] Existing tests pass (if they exist)

---

## Quick Commands

```bash
# Build
npm run build:server

# Restart server
npx pm2 restart spec-server-2-server

# Check health
curl http://localhost:3002/health

# View logs
tail -100 apps/logs/server/out.log
tail -100 apps/server/error.log

# Check TypeORM migrations
npm run migration:show

# Generate new migration (if entity changed)
npm run migration:generate src/migrations/DescriptiveName

# Run migrations
npm run migration:run
```

---

## Migration Velocity

**Current Pace**:

- Average: 1.7 services per session
- Simple services: 30-45 minutes
- Complex services: 1-2 hours
- Very complex: Multi-session approach

**Estimated Time to 50%**: 6-10 sessions  
**Estimated Time to 100%**: 20-25 total sessions

---

## Status Tracking

Update `TYPEORM_MIGRATION_STATUS.md` after each session with:

- Services migrated
- Queries eliminated
- Any issues encountered
- Build/restart count
- Next targets

---

**Happy Migrating!** 🚀
