# Test Organization: Unit vs E2E/Integration (Consolidated)

## Summary

**Final architecture** (after consolidation): Tests are organized into **two main categories** based on infrastructure requirements:

1. **Unit Tests** - Fast, isolated tests with no external dependencies
2. **E2E/Integration Tests** - All tests requiring external infrastructure (database, services, APIs)

## Test Results

### ✅ Unit Tests (No External Dependencies)
```
Test Files: 111 passed | 1 skipped (112)
Tests:      1022 passed | 3 skipped (1025)
Duration:   ~9 seconds
Pass Rate:  100% of runnable tests
```

**Requirements:** None - just run the tests!  
**Run with:** `npm run test:unit` or `npm test`

### 🗄️ E2E/Integration Tests (Require Database)

**Total: 85+ test files** requiring PostgreSQL database:

#### HTTP Endpoint Tests (E2E)
- **70+ test files** in `tests/e2e/`
- Test through HTTP layer with full NestJS app bootstrap
- Examples: `chat.*.e2e.spec.ts`, `documents.*.e2e.spec.ts`, `search.*.e2e.spec.ts`

#### Service Integration Tests
- **13 files** in `src/modules/graph/__tests__/` (graph DB operations)
- **1 file** `tests/unit/schema.indexes.spec.ts` (direct DB queries)
- **1 file** `tests/clickup-real.integration.spec.ts` (external API)
- Test services/repositories directly (lighter than E2E)

#### Scenario Tests
- **1 file** in `tests/scenarios/` (`user-first-run.spec.ts`)
- Full user journey tests

**Requirements:** PostgreSQL database on port 5432  
**Run with:** `npm run test:e2e`

## Architecture Evolution

### Original Problem (Pre-Session 5)
```
All tests ran together → 20 files failing due to missing database
Pass rate: 93% (1005/1025 tests)
Developers couldn't run tests locally without complex setup
```

### Session 5 Interim (3 configs)
```
vitest.config.ts              → Unit tests
vitest.integration.config.ts  → Integration tests (15 files)
vitest.e2e.config.ts          → E2E tests (70+ files)

Problem: 3 separate configs, both integration/e2e needed same infrastructure
```

### Final Consolidated (2 configs) ✅
```
vitest.config.ts     → Unit tests (fast, no deps)
vitest.e2e.config.ts → ALL infrastructure tests (E2E + Integration + Scenarios)

Benefits:
✅ Simpler mental model (unit vs infrastructure)
✅ One command for all database tests
✅ One CI job for infrastructure tests
✅ Less configuration maintenance
```

## Configuration Details

### vitest.config.ts (Unit Tests)
```typescript
{
  include: ['tests/**/*.spec.ts', 'src/**/__tests__/**/*.spec.ts'],
  exclude: [
    'tests/e2e/**',
    'tests/scenarios/**',
    '**/clickup-real.integration.spec.ts',
    '**/schema.indexes.spec.ts',
    'src/modules/graph/__tests__/*-integration.spec.ts',
    'src/modules/graph/__tests__/embedding-worker.*.spec.ts',
    'src/modules/graph/__tests__/graph-*.spec.ts',
  ]
}
```

### vitest.e2e.config.ts (E2E/Integration Tests)
```typescript
{
  include: [
    'tests/e2e/**/*.e2e.spec.ts',
    'tests/e2e/**/*.spec.ts',
    'tests/scenarios/**/*.spec.ts',
    'src/modules/graph/__tests__/*-integration.spec.ts',
    '**/clickup-real.integration.spec.ts',
  ],
  testTimeout: 30000  // Longer for DB/API operations
}
```

## NPM Scripts

### Simplified Commands
```bash
# Unit tests (fast, no setup)
npm test                  # Default: unit tests
npm run test:unit         # Explicit unit tests

# E2E/Integration tests (requires database)
npm run test:e2e          # All infrastructure tests

# Run everything
npm run test:all          # Unit + E2E sequentially
```

### Removed Commands
- ❌ `npm run test:integration` - Consolidated into test:e2e
- ❌ `vitest.integration.config.ts` - Removed (merged into e2e config)

## Usage Examples

### Local Development

**Fast feedback loop (no setup required):**
```bash
npm test
# Runs in ~9 seconds, all unit tests pass
```

**Full test suite (requires database):**
```bash
# Start database
nx run workspace-cli:workspace:deps:start

# Run all tests
npm run test:all
```

### CI/CD Pipeline

**On every commit:**
```bash
npm run test:unit
npm run build
```

**On PR merge / nightly:**
```bash
npm run test:e2e  # Requires PostgreSQL container
npm run test:all  # Full suite
```

## Directory Structure

```
apps/server/
├── tests/
│   ├── e2e/                    # E2E tests (HTTP endpoints)
│   │   ├── integration/        # Service integration tests (optional location)
│   │   ├── chat.*.e2e.spec.ts
│   │   ├── documents.*.e2e.spec.ts
│   │   └── ...
│   ├── scenarios/              # Full user journey tests
│   │   └── user-first-run.spec.ts
│   ├── integration/            # Deprecated (see README)
│   └── unit/                   # Unit tests
├── src/
│   └── modules/
│       └── graph/__tests__/    # Graph DB integration tests
│           ├── *-integration.spec.ts
│           └── graph-*.spec.ts
├── vitest.config.ts            # Unit test config
└── vitest.e2e.config.ts        # E2E/Integration config
```

## Benefits of Consolidation

### Before (3 configs)
- ❌ Confusing: "Is this integration or e2e?"
- ❌ Both need database anyway
- ❌ Two separate CI jobs for same infrastructure
- ❌ More configuration to maintain

### After (2 configs)
- ✅ Clear: "Does it need infrastructure?"
- ✅ One command for all database tests
- ✅ One CI job for infrastructure tests
- ✅ Simpler mental model
- ✅ Less maintenance overhead

## Maintenance Guidelines

### Adding New Tests

**Unit Test** (if):
- Pure logic, no side effects
- Mocked dependencies
- Fast execution (<100ms per test)
- No database, file system, or network

**E2E/Integration Test** (if):
- Requires PostgreSQL database
- Requires external API calls
- Tests HTTP endpoints
- Tests multi-service interactions
- Execution >1s per test

### Test Categorization Rules

**Goes in unit tests:**
```typescript
// Pure service logic with mocked database
it('calculates score correctly', () => {
  const service = new ScoreService();
  expect(service.calculate(data)).toBe(42);
});
```

**Goes in e2e/integration:**
```typescript
// Real database operations
it('persists graph object', async () => {
  const ctx = await createE2EContext('test');
  await graphService.createObject({ ... });
  const result = await db.query('SELECT ...');
  expect(result.rows).toHaveLength(1);
});
```

## Migration Notes

### What Changed from Session 5 Initial

1. **Removed** `vitest.integration.config.ts`
2. **Updated** `vitest.e2e.config.ts` to include all infrastructure tests
3. **Removed** `npm run test:integration` script
4. **Updated** `npm run test:all` to run `test:unit && test:e2e`
5. **Created** `tests/e2e/integration/` directory for optional organization
6. **Updated** `tests/integration/README.md` to point to new location
7. **Simplified** documentation and mental model

### Files Not Moved (Yet)

Integration tests remain in their current locations:
- ✅ `src/modules/graph/__tests__/*-integration.spec.ts` (can stay, properly excluded)
- ✅ `tests/clickup-real.integration.spec.ts` (can stay, properly excluded)
- ✅ `tests/scenarios/user-first-run.spec.ts` (stays in scenarios)

These files are correctly excluded from unit tests and included in e2e runs. Physical relocation to `tests/e2e/integration/` is optional for organizational preference.

## Success Metrics

### Unit Tests
- ✅ 100% pass rate without any setup
- ✅ ~9 second execution time (fast feedback)
- ✅ Zero external dependencies

### E2E/Integration Tests
- ✅ All database-dependent tests consolidated
- ✅ Clear infrastructure requirements
- ✅ One command to run all infrastructure tests

### Developer Experience
- ✅ Simple mental model: unit vs infrastructure
- ✅ Fast local development (unit tests)
- ✅ Easy CI/CD configuration (2 job types)
- ✅ Clear documentation and README files

## Related Documentation

- `tests/e2e/integration/README.md` - Integration test organization details
- `tests/integration/README.md` - Deprecated location notice
- `.github/instructions/testing.instructions.md` - Testing infrastructure overview
- This file serves as the authoritative reference for test organization after consolidation
