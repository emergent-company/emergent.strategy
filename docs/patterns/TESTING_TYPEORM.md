# Testing TypeORM Services - Comprehensive Guide

## Table of Contents

1. [Overview](#overview)
2. [Testing Strategy](#testing-strategy)
3. [Unit Testing Patterns](#unit-testing-patterns)
4. [Mock Factory Patterns](#mock-factory-patterns)
5. [QueryBuilder Testing](#querybuilder-testing)
6. [Transaction Testing](#transaction-testing)
7. [E2E Testing Patterns](#e2e-testing-patterns)
8. [Testing Anti-Patterns](#testing-anti-patterns)
9. [Best Practices](#best-practices)

## Overview

This guide covers testing patterns for services using TypeORM in the spec-server-2 project. We focus on:

- **Unit tests**: Fast, isolated tests with mocked dependencies
- **Integration tests**: Testing database interactions with real PostgreSQL
- **E2E tests**: Full request/response cycle testing

### Testing Philosophy

```
Unit Tests (Fast, Isolated)
    ↓
Integration Tests (Real DB, Isolated Transactions)
    ↓
E2E Tests (Full Stack, Real Auth)
```

**Key Principles**:
- Mock TypeORM repositories and QueryBuilder in unit tests
- Use test database with transactions for integration tests
- Leverage existing test utilities and factories
- Test both success and error paths
- Validate TypeORM-specific behaviors (lazy loading, transactions, etc.)

## Testing Strategy

### When to Use Each Test Type

| Test Type | Use When | Examples |
|-----------|----------|----------|
| **Unit** | Testing business logic without DB | Validation, transformations, error handling |
| **Integration** | Testing TypeORM queries and relations | Complex QueryBuilder, transactions, relations |
| **E2E** | Testing full API endpoints | Auth flows, request/response validation |

### Decision Tree

```
Does this test need a real database?
├─ NO → Unit Test (mock Repository/QueryBuilder)
│   └─ Fast, isolated, test logic only
│
└─ YES → Does it need auth/HTTP context?
    ├─ NO → Integration Test (real DB, no HTTP)
    │   └─ Test complex queries, transactions
    │
    └─ YES → E2E Test (full stack)
        └─ Test API endpoints, auth, full flow
```

## Unit Testing Patterns

### Pattern 1: Basic Repository CRUD Mocking

**Use Case**: Testing simple CRUD operations without database

**Example**: UserProfileService basic operations

```typescript
// user-profile.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfileService } from './user-profile.service';
import { UserProfile } from './entities/user-profile.entity';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let repository: jest.Mocked<Repository<UserProfile>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileService,
        {
          provide: getRepositoryToken(UserProfile),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            remove: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserProfileService>(UserProfileService);
    repository = module.get(getRepositoryToken(UserProfile));
  });

  describe('findById', () => {
    it('should return a user profile', async () => {
      const mockProfile = {
        id: '123',
        userId: 'user-1',
        displayName: 'John Doe',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.findOne.mockResolvedValue(mockProfile as UserProfile);

      const result = await service.findById('123');

      expect(result).toEqual(mockProfile);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });

    it('should return null when profile not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create and save a new profile', async () => {
      const createDto = {
        userId: 'user-1',
        displayName: 'John Doe',
      };

      const mockProfile = {
        id: '123',
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create.mockReturnValue(mockProfile as UserProfile);
      repository.save.mockResolvedValue(mockProfile as UserProfile);

      const result = await service.create(createDto);

      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalledWith(mockProfile);
      expect(result).toEqual(mockProfile);
    });
  });

  describe('update', () => {
    it('should update existing profile', async () => {
      const existingProfile = {
        id: '123',
        userId: 'user-1',
        displayName: 'Old Name',
      };

      const updateDto = {
        displayName: 'New Name',
      };

      repository.findOne.mockResolvedValue(existingProfile as UserProfile);
      repository.save.mockResolvedValue({
        ...existingProfile,
        ...updateDto,
      } as UserProfile);

      const result = await service.update('123', updateDto);

      expect(result.displayName).toBe('New Name');
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw error when profile not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent', {})).rejects.toThrow();
    });
  });
});
```

**Key Points**:
- Use `getRepositoryToken()` from `@nestjs/typeorm`
- Mock only the methods you use
- Test both success and error paths
- Validate method arguments with `toHaveBeenCalledWith()`

### Pattern 2: Mock Factory Pattern

**Use Case**: Reusable mock creation for consistent testing

**Example**: Creating mock repositories

```typescript
// test/factories/repository.factory.ts
import { Repository } from 'typeorm';

export function createMockRepository<T = any>(): jest.Mocked<Repository<T>> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
    findAndCount: jest.fn(),
    softRemove: jest.fn(),
    softDelete: jest.fn(),
    recover: jest.fn(),
    restore: jest.fn(),
    // Add other methods as needed
  } as any;
}

// Usage in tests
describe('InvitesService', () => {
  let service: InvitesService;
  let inviteRepository: jest.Mocked<Repository<Invite>>;

  beforeEach(async () => {
    inviteRepository = createMockRepository<Invite>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        {
          provide: getRepositoryToken(Invite),
          useValue: inviteRepository,
        },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
  });

  // Tests...
});
```

**Benefits**:
- Consistent mock structure across tests
- Easy to maintain and update
- Type-safe with TypeScript
- Reduces boilerplate code

## QueryBuilder Testing

### Pattern 3: Chainable QueryBuilder Mocking

**Use Case**: Testing services that use QueryBuilder for complex queries

**Example**: ChunksService with filtering

```typescript
// chunks.service.spec.ts
describe('ChunksService - QueryBuilder', () => {
  let service: ChunksService;
  let repository: jest.Mocked<Repository<Chunk>>;
  let queryBuilder: any;

  beforeEach(async () => {
    // Create chainable QueryBuilder mock
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getOne: jest.fn(),
      getManyAndCount: jest.fn(),
      getCount: jest.fn(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
      setParameter: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
    };

    repository = createMockRepository<Chunk>();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChunksService,
        {
          provide: getRepositoryToken(Chunk),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<ChunksService>(ChunksService);
  });

  describe('findWithFilters', () => {
    it('should build query with all filters', async () => {
      const filters = {
        documentId: 'doc-1',
        search: 'test query',
        minScore: 0.5,
        limit: 10,
        offset: 0,
      };

      const mockChunks = [
        { id: '1', content: 'test chunk 1' },
        { id: '2', content: 'test chunk 2' },
      ];

      queryBuilder.getMany.mockResolvedValue(mockChunks);

      const result = await service.findWithFilters(filters);

      // Verify QueryBuilder chain
      expect(repository.createQueryBuilder).toHaveBeenCalledWith('chunk');
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'chunk.documentId = :documentId',
        { documentId: 'doc-1' }
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'chunk.content ILIKE :search',
        { search: '%test query%' }
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'chunk.score >= :minScore',
        { minScore: 0.5 }
      );
      expect(queryBuilder.take).toHaveBeenCalledWith(10);
      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(queryBuilder.getMany).toHaveBeenCalled();

      expect(result).toEqual(mockChunks);
    });

    it('should handle empty filters', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      const result = await service.findWithFilters({});

      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(queryBuilder.where).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should handle getManyAndCount', async () => {
      const mockResult = [
        [{ id: '1' }, { id: '2' }],
        2,
      ] as [Chunk[], number];

      queryBuilder.getManyAndCount.mockResolvedValue(mockResult);

      const result = await service.findAndCountWithFilters({});

      expect(queryBuilder.getManyAndCount).toHaveBeenCalled();
      expect(result).toEqual({ items: mockResult[0], total: 2 });
    });
  });
});
```

**Key Points**:
- Every QueryBuilder method returns `this` for chaining
- Mock `createQueryBuilder` on repository
- Verify the query chain with `toHaveBeenCalledWith()`
- Test parameter binding separately

### Pattern 4: Testing Complex Joins and Relations

**Example**: Testing services with relation loading

```typescript
describe('DocumentService - Relations', () => {
  it('should load document with chunks relation', async () => {
    const mockDocument = {
      id: 'doc-1',
      title: 'Test Doc',
      chunks: [
        { id: 'chunk-1', content: 'Content 1' },
        { id: 'chunk-2', content: 'Content 2' },
      ],
    };

    repository.findOne.mockResolvedValue(mockDocument as Document);

    const result = await service.findWithChunks('doc-1');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      relations: ['chunks'],
    });
    expect(result.chunks).toHaveLength(2);
  });

  it('should use QueryBuilder for complex joins', async () => {
    const mockResults = [
      {
        id: 'doc-1',
        title: 'Doc 1',
        chunk_count: 5,
        user_name: 'John Doe',
      },
    ];

    queryBuilder.getRawMany.mockResolvedValue(mockResults);

    const result = await service.findWithChunkCounts();

    expect(queryBuilder.leftJoin).toHaveBeenCalledWith('doc.chunks', 'chunk');
    expect(queryBuilder.leftJoin).toHaveBeenCalledWith('doc.user', 'user');
    expect(queryBuilder.select).toHaveBeenCalledWith([
      'doc.id',
      'doc.title',
      'COUNT(chunk.id) as chunk_count',
      'user.name as user_name',
    ]);
    expect(queryBuilder.groupBy).toHaveBeenCalledWith('doc.id, user.id');
  });
});
```

## Transaction Testing

### Pattern 5: QueryRunner Transaction Mocking

**Use Case**: Testing services that use manual transactions

**Example**: InvitesService with transaction rollback

```typescript
// invites.service.spec.ts
describe('InvitesService - Transactions', () => {
  let service: InvitesService;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    // Create mock QueryRunner
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    } as any;

    // Create mock DataSource
    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(Invite),
          useValue: createMockRepository<Invite>(),
        },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
  });

  describe('createInviteWithUser', () => {
    it('should commit transaction on success', async () => {
      const createDto = {
        email: 'test@example.com',
        organizationId: 'org-1',
      };

      const mockInvite = { id: 'invite-1', ...createDto };
      const mockUser = { id: 'user-1', email: createDto.email };

      (queryRunner.manager.create as jest.Mock)
        .mockReturnValueOnce(mockInvite)
        .mockReturnValueOnce(mockUser);
      
      (queryRunner.manager.save as jest.Mock)
        .mockResolvedValueOnce(mockInvite)
        .mockResolvedValueOnce(mockUser);

      const result = await service.createInviteWithUser(createDto);

      expect(queryRunner.connect).toHaveBeenCalled();
      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.manager.save).toHaveBeenCalledTimes(2);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
      expect(result).toEqual({ invite: mockInvite, user: mockUser });
    });

    it('should rollback transaction on error', async () => {
      const createDto = {
        email: 'test@example.com',
        organizationId: 'org-1',
      };

      (queryRunner.manager.save as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.createInviteWithUser(createDto)).rejects.toThrow(
        'Database error'
      );

      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should release queryRunner even if rollback fails', async () => {
      (queryRunner.manager.save as jest.Mock).mockRejectedValue(
        new Error('Save failed')
      );
      (queryRunner.rollbackTransaction as jest.Mock).mockRejectedValue(
        new Error('Rollback failed')
      );

      await expect(service.createInviteWithUser({})).rejects.toThrow();

      expect(queryRunner.release).toHaveBeenCalled();
    });
  });
});
```

**Key Points**:
- Mock `DataSource.createQueryRunner()`
- Track transaction lifecycle: connect → start → commit/rollback → release
- Test both success path (commit) and error path (rollback)
- Verify cleanup (`release()`) is always called

### Pattern 6: FakeDataSource Helper

**Use Case**: Reusable DataSource mock for transaction testing

```typescript
// test/helpers/fake-datasource.ts
export class FakeDataSource {
  private queryRunnerMock: any;

  constructor() {
    this.queryRunnerMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        save: jest.fn(),
        create: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        createQueryBuilder: jest.fn(),
      },
    };
  }

  createQueryRunner(): any {
    return this.queryRunnerMock;
  }

  getQueryRunner(): any {
    return this.queryRunnerMock;
  }

  reset(): void {
    Object.values(this.queryRunnerMock).forEach((fn: any) => {
      if (typeof fn?.mockClear === 'function') {
        fn.mockClear();
      }
    });
    Object.values(this.queryRunnerMock.manager).forEach((fn: any) => {
      if (typeof fn?.mockClear === 'function') {
        fn.mockClear();
      }
    });
  }
}

// Usage in tests
describe('Service with Transactions', () => {
  let service: MyService;
  let fakeDataSource: FakeDataSource;

  beforeEach(() => {
    fakeDataSource = new FakeDataSource();

    const module = Test.createTestingModule({
      providers: [
        MyService,
        {
          provide: DataSource,
          useValue: fakeDataSource,
        },
      ],
    }).compile();

    service = module.get(MyService);
  });

  it('should handle transaction', async () => {
    const qr = fakeDataSource.getQueryRunner();
    qr.manager.save.mockResolvedValue({ id: '1' });

    await service.doSomethingTransactional();

    expect(qr.startTransaction).toHaveBeenCalled();
    expect(qr.commitTransaction).toHaveBeenCalled();
  });
});
```

## E2E Testing Patterns

### Pattern 7: E2E Test Setup with Auth

**Use Case**: Testing full API endpoints with authentication

**Example**: UserProfile E2E tests

```typescript
// user-profile.basic.e2e.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('UserProfile E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  beforeEach(async () => {
    // Get auth token helper
    const authResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123',
      })
      .expect(200);

    authToken = authResponse.body.accessToken;
    userId = authResponse.body.user.id;
  });

  afterEach(async () => {
    // Clean up test data
    await dataSource.query('DELETE FROM user_profiles WHERE user_id = $1', [
      userId,
    ]);
  });

  describe('GET /user-profiles/:id', () => {
    it('should return user profile', async () => {
      // Arrange: Create profile
      const createResponse = await request(app.getHttpServer())
        .post('/user-profiles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          displayName: 'John Doe',
          bio: 'Test bio',
        })
        .expect(201);

      const profileId = createResponse.body.id;

      // Act: Fetch profile
      const response = await request(app.getHttpServer())
        .get(`/user-profiles/${profileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Assert
      expect(response.body).toMatchObject({
        id: profileId,
        displayName: 'John Doe',
        bio: 'Test bio',
        userId: userId,
      });
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('should return 404 for non-existent profile', async () => {
      await request(app.getHttpServer())
        .get('/user-profiles/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/user-profiles/some-id')
        .expect(401);
    });
  });

  describe('POST /user-profiles', () => {
    it('should create new profile', async () => {
      const createDto = {
        displayName: 'Jane Doe',
        bio: 'Software Engineer',
        avatarUrl: 'https://example.com/avatar.jpg',
      };

      const response = await request(app.getHttpServer())
        .post('/user-profiles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toMatchObject(createDto);
      expect(response.body.id).toBeDefined();
      expect(response.body.userId).toBe(userId);
    });

    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/user-profiles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.message).toContain('displayName');
    });
  });

  describe('PATCH /user-profiles/:id', () => {
    it('should update profile', async () => {
      // Create profile
      const createResponse = await request(app.getHttpServer())
        .post('/user-profiles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayName: 'Original Name' })
        .expect(201);

      const profileId = createResponse.body.id;

      // Update profile
      const updateResponse = await request(app.getHttpServer())
        .patch(`/user-profiles/${profileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayName: 'Updated Name' })
        .expect(200);

      expect(updateResponse.body.displayName).toBe('Updated Name');
      expect(updateResponse.body.id).toBe(profileId);
    });
  });

  describe('DELETE /user-profiles/:id', () => {
    it('should delete profile', async () => {
      // Create profile
      const createResponse = await request(app.getHttpServer())
        .post('/user-profiles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayName: 'To Delete' })
        .expect(201);

      const profileId = createResponse.body.id;

      // Delete profile
      await request(app.getHttpServer())
        .delete(`/user-profiles/${profileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify deletion
      await request(app.getHttpServer())
        .get(`/user-profiles/${profileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
```

**Key Points**:
- Use real database with test environment
- Clean up test data in `afterEach`
- Test authentication and authorization
- Validate request/response bodies
- Test error cases (404, 401, 400)

### Pattern 8: E2E Test Helpers

**Example**: Reusable auth and setup helpers

```typescript
// test/helpers/e2e-helpers.ts
export class E2ETestHelper {
  constructor(private app: INestApplication) {}

  async authenticate(
    email = 'test@example.com',
    password = 'password123'
  ): Promise<{ token: string; userId: string }> {
    const response = await request(this.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    return {
      token: response.body.accessToken,
      userId: response.body.user.id,
    };
  }

  async createTestUser(overrides = {}): Promise<any> {
    const response = await request(this.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `test-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Test User',
        ...overrides,
      })
      .expect(201);

    return response.body;
  }

  async cleanupUser(userId: string): Promise<void> {
    const dataSource = this.app.get(DataSource);
    await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
  }

  async getAuthHeaders(token: string): Promise<{ Authorization: string }> {
    return { Authorization: `Bearer ${token}` };
  }
}

// Usage in tests
describe('API E2E', () => {
  let app: INestApplication;
  let helper: E2ETestHelper;

  beforeAll(async () => {
    // Setup app...
    helper = new E2ETestHelper(app);
  });

  it('should test authenticated endpoint', async () => {
    const { token } = await helper.authenticate();
    const headers = await helper.getAuthHeaders(token);

    await request(app.getHttpServer())
      .get('/protected-resource')
      .set(headers)
      .expect(200);
  });
});
```

## Testing Anti-Patterns

### ❌ Anti-Pattern 1: Testing TypeORM Internals

**Don't Test**:
```typescript
// BAD: Testing TypeORM's implementation
it('should call repository.save internally', async () => {
  await service.create(dto);
  expect(repository.save).toHaveBeenCalled();
});
```

**Do Test**:
```typescript
// GOOD: Testing behavior and output
it('should create and return user profile', async () => {
  repository.save.mockResolvedValue(mockProfile);
  
  const result = await service.create(dto);
  
  expect(result).toEqual(mockProfile);
  expect(result.id).toBeDefined();
});
```

### ❌ Anti-Pattern 2: Over-Mocking

**Don't Mock**:
```typescript
// BAD: Mocking everything, even simple transformations
it('should uppercase display name', () => {
  const spy = jest.spyOn(String.prototype, 'toUpperCase');
  service.formatDisplayName('john');
  expect(spy).toHaveBeenCalled();
});
```

**Do Test**:
```typescript
// GOOD: Test the actual behavior
it('should uppercase display name', () => {
  expect(service.formatDisplayName('john')).toBe('JOHN');
});
```

### ❌ Anti-Pattern 3: Not Testing Error Paths

**Don't Ignore**:
```typescript
// BAD: Only testing happy path
it('should find user', async () => {
  repository.findOne.mockResolvedValue(mockUser);
  const result = await service.findById('1');
  expect(result).toEqual(mockUser);
});
```

**Do Test**:
```typescript
// GOOD: Test both success and error paths
it('should find user', async () => {
  repository.findOne.mockResolvedValue(mockUser);
  const result = await service.findById('1');
  expect(result).toEqual(mockUser);
});

it('should throw NotFoundException when user not found', async () => {
  repository.findOne.mockResolvedValue(null);
  await expect(service.findById('999')).rejects.toThrow(NotFoundException);
});

it('should handle database errors', async () => {
  repository.findOne.mockRejectedValue(new Error('DB connection failed'));
  await expect(service.findById('1')).rejects.toThrow('DB connection failed');
});
```

### ❌ Anti-Pattern 4: Brittle QueryBuilder Tests

**Don't Write**:
```typescript
// BAD: Too specific, breaks on any query change
expect(queryBuilder.where).toHaveBeenCalledWith(
  'user.name = :name AND user.age > :age AND user.active = :active',
  { name: 'John', age: 18, active: true }
);
```

**Do Write**:
```typescript
// GOOD: Test the important parts
expect(queryBuilder.where).toHaveBeenCalledWith(
  expect.stringContaining('user.name = :name'),
  expect.objectContaining({ name: 'John' })
);
expect(queryBuilder.andWhere).toHaveBeenCalledWith(
  expect.stringContaining('user.age > :age'),
  expect.objectContaining({ age: 18 })
);
```

### ❌ Anti-Pattern 5: Not Cleaning Up E2E Tests

**Don't Leave**:
```typescript
// BAD: Test data accumulates
it('should create user', async () => {
  await request(app.getHttpServer())
    .post('/users')
    .send({ email: 'test@example.com' });
  // No cleanup
});
```

**Do Clean**:
```typescript
// GOOD: Clean up after each test
afterEach(async () => {
  await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
    'test-%@example.com',
  ]);
});

it('should create user', async () => {
  await request(app.getHttpServer())
    .post('/users')
    .send({ email: 'test-123@example.com' });
});
```

## Best Practices

### 1. Use Test Fixtures and Factories

```typescript
// test/fixtures/user.fixtures.ts
export const createUserFixture = (overrides = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const createUserProfileFixture = (overrides = {}) => ({
  id: 'profile-1',
  userId: 'user-1',
  displayName: 'Test User',
  bio: 'Test bio',
  ...overrides,
});

// Usage
const mockUser = createUserFixture({ email: 'custom@example.com' });
```

### 2. Test Transactions Properly

```typescript
it('should rollback on error', async () => {
  const qr = fakeDataSource.getQueryRunner();
  qr.manager.save.mockRejectedValue(new Error('Save failed'));

  await expect(service.transactionalMethod()).rejects.toThrow();

  expect(qr.startTransaction).toHaveBeenCalled();
  expect(qr.rollbackTransaction).toHaveBeenCalled();
  expect(qr.commitTransaction).not.toHaveBeenCalled();
  expect(qr.release).toHaveBeenCalled();
});
```

### 3. Test Relation Loading

```typescript
it('should eager load relations when specified', async () => {
  const mockUser = {
    id: '1',
    profile: { displayName: 'John' },
    roles: [{ name: 'admin' }],
  };

  repository.findOne.mockResolvedValue(mockUser);

  const result = await service.findWithRelations('1');

  expect(repository.findOne).toHaveBeenCalledWith({
    where: { id: '1' },
    relations: ['profile', 'roles'],
  });
  expect(result.profile).toBeDefined();
  expect(result.roles).toHaveLength(1);
});
```

### 4. Test Soft Deletes

```typescript
describe('soft delete', () => {
  it('should soft delete entity', async () => {
    repository.softDelete.mockResolvedValue({ affected: 1, raw: [] });

    await service.softDelete('1');

    expect(repository.softDelete).toHaveBeenCalledWith('1');
  });

  it('should exclude soft-deleted by default', async () => {
    repository.find.mockResolvedValue([/* active entities */]);

    await service.findAll();

    expect(repository.find).toHaveBeenCalledWith({
      where: { deletedAt: IsNull() },
    });
  });

  it('should include soft-deleted when withDeleted=true', async () => {
    repository.find.mockResolvedValue([/* all entities */]);

    await service.findAll({ withDeleted: true });

    expect(repository.find).toHaveBeenCalledWith({
      withDeleted: true,
    });
  });
});
```

### 5. Test Pagination

```typescript
it('should paginate results', async () => {
  const mockResults = [
    [{ id: '1' }, { id: '2' }],
    100,
  ] as [User[], number];

  queryBuilder.getManyAndCount.mockResolvedValue(mockResults);

  const result = await service.paginate({ page: 1, limit: 10 });

  expect(queryBuilder.skip).toHaveBeenCalledWith(0);
  expect(queryBuilder.take).toHaveBeenCalledWith(10);
  expect(result).toEqual({
    items: mockResults[0],
    total: 100,
    page: 1,
    pageCount: 10,
  });
});
```

### 6. Organize Test Files

```
tests/
├── unit/
│   ├── services/
│   │   ├── user-profile.service.spec.ts
│   │   ├── chunks.service.spec.ts
│   │   └── invites.service.spec.ts
│   └── common/
│       └── guards/
├── integration/
│   └── repositories/
│       └── user.repository.integration.spec.ts
├── e2e/
│   ├── auth.e2e.spec.ts
│   └── user-profile.e2e.spec.ts
├── fixtures/
│   ├── user.fixtures.ts
│   └── profile.fixtures.ts
└── helpers/
    ├── fake-datasource.ts
    ├── e2e-helper.ts
    └── repository.factory.ts
```

### 7. Use Descriptive Test Names

```typescript
// GOOD: Descriptive test names
describe('UserProfileService', () => {
  describe('create', () => {
    it('should create profile with valid data');
    it('should throw BadRequestException when displayName is empty');
    it('should set createdAt and updatedAt timestamps');
    it('should associate profile with userId');
  });

  describe('update', () => {
    it('should update only provided fields');
    it('should throw NotFoundException when profile does not exist');
    it('should not allow updating userId');
  });
});
```

## Summary Checklist

### Unit Test Checklist
- [ ] Mock Repository and DataSource dependencies
- [ ] Test both success and error paths
- [ ] Verify method arguments with `toHaveBeenCalledWith()`
- [ ] Use mock factories for consistency
- [ ] Test business logic in isolation

### QueryBuilder Test Checklist
- [ ] Mock QueryBuilder with chainable methods
- [ ] Verify query construction step-by-step
- [ ] Test parameter binding
- [ ] Mock `getMany()`, `getOne()`, `getManyAndCount()`
- [ ] Test complex joins and relations

### Transaction Test Checklist
- [ ] Mock DataSource and QueryRunner
- [ ] Test commit path (success)
- [ ] Test rollback path (error)
- [ ] Verify `release()` is always called
- [ ] Test transaction isolation

### E2E Test Checklist
- [ ] Use real database (test environment)
- [ ] Clean up test data in `afterEach`
- [ ] Test authentication/authorization
- [ ] Validate request/response schemas
- [ ] Test error responses (404, 401, 400, 500)
- [ ] Use test helpers for common operations

## References

- [TypeORM Testing Guide](https://typeorm.io/testing)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Jest Mocking](https://jestjs.io/docs/mock-functions)
- [Supertest E2E Testing](https://github.com/visionmedia/supertest)

---

**Related Documentation**:
- [TypeORM Patterns](./TYPEORM_PATTERNS.md) - Service implementation patterns
- [Strategic SQL Patterns](./STRATEGIC_SQL_PATTERNS.md) - When to use raw SQL
- [Contributing Guide](../../CONTRIBUTING.md) - Development workflow

**Last Updated**: 2024-01-15
