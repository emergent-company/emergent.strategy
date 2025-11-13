# TypeORM Patterns Guide

**Purpose**: Standard patterns for using TypeORM in this codebase  
**Audience**: All developers working on backend services  
**Last Updated**: January 2025

---

## Table of Contents

1. [When to Use TypeORM](#when-to-use-typeorm)
2. [Pattern 1: Repository CRUD Operations](#pattern-1-repository-crud-operations)
3. [Pattern 2: QueryBuilder for Complex Filtering](#pattern-2-querybuilder-for-complex-filtering)
4. [Pattern 3: Manual Transactions with QueryRunner](#pattern-3-manual-transactions-with-queryrunner)
5. [Pattern 4: Soft Deletes and Timestamps](#pattern-4-soft-deletes-and-timestamps)
6. [Pattern 5: Relation Loading Strategies](#pattern-5-relation-loading-strategies)
7. [Pattern 6: Backward Compatibility Fallbacks](#pattern-6-backward-compatibility-fallbacks)
8. [Pattern 7: Bulk Operations](#pattern-7-bulk-operations)
9. [Pattern 8: Custom Repository Methods](#pattern-8-custom-repository-methods)
10. [Pattern 9: Testing TypeORM Services](#pattern-9-testing-typeorm-services)
11. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
12. [Decision Tree: TypeORM vs Strategic SQL](#decision-tree-typeorm-vs-strategic-sql)

---

## When to Use TypeORM

Use TypeORM when:

- ✅ **Basic CRUD operations** - Create, Read, Update, Delete
- ✅ **Simple filtering** - WHERE clauses with standard operators (=, >, <, IN, LIKE)
- ✅ **Relation loading** - JOIN operations with predefined entity relations
- ✅ **Type safety is important** - Compile-time type checking for entities
- ✅ **Standard SQL operations** - Operations supported across multiple databases

**Don't use TypeORM when** (use Strategic SQL instead):

- ❌ **PostgreSQL-specific features** - Advisory locks, recursive CTEs, full-text search
- ❌ **Complex aggregations** - Window functions, COUNT FILTER, advanced GROUP BY
- ❌ **Performance-critical operations** - Batch processing, complex JOINs
- ❌ **Database extensions** - pgvector, pgcrypto, custom functions

See [STRATEGIC_SQL_PATTERNS.md](./STRATEGIC_SQL_PATTERNS.md) for when to use raw SQL.

---

## Pattern 1: Repository CRUD Operations

### Description

Use TypeORM Repository methods for basic CRUD operations on single entities.

### When to Use

- Creating, reading, updating, or deleting single entities
- Simple queries without complex filtering
- Type safety is desired

### Example: UserProfileService

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';

@Injectable()
export class UserProfileService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>
  ) {}

  // CREATE - Insert new entity
  async create(data: Partial<UserProfile>): Promise<UserProfile> {
    const profile = this.userProfileRepository.create(data);
    return await this.userProfileRepository.save(profile);
  }

  // READ - Get by ID
  async getById(id: string): Promise<UserProfile | null> {
    return await this.userProfileRepository.findOne({
      where: { id },
    });
  }

  // READ - Get by user ID
  async get(userId: string): Promise<UserProfile | null> {
    return await this.userProfileRepository.findOne({
      where: { user_id: userId },
    });
  }

  // UPDATE - Update specific fields
  async update(id: string, data: Partial<UserProfile>): Promise<UserProfile> {
    await this.userProfileRepository.update(id, data);
    return await this.getById(id);
  }

  // DELETE - Soft delete (recommended)
  async delete(id: string): Promise<void> {
    await this.userProfileRepository.softDelete(id);
  }

  // DELETE - Hard delete (use sparingly)
  async hardDelete(id: string): Promise<void> {
    await this.userProfileRepository.delete(id);
  }
}
```

### Key Methods

| Method         | Use Case                        | Returns           |
| -------------- | ------------------------------- | ----------------- |
| `create()`     | Instantiate entity (no DB call) | Entity instance   |
| `save()`       | Insert or update entity         | Saved entity      |
| `findOne()`    | Get single entity by criteria   | Entity or null    |
| `find()`       | Get multiple entities           | Array of entities |
| `update()`     | Update by ID (no return value)  | UpdateResult      |
| `delete()`     | Hard delete by ID               | DeleteResult      |
| `softDelete()` | Soft delete by ID               | UpdateResult      |

### Best Practices

1. **Use `create()` + `save()` for inserts** - Runs validation and hooks
2. **Use `update()` for updates without returning** - More efficient
3. **Use `save()` for updates when you need the result** - Returns updated entity
4. **Prefer soft deletes over hard deletes** - Maintains data integrity
5. **Always handle null results** - `findOne()` returns null if not found

---

## Pattern 2: QueryBuilder for Complex Filtering

### Description

Use TypeORM QueryBuilder for queries with complex WHERE clauses, JOINs, or sorting.

### When to Use

- Multiple WHERE conditions with AND/OR logic
- Dynamic filtering based on optional parameters
- Queries requiring JOINs across relations
- Complex sorting or pagination

### Example: ChunksService

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chunk } from './entities/chunk.entity';

@Injectable()
export class ChunksService {
  constructor(
    @InjectRepository(Chunk)
    private readonly chunkRepository: Repository<Chunk>
  ) {}

  // Simple QueryBuilder - List with optional filtering
  async list(documentId?: string): Promise<Chunk[]> {
    const query = this.chunkRepository
      .createQueryBuilder('chunk')
      .leftJoinAndSelect('chunk.document', 'document');

    // Optional filtering
    if (documentId) {
      query.where('chunk.document_id = :documentId', { documentId });
    }

    // Sorting with backward compatibility
    query.orderBy('chunk.created_at', 'DESC');

    return await query.getMany();
  }

  // Complex QueryBuilder - Advanced filtering
  async search(options: {
    projectId?: string;
    documentIds?: string[];
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Chunk[]> {
    const query = this.chunkRepository
      .createQueryBuilder('chunk')
      .leftJoinAndSelect('chunk.document', 'document');

    // Filter by project
    if (options.projectId) {
      query.andWhere('document.project_id = :projectId', {
        projectId: options.projectId,
      });
    }

    // Filter by document IDs
    if (options.documentIds && options.documentIds.length > 0) {
      query.andWhere('chunk.document_id IN (:...documentIds)', {
        documentIds: options.documentIds,
      });
    }

    // Text search (simple LIKE)
    if (options.search) {
      query.andWhere('chunk.content ILIKE :search', {
        search: `%${options.search}%`,
      });
    }

    // Pagination
    if (options.limit) {
      query.limit(options.limit);
    }
    if (options.offset) {
      query.offset(options.offset);
    }

    // Sorting
    query.orderBy('chunk.created_at', 'DESC');

    return await query.getMany();
  }
}
```

### QueryBuilder Methods

| Method                | Use Case                   | Example                                                |
| --------------------- | -------------------------- | ------------------------------------------------------ |
| `where()`             | First WHERE clause         | `.where('user.id = :id', { id })`                      |
| `andWhere()`          | Additional AND condition   | `.andWhere('user.active = :active', { active: true })` |
| `orWhere()`           | Additional OR condition    | `.orWhere('user.role = :role', { role: 'admin' })`     |
| `leftJoinAndSelect()` | JOIN with relation loading | `.leftJoinAndSelect('user.profile', 'profile')`        |
| `innerJoin()`         | JOIN without loading       | `.innerJoin('user.profile', 'profile')`                |
| `orderBy()`           | Primary sort               | `.orderBy('user.created_at', 'DESC')`                  |
| `addOrderBy()`        | Additional sort            | `.addOrderBy('user.name', 'ASC')`                      |
| `limit()`             | Max results                | `.limit(10)`                                           |
| `offset()`            | Skip results               | `.offset(20)`                                          |
| `getMany()`           | Execute and get array      | `await query.getMany()`                                |
| `getOne()`            | Execute and get single     | `await query.getOne()`                                 |
| `getManyAndCount()`   | Get results + total count  | `await query.getManyAndCount()`                        |

### Best Practices

1. **Use named parameters** - `:paramName` syntax prevents SQL injection
2. **Use `andWhere()` for optional filters** - Builds dynamic queries cleanly
3. **Use `leftJoinAndSelect()` for optional relations** - Loads related data
4. **Use `innerJoin()` without select for filtering** - More efficient when you don't need the data
5. **Always order results** - Consistent pagination requires ordering
6. **Use `getManyAndCount()` for pagination** - Returns both results and total count

### Common Patterns

#### Optional Filtering Pattern

```typescript
async find(filters: {
  userId?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<Entity[]> {
  const query = this.repository.createQueryBuilder('entity');

  if (filters.userId) {
    query.andWhere('entity.user_id = :userId', { userId: filters.userId });
  }

  if (filters.status) {
    query.andWhere('entity.status = :status', { status: filters.status });
  }

  if (filters.startDate) {
    query.andWhere('entity.created_at >= :startDate', { startDate: filters.startDate });
  }

  if (filters.endDate) {
    query.andWhere('entity.created_at <= :endDate', { endDate: filters.endDate });
  }

  return await query.getMany();
}
```

#### Pagination Pattern

```typescript
async paginate(options: {
  page: number;
  limit: number;
  filters?: any;
}): Promise<{ items: Entity[]; total: number; page: number; totalPages: number }> {
  const query = this.repository.createQueryBuilder('entity');

  // Apply filters...

  query
    .orderBy('entity.created_at', 'DESC')
    .limit(options.limit)
    .offset((options.page - 1) * options.limit);

  const [items, total] = await query.getManyAndCount();

  return {
    items,
    total,
    page: options.page,
    totalPages: Math.ceil(total / options.limit),
  };
}
```

---

## Pattern 3: Manual Transactions with QueryRunner

### Description

Use QueryRunner for complex multi-step operations that require atomic transactions with validation between steps.

### When to Use

- Multiple database operations that must succeed or fail together
- Operations that require validation between steps
- Complex business logic with database state changes

### Example: InvitesService

```typescript
import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Invite } from './entities/invite.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class InvitesService {
  constructor(private readonly dataSource: DataSource) {}

  async accept(inviteId: string, userData: Partial<User>): Promise<User> {
    const queryRunner = this.dataSource.createQueryRunner();

    // Connect to database
    await queryRunner.connect();

    // Start transaction
    await queryRunner.startTransaction();

    try {
      // Step 1: Validate invite exists and is pending
      const invite = await queryRunner.manager.findOne(Invite, {
        where: { id: inviteId },
      });

      if (!invite) {
        throw new Error('Invite not found');
      }

      if (invite.status !== 'pending') {
        throw new Error('Invite already used or expired');
      }

      // Step 2: Create user
      const user = queryRunner.manager.create(User, {
        email: invite.email,
        ...userData,
      });
      const savedUser = await queryRunner.manager.save(user);

      // Step 3: Update invite status
      await queryRunner.manager.update(
        Invite,
        { id: inviteId },
        {
          status: 'accepted',
          accepted_at: new Date(),
          user_id: savedUser.id,
        }
      );

      // Step 4: Create organization membership
      await queryRunner.manager.insert('organization_members', {
        organization_id: invite.organization_id,
        user_id: savedUser.id,
        role: invite.role,
      });

      // Commit transaction - all steps succeeded
      await queryRunner.commitTransaction();

      return savedUser;
    } catch (err) {
      // Rollback transaction - one step failed
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      // Release connection back to pool
      await queryRunner.release();
    }
  }
}
```

### QueryRunner Methods

| Method                  | Use Case                         |
| ----------------------- | -------------------------------- |
| `createQueryRunner()`   | Create new transaction runner    |
| `connect()`             | Establish database connection    |
| `startTransaction()`    | Begin transaction                |
| `commitTransaction()`   | Commit all changes               |
| `rollbackTransaction()` | Undo all changes                 |
| `release()`             | Return connection to pool        |
| `manager.findOne()`     | Query within transaction         |
| `manager.save()`        | Insert/update within transaction |
| `manager.update()`      | Update within transaction        |
| `manager.delete()`      | Delete within transaction        |

### Best Practices

1. **Always use try-catch-finally** - Ensures cleanup
2. **Call `release()` in finally block** - Prevents connection leaks
3. **Rollback on any error** - Maintains consistency
4. **Validate between steps** - Ensures business logic
5. **Use `manager.save()` for entities** - Runs validation and hooks
6. **Use `manager.update()` for partial updates** - More efficient

### Transaction Isolation Levels

```typescript
// Default isolation level (READ COMMITTED)
await queryRunner.startTransaction();

// Serializable isolation (strictest)
await queryRunner.startTransaction('SERIALIZABLE');

// Read uncommitted (least strict, rarely used)
await queryRunner.startTransaction('READ UNCOMMITTED');
```

**Recommendation**: Use default isolation level unless you have specific requirements.

---

## Pattern 4: Soft Deletes and Timestamps

### Description

Use TypeORM decorators for automatic timestamp management and soft deletes.

### When to Use

- All entities should have timestamps (`created_at`, `updated_at`)
- Most entities should support soft deletes (audit trail)
- Hard deletes only for truly ephemeral data

### Example: Entity Definition

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  name: string;

  // Automatic timestamps
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Soft delete support
  @DeleteDateColumn()
  deleted_at: Date | null;
}
```

### Using Soft Deletes

```typescript
// Soft delete (sets deleted_at)
await this.repository.softDelete(id);

// Restore soft-deleted entity
await this.repository.restore(id);

// Find including soft-deleted
const allUsers = await this.repository.find({
  withDeleted: true,
});

// Find only soft-deleted
const deletedUsers = await this.repository
  .createQueryBuilder('user')
  .where('user.deleted_at IS NOT NULL')
  .withDeleted()
  .getMany();

// Hard delete (permanent)
await this.repository.delete(id);
```

### Best Practices

1. **Always add timestamps** - `@CreateDateColumn()` and `@UpdateDateColumn()`
2. **Add soft delete by default** - `@DeleteDateColumn()` unless ephemeral data
3. **Use `softDelete()` instead of `delete()`** - Maintains audit trail
4. **Document why hard deletes are used** - Should be rare
5. **Consider data retention policies** - Soft deletes can accumulate

---

## Pattern 5: Relation Loading Strategies

### Description

TypeORM provides multiple strategies for loading related entities.

### Strategy 1: Eager Loading (Entity Level)

```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Eager loading - always loads profile
  @OneToOne(() => UserProfile, { eager: true })
  @JoinColumn()
  profile: UserProfile;
}

// Usage - profile is automatically loaded
const user = await this.userRepository.findOne({ where: { id } });
// user.profile is available
```

**Pros**: Convenient, no additional queries needed  
**Cons**: Always loads relation (even when not needed), can cause N+1 queries

**Recommendation**: ❌ Avoid eager loading - use explicit loading instead

### Strategy 2: Lazy Loading

```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Lazy loading - loads when accessed
  @OneToOne(() => UserProfile)
  @JoinColumn()
  profile: Promise<UserProfile>;
}

// Usage - profile loads when accessed
const user = await this.userRepository.findOne({ where: { id } });
const profile = await user.profile; // Additional query
```

**Pros**: Loads only when needed  
**Cons**: Requires await, can cause N+1 queries, harder to track queries

**Recommendation**: ❌ Avoid lazy loading - use explicit loading instead

### Strategy 3: Explicit Loading with Relations Option (Recommended)

```typescript
// Load specific relations
const user = await this.userRepository.findOne({
  where: { id },
  relations: ['profile', 'organization'],
});

// Profile and organization are loaded
console.log(user.profile); // Available
console.log(user.organization); // Available
```

**Pros**: Explicit, predictable, single query with JOINs  
**Cons**: Must specify relations explicitly

**Recommendation**: ✅ Use this approach - most predictable

### Strategy 4: Explicit Loading with QueryBuilder (Recommended)

```typescript
const user = await this.userRepository
  .createQueryBuilder('user')
  .leftJoinAndSelect('user.profile', 'profile')
  .leftJoinAndSelect('user.organization', 'organization')
  .where('user.id = :id', { id })
  .getOne();
```

**Pros**: Explicit, can add WHERE clauses on relations, single query  
**Cons**: More verbose

**Recommendation**: ✅ Use for complex queries with filtering

### Best Practices

1. **Never use eager loading** - Makes queries unpredictable
2. **Avoid lazy loading** - Can cause N+1 queries
3. **Use `relations` option for simple cases** - Clean and explicit
4. **Use QueryBuilder for complex cases** - More control
5. **Always document loaded relations** - Makes API contracts clear

### N+1 Query Problem

❌ **Bad - N+1 Queries**

```typescript
// Loads users (1 query)
const users = await this.userRepository.find();

// Loads profile for each user (N queries)
for (const user of users) {
  const profile = await this.profileRepository.findOne({
    where: { user_id: user.id },
  });
  console.log(profile);
}
// Total: 1 + N queries
```

✅ **Good - Single Query with JOIN**

```typescript
// Loads users + profiles (1 query)
const users = await this.userRepository.find({
  relations: ['profile'],
});

// Profiles already loaded
for (const user of users) {
  console.log(user.profile);
}
// Total: 1 query
```

---

## Pattern 6: Backward Compatibility Fallbacks

### Description

Handle missing columns/tables gracefully during zero-downtime migrations.

### When to Use

- Deploying schema changes with zero downtime
- Supporting multiple database schema versions
- Gradual migration strategies

### Example: ChunksService

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chunk } from './entities/chunk.entity';

@Injectable()
export class ChunksService {
  constructor(
    @InjectRepository(Chunk)
    private readonly chunkRepository: Repository<Chunk>
  ) {}

  async list(documentId?: string): Promise<Chunk[]> {
    try {
      // Try to use new column (created_at)
      return await this.chunkRepository.find({
        where: documentId ? { document_id: documentId } : {},
        order: { created_at: 'DESC' },
      });
    } catch (err) {
      // Check if error is undefined column
      if (err.code === '42703') {
        // PostgreSQL error code for undefined_column
        // Fall back to id sort if created_at doesn't exist yet
        return await this.chunkRepository.find({
          where: documentId ? { document_id: documentId } : {},
          order: { id: 'DESC' },
        });
      }
      throw err;
    }
  }
}
```

### PostgreSQL Error Codes

| Code    | Constant           | Description           |
| ------- | ------------------ | --------------------- |
| `42P01` | `undefined_table`  | Table doesn't exist   |
| `42703` | `undefined_column` | Column doesn't exist  |
| `42P07` | `duplicate_table`  | Table already exists  |
| `42701` | `duplicate_column` | Column already exists |

### Example: NotificationsService (Table Fallback)

```typescript
async getPreferences(userId: string): Promise<NotificationPreferences> {
  try {
    // Try to query preferences table
    const prefs = await this.preferencesRepository.findOne({
      where: { user_id: userId },
    });
    return prefs || this.getDefaultPreferences();
  } catch (err) {
    if (err.code === '42P01') {
      // Table doesn't exist yet - return defaults
      return this.getDefaultPreferences();
    }
    throw err;
  }
}

private getDefaultPreferences(): NotificationPreferences {
  return {
    email_enabled: true,
    slack_enabled: false,
    in_app_enabled: true,
  };
}
```

### Best Practices

1. **Catch specific error codes** - Use PostgreSQL error codes (42703, 42P01)
2. **Log fallback usage** - Monitor when fallbacks are used
3. **Provide sensible defaults** - Don't return null/undefined
4. **Document migration strategy** - Explain why fallback exists
5. **Remove fallbacks after migration** - Clean up once schema is stable

### Migration Strategy with Fallbacks

**Phase 1: Add new column (nullable)**

```sql
ALTER TABLE chunks ADD COLUMN created_at TIMESTAMP;
```

**Phase 2: Deploy code with fallback**

```typescript
// Code tries created_at, falls back to id
```

**Phase 3: Backfill data**

```sql
UPDATE chunks SET created_at = NOW() WHERE created_at IS NULL;
```

**Phase 4: Make column non-nullable**

```sql
ALTER TABLE chunks ALTER COLUMN created_at SET NOT NULL;
```

**Phase 5: Remove fallback code**

```typescript
// Remove try-catch, use created_at directly
```

---

## Pattern 7: Bulk Operations

### Description

Efficiently insert or update multiple entities at once.

### When to Use

- Inserting/updating 10+ entities
- Performance is critical
- Data is validated upfront

### Bulk Insert

```typescript
// ❌ Bad - N queries
for (const data of items) {
  await this.repository.save(data);
}

// ✅ Good - 1 query
const entities = items.map((data) => this.repository.create(data));
await this.repository.save(entities);

// ✅ Better - 1 query with INSERT ... VALUES (faster)
await this.repository.insert(items);
```

### Bulk Update

```typescript
// ❌ Bad - N queries
for (const item of items) {
  await this.repository.update(item.id, { status: 'processed' });
}

// ✅ Good - 1 query (if updating to same value)
await this.repository.update(
  { id: In(items.map((i) => i.id)) },
  { status: 'processed' }
);

// ✅ Best - Use Strategic SQL for complex bulk updates
// See STRATEGIC_SQL_PATTERNS.md
```

### Bulk Delete

```typescript
// ❌ Bad - N queries
for (const id of ids) {
  await this.repository.delete(id);
}

// ✅ Good - 1 query
await this.repository.delete(ids);

// Or with soft delete
await this.repository.softDelete(ids);
```

### Best Practices

1. **Use `insert()` for bulk inserts** - Faster than `save()`
2. **`insert()` skips validation** - Validate data before inserting
3. **Use `save()` when validation needed** - Slower but safer
4. **Batch in chunks** - For 1000+ items, process in batches of 100-500
5. **Use Strategic SQL for complex bulk ops** - UPDATE with JOINs, conditional updates

### Chunked Bulk Insert

```typescript
async bulkInsert(items: Entity[], chunkSize = 500): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await this.repository.insert(chunk);
  }
}
```

---

## Pattern 8: Custom Repository Methods

### Description

Extend TypeORM repositories with custom methods for domain-specific queries.

### Example: Custom Repository

```typescript
// custom-user.repository.ts
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class CustomUserRepository extends Repository<User> {
  constructor(private dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  // Custom method - Find active users
  async findActiveUsers(): Promise<User[]> {
    return this.createQueryBuilder('user')
      .where('user.active = :active', { active: true })
      .andWhere('user.deleted_at IS NULL')
      .orderBy('user.created_at', 'DESC')
      .getMany();
  }

  // Custom method - Find by email (case-insensitive)
  async findByEmail(email: string): Promise<User | null> {
    return this.createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .getOne();
  }

  // Custom method - Count users by role
  async countByRole(role: string): Promise<number> {
    return this.createQueryBuilder('user')
      .where('user.role = :role', { role })
      .getCount();
  }
}
```

### Register Custom Repository

```typescript
// user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { CustomUserRepository } from './custom-user.repository';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [CustomUserRepository, UserService],
  exports: [UserService],
})
export class UserModule {}
```

### Use Custom Repository

```typescript
// user.service.ts
import { Injectable } from '@nestjs/common';
import { CustomUserRepository } from './custom-user.repository';

@Injectable()
export class UserService {
  constructor(private readonly customUserRepository: CustomUserRepository) {}

  async getActiveUsers() {
    return this.customUserRepository.findActiveUsers();
  }
}
```

### Best Practices

1. **Use for domain-specific queries** - Encapsulate complex queries
2. **Extend TypeORM Repository** - Inherit all standard methods
3. **Keep methods focused** - One query per method
4. **Use QueryBuilder** - More flexible than find options
5. **Add JSDoc comments** - Document what query does

---

## Pattern 9: Testing TypeORM Services

### Description

Mock TypeORM repositories and QueryRunner for unit tests.

### Example: Mocking Repository

```typescript
// user.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should find user by id', async () => {
    const mockUser = { id: '1', email: 'test@example.com' } as User;
    jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

    const result = await service.getById('1');

    expect(result).toEqual(mockUser);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
  });

  it('should create user', async () => {
    const userData = { email: 'test@example.com', name: 'Test' };
    const mockUser = { id: '1', ...userData } as User;

    jest.spyOn(repository, 'create').mockReturnValue(mockUser);
    jest.spyOn(repository, 'save').mockResolvedValue(mockUser);

    const result = await service.create(userData);

    expect(result).toEqual(mockUser);
    expect(repository.create).toHaveBeenCalledWith(userData);
    expect(repository.save).toHaveBeenCalledWith(mockUser);
  });
});
```

### Mocking QueryRunner (Transactions)

```typescript
describe('InvitesService', () => {
  let service: InvitesService;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(queryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should accept invite and create user', async () => {
    const mockInvite = {
      id: '1',
      email: 'test@example.com',
      status: 'pending',
    };
    const mockUser = { id: '2', email: 'test@example.com' };

    jest.spyOn(queryRunner.manager, 'findOne').mockResolvedValue(mockInvite);
    jest.spyOn(queryRunner.manager, 'save').mockResolvedValue(mockUser);

    const result = await service.accept('1', { name: 'Test User' });

    expect(result).toEqual(mockUser);
    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('should rollback on error', async () => {
    jest
      .spyOn(queryRunner.manager, 'findOne')
      .mockRejectedValue(new Error('DB error'));

    await expect(service.accept('1', {})).rejects.toThrow('DB error');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
```

### Best Practices

1. **Mock at repository level** - Don't mock database
2. **Test business logic, not TypeORM** - Focus on service methods
3. **Mock both success and failure cases** - Test error handling
4. **Verify method calls** - Ensure correct queries are made
5. **Use test database for integration tests** - Test actual queries

---

## Anti-Patterns to Avoid

### 1. ❌ N+1 Query Problem

```typescript
// ❌ Bad
const users = await this.userRepository.find();
for (const user of users) {
  user.profile = await this.profileRepository.findOne({
    where: { user_id: user.id },
  });
}

// ✅ Good
const users = await this.userRepository.find({
  relations: ['profile'],
});
```

### 2. ❌ Eager Loading Everything

```typescript
// ❌ Bad - Entity with eager loading
@Entity()
export class User {
  @OneToOne(() => Profile, { eager: true })
  profile: Profile;

  @OneToMany(() => Post, { eager: true })
  posts: Post[];

  @ManyToOne(() => Organization, { eager: true })
  organization: Organization;
}

// ✅ Good - No eager loading, explicit relations
@Entity()
export class User {
  @OneToOne(() => Profile)
  profile: Profile;

  @OneToMany(() => Post)
  posts: Post[];

  @ManyToOne(() => Organization)
  organization: Organization;
}
```

### 3. ❌ Using `save()` for Bulk Inserts

```typescript
// ❌ Bad - N queries
for (const item of items) {
  await this.repository.save(item);
}

// ✅ Good - 1 query
await this.repository.insert(items);
```

### 4. ❌ Not Using Transactions for Multi-Step Operations

```typescript
// ❌ Bad - No transaction
async transfer(from: string, to: string, amount: number) {
  await this.accountRepository.update(from, { balance: balance - amount });
  await this.accountRepository.update(to, { balance: balance + amount });
}

// ✅ Good - With transaction
async transfer(from: string, to: string, amount: number) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.manager.update(Account, from, { balance: balance - amount });
    await queryRunner.manager.update(Account, to, { balance: balance + amount });
    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
```

### 5. ❌ Ignoring Type Safety

```typescript
// ❌ Bad - Using any
async create(data: any): Promise<any> {
  return await this.repository.save(data);
}

// ✅ Good - Using types
async create(data: Partial<User>): Promise<User> {
  const user = this.repository.create(data);
  return await this.repository.save(user);
}
```

---

## Decision Tree: TypeORM vs Strategic SQL

```
Does the operation require PostgreSQL-specific features?
├─ Yes → Use Strategic SQL
│   ├─ Advisory locks → Strategic SQL
│   ├─ Recursive CTEs → Strategic SQL
│   ├─ Full-text search (ts_rank) → Strategic SQL
│   ├─ Vector search (pgvector) → Strategic SQL
│   ├─ Window functions → Strategic SQL
│   ├─ COUNT FILTER → Strategic SQL
│   ├─ LATERAL joins → Strategic SQL
│   ├─ pgcrypto functions → Strategic SQL
│   └─ FOR UPDATE SKIP LOCKED → Strategic SQL
│
└─ No → Does it need complex filtering or JOINs?
    ├─ Yes → Use TypeORM QueryBuilder
    │   ├─ Multiple WHERE conditions → QueryBuilder
    │   ├─ Dynamic filtering → QueryBuilder
    │   ├─ JOINs across relations → QueryBuilder
    │   ├─ Complex sorting → QueryBuilder
    │   └─ Pagination → QueryBuilder
    │
    └─ No → Does it need a transaction?
        ├─ Yes → Use TypeORM QueryRunner
        │   ├─ Multi-step atomic operations → QueryRunner
        │   ├─ Validation between steps → QueryRunner
        │   └─ Complex business logic → QueryRunner
        │
        └─ No → Use TypeORM Repository
            ├─ Create entity → Repository.save()
            ├─ Read by ID → Repository.findOne()
            ├─ Update entity → Repository.update()
            ├─ Delete entity → Repository.softDelete()
            └─ Simple queries → Repository.find()
```

---

## Summary

### Key Takeaways

1. **Use Repository for simple CRUD** - Most common pattern
2. **Use QueryBuilder for complex queries** - Dynamic filtering, JOINs
3. **Use QueryRunner for transactions** - Multi-step atomic operations
4. **Never use eager loading** - Makes queries unpredictable
5. **Always use explicit relation loading** - More predictable and efficient
6. **Prefer soft deletes** - Maintains audit trail
7. **Use bulk operations** - 10x faster for multiple entities
8. **Handle backward compatibility** - Support zero-downtime migrations
9. **Test with mocks** - Focus on business logic
10. **Use Strategic SQL when needed** - Don't force TypeORM for PostgreSQL features

### Quick Reference

| Use Case          | Pattern                 | Example                                   |
| ----------------- | ----------------------- | ----------------------------------------- |
| Create entity     | Repository.save()       | `await repo.save(entity)`                 |
| Read by ID        | Repository.findOne()    | `await repo.findOne({ where: { id } })`   |
| Update entity     | Repository.update()     | `await repo.update(id, data)`             |
| Delete entity     | Repository.softDelete() | `await repo.softDelete(id)`               |
| Complex filtering | QueryBuilder            | `repo.createQueryBuilder('e').where(...)` |
| Load relations    | find() with relations   | `repo.find({ relations: ['profile'] })`   |
| Transaction       | QueryRunner             | `dataSource.createQueryRunner()`          |
| Bulk insert       | Repository.insert()     | `await repo.insert(items)`                |

---

## Next Steps

- Read [STRATEGIC_SQL_PATTERNS.md](./STRATEGIC_SQL_PATTERNS.md) for PostgreSQL-specific patterns
- Review [MIGRATION_TRACKING.md](../migrations/MIGRATION_TRACKING.md) for migration status
- See [TYPEORM_MIGRATION_SUMMARY.md](../migrations/TYPEORM_MIGRATION_SUMMARY.md) for overall statistics

---

**Questions or suggestions?** Open an issue or submit a PR to improve this guide!
