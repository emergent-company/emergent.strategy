# Server Testing Patterns - AI Agent Guide

This guide documents testing infrastructure and patterns for `apps/server/tests/`. It helps AI assistants write tests that follow established conventions and use the correct helpers.

## Quick Reference

| Test Type       | Location                 | Database     | When to Use                               |
| --------------- | ------------------------ | ------------ | ----------------------------------------- |
| **Unit**        | `tests/unit/`            | No (mocks)   | Service logic, isolated functions         |
| **E2E**         | `tests/e2e/`             | Yes (HTTP)   | API endpoints, full request/response      |
| **Integration** | `tests/e2e/integration/` | Yes (direct) | Service tests with real DB, no HTTP       |
| **Scenarios**   | `tests/e2e/scenarios/`   | Yes (full)   | User journeys, requires `RUN_SCENARIOS=1` |

---

## 1. Test Commands

```bash
# Unit tests (no database required)
nx run server:test
npm --prefix apps/server run test

# E2E tests (requires database)
nx run server:test-e2e
npm --prefix apps/server run test:e2e

# Scenario tests (heavy, skipped by default)
RUN_SCENARIOS=1 npm --prefix apps/server run test:scenarios

# Run specific test file
npm --prefix apps/server run test -- database.service.spec.ts
npm --prefix apps/server run test:e2e -- documents.e2e-spec.ts

# Skip database-dependent tests
SKIP_DB=1 npm --prefix apps/server run test
```

### Environment Variables

| Variable             | Purpose                                | Default |
| -------------------- | -------------------------------------- | ------- |
| `SKIP_DB`            | Skip tests requiring database          | unset   |
| `RUN_SCENARIOS`      | Enable scenario tests                  | unset   |
| `SCENARIO_DEBUG`     | Extra logging in scenarios             | unset   |
| `CHAT_MODEL_ENABLED` | Use real LLM in chat tests             | `false` |
| `GOOGLE_API_KEY`     | Required if `CHAT_MODEL_ENABLED=true`  | unset   |
| `DEBUG_AUTH_SCOPES`  | Add debug headers for scope resolution | unset   |

---

## 2. Unit Tests (`tests/unit/`)

Unit tests run without database. Use mocks and stubs for all dependencies.

### File Structure

```
tests/unit/
├── helpers/
│   ├── fake-graph-db.ts      # In-memory SQL emulator for GraphService
│   ├── inmemory-db.ts        # Lightweight DatabaseService stub
│   ├── schema-registry.stub.ts  # Mock schema validator
│   └── README.md             # FakeGraphDb documentation
├── services/
│   ├── auth.service.spec.ts
│   ├── database.service.spec.ts
│   └── graph.service.spec.ts
└── ...
```

### Basic Unit Test Pattern

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyService } from '../../src/modules/my/my.service';

describe('MyService', () => {
  let service: MyService;
  let mockDependency: { someMethod: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDependency = {
      someMethod: vi.fn().mockResolvedValue({ id: '123' }),
    };
    service = new MyService(mockDependency as any);
  });

  it('should process item correctly', async () => {
    const result = await service.process('input');

    expect(mockDependency.someMethod).toHaveBeenCalledWith('input');
    expect(result).toEqual({ id: '123', processed: true });
  });
});
```

### Mocking TypeORM DataSource

```typescript
import { vi, Mock } from 'vitest';

// Mock DataSource before imports
vi.mock('typeorm', async () => {
  const actual = await vi.importActual<typeof import('typeorm')>('typeorm');
  return {
    ...actual,
    DataSource: vi.fn().mockImplementation(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      isInitialized: true,
      query: vi.fn(),
      createQueryRunner: vi.fn().mockReturnValue({
        connect: vi.fn(),
        startTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        rollbackTransaction: vi.fn(),
        release: vi.fn(),
        query: vi.fn(),
      }),
    })),
  };
});

// Now import service that uses DataSource
import { DatabaseService } from '../../src/common/database/database.service';
```

### Creating Mock Services

```typescript
// Mock factory pattern
function createMockZitadelService() {
  return {
    validateToken: vi.fn().mockResolvedValue({
      sub: 'test-user-123',
      email: 'test@example.com',
    }),
    introspectToken: vi.fn().mockResolvedValue({ active: true }),
  };
}

function createMockUserProfileService() {
  return {
    findByZitadelId: vi.fn().mockResolvedValue({
      id: 'uuid-123',
      email: 'test@example.com',
    }),
    upsertFromZitadel: vi.fn().mockResolvedValue({ id: 'uuid-123' }),
  };
}

// Usage
const mockZitadel = createMockZitadelService();
const mockUserProfile = createMockUserProfileService();
const authService = new AuthService(mockZitadel, mockUserProfile);
```

---

## 3. FakeGraphDb Helper

The `FakeGraphDb` (`tests/unit/helpers/fake-graph-db.ts`) is an in-memory SQL pattern emulator for GraphService tests. It avoids Postgres while exercising SQL construction logic.

### When to Use FakeGraphDb

| Scenario                        | Use FakeGraphDb   |
| ------------------------------- | ----------------- |
| Testing GraphService CRUD logic | Yes               |
| Testing SQL query construction  | Yes               |
| Testing traversal algorithms    | Yes               |
| Testing RLS policies            | No (need real DB) |
| Performance benchmarking        | No (use real DB)  |
| Cross-module integration        | No (need real DB) |

### Creating FakeGraphDb

```typescript
import { makeFakeGraphDb, FakeGraphDb } from '../helpers/fake-graph-db';

describe('GraphService', () => {
  let fakeDb: FakeGraphDb;
  let service: GraphService;

  beforeEach(() => {
    // Minimal configuration for specific test needs
    fakeDb = makeFakeGraphDb({
      enableHistory: true, // Enable version history queries
      enableSearch: true, // Enable search queries
      enableTraversal: true, // Enable traversal/expand queries
      enableRelationships: true, // Enable relationship CRUD
      strict: false, // Throw on unmatched SQL (debugging)
      recordQueries: false, // Record queries for inspection
    });

    service = new GraphService(fakeDb as any);
  });
});
```

### Feature Flags Reference

| Flag                  | Purpose                   | Enable When Testing         |
| --------------------- | ------------------------- | --------------------------- |
| `enableHistory`       | Version history listing   | Object/relationship history |
| `enableSearch`        | DISTINCT ON head search   | Search endpoints            |
| `enableTraversal`     | Edge selection queries    | `traverse()`, `expand()`    |
| `enableRelationships` | Relationship CRUD         | Any relationship operations |
| `strict`              | Throw on unmatched SQL    | Debugging missing patterns  |
| `recordQueries`       | Record SQL for inspection | Asserting query sequences   |

### Testing with Query Recording

```typescript
it('should execute expected SQL sequence', async () => {
  fakeDb = makeFakeGraphDb({
    enableRelationships: true,
    recordQueries: true,
  });

  await service.createRelationship({ type: 'RELATES_TO', srcId, dstId });

  const queries = fakeDb.getRecordedQueries();
  expect(queries).toHaveLength(2);
  expect(queries[0].sql).toMatch(/INSERT INTO kb\.graph_relationships/);
});
```

### Strict Mode for Debugging

```typescript
// Enable strict mode to catch unsupported SQL patterns
fakeDb = makeFakeGraphDb({ strict: true });

// This will throw if the SQL doesn't match any pattern
await service.someNewQuery(); // Throws: "Unmatched SQL pattern: ..."
```

---

## 4. InMemoryDatabaseService

Lighter stub for tests that need basic query simulation without full FakeGraphDb.

```typescript
import { InMemoryDatabaseService } from '../helpers/inmemory-db';

describe('ExpandService', () => {
  let db: InMemoryDatabaseService;

  beforeEach(() => {
    db = new InMemoryDatabaseService();

    // Seed test data
    db.seedObjects([
      { id: 'obj-1', type: 'Document', key: 'doc-1' },
      { id: 'obj-2', type: 'Person', key: 'person-1' },
    ]);
  });

  it('should expand from root', async () => {
    const result = await service.expand('obj-1', { depth: 2 });
    expect(result.nodes).toContainEqual(
      expect.objectContaining({ id: 'obj-1' })
    );
  });
});
```

---

## 5. Schema Registry Stub

Mock schema validator for testing schema-aware operations:

```typescript
import { makeSchemaRegistryStub } from '../helpers/schema-registry.stub';

describe('ObjectValidation', () => {
  let schemaRegistry: ReturnType<typeof makeSchemaRegistryStub>;

  beforeEach(() => {
    schemaRegistry = makeSchemaRegistryStub({
      types: {
        Document: {
          properties: { title: 'string', content: 'string' },
          required: ['title'],
        },
        Person: {
          properties: { name: 'string', email: 'string' },
          required: ['name'],
        },
      },
      relationships: {
        AUTHORED: {
          srcTypes: ['Person'],
          dstTypes: ['Document'],
          multiplicity: 'many-to-many',
        },
      },
    });
  });
});
```

---

## 6. E2E Tests (`tests/e2e/`)

E2E tests run against a real NestJS application with database.

### Test App Bootstrap

```typescript
import { bootstrapTestApp } from '../utils/test-app';

describe('Documents E2E', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const { app: testApp, baseUrl: url } = await bootstrapTestApp();
    app = testApp;
    baseUrl = url;
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### E2E Context (Recommended)

Use `createE2EContext()` for isolated test environments with automatic cleanup:

```typescript
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

describe('Documents E2E', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EContext();
  });

  afterAll(async () => {
    await ctx.cleanup(); // Clean test data
    await ctx.close(); // Close app
  });

  it('should create document', async () => {
    const response = await fetch(`${ctx.baseUrl}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': ctx.projectId,
        'x-org-id': ctx.orgId,
        ...authHeader('all'), // Full scopes
      },
      body: JSON.stringify({ title: 'Test Doc', content: 'Hello' }),
    });

    expect(response.status).toBe(201);
  });
});
```

### E2EContext Interface

```typescript
interface E2EContext {
  app: INestApplication;
  baseUrl: string;
  orgId: string; // Isolated org for this test run
  projectId: string; // Isolated project for this test run
  userSub: string; // Test user subject
  cleanup(): Promise<void>; // Clean artifacts (chat, docs, etc.)
  close(): Promise<void>; // Close NestJS app
  cleanupProjectArtifacts(projectId: string): Promise<void>;
  cleanupExternalOrg(orgId: string, opts?): Promise<void>;
  cleanupExternalProject(projectId: string, opts?): Promise<void>;
}
```

---

## 7. Auth Helpers

### Token Variants

```typescript
import { authHeader } from './auth-helpers';

// Full scopes (org:*, project:*, documents:*, etc.)
authHeader('all');
// → { Authorization: 'Bearer e2e-all' }

// Full scopes with user suffix (for multi-user tests)
authHeader('all', 'user1');
// → { Authorization: 'Bearer e2e-user1' }

// Default scopes (org:read only)
authHeader('default');
// → { Authorization: 'Bearer with-scope' }

// No scopes (expect 403)
authHeader('none');
// → { Authorization: 'Bearer no-scope' }

// Graph read scopes only
authHeader('graph-read');
// → { Authorization: 'Bearer graph-read' }
```

### Scope Variants Reference

| Variant        | Token                       | Scopes                    |
| -------------- | --------------------------- | ------------------------- |
| `'all'`        | `e2e-all` or `e2e-{suffix}` | All scopes (admin-level)  |
| `'default'`    | `with-scope`                | `org:read` only           |
| `'none'`       | `no-scope`                  | No scopes (for 403 tests) |
| `'graph-read'` | `graph-read`                | Graph search scopes       |

### Complete Request Example

```typescript
const response = await fetch(`${ctx.baseUrl}/graph/objects`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-project-id': ctx.projectId,
    'x-org-id': ctx.orgId,
    ...authHeader('all'),
  },
  body: JSON.stringify({
    type: 'Document',
    key: 'doc-1',
    properties: { title: 'Test' },
  }),
});
```

---

## 8. Database Availability Handling

### describeWithDb Wrapper

Skip entire test suite when database is unavailable:

```typescript
import { describeWithDb } from '../utils/db-describe';

describeWithDb('DatabaseService Integration', () => {
  // These tests only run when SKIP_DB is not set
  // and database connection succeeds

  it('should execute queries', async () => {
    // ...
  });
});
```

### Manual Skip Pattern

```typescript
import { describe, it, beforeAll } from 'vitest';

describe('OptionalDbTests', () => {
  const skipDb = process.env.SKIP_DB === '1';

  beforeAll(async () => {
    if (skipDb) return;
    // Setup database connection
  });

  it.skipIf(skipDb)('should query database', async () => {
    // Test requiring database
  });

  it('should work without database', () => {
    // Test that works regardless
  });
});
```

---

## 9. Fixtures (`tests/e2e/fixtures.ts`)

### Ensuring Org/Project Exist

```typescript
import { ensureOrg, ensureProject, ensureOrgAndProject } from './fixtures';

// Create org if not exists
const org = await ensureOrg(pool, { name: 'Test Org' });

// Create project if not exists
const project = await ensureProject(pool, {
  name: 'Test Project',
  organizationId: org.id,
});

// Combined helper
const { org, project } = await ensureOrgAndProject(pool, {
  orgName: 'Test Org',
  projectName: 'Test Project',
});
```

---

## 10. Integration Tests (`tests/e2e/integration/`)

Direct service tests with real database, no HTTP layer:

```typescript
import { Test } from '@nestjs/testing';
import { describeWithDb } from '../../utils/db-describe';
import { GraphService } from '../../../src/modules/graph/graph.service';

describeWithDb('GraphService Integration', () => {
  let service: GraphService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    service = module.get(GraphService);
  });

  it('should create and retrieve object', async () => {
    const created = await service.createObject({
      projectId,
      type: 'Document',
      key: 'test-doc',
      properties: { title: 'Test' },
    });

    const retrieved = await service.getObject(created.id);
    expect(retrieved.properties.title).toBe('Test');
  });
});
```

---

## 11. Scenario Tests (`tests/e2e/scenarios/`)

Heavy end-to-end user journeys. Skipped by default.

```typescript
// Only runs when RUN_SCENARIOS=1
import { describe, it, beforeAll, afterAll } from 'vitest';

const runScenarios = process.env.RUN_SCENARIOS === '1';

describe.skipIf(!runScenarios)('Full User Journey', () => {
  it('should complete document ingestion and chat flow', async () => {
    // 1. Create org and project
    // 2. Upload document
    // 3. Wait for extraction
    // 4. Start chat conversation
    // 5. Verify citations in response
  });
});
```

---

## 12. Decision Table: Which Test Type?

| Testing...                   | Test Type   | Key Helper                   |
| ---------------------------- | ----------- | ---------------------------- |
| Service method logic (no DB) | Unit        | `vi.mock`, mock factories    |
| GraphService SQL patterns    | Unit        | `FakeGraphDb`                |
| API endpoint behavior        | E2E         | `createE2EContext()`         |
| HTTP status codes            | E2E         | `authHeader()` variants      |
| Service with real DB         | Integration | `describeWithDb`             |
| Auth guard behavior          | E2E         | `authHeader('none')` for 403 |
| Multi-step user flow         | Scenario    | `RUN_SCENARIOS=1`            |
| Schema validation            | Unit        | `makeSchemaRegistryStub()`   |

---

## 13. Anti-Patterns

| Anti-Pattern                         | Correct Approach                                      |
| ------------------------------------ | ----------------------------------------------------- |
| Skipping cleanup in E2E              | Always use `ctx.cleanup()` in `afterAll`              |
| Hardcoding project/org IDs           | Use `ctx.projectId`, `ctx.orgId` from context         |
| Using `authHeader('all')` everywhere | Use minimal scope variant for the test                |
| Direct DB queries in E2E tests       | Use API endpoints; direct queries only in fixtures    |
| Missing `x-project-id` header        | Always include tenant headers for protected endpoints |
| Using real LLM in unit tests         | Mock LLM services; only use real LLM in scenarios     |
| Not checking response status         | Always assert `response.status` before body           |
| Sharing state between tests          | Each test should be independent                       |
| Using `strict: true` in CI           | Only for debugging; can fail on new patterns          |

---

## 14. Common Test Assertions

### HTTP Response Patterns

```typescript
// Success response
expect(response.status).toBe(200);
const data = await response.json();
expect(data).toHaveProperty('id');

// Created response
expect(response.status).toBe(201);

// Not found
expect(response.status).toBe(404);
const error = await response.json();
expect(error.error.code).toBe('not-found');

// Forbidden (missing scopes)
expect(response.status).toBe(403);
const error = await response.json();
expect(error.error.missing_scopes).toContain('documents:write');

// Validation error
expect(response.status).toBe(400);
const error = await response.json();
expect(error.error.code).toBe('validation-failed');
```

### FakeGraphDb Assertions

```typescript
// Verify object was stored
const stored = fakeDb.getObject(createdId);
expect(stored).toBeDefined();
expect(stored.properties.title).toBe('Test');

// Verify relationship exists
const rel = fakeDb.getRelationship(srcId, dstId, 'RELATES_TO');
expect(rel).toBeDefined();

// Query recording assertions
const queries = fakeDb.getRecordedQueries();
expect(queries.filter((q) => q.sql.includes('INSERT'))).toHaveLength(1);
```

---

## 15. File Index

```
tests/
├── e2e/
│   ├── auth-helpers.ts           # authHeader() function
│   ├── e2e-context.ts            # createE2EContext() for isolated tests
│   ├── fixtures.ts               # ensureOrg(), ensureProject() helpers
│   ├── integration/              # Direct service tests with DB
│   │   └── *.integration-spec.ts
│   ├── scenarios/                # Full user journey tests
│   │   └── *.scenario-spec.ts
│   ├── documents.e2e-spec.ts     # Document API tests
│   ├── graph.e2e-spec.ts         # Graph API tests
│   ├── auth.e2e-spec.ts          # Auth flow tests
│   └── ...                       # ~100 E2E spec files
├── unit/
│   ├── helpers/
│   │   ├── fake-graph-db.ts      # In-memory GraphService emulator
│   │   ├── inmemory-db.ts        # Lightweight DB stub
│   │   ├── schema-registry.stub.ts  # Schema validator mock
│   │   └── README.md             # FakeGraphDb documentation
│   └── services/
│       ├── auth.service.spec.ts
│       ├── database.service.spec.ts
│       └── graph.service.spec.ts
├── utils/
│   ├── test-app.ts               # bootstrapTestApp() for E2E
│   ├── db-describe.ts            # describeWithDb() wrapper
│   ├── http.ts                   # HTTP test utilities
│   ├── vector-helpers.ts         # Vector/embedding test helpers
│   └── seed-embeddings.ts        # Seed test embeddings
└── test-db-config.ts             # Database configuration for tests
```

---

## 16. Running Tests in CI

```yaml
# Example CI configuration
test-unit:
  script: npm --prefix apps/server run test

test-e2e:
  script: npm --prefix apps/server run test:e2e
  services:
    - postgres:16

test-scenarios:
  script: RUN_SCENARIOS=1 npm --prefix apps/server run test:scenarios
  when: manual # Heavy tests, run manually or on release
```

---

## 17. Troubleshooting

| Issue                                | Cause                    | Solution                                     |
| ------------------------------------ | ------------------------ | -------------------------------------------- |
| E2E tests fail with connection error | Database not running     | Start postgres: `docker compose up -d db`    |
| 403 on endpoints expecting 200       | Wrong auth token variant | Use `authHeader('all')` for full access      |
| Missing `x-project-id` error         | Forgot tenant headers    | Add `x-project-id` and `x-org-id` to request |
| FakeGraphDb returns empty            | SQL pattern not matched  | Enable `strict: true` to see unmatched SQL   |
| Scenario tests not running           | Missing env var          | Set `RUN_SCENARIOS=1`                        |
| Test data persists between runs      | Cleanup not called       | Ensure `ctx.cleanup()` in `afterAll`         |
| Unit test imports fail               | Missing vitest mock      | Add `vi.mock()` before import statements     |
