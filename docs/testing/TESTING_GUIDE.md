# Testing Guide

## Overview

This guide provides comprehensive testing standards for the Spec Server project. It covers test types, mocking patterns, authentication setup, database configuration, and best practices.

**Target Audience**: All developers writing or maintaining tests in this project.

**Related Documentation**:

- [AI Agent Testing Guide](./AI_AGENT_GUIDE.md) - Condensed guide optimized for AI coding assistants
- [Vitest Configuration](../../apps/server/vitest.config.ts)
- [Package Scripts](../../apps/server/package.json)

## Table of Contents

1. [Test Types & When to Use Them](#test-types--when-to-use-them)
2. [Test Organization](#test-organization)
3. [Mocking Patterns](#mocking-patterns)
4. [Authentication Setup](#authentication-setup)
5. [Database Configuration](#database-configuration)
6. [Running Tests](#running-tests)
7. [Writing Good Tests](#writing-good-tests)
8. [Troubleshooting](#troubleshooting)

## Test Types & When to Use Them

### Decision Tree

```
What are you testing?
│
├─ Single function/class in isolation
│  └─> UNIT TEST (tests/unit/)
│
├─ Multiple components working together (no external services)
│  └─> INTEGRATION TEST (tests/integration/)
│
└─ Complete user workflows with real database and auth
   └─> E2E TEST (tests/e2e/)
```

### Unit Tests

**Purpose**: Test single classes or functions in isolation.

**Location**: `apps/{app}/tests/unit/**/*.spec.ts`

**When to Use**:

- Testing service business logic
- Testing utility functions
- Testing guards, pipes, interceptors
- Testing data transformations
- Fast feedback on logic changes

**Characteristics**:

- ✅ Fast execution (< 10ms per test)
- ✅ No external dependencies (database, APIs, file system)
- ✅ Mock all dependencies using `vi.fn()` or `vi.spyOn()`
- ✅ Use `Test.createTestingModule()` for NestJS components
- ✅ Deterministic (same input = same output)

**Example**:

```typescript
// tests/unit/auth/auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { DatabaseService } from '../../../src/modules/database/database.service';
import { vi } from 'vitest';

describe('AuthService', () => {
  let service: AuthService;
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    // Mock database service
    mockDb = { query: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [AuthService, { provide: DatabaseService, useValue: mockDb }],
    }).compile();

    service = module.get(AuthService);
  });

  it('should validate user token', async () => {
    mockDb.query.mockResolvedValue([
      { id: 'user-1', email: 'test@example.com' },
    ]);

    const result = await service.validateToken('valid-token');

    expect(result).toEqual({ id: 'user-1', email: 'test@example.com' });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM users'),
      expect.any(Array)
    );
  });
});
```

### Integration Tests

**Purpose**: Test multiple components working together, with mocked external boundaries.

**Location**: `apps/{app}/tests/integration/**/*.integration.spec.ts`

**When to Use**:

- Testing service interactions (e.g., ChatService + EmbeddingsService)
- Testing API clients with mocked HTTP responses (MSW)
- Testing module configuration
- Verifying component contracts

**Characteristics**:

- ✅ Moderate speed (10-100ms per test)
- ✅ Real internal services, mocked external dependencies
- ✅ Use MSW for HTTP mocking
- ✅ Can use in-memory database or mocked database
- ✅ Tests integration contracts between components

**Example**:

```typescript
// tests/integration/clickup-api.integration.spec.ts
import { Test } from '@nestjs/testing';
import { ClickUpService } from '../../../src/modules/clickup/clickup.service';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock ClickUp API with MSW
const server = setupServer(
  http.get('https://api.clickup.com/api/v2/task/:taskId', () => {
    return HttpResponse.json({
      id: 'task-123',
      name: 'Test Task',
      status: { status: 'in progress' },
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ClickUpService Integration', () => {
  it('should fetch task with retries on rate limit', async () => {
    // Test real HTTP client behavior with mocked API responses
  });
});
```

### E2E Tests

**Purpose**: Test complete user workflows with real infrastructure.

**Location**: `apps/{app}/tests/e2e/**/*.e2e-spec.ts`

**When to Use**:

- Testing full API flows (create → read → update → delete)
- Testing authentication and authorization
- Testing database transactions and RLS policies
- Testing error handling across layers
- Verifying production-like behavior

**Characteristics**:

- ⚠️ Slower execution (100ms - several seconds per test)
- ✅ Real Postgres database with RLS policies
- ✅ Real authentication tokens (via `authHeader()`)
- ✅ Use `createE2EContext()` for setup and teardown
- ✅ Tests system as users would interact with it

**Example**:

```typescript
// tests/e2e/auth-flow.e2e-spec.ts
import { createE2EContext, authHeader } from './helpers';
import request from 'supertest';

describe('Authentication Flow (E2E)', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createE2EContext();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should create project with authenticated user', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', authHeader(['write:projects']))
      .send({
        name: 'Test Project',
        org_id: ctx.org.id,
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });
});
```

## Test Organization

### Folder Structure

All tests follow a semantic folder structure that clearly indicates test type:

```
apps/
  server/
    tests/
      unit/                      # Unit tests
        auth/                    # Mirror source module structure
          auth.guard.spec.ts
          auth.service.spec.ts
        graph/
          graph.service.spec.ts
        chat/
          chat.service.spec.ts
        helpers/                 # Unit-specific test utilities
          mock-factories.ts

      e2e/                       # E2E tests
        auth-flow.e2e-spec.ts
        extraction-flow.e2e-spec.ts
        helpers/                 # E2E-specific utilities
          e2e-context.ts
          auth-helpers.ts
          fixtures.ts

      integration/               # Integration tests
        clickup-api.integration.spec.ts
        helpers/                 # Integration-specific utilities

      helpers/                   # Shared across ALL test types
        test-logger.ts           # Only truly shared utilities here

    src/                         # Production code (NO test files)
      modules/
        auth/
        chat/
        graph/
```

### Helper Organization Strategy

**Key Principle**: Keep helpers close to where they're used unless truly shared across multiple test types.

- **`tests/helpers/`**: ONLY for utilities genuinely shared across multiple test types (e.g., common logging, shared assertions)
- **`tests/unit/helpers/`**: For utilities used only by unit tests (e.g., mock factories, stub builders)
- **`tests/e2e/helpers/`**: For utilities used only by e2e tests (e.g., `createE2EContext()`, `authHeader()`, fixtures)
- **`tests/integration/helpers/`**: For utilities used only by integration tests (e.g., MSW server setup)

**Migration Note**: This project is transitioning from scattered test files (`test/`, `tests/`, `src/*/__tests__/`) to this centralized structure. See [Migration Tasks](#migration-tasks) for details.

### Naming Conventions

- **Unit tests**: `*.spec.ts`
- **Integration tests**: `*.integration.spec.ts`
- **E2E tests**: `*.e2e-spec.ts`
- **Test helpers**: Descriptive names without `.spec` suffix (e.g., `e2e-context.ts`, `mock-factories.ts`)

### File Organization

- Unit test subdirectories should **mirror source module structure** for easy navigation
- E2E tests are organized by **workflow** or **feature** (not by module)
- Integration tests are organized by **external system** being integrated

## Mocking Patterns

### When to Mock vs Use Real Implementation

| Scenario                     | Unit Test             | Integration Test  | E2E Test      |
| ---------------------------- | --------------------- | ----------------- | ------------- |
| Database                     | Always mock           | Mock or in-memory | Real Postgres |
| HTTP APIs (ClickUp, Zitadel) | Always mock           | Mock with MSW     | Real or MSW\* |
| File system                  | Always mock           | Mock              | Real          |
| Environment variables        | Mock/override         | Mock/override     | Real test env |
| Authentication               | Mock ExecutionContext | Mock tokens       | Real tokens   |
| Internal services            | Mock dependencies     | Real services     | Real services |

\*E2E tests can use MSW for external APIs to avoid test flakiness from third-party services.

### Vitest Mocking Utilities

#### `vi.fn()` - Simple Function Mocks

**When to use**: Mocking simple dependencies that return values.

**Example**:

```typescript
import { vi } from 'vitest';

const mockEmailService = {
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
};

// Later in test
expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
  'user@example.com',
  'Welcome',
  expect.stringContaining('Thank you')
);
```

#### `vi.spyOn()` - Spy on Existing Methods

**When to use**: Observing calls while preserving or overriding implementation.

**Example**:

```typescript
import { vi } from 'vitest';

const service = new MyService(deps);
const spy = vi.spyOn(service, 'processData').mockReturnValue('mocked result');

// Run code that calls processData
await service.execute();

expect(spy).toHaveBeenCalledTimes(1);
spy.mockRestore(); // Restore original implementation
```

#### `vi.mock()` - Module-Level Mocks

**When to use**: Mocking entire modules (e.g., external libraries).

**Example**:

```typescript
import { vi } from 'vitest';

vi.mock('@langchain/google-genai', () => ({
  GoogleGenerativeAIEmbeddings: class MockEmbeddings {
    embedQuery = vi.fn(async (text: string) => [0.1, 0.2, 0.3]);
  },
}));

// Now all imports of GoogleGenerativeAIEmbeddings use the mock
```

#### MSW (Mock Service Worker) - HTTP Mocking

**When to use**: Mocking HTTP requests in integration tests.

**Example**:

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('https://api.clickup.com/api/v2/task/:taskId', ({ params }) => {
    return HttpResponse.json({
      id: params.taskId,
      name: 'Mocked Task',
    });
  }),

  // Simulate error
  http.post('https://api.clickup.com/api/v2/task', () => {
    return new HttpResponse(null, { status: 429 }); // Rate limit
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Manual Mock Classes (Use Sparingly)

**When to avoid**: Most cases - prefer `vi.fn()` for simplicity.

**When acceptable**: Complex stateful dependencies requiring coordinated behavior.

**Example**:

```typescript
class MockGraphService {
  private objects = new Map();

  createObject = vi.fn(async (obj) => {
    this.objects.set(obj.id, obj);
    return obj;
  });

  getObject = vi.fn(async (id) => {
    return this.objects.get(id);
  });
}
```

### Mocking Best Practices

1. **Document what you mock and why** (inline comments)
2. **Mock at the boundary** - mock external dependencies, keep internal logic real
3. **Use type-safe mocks** - leverage TypeScript for mock typing
4. **Clear mocks between tests** - use `vi.clearAllMocks()` in `beforeEach`
5. **Keep mocks simple** - if a mock is complex, the code might need refactoring
6. **Avoid over-mocking** - only mock what's necessary for the test

## Authentication Setup

### Unit Tests: Mock ExecutionContext

**Pattern**: Provide a mock request object with user and scopes.

**Example**:

```typescript
import { ExecutionContext } from '@nestjs/common';
import { vi } from 'vitest';

function createMockExecutionContext(
  user: any,
  scopes: string[] = []
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        scopes,
      }),
    }),
  } as ExecutionContext;
}

// In test
it('should allow access with correct scope', () => {
  const mockCtx = createMockExecutionContext(
    { id: 'user-1', email: 'test@example.com' },
    ['read:projects', 'write:projects']
  );

  const guard = new ScopeGuard(['write:projects']);
  expect(guard.canActivate(mockCtx)).toBe(true);
});
```

### E2E Tests: Real Tokens with authHeader()

**Pattern**: Use the `authHeader()` helper to generate valid JWT tokens with scopes.

**Location**: `tests/e2e/helpers/auth-helpers.ts`

**Usage**:

```typescript
import request from 'supertest';
import { authHeader } from './helpers/auth-helpers';

// No auth (test public endpoints)
await request(app.getHttpServer()).get('/health').expect(200);

// Basic auth (default scopes)
await request(app.getHttpServer())
  .get('/profile')
  .set('Authorization', authHeader());

// Scoped auth (specific permissions)
await request(app.getHttpServer())
  .post('/projects')
  .set('Authorization', authHeader(['write:projects', 'read:organizations']))
  .send({ name: 'New Project', org_id: 'org-1' });

// Test authorization failures
await request(app.getHttpServer())
  .post('/projects')
  .set('Authorization', authHeader(['read:projects'])) // Missing write scope
  .send({ name: 'New Project', org_id: 'org-1' })
  .expect(403);
```

### Available Scopes

Common scopes used in tests:

- `read:projects`, `write:projects`
- `read:organizations`, `write:organizations`
- `read:documents`, `write:documents`
- `read:graph`, `write:graph`
- `chat:read`, `chat:write`
- `admin:*` (superuser access)

**Finding scopes**: Check OpenAPI spec (`openapi.yaml`) or controller decorators (`@Scopes()`).

## Database Configuration

### Unit Tests: Always Mock

**Principle**: Unit tests should never touch a real database.

**Pattern**: Mock database client or repository methods.

**Example**:

```typescript
const mockDb = {
  query: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// Provide deterministic test data
mockDb.query.mockResolvedValue([
  { id: 'proj-1', name: 'Project 1' },
  { id: 'proj-2', name: 'Project 2' },
]);

const module = await Test.createTestingModule({
  providers: [ProjectService, { provide: DatabaseService, useValue: mockDb }],
}).compile();
```

### E2E Tests: Real PostgreSQL with RLS

**Setup**: Use `createE2EContext()` helper for automatic database provisioning and cleanup.

**Location**: `tests/e2e/helpers/e2e-context.ts`

**How it works**:

1. Creates a test organization with unique UUID
2. Sets up RLS (Row-Level Security) policies for test isolation
3. Provides authenticated app instance
4. Automatically cleans up test data on teardown

**Usage**:

```typescript
import { createE2EContext } from './helpers/e2e-context';

describe('Projects API (E2E)', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createE2EContext();
    // ctx.app - NestJS app instance
    // ctx.org - Test organization
    // ctx.user - Test user
    // ctx.db - Database connection (if needed for direct queries)
  });

  afterAll(async () => {
    await ctx.cleanup(); // Deletes test org and cascades to all related records
  });

  it('should create project in database', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set('Authorization', authHeader(['write:projects']))
      .send({ name: 'Test Project', org_id: ctx.org.id });

    expect(response.status).toBe(201);

    // Verify in database
    const project = await ctx.db.query(
      'SELECT * FROM kb.projects WHERE id = $1',
      [response.body.id]
    );
    expect(project.rows[0]).toMatchObject({
      name: 'Test Project',
      org_id: ctx.org.id,
    });
  });
});
```

### Database Test Isolation

**RLS (Row-Level Security)**: Ensures tests don't interfere with each other.

- Each test organization has a unique UUID
- All queries are scoped to the current user's organization via RLS policies
- Deleting the test org cascades to all related records (automatic cleanup)

**Best Practices**:

1. Always use `createE2EContext()` for E2E tests
2. Call `ctx.cleanup()` in `afterAll`
3. Don't hardcode UUIDs - use `ctx.org.id`, `ctx.user.id`
4. Verify database state when testing data integrity

## Running Tests

### Test Scripts

All test commands use `nx` to run tasks on projects:

```bash
# Unit tests (fast, no external dependencies)
nx test server          # Run all unit tests for server
nx test admin                # Run all unit tests for admin

# E2E tests (slower, requires database and auth)
nx test-e2e server      # Run all e2e tests for server

# Integration tests (moderate speed)
nx test server --testFile=tests/integration/*.integration.spec.ts

# Single test file
nx test server --testFile=tests/unit/auth/auth.service.spec.ts

# Watch mode (re-run on file changes)
nx test server --watch

# Coverage
nx test server --coverage
```

### Test Configuration

- **Unit tests**: `vitest.config.ts` - includes `tests/**/*.spec.ts` and `src/**/__tests__/**/*.spec.ts`
- **E2E tests**: `vitest.e2e.config.ts` - includes `tests/e2e/**/*.e2e-spec.ts`

### Environment Setup for E2E Tests

E2E tests require:

1. **PostgreSQL database** running locally or via Docker
2. **Zitadel** for authentication (can use test instance)
3. **Environment variables** configured in `.env.test` or `.env.test.local`

**Quick setup**:

```bash
# Start services via Docker Compose
docker compose -f docker/docker-compose.yml up -d

# Copy example env file
cp .env.test.local.example .env.test.local

# Run e2e tests
nx test-e2e server
```

## Writing Good Tests

### Test Structure

Follow the **Arrange-Act-Assert** pattern:

```typescript
it('should calculate total price with tax', () => {
  // Arrange: Set up test data and dependencies
  const cart = { items: [{ price: 100 }, { price: 200 }], taxRate: 0.1 };
  const calculator = new PriceCalculator();

  // Act: Execute the code under test
  const total = calculator.calculateTotal(cart);

  // Assert: Verify expected outcome
  expect(total).toBe(330); // 300 + 10% tax
});
```

### Inline Documentation

**Always document**:

1. **What is being tested** (test file header comment)
2. **What is mocked and why** (inline comments in setup)
3. **Complex assertions** (inline comments explaining expected behavior)

**Template**:

```typescript
/**
 * Tests the ChatService message handling and conversation flow.
 *
 * Mocked:
 * - EmbeddingsService: Returns deterministic vectors to avoid LLM calls
 * - LangGraph: Skipped to test business logic only
 * - DatabaseService: Uses in-memory test data
 *
 * Auth: Mock user with chat:read and chat:write scopes
 * Database: Mocked (unit test)
 */
describe('ChatService', () => {
  let service: ChatService;
  let mockEmbeddings: { embedQuery: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    // Mock embeddings service to avoid LLM API calls
    mockEmbeddings = {
      embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: EmbeddingsService, useValue: mockEmbeddings },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  it('should create conversation with initial message', async () => {
    // Test implementation
  });
});
```

### Test Quality Checklist

Before committing tests, verify:

- [ ] Test has clear `describe` and `it` blocks with descriptive names
- [ ] Header comment explains what is tested, what is mocked, and why
- [ ] Inline comments document non-obvious mocking decisions
- [ ] Assertions are meaningful (not just `toBeDefined()`)
- [ ] Test is deterministic (no random data, flaky timers, race conditions)
- [ ] Cleanup is handled (`afterEach`, `afterAll`)
- [ ] Mocks are cleared between tests (`vi.clearAllMocks()`)
- [ ] Test runs independently (doesn't depend on test execution order)
- [ ] Test follows project naming conventions

### Common Pitfalls

1. **Testing implementation details** - Focus on behavior, not internal state
2. **Over-mocking** - Only mock external boundaries
3. **Flaky tests** - Avoid timeouts, race conditions, shared state
4. **Missing cleanup** - Always clean up resources in `afterEach`/`afterAll`
5. **Generic test names** - Use descriptive names that explain the scenario
6. **Assertions without context** - Add comments explaining complex expectations

## Troubleshooting

### "Module not found" in tests

**Symptom**: Import errors when running tests.

**Solutions**:

1. Check TypeScript path mappings in `tsconfig.json`
2. Verify import paths are relative or use configured aliases
3. Ensure test file is in the correct location for test runner configuration

### "Cannot find module 'vitest'"

**Symptom**: Vitest import errors.

**Solution**: Install dependencies:

```bash
npm install
```

### E2E tests fail with "database connection refused"

**Symptom**: E2E tests can't connect to Postgres.

**Solutions**:

1. Start Docker Compose services: `docker compose up -d`
2. Check `.env.test.local` has correct database credentials
3. Verify `DATABASE_URL` environment variable

### E2E tests fail with "unauthorized"

**Symptom**: E2E tests get 401/403 errors.

**Solutions**:

1. Verify Zitadel is running
2. Check test service account credentials in `.env.test.local`
3. Ensure `authHeader()` is called with correct scopes

### Tests pass locally but fail in CI

**Symptom**: Tests work on local machine but fail in CI pipeline.

**Common causes**:

1. Missing environment variables in CI
2. Database not seeded or migrations not run
3. Different Node.js versions
4. Timing issues (increase timeouts for CI)

**Solution**: Check CI configuration (`.github/workflows/`) and ensure setup steps match local environment.

### Flaky tests (pass/fail randomly)

**Symptom**: Tests fail intermittently without code changes.

**Common causes**:

1. Race conditions (async timing)
2. Shared state between tests
3. External API dependencies
4. Insufficient test isolation

**Solutions**:

1. Use `vi.useFakeTimers()` for time-dependent tests
2. Clear mocks in `beforeEach`: `vi.clearAllMocks()`
3. Ensure proper cleanup in `afterEach`/`afterAll`
4. Mock external APIs with MSW
5. Increase timeouts for slow operations (but investigate root cause)

### Vitest vs Jest differences

**This project uses Vitest, not Jest.**

Key differences:

- Import from `vitest`, not `@jest/globals`
- Use `vi.fn()` instead of `jest.fn()`
- Use `vi.mock()` instead of `jest.mock()`
- Some matchers differ (check Vitest docs)

## Migration Tasks

**Note**: This project is currently migrating to the standardized folder structure documented above.

### Current State

Tests are scattered across:

- `/apps/server/test/` (e2e tests)
- `/apps/server/tests/` (mixed unit tests)
- `/apps/server/src/modules/*/__tests__/` (co-located unit tests)
- `/apps/server/src/modules/*/*.spec.ts` (inline spec files)

### Target State

All tests organized by type:

- `/apps/server/tests/unit/` (all unit tests, mirroring src structure)
- `/apps/server/tests/e2e/` (all e2e tests)
- `/apps/server/tests/integration/` (all integration tests)

### Migration Progress

See implementation tasks in the change proposal: `openspec/changes/document-test-infrastructure/tasks.md`

## AI Tool Configuration

This testing guide is referenced by AI coding tools for consistency:

- **GitHub Copilot**: References guide via `.github/copilot-instructions.md`
- **OpenCode**: Includes guide in `opencode.jsonc` instructions array
- **Gemini CLI**: Imports guide via `.gemini/GEMINI.md` context file

For detailed AI-specific guidance, see [AI Agent Testing Guide](./AI_AGENT_GUIDE.md).

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [MSW Documentation](https://mswjs.io/)
- [Testing Best Practices](https://testingjavascript.com/)

---

**Last Updated**: 2025-01-10
**Maintainer**: Development Team
**Feedback**: Please open an issue or PR if you find errors or have suggestions.
