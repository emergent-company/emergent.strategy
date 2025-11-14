# Integration Test Refactoring Plan

## Context

13 database-dependent graph tests were moved from `tests/unit/graph/` to `tests/e2e/integration/graph/` but are currently **excluded** from the E2E test suite due to architectural incompatibility.

## The Problem

These tests use `Test.createTestingModule()` (NestJS testing pattern) which causes:

- **Partial NestJS bootstrap** - incomplete entity loading
- **TypeORM errors** - "Entity metadata for ProjectObjectTypeRegistry#project was not found"
- **Worker process crashes** - tests fail with segmentation faults

### Root Cause

The tests import `GraphModule` → `TypeRegistryModule` → `ProjectObjectTypeRegistry` entity, which has a relationship to the `Project` entity that isn't loaded during partial bootstrap.

### True E2E Pattern

Working E2E tests use `createE2EContext()` which:

- Bootstraps a complete NestJS application
- Loads all TypeORM entities properly
- Tests via HTTP endpoints (not direct service calls)

## Affected Tests

Located in `apps/server/tests/e2e/integration/graph/`:

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
13. `graph-vector.controller.spec.ts`

## Current Status

- ✅ Tests moved to `tests/e2e/integration/graph/`
- ✅ Excluded from E2E suite in `vitest.e2e.config.ts`
- ✅ Unit tests passing (1122 tests)
- ✅ E2E tests no longer crash
- ❌ 13 integration tests not running

## Refactoring Options

### Option A: Convert to True E2E Tests (Recommended)

**Approach:** Refactor to use HTTP endpoints like other E2E tests

**Steps:**

1. Replace `Test.createTestingModule()` with `createE2EContext()`
2. Change from direct service testing to HTTP endpoint testing
3. Use `app.inject()` or HTTP client for requests
4. Assert on HTTP responses instead of service return values

**Example Conversion:**

**Before (Integration Test):**

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [GraphModule],
}).compile();

const graphService = moduleRef.get(GraphService);
const result = await graphService.createObject(...);
expect(result.id).toBeDefined();
```

**After (E2E Test):**

```typescript
const { app } = await createE2EContext();

const response = await app.inject({
  method: 'POST',
  url: '/graph/objects',
  payload: { ... },
});

expect(response.statusCode).toBe(201);
expect(response.json().id).toBeDefined();
```

**Pros:**

- Tests real user-facing behavior
- No module dependency issues
- Consistent with existing E2E patterns
- Better integration coverage

**Cons:**

- Requires significant test rewriting
- May need to expose new endpoints
- Less direct service testing

### Option B: Create Dedicated Integration Test Runner

**Approach:** Separate infrastructure for tests that need partial bootstrap

**Steps:**

1. Create `vitest.integration.config.ts`
2. Configure with full TypeORM entity loading
3. Add npm script: `npm run test:integration`
4. Run separately from unit and E2E tests

**Configuration Example:**

```typescript
// vitest.integration.config.ts
export default defineConfig({
  test: {
    include: ['tests/e2e/integration/**/*.spec.ts'],
    setupFiles: ['tests/integration-setup.ts'],
    // Custom setup to load all entities
  },
});
```

**Pros:**

- Minimal test changes
- Maintains direct service testing
- Clear separation of test types

**Cons:**

- Additional infrastructure complexity
- Another test suite to maintain
- Still requires entity loading fixes

### Option C: Mock TypeORM Relationships

**Approach:** Mock out problematic entity relationships

**Steps:**

1. Mock `ProjectObjectTypeRegistry.project` relationship
2. Provide test doubles for related entities
3. Keep using `Test.createTestingModule()`

**Pros:**

- Minimal structural changes
- Fast execution (no real DB)

**Cons:**

- Loses integration value
- Brittle mocking logic
- Doesn't test real entity relationships

## Recommendation

**Start with Option A** (Convert to E2E Tests) for the following reasons:

1. **Best Practices** - Aligns with existing E2E patterns in the codebase
2. **Real Coverage** - Tests actual user-facing behavior via HTTP
3. **Maintainability** - One less test category to manage
4. **Future-Proof** - Less likely to break as TypeORM evolves

**Incremental Approach:**

1. Start with 1-2 simpler tests (e.g., `graph-branching.spec.ts`)
2. Develop conversion pattern
3. Apply to remaining tests
4. Remove exclusion from `vitest.e2e.config.ts`

## Implementation Checklist

- [ ] Review existing E2E tests for conversion patterns
- [ ] Identify required HTTP endpoints (some may need creation)
- [ ] Convert 1-2 pilot tests to E2E pattern
- [ ] Validate pilot tests pass in E2E suite
- [ ] Convert remaining tests
- [ ] Remove exclusion from `vitest.e2e.config.ts`
- [ ] Update this document with lessons learned

## References

- **Working E2E Examples:**

  - `apps/server/tests/e2e/graph.traversal-advanced.e2e.spec.ts`
  - `apps/server/tests/e2e/extraction-worker.e2e.spec.ts`
  - `apps/server/tests/e2e/phase1.workflows.e2e.spec.ts`

- **E2E Utilities:**

  - `createE2EContext()` helper
  - `apps/server/tests/e2e/global-org-cleanup.ts`

- **Related Configuration:**
  - `apps/server/vitest.e2e.config.ts` (E2E test config)
  - `apps/server/vitest.config.ts` (Unit test config)

## Notes

- The 22 failing ClickUp integration tests are unrelated to this issue
- Unit tests remain stable at 100% pass rate (1122 tests)
- Worker crash issue is fully resolved by the exclusion
