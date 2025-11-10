# AI Agent Testing Guide

**Purpose**: Condensed testing reference optimized for AI coding agents. For human-readable documentation, see [TESTING_GUIDE.md](./TESTING_GUIDE.md).

**Format**: Rules, templates, and checklists for quick decision-making.

## Quick Decision Tree

```
Choose Test Type:
│
├─ Testing single function/class?
│  ├─ Mock all dependencies? → UNIT TEST (tests/unit/)
│  └─ Need real services? → Consider integration test
│
├─ Testing multiple components together?
│  ├─ Mocking external APIs? → INTEGRATION TEST (tests/integration/)
│  └─ Need real DB? → Consider e2e test
│
└─ Testing complete user workflow?
   └─ Real DB + Auth required? → E2E TEST (tests/e2e/)
```

## Core Rules

### Rule 1: File Locations

```
Unit:        apps/{app}/tests/unit/**/*.spec.ts
Integration: apps/{app}/tests/integration/**/*.integration.spec.ts
E2E:         apps/{app}/tests/e2e/**/*.e2e-spec.ts
Helpers:     apps/{app}/tests/{type}/helpers/ (type-specific)
             apps/{app}/tests/helpers/ (shared across all types)
```

### Rule 2: Mocking Strategy

```
| Component          | Unit Test  | Integration | E2E Test   |
|--------------------|------------|-------------|------------|
| Database           | MOCK       | Mock/Memory | REAL       |
| HTTP APIs          | MOCK       | MSW         | MSW/REAL   |
| Authentication     | MOCK       | Mock        | REAL       |
| Internal Services  | MOCK       | REAL        | REAL       |
```

### Rule 3: Always Document Mocks

```typescript
/**
 * Tests {what you're testing}.
 *
 * Mocked:
 * - {Service}: {why mocked}
 * - {API}: {why mocked}
 *
 * Auth: {auth setup description}
 * Database: {database setup description}
 */
```

### Rule 4: Test Structure

```
1. Arrange: Set up test data and mocks
2. Act: Execute code under test
3. Assert: Verify expected outcome
```

### Rule 5: Cleanup

```
- beforeEach: Clear mocks with vi.clearAllMocks()
- afterEach: Clean up test resources
- afterAll: Tear down test context (e2e)
```

## Templates

### Unit Test Template

```typescript
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { ServiceUnderTest } from '../../../src/modules/feature/service-under-test';
import { DependencyService } from '../../../src/modules/dependency/dependency.service';

/**
 * Tests ServiceUnderTest business logic.
 *
 * Mocked:
 * - DependencyService: Returns deterministic test data
 * - DatabaseService: Mocked to avoid real DB queries
 *
 * Auth: N/A (unit test)
 * Database: Mocked
 */
describe('ServiceUnderTest', () => {
  let service: ServiceUnderTest;
  let mockDependency: { method: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    // Arrange: Set up mocks
    mockDependency = {
      method: vi.fn().mockResolvedValue('mocked result'),
    };

    const module = await Test.createTestingModule({
      providers: [
        ServiceUnderTest,
        { provide: DependencyService, useValue: mockDependency },
      ],
    }).compile();

    service = module.get(ServiceUnderTest);
    vi.clearAllMocks();
  });

  it('should do the expected behavior', async () => {
    // Arrange: Set up test data
    const input = { foo: 'bar' };

    // Act: Execute code under test
    const result = await service.execute(input);

    // Assert: Verify outcome
    expect(result).toEqual({ expected: 'output' });
    expect(mockDependency.method).toHaveBeenCalledWith(input);
  });
});
```

### Integration Test Template (MSW)

```typescript
import { Test } from '@nestjs/testing';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ServiceUnderTest } from '../../../src/modules/feature/service-under-test';

/**
 * Tests ServiceUnderTest integration with external API.
 *
 * Mocked:
 * - External API: MSW intercepts HTTP requests
 *
 * Auth: Mocked API key
 * Database: Mocked
 */

// Set up MSW server
const server = setupServer(
  http.get('https://api.external.com/resource/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Mocked Resource',
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ServiceUnderTest Integration', () => {
  let service: ServiceUnderTest;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ServiceUnderTest],
    }).compile();

    service = module.get(ServiceUnderTest);
  });

  it('should fetch resource from external API', async () => {
    // Act: Call service that makes HTTP request
    const result = await service.fetchResource('resource-1');

    // Assert: Verify result from mocked API
    expect(result).toEqual({
      id: 'resource-1',
      name: 'Mocked Resource',
    });
  });
});
```

### E2E Test Template

```typescript
import { createE2EContext, authHeader } from './helpers';
import request from 'supertest';

/**
 * Tests Feature API end-to-end flow.
 *
 * Mocked: None (real database and auth)
 *
 * Auth: Real JWT tokens via authHeader()
 * Database: Real Postgres with RLS
 */
describe('Feature API (E2E)', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createE2EContext();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should create resource with authentication', async () => {
    // Act: Make authenticated API request
    const response = await request(ctx.app.getHttpServer())
      .post('/resources')
      .set('Authorization', authHeader(['write:resources']))
      .send({
        name: 'Test Resource',
        org_id: ctx.org.id,
      });

    // Assert: Verify response
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');

    // Assert: Verify database state
    const dbRecord = await ctx.db.query(
      'SELECT * FROM kb.resources WHERE id = $1',
      [response.body.id]
    );
    expect(dbRecord.rows[0].name).toBe('Test Resource');
  });

  it('should reject without proper scope', async () => {
    // Act: Make request with insufficient permissions
    const response = await request(ctx.app.getHttpServer())
      .post('/resources')
      .set('Authorization', authHeader(['read:resources'])) // Missing write scope
      .send({
        name: 'Test Resource',
        org_id: ctx.org.id,
      });

    // Assert: Verify rejection
    expect(response.status).toBe(403);
  });
});
```

## Mock Setup Patterns

### Pattern: vi.fn() for Simple Mocks

```typescript
const mockService = {
  method: vi.fn().mockResolvedValue('result'),
  anotherMethod: vi.fn().mockRejectedValue(new Error('failure')),
};

// In provider
{ provide: ServiceName, useValue: mockService }

// In test
expect(mockService.method).toHaveBeenCalledWith(expectedArg);
expect(mockService.method).toHaveBeenCalledTimes(1);
```

### Pattern: vi.spyOn() for Partial Mocks

```typescript
const service = new MyService(deps);
const spy = vi.spyOn(service, 'methodToSpy').mockReturnValue('mocked');

// Run code
await service.execute();

// Verify
expect(spy).toHaveBeenCalled();

// Cleanup
spy.mockRestore();
```

### Pattern: vi.mock() for Module-Level Mocks

```typescript
vi.mock('@external/library', () => ({
  ExternalClass: class MockClass {
    method = vi.fn().mockResolvedValue('mocked');
  },
}));

// All imports of ExternalClass now use the mock
```

### Pattern: MSW for HTTP Mocking

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  // Success response
  http.get('https://api.example.com/data', () => {
    return HttpResponse.json({ success: true });
  }),

  // Error response
  http.post('https://api.example.com/create', () => {
    return new HttpResponse(null, { status: 500 });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Auth Setup Patterns

### Pattern: Unit Test Mock ExecutionContext

```typescript
import { ExecutionContext } from '@nestjs/common';

function createMockContext(scopes: string[] = []): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: 'test-user', email: 'test@example.com' },
        scopes,
      }),
    }),
  } as ExecutionContext;
}

// In test
const ctx = createMockContext(['read:projects', 'write:projects']);
const canActivate = guard.canActivate(ctx);
expect(canActivate).toBe(true);
```

### Pattern: E2E Test authHeader()

```typescript
import { authHeader } from './helpers/auth-helpers';

// No auth
await request(app).get('/public');

// Basic auth (default scopes)
await request(app).get('/profile').set('Authorization', authHeader());

// Scoped auth
await request(app)
  .post('/projects')
  .set('Authorization', authHeader(['write:projects']))
  .send(data);

// Test insufficient permissions
await request(app)
  .delete('/projects/123')
  .set('Authorization', authHeader(['read:projects'])) // Missing write
  .expect(403);
```

## Database Setup Patterns

### Pattern: Unit Test Mock Database

```typescript
const mockDb = {
  query: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// Provide test data
mockDb.query.mockResolvedValue([
  { id: '1', name: 'Project 1' },
  { id: '2', name: 'Project 2' },
]);

// In provider
{ provide: DatabaseService, useValue: mockDb }

// In test
expect(mockDb.query).toHaveBeenCalledWith(
  expect.stringContaining('SELECT'),
  expect.any(Array)
);
```

### Pattern: E2E Test Real Database

```typescript
import { createE2EContext } from './helpers/e2e-context';

let ctx;

beforeAll(async () => {
  ctx = await createE2EContext();
  // ctx.app - NestJS app
  // ctx.org - Test organization
  // ctx.user - Test user
  // ctx.db - Database connection
});

afterAll(async () => {
  await ctx.cleanup(); // Deletes test org (cascades to all data)
});

it('should persist to database', async () => {
  // Make API request
  const response = await request(ctx.app.getHttpServer())
    .post('/resources')
    .set('Authorization', authHeader(['write:resources']))
    .send({ name: 'Test', org_id: ctx.org.id });

  // Verify in database
  const result = await ctx.db.query(
    'SELECT * FROM kb.resources WHERE id = $1',
    [response.body.id]
  );
  expect(result.rows[0].name).toBe('Test');
});
```

## Common Scopes Reference

```typescript
// Projects
['read:projects', 'write:projects'][
  // Organizations
  ('read:organizations', 'write:organizations')
][
  // Documents
  ('read:documents', 'write:documents')
][
  // Graph
  ('read:graph', 'write:graph')
][
  // Chat
  ('chat:read', 'chat:write')
][
  // Admin (superuser)
  'admin:*'
];
```

## Test Quality Checklist

Before committing tests:

- [ ] Test file has header comment explaining what is tested
- [ ] Mocks are documented (what, why)
- [ ] Auth setup is documented
- [ ] Database setup is documented
- [ ] Test has clear describe/it blocks with descriptive names
- [ ] Assertions are meaningful (not just `toBeDefined()`)
- [ ] Mocks are cleared in beforeEach: `vi.clearAllMocks()`
- [ ] Cleanup is handled in afterEach/afterAll
- [ ] Test is deterministic (no random data, race conditions)
- [ ] Test runs independently (no execution order dependency)
- [ ] Test follows Arrange-Act-Assert pattern
- [ ] Complex assertions have inline comments

## Running Tests

```bash
# Unit tests (fast)
nx test server-nest
nx test admin

# E2E tests (slower)
nx test-e2e server-nest

# Single test file
nx test server-nest --testFile=tests/unit/auth/auth.service.spec.ts

# Watch mode
nx test server-nest --watch

# Coverage
nx test server-nest --coverage
```

## Common Commands with Expected Outputs

### Run unit tests

```bash
$ nx test server-nest
✓ tests/unit/auth/auth.service.spec.ts (5 tests) 23ms
✓ tests/unit/graph/graph.service.spec.ts (12 tests) 45ms
...
Test Files  42 passed (42)
Tests  156 passed (156)
```

### Run e2e tests

```bash
$ nx test-e2e server-nest
✓ tests/e2e/auth-flow.e2e-spec.ts (3 tests) 1234ms
✓ tests/e2e/extraction-flow.e2e-spec.ts (5 tests) 2145ms
...
Test Files  8 passed (8)
Tests  23 passed (23)
```

### Run single test

```bash
$ nx test server-nest --testFile=tests/unit/auth/auth.service.spec.ts
✓ tests/unit/auth/auth.service.spec.ts (5 tests) 23ms
Test Files  1 passed (1)
Tests  5 passed (5)
```

## Troubleshooting Quick Reference

### "Module not found" errors

- Check import paths (use relative or configured aliases)
- Verify test file location matches vitest config includes

### E2E "database connection refused"

- Start Docker Compose: `docker compose up -d`
- Check `.env.test.local` for correct DATABASE_URL

### E2E "unauthorized" errors

- Verify Zitadel is running
- Check test service account credentials in `.env.test.local`
- Ensure authHeader() called with correct scopes

### Flaky tests

- Use `vi.useFakeTimers()` for time-dependent tests
- Clear mocks in `beforeEach`: `vi.clearAllMocks()`
- Ensure proper cleanup in afterEach/afterAll
- Mock external APIs with MSW

### "Cannot find module 'vitest'"

- Run: `npm install`

## Key Differences from Jest

This project uses Vitest, not Jest:

```typescript
// Import from vitest
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.* instead of jest.*
vi.fn(); // not jest.fn()
vi.mock(); // not jest.mock()
vi.spyOn(); // not jest.spyOn()
```

## File Organization

```
apps/server-nest/
  tests/
    unit/                      # Unit tests
      auth/                    # Mirror src structure
        auth.guard.spec.ts
        auth.service.spec.ts
      graph/
      chat/
      helpers/                 # Unit-specific helpers

    e2e/                       # E2E tests
      auth-flow.e2e-spec.ts
      extraction-flow.e2e-spec.ts
      helpers/                 # E2E-specific helpers
        e2e-context.ts
        auth-helpers.ts

    integration/               # Integration tests
      clickup-api.integration.spec.ts
      helpers/                 # Integration-specific helpers

    helpers/                   # Shared across ALL test types

  src/                         # Production code (NO tests)
```

## Additional Context

- **Project Framework**: NestJS with TypeScript
- **Test Runner**: Vitest
- **Database**: PostgreSQL with Row-Level Security (RLS)
- **Auth**: Zitadel OIDC with scope-based authorization
- **HTTP Mocking**: MSW (Mock Service Worker)
- **E2E Helper**: `createE2EContext()` for automatic setup/teardown

---

**For detailed explanations and human-readable documentation, see [TESTING_GUIDE.md](./TESTING_GUIDE.md).**
