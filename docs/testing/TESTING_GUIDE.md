# Testing Guide

## Overview

This document provides comprehensive guidelines for writing and maintaining tests in the spec-server-2 monorepo. Our testing strategy emphasizes clear boundaries between test types, consistent patterns, and maintainable test code.

## Philosophy

- **Test the right thing at the right level**: Unit tests for logic, integration tests for component interaction, e2e tests for complete workflows
- **Fast feedback loops**: Unit tests run in milliseconds, integration/e2e tests are reserved for higher-level validation
- **Realistic e2e tests**: Use real database, real auth, real HTTP calls to catch integration issues
- **Clear, maintainable tests**: Tests are documentation - they should be easy to read and understand

## Test Types

### 1. Unit Tests

**Purpose**: Test individual functions, classes, or modules in isolation with all dependencies mocked.

**When to use**:
- Testing business logic in services
- Testing utility functions
- Testing guards, pipes, and other middleware
- Testing React components in isolation

**Characteristics**:
- Fast (< 100ms per test)
- No external dependencies (DB, APIs, file system)
- All dependencies mocked using Vitest mocks
- Deterministic and repeatable

**Location**:
- Server: `apps/server/tests/unit/**/*.spec.ts`
- Admin: `apps/admin/tests/unit/**/*.test.tsx`

**Example (Server)**:
```typescript
// apps/server/tests/unit/auth/auth.service.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../../../src/modules/auth/auth.service';

describe('AuthService', () => {
  it('should validate JWT token', () => {
    // Mock dependencies
    const mockJwtService = {
      verify: vi.fn().mockReturnValue({ sub: 'user-123' })
    };
    
    const authService = new AuthService(mockJwtService as any);
    const result = authService.validateToken('valid-token');
    
    expect(result.sub).toBe('user-123');
    expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
  });
});
```

**Example (Admin React)**:
```typescript
// apps/admin/tests/unit/components/Button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../../src/components/atoms/Button';

describe('Button', () => {
  it('should render with correct label', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
});
```

### 2. Integration Tests

**Purpose**: Test how multiple components work together, with some real dependencies but mocked external services.

**When to use**:
- Testing service layer with real repository layer (but mocked DB)
- Testing multiple services interacting
- Testing complex workflows that span multiple modules

**Characteristics**:
- Moderate speed (100ms - 1s per test)
- Some real dependencies, some mocked
- May use in-memory database or mocked DB
- More realistic than unit tests, faster than e2e

**Location**:
- Server: `apps/server/tests/integration/**/*.integration.spec.ts`

**Example**:
```typescript
// apps/server/tests/integration/clickup-sync.integration.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ClickUpSyncService } from '../../../src/modules/clickup/clickup-sync.service';
import { DatabaseService } from '../../../src/common/database/database.service';

describe('ClickUpSyncService Integration', () => {
  it('should sync tasks from ClickUp API', async () => {
    // Mock external API, use real service logic
    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        data: { tasks: [{ id: '123', name: 'Task 1' }] }
      })
    };
    
    const module = await Test.createTestingModule({
      providers: [
        ClickUpSyncService,
        { provide: 'HTTP_CLIENT', useValue: mockHttpClient },
        { provide: DatabaseService, useValue: mockDb }
      ]
    }).compile();
    
    const service = module.get(ClickUpSyncService);
    const result = await service.syncTasks('workspace-123');
    
    expect(result.taskCount).toBe(1);
  });
});
```

### 3. API E2E Tests (Server)

**Purpose**: Test complete HTTP request/response workflows through the API, using real infrastructure.

**When to use**:
- Testing REST API endpoints end-to-end
- Testing authentication and authorization
- Testing database operations with RLS policies
- Testing complete user workflows via API

**Characteristics**:
- Slower (1-10s per test)
- Uses real PostgreSQL with RLS
- Uses real authentication (Zitadel test tokens)
- Tests complete request/response cycle
- Uses supertest for HTTP requests

**Location**:
- Server: `apps/server/tests/e2e/**/*.e2e-spec.ts`

**Example**:
```typescript
// apps/server/tests/e2e/documents.create-and-get.e2e-spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

describe('Documents API (e2e)', () => {
  let ctx: any;
  let app: any;
  
  beforeAll(async () => {
    ctx = await createE2EContext();
    app = ctx.app;
  });
  
  afterAll(async () => {
    await ctx.cleanup();
  });
  
  it('should create and retrieve a document', async () => {
    // Create document with authenticated request
    const createRes = await request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', authHeader(['write:documents']))
      .send({
        title: 'Test Document',
        content: 'Hello world'
      });
    
    expect(createRes.status).toBe(201);
    const docId = createRes.body.id;
    
    // Retrieve document
    const getRes = await request(app.getHttpServer())
      .get(`/api/documents/${docId}`)
      .set('Authorization', authHeader(['read:documents']));
    
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe('Test Document');
  });
});
```

### 4. Browser E2E Tests (Admin)

**Purpose**: Test complete UI workflows through real browser automation.

**When to use**:
- Testing user interactions and workflows
- Testing UI components in real browser context
- Testing authentication flows
- Testing complex multi-step processes

**Characteristics**:
- Slowest (5-30s per test)
- Uses real browser (via Playwright)
- Uses real API backend
- Tests complete user experience
- Can capture screenshots/videos on failure

**Location**:
- Admin: `apps/admin/tests/e2e/**/*.spec.ts`

**Example**:
```typescript
// apps/admin/tests/e2e/specs/smoke.spec.ts
import { test, expect } from '@playwright/test';

test('user can view dashboard after login', async ({ page }) => {
  // Navigate to login
  await page.goto('/login');
  
  // Perform login
  await page.fill('[name="email"]', process.env.E2E_TEST_USER_EMAIL);
  await page.fill('[name="password"]', process.env.E2E_TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');
  
  // Verify dashboard loads
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

## Decision Tree: Choosing the Right Test Type

```
┌─────────────────────────────────────┐
│ What are you testing?               │
└────────────┬────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌────────┐      ┌──────────┐
│ Logic  │      │ Workflow │
│ Units  │      │ / Flow   │
└───┬────┘      └─────┬────┘
    │                 │
    ▼                 │
┌────────────┐        │
│ Unit Test  │        │
└────────────┘        │
                      │
         ┌────────────┴─────────────┐
         │                          │
         ▼                          ▼
    ┌─────────┐              ┌──────────┐
    │ Backend │              │ Frontend │
    │   API   │              │    UI    │
    └────┬────┘              └─────┬────┘
         │                         │
         ▼                         ▼
    ┌──────────────┐        ┌─────────────┐
    │ API E2E Test │        │ Browser E2E │
    └──────────────┘        └─────────────┘
```

**Quick Rules**:
1. Testing a single function/method? → **Unit Test**
2. Testing API endpoint behavior? → **API E2E Test**
3. Testing UI interaction? → **Browser E2E Test**
4. Testing multiple services together (no external deps)? → **Integration Test**

## Authentication Patterns

### Unit Tests: Mock Auth

Mock the authentication context:

```typescript
import { ExecutionContext } from '@nestjs/common';

const mockContext = {
  switchToHttp: () => ({
    getRequest: () => ({ 
      user: { sub: 'user-123', scopes: ['read:documents'] }
    })
  })
} as ExecutionContext;
```

### API E2E Tests: Scope-Based Tokens

Use the `authHeader()` helper with scope arrays:

```typescript
import { authHeader } from './auth-helpers';

// No auth
await request(app).get('/api/documents');

// Basic auth
await request(app)
  .get('/api/documents')
  .set('Authorization', authHeader());

// Scoped auth
await request(app)
  .get('/api/documents')
  .set('Authorization', authHeader(['read:documents', 'write:tasks']));
```

### Browser E2E Tests: Playwright Fixtures

Use Playwright fixtures with real Zitadel login:

```typescript
// apps/admin/tests/e2e/fixtures/auth.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    // Perform real login
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.E2E_TEST_USER_EMAIL);
    await page.fill('[name="password"]', process.env.E2E_TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
    
    await use(page);
  }
});

// Usage in tests
test('user can create document', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/documents/new');
  // ...
});
```

## Database Patterns

### Unit Tests: Always Mock

```typescript
const mockDb = {
  query: vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
  transaction: vi.fn()
};
```

### API E2E Tests: Real PostgreSQL with RLS

Use the `createE2EContext()` helper for automatic setup/teardown:

```typescript
import { createE2EContext } from './e2e-context';

describe('My E2E Test', () => {
  let ctx: any;
  
  beforeAll(async () => {
    ctx = await createE2EContext();
    // ctx provides: app, db, testOrgId, testProjectId, cleanup()
  });
  
  afterAll(async () => {
    await ctx.cleanup(); // Automatic cleanup via RLS
  });
  
  it('should test with real database', async () => {
    // Database operations automatically scoped to test tenant via RLS
    await request(ctx.app.getHttpServer())
      .post('/api/documents')
      .set('X-Organization-ID', ctx.testOrgId)
      .send({ title: 'Test' });
  });
});
```

## Mocking Strategies

### Vitest Mocks

Use Vitest's built-in mocking utilities:

```typescript
import { vi } from 'vitest';

// Simple function mock
const mockFn = vi.fn().mockReturnValue('result');

// Spy on existing method
const spy = vi.spyOn(service, 'method').mockResolvedValue('result');

// Module mock
vi.mock('../src/external-service', () => ({
  ExternalService: vi.fn().mockImplementation(() => ({
    fetchData: vi.fn().mockResolvedValue({ data: 'mocked' })
  }))
}));
```

### MSW for HTTP Mocking

For testing code that makes HTTP requests:

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('https://api.external.com/data', () => {
    return HttpResponse.json({ data: 'mocked response' });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Running Tests

### Server App

```bash
# Unit tests only
nx test server

# E2E tests
nx test-e2e server

# Watch mode
nx test server --watch

# Coverage
nx test server --coverage
```

### Admin App

```bash
# Unit tests
nx test admin

# Browser E2E tests
nx test-e2e admin

# E2E in UI mode
nx test-e2e admin --ui

# E2E headed (see browser)
nx test-e2e admin --headed
```

## Test Organization

### File Structure

```
apps/
  server/
    tests/
      unit/           # Unit tests (*.spec.ts)
      e2e/            # API E2E tests (*.e2e-spec.ts)
      integration/    # Integration tests (*.integration.spec.ts)
      helpers/        # Shared test utilities
  admin/
    tests/
      unit/           # React unit tests (*.test.tsx)
      e2e/            # Browser E2E tests (*.spec.ts)
      helpers/        # Shared test utilities
```

### Naming Conventions

- Unit tests: `*.spec.ts` (server), `*.test.tsx` (admin)
- API E2E tests: `*.e2e-spec.ts`
- Browser E2E tests: `*.spec.ts` (in e2e directory)
- Integration tests: `*.integration.spec.ts`

### Test File Structure

```typescript
/**
 * Brief description of what this test file covers.
 *
 * Mocked:
 * - List what is mocked and why
 * - Example: Database client (using in-memory mock for speed)
 * - Example: External API (using MSW to avoid network calls)
 *
 * Real:
 * - List what uses real implementations
 * - Example: Business logic in service
 *
 * Auth: Description of auth setup
 * - Example: Mock user with read:documents scope
 */
describe('Feature Name', () => {
  // Setup
  beforeAll(async () => {
    // One-time setup
  });
  
  beforeEach(() => {
    // Per-test setup
  });
  
  afterEach(() => {
    // Per-test cleanup
  });
  
  afterAll(async () => {
    // One-time cleanup
  });
  
  describe('Specific behavior', () => {
    it('should do something specific', async () => {
      // Arrange
      const input = { /* ... */ };
      
      // Act
      const result = await service.method(input);
      
      // Assert
      expect(result).toMatchObject({ /* ... */ });
    });
  });
});
```

## Best Practices

### DO

✅ Write clear, descriptive test names
✅ Follow Arrange-Act-Assert pattern
✅ Test one thing per test
✅ Use meaningful variable names
✅ Clean up resources in afterEach/afterAll
✅ Mock external dependencies in unit tests
✅ Use real dependencies in e2e tests
✅ Add comments explaining complex setup
✅ Keep tests independent (no shared state)

### DON'T

❌ Test implementation details
❌ Have tests that depend on execution order
❌ Leave console.log() statements in tests
❌ Mock everything in e2e tests
❌ Skip cleanup in afterEach/afterAll
❌ Write tests that are flaky or timing-dependent
❌ Duplicate test code (use helpers)
❌ Test framework code (focus on your logic)

## Troubleshooting

### Common Issues

**Tests fail locally but pass in CI**:
- Check for hard-coded paths or environment variables
- Ensure database is running locally
- Check for timezone differences

**Tests are slow**:
- Move expensive operations to beforeAll
- Use unit tests instead of e2e for logic testing
- Parallel test execution: `--parallel`

**Flaky tests**:
- Add explicit waits in browser tests
- Check for race conditions
- Ensure proper cleanup between tests

**Database connection errors**:
- Verify Docker containers are running: `docker ps`
- Check environment variables
- Ensure RLS policies are set up

### Getting Help

- Check existing tests for patterns
- Review this guide
- Ask in team chat
- See [CONTRIBUTING.md](../../CONTRIBUTING.md)

## Configuration Files

### Server Vitest Config

- `apps/server/vitest.config.ts` - Unit tests
- `apps/server/vitest.e2e.config.ts` - E2E tests (if separate)

### Admin Test Configs

- `apps/admin/vitest.config.ts` - Unit tests
- `apps/admin/tests/e2e/playwright.config.ts` - Browser E2E tests

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library (React)](https://testing-library.com/docs/react-testing-library/intro/)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [MSW Documentation](https://mswjs.io/)
