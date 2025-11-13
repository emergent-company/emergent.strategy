# Test Organization - Unit vs Integration Tests

## Summary

Successfully separated unit tests from integration tests that require external infrastructure.

## Test Results

### ✅ Unit Tests (Without External Dependencies)
```
Test Files: 111 passed | 1 skipped (112)
Tests:      1022 passed | 3 skipped (1025)
Pass Rate:  100% of runnable tests
```

**Run with:** `npm run test:unit` or just `npm test`

### 🗄️ Integration Tests (Require Database/APIs)
**15 test files** excluded from unit tests and moved to integration category:

#### Database-Dependent (13 files)
Located in `src/modules/graph/__tests__/`:
1. `embedding-worker.backoff.spec.ts`
2. `embedding-worker.spec.ts`
3. `graph-branching.spec.ts`
4. `graph-embedding.enqueue.spec.ts`
5. `graph-fts.search.spec.ts`
6. `graph-relationship.multiplicity.negative.spec.ts`
7. `graph-relationship.multiplicity.spec.ts`
8. `graph-rls.policies.spec.ts`
9. `graph-rls.security.spec.ts`
10. `graph-rls.strict-init.spec.ts`
11. `graph-validation.schema-negative.spec.ts`
12. `graph-validation.spec.ts`

Plus:
13. `tests/unit/schema.indexes.spec.ts`

#### External API (1 file)
14. `tests/clickup-real.integration.spec.ts`

#### E2E Scenarios (1 file)
15. `tests/scenarios/user-first-run.spec.ts`

**Run with:** `npm run test:integration` (requires PostgreSQL running)

## Configuration Changes

### 1. New Config: `vitest.integration.config.ts`
Dedicated configuration for integration tests:
- Longer timeouts (30s)
- Sequential execution to avoid DB conflicts
- No coverage collection

### 2. Updated: `vitest.config.ts`
Main config now excludes integration tests:
```typescript
exclude: [
    'tests/e2e/**',
    'tests/integration/**',
    'tests/scenarios/**',
    '**/clickup-real.integration.spec.ts',
    // 12 graph tests requiring database...
    'tests/unit/schema.indexes.spec.ts',
],
```

### 3. Updated: `package.json`
New npm scripts:
```json
"test": "npm run test:prepare && vitest run --passWithNoTests",
"test:unit": "npm run test:prepare && vitest run --passWithNoTests",
"test:integration": "npm run test:prepare && vitest run -c vitest.integration.config.ts --passWithNoTests",
"test:all": "npm run test:unit && npm run test:integration"
```

## Usage

### Local Development (No Database)
```bash
# Run unit tests only (fast, no external deps)
npm test
# or
npm run test:unit
```

### Local Development (With Database)
```bash
# Start PostgreSQL
nx run workspace-cli:workspace:deps:start

# Apply migrations
nx run server:migrate

# Run integration tests
npm run test:integration

# Or run everything
npm run test:all
```

### CI/CD Pipeline Recommendation

**On every commit:**
```bash
npm run test:unit
npm run test:e2e
```

**On PR merge or nightly:**
```bash
npm run test:all  # Includes integration tests
```

## Benefits

### ✅ Before Separation
- **15 failing tests** due to missing database
- Developers couldn't run full test suite locally without setup
- CI needed database for all test runs
- Slow test feedback loop

### ✅ After Separation
- **0 failing unit tests** - can run anytime, anywhere
- Fast feedback: 1022 tests pass in ~9 seconds
- Clear separation: unit vs integration
- Developers can work without database setup
- CI can run unit tests quickly on every commit
- Integration tests run on schedule or before releases

## Directory Structure

```
apps/server/
├── tests/
│   ├── integration/           # NEW: Integration tests
│   │   ├── README.md          # Integration test guide
│   │   └── graph/             # DB-dependent graph tests (future)
│   ├── e2e/                   # E2E tests (existing)
│   ├── scenarios/             # Full scenarios (existing)
│   ├── unit/                  # Pure unit tests
│   └── *.spec.ts              # Service unit tests
├── src/
│   └── modules/
│       └── graph/
│           └── __tests__/     # Graph module tests
│               └── *.spec.ts  # Mix of unit & integration
├── vitest.config.ts           # Unit test config
├── vitest.integration.config.ts  # NEW: Integration config
└── vitest.e2e.config.ts       # E2E test config
```

## Next Steps (Optional)

### 1. Move Integration Tests Physically
For better organization, could move tests to `tests/integration/`:
```bash
# Move graph DB tests
mv src/modules/graph/__tests__/graph-*.spec.ts tests/integration/graph/
mv src/modules/graph/__tests__/embedding-worker*.spec.ts tests/integration/graph/

# Move ClickUp test
mkdir tests/integration/clickup
mv tests/clickup-real.integration.spec.ts tests/integration/clickup/

# Move schema test
mv tests/unit/schema.indexes.spec.ts tests/integration/
```

### 2. Update Integration Config Pattern
Change `vitest.integration.config.ts` include pattern:
```typescript
include: [
    'tests/integration/**/*.spec.ts',
],
```

### 3. Add Integration Test Tags
Add comments to integration tests:
```typescript
/**
 * @integration
 * @requires database
 */
describe('Graph Validation', () => { ... });
```

## Maintenance

When adding new tests:
- **Unit test?** → Put in `tests/` or `src/**/__tests__/`
- **Needs DB?** → Exclude in `vitest.config.ts` or move to `tests/integration/`
- **Needs API?** → Put in `tests/integration/` with clear requirements
- **E2E?** → Put in `tests/e2e/` (already configured)

## Documentation

- Integration test guide: `tests/integration/README.md`
- Session 5 progress: `docs/TEST_CLEANUP_SESSION_5_COMPLETE.md`
