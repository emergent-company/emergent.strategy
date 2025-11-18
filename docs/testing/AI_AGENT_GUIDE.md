# AI Agent Testing Guide

**Purpose**: Quick reference for AI coding agents to write correct tests. Optimized for copy-paste and pattern matching.

## Quick Decision Tree

```
What are you testing?
├─ Single function/class/component → UNIT TEST
├─ API endpoint workflow → API E2E TEST (server)
├─ UI interaction/workflow → BROWSER E2E TEST (admin)
└─ Multiple services (no external deps) → INTEGRATION TEST
```

## Rules

### Rule 1: File Location

```
Server unit:        apps/server/tests/unit/**/*.spec.ts
Server e2e:         apps/server/tests/e2e/**/*.e2e-spec.ts
Server integration: apps/server/tests/integration/**/*.integration.spec.ts
Admin unit:         apps/admin/tests/unit/**/*.test.tsx
Admin e2e:          apps/admin/tests/e2e/**/*.spec.ts
```

### Rule 2: Mock Everything in Unit Tests

```typescript
import { vi } from 'vitest';

// Mock dependencies
const mockService = {
  method: vi.fn().mockResolvedValue('result')
};

// Spy on methods
const spy = vi.spyOn(obj, 'method').mockReturnValue('value');
```

### Rule 3: Use Real Infrastructure in E2E Tests

- API E2E: Real PostgreSQL, real auth tokens, real HTTP
- Browser E2E: Real browser, real UI, real API backend

### Rule 4: Always Clean Up

```typescript
afterEach(() => {
  vi.clearAllMocks(); // Unit tests
});

afterAll(async () => {
  await ctx.cleanup(); // E2E tests
});
```

### Rule 5: Test File Header

```typescript
/**
 * Tests [feature name].
 *
 * Mocked: [list mocked dependencies]
 * Real: [list real dependencies]
 * Auth: [describe auth setup]
 */
```

## Templates

### Unit Test (Server)

```typescript
// apps/server/tests/unit/my-module/my.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyService } from '../../../src/modules/my-module/my.service';

/**
 * Tests MyService business logic.
 *
 * Mocked: DatabaseService, ExternalAPI
 * Real: MyService logic
 * Auth: Not applicable (unit test)
 */
describe('MyService', () => {
  let service: MyService;
  let mockDb: any;
  
  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockResolvedValue([]),
      transaction: vi.fn()
    };
    service = new MyService(mockDb);
  });
  
  describe('methodName', () => {
    it('should do something', async () => {
      // Arrange
      mockDb.query.mockResolvedValue([{ id: '1', name: 'Test' }]);
      
      // Act
      const result = await service.methodName('input');
      
      // Assert
      expect(result).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String));
    });
  });
});
```

### Unit Test (Admin React)

```typescript
// apps/admin/tests/unit/components/MyComponent.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../../../src/components/MyComponent';

/**
 * Tests MyComponent rendering and interactions.
 *
 * Mocked: None (pure component test)
 * Real: Component rendering
 * Auth: Not applicable
 */
describe('MyComponent', () => {
  it('should render with correct props', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
  
  it('should handle click events', async () => {
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick} />);
    
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### API E2E Test (Server)

```typescript
// apps/server/tests/e2e/my-feature.e2e-spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Tests My Feature API endpoints.
 *
 * Mocked: None
 * Real: Full NestJS app, PostgreSQL, Auth
 * Auth: Zitadel test tokens with scopes
 */
describe('My Feature API (e2e)', () => {
  let ctx: any;
  
  beforeAll(async () => {
    ctx = await createE2EContext();
  });
  
  afterAll(async () => {
    await ctx.cleanup();
  });
  
  it('should create resource', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/my-resource')
      .set('Authorization', authHeader(['write:resource']))
      .set('X-Organization-ID', ctx.testOrgId)
      .send({ name: 'Test Resource' });
    
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'Test Resource'
    });
  });
});
```

### Browser E2E Test (Admin)

```typescript
// apps/admin/tests/e2e/specs/my-workflow.spec.ts
import { test, expect } from '@playwright/test';

/**
 * Tests My Workflow user journey.
 *
 * Mocked: None
 * Real: Full application stack
 * Auth: Real Zitadel login via Playwright
 */
test('user can complete my workflow', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[name="email"]', process.env.E2E_TEST_USER_EMAIL!);
  await page.fill('[name="password"]', process.env.E2E_TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
  
  // Perform workflow
  await page.goto('/my-feature');
  await page.click('button:has-text("Create New")');
  await page.fill('[name="title"]', 'Test Item');
  await page.click('button:has-text("Save")');
  
  // Verify
  await expect(page.getByText('Test Item')).toBeVisible();
});
```

## Authentication Patterns

### Unit Tests: Mock ExecutionContext

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

### API E2E: authHeader Helper

```typescript
import { authHeader } from './auth-helpers';

// No auth
await request(app).get('/api/public');

// Basic auth (default scopes)
await request(app)
  .get('/api/documents')
  .set('Authorization', authHeader());

// Custom scopes
await request(app)
  .post('/api/documents')
  .set('Authorization', authHeader(['write:documents', 'read:projects']));
```

### Browser E2E: Playwright Login

```typescript
// Use in beforeEach or test
await page.goto('/login');
await page.fill('[name="email"]', process.env.E2E_TEST_USER_EMAIL!);
await page.fill('[name="password"]', process.env.E2E_TEST_USER_PASSWORD!);
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/);
```

## Database Patterns

### Unit Tests: Mock Database

```typescript
const mockDb = {
  query: vi.fn().mockResolvedValue([{ id: '1' }]),
  transaction: vi.fn(async (cb) => cb(mockDb)),
  getRepository: vi.fn().mockReturnValue({
    find: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue({ id: '1' })
  })
};
```

### API E2E: createE2EContext

```typescript
import { createE2EContext } from './e2e-context';

beforeAll(async () => {
  ctx = await createE2EContext();
  // Provides: app, db, testOrgId, testProjectId, cleanup()
});

afterAll(async () => {
  await ctx.cleanup(); // Automatic cleanup via RLS
});

// Database automatically scoped to test org via RLS
```

## Mocking Patterns

### Simple Function Mock

```typescript
const mockFn = vi.fn().mockReturnValue('result');
const asyncMock = vi.fn().mockResolvedValue({ data: 'result' });
const errorMock = vi.fn().mockRejectedValue(new Error('Failed'));
```

### Spy on Method

```typescript
const spy = vi.spyOn(service, 'method');
spy.mockReturnValue('mocked');
spy.mockResolvedValue('async mocked');
spy.mockImplementation((arg) => `processed ${arg}`);
```

### Module Mock

```typescript
vi.mock('../../../src/modules/external/external.service', () => ({
  ExternalService: vi.fn().mockImplementation(() => ({
    fetchData: vi.fn().mockResolvedValue({ success: true }),
    processData: vi.fn().mockReturnValue('processed')
  }))
}));
```

### NestJS Module Mock

```typescript
import { Test } from '@nestjs/testing';

const module = await Test.createTestingModule({
  providers: [
    MyService,
    {
      provide: DatabaseService,
      useValue: mockDb
    },
    {
      provide: ExternalService,
      useValue: mockExternal
    }
  ]
}).compile();

const service = module.get(MyService);
```

## Quality Checklist

Before submitting a test, verify:

- [ ] Test is in correct location (see Rule 1)
- [ ] Test has descriptive name (not "should work")
- [ ] Header comment explains what/why/how
- [ ] All dependencies mocked (unit) or real (e2e)
- [ ] Cleanup in afterEach/afterAll
- [ ] Follows Arrange-Act-Assert pattern
- [ ] No console.log() statements
- [ ] No hardcoded IDs or credentials
- [ ] No timing-dependent assertions (use waitFor)
- [ ] Test is independent (no shared state)

## Commands

```bash
# Server
nx test server              # Unit tests
nx test server --watch      # Watch mode
nx test-e2e server          # E2E tests
nx test server --coverage   # With coverage

# Admin
nx test admin               # Unit tests
nx test-e2e admin           # Browser E2E
nx test-e2e admin --ui      # E2E UI mode
nx test-e2e admin --headed  # See browser
```

## Common Patterns

### Test Isolation

```typescript
describe('MyService', () => {
  let service: MyService;
  let mockDep: any;
  
  beforeEach(() => {
    // Fresh instances per test
    mockDep = { method: vi.fn() };
    service = new MyService(mockDep);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
});
```

### Async Operations

```typescript
it('should handle async operation', async () => {
  mockService.fetch.mockResolvedValue({ data: 'result' });
  
  const result = await service.processData();
  
  expect(result).toBe('result');
});
```

### Error Handling

```typescript
it('should handle errors', async () => {
  mockService.fetch.mockRejectedValue(new Error('Network error'));
  
  await expect(service.processData()).rejects.toThrow('Network error');
});
```

### Multiple Assertions

```typescript
it('should process data correctly', async () => {
  const input = { id: '123', name: 'Test' };
  
  const result = await service.process(input);
  
  expect(result).toMatchObject({
    id: '123',
    name: 'Test',
    processed: true
  });
  expect(mockDb.save).toHaveBeenCalledWith(expect.objectContaining({
    id: '123'
  }));
});
```

## Anti-Patterns (DON'T)

```typescript
// ❌ DON'T: Test implementation details
it('should call private method', () => {
  expect(service['_privateMethod']).toHaveBeenCalled();
});

// ✅ DO: Test public behavior
it('should process data', () => {
  const result = service.processData(input);
  expect(result).toBe(expected);
});

// ❌ DON'T: Mock everything in e2e tests
const mockDb = { query: vi.fn() }; // in e2e test

// ✅ DO: Use real infrastructure
const ctx = await createE2EContext(); // real DB

// ❌ DON'T: Shared state between tests
let sharedData = [];
it('test 1', () => { sharedData.push(1); });
it('test 2', () => { expect(sharedData).toHaveLength(1); }); // Fragile!

// ✅ DO: Independent tests
let data: any[];
beforeEach(() => { data = []; });
it('test 1', () => { data.push(1); expect(data).toHaveLength(1); });
it('test 2', () => { data.push(2); expect(data).toHaveLength(1); });
```

## Troubleshooting

### Test Fails: "Cannot find module"
→ Check import paths after migration, use correct relative paths

### Test Fails: "Database connection error"
→ Verify Docker containers running: `docker ps`
→ Check `.env` has correct DB connection string

### Test Timeout
→ Increase timeout: `it('test', async () => {...}, 10000)` (10s)
→ Check for missing `await` on async operations

### Flaky Test
→ Add explicit waits in browser tests: `await page.waitForSelector()`
→ Check for race conditions
→ Ensure cleanup runs properly

### Mock Not Working
→ Verify mock is set up before test runs
→ Check mock is reset between tests: `vi.clearAllMocks()`
→ Use `vi.spyOn()` for existing methods

## Reference

Full documentation: `docs/testing/TESTING_GUIDE.md`
