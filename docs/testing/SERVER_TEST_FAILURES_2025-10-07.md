# Server Unit Test Failures - October 7, 2025

## Executive Summary

Server unit test run completed with **174 failed tests out of 827 total** (21% failure rate).
Tests completed in 36.97 seconds with the following breakdown:

- ✅ **632 passed** (76.4%)
- ❌ **174 failed** (21.0%)
- ⏭️ **21 skipped** (2.5%)

## Critical Blockers

### 1. Testing Framework Mismatch (HIGH PRIORITY)

**Issue**: Multiple test files using `jest` API when project uses Vitest.

**Affected Files**:

- `src/modules/type-registry/__tests__/type-registry.service.spec.ts`
- `src/modules/template-packs/__tests__/template-pack.service.spec.ts`

**Error Pattern**:

```
ReferenceError: jest is not defined
❯ src/modules/type-registry/__tests__/type-registry.service.spec.ts:65:9
    jest.clearAllMocks();
```

**Impact**: 48 tests failing (all tests in TypeRegistryService and TemplatePackService)

**Root Cause**: Tests were written for Jest but project uses Vitest.

**Fix Required**:

```typescript
// BEFORE (Jest syntax)
beforeEach(() => {
  mockDb = {
    query: jest.fn(),
    transaction: jest.fn(),
  } as any;
});

afterEach(() => {
  jest.clearAllMocks();
});

// AFTER (Vitest syntax)
import { vi } from 'vitest';

beforeEach(() => {
  mockDb = {
    query: vi.fn(),
    transaction: vi.fn(),
  } as any;
});

afterEach(() => {
  vi.clearAllMocks();
});
```

**Estimated Effort**: 30 minutes - straightforward find/replace operation

---

### 2. Database Schema Mismatches (HIGH PRIORITY)

**Issue**: Tests expecting database columns that don't exist in E2E_MINIMAL_DB mode.

#### Missing Columns:

1. **`chat_conversations.is_private`**

   - Error: `column "is_private" of relation "chat_conversations" does not exist`
   - Affected: `tests/scenarios/user-first-run.spec.ts`
   - Likely recent schema change not reflected in test setup

2. **`graph_relationships.weight`**

   - Error: `column "weight" does not exist`
   - Affected: Multiple graph relationship tests
   - Files: `graph-branching.spec.ts`, `graph-relationship.multiplicity.spec.ts`

3. **`graph_objects.expires_at`**
   - Error: `column o.expires_at does not exist`
   - Affected: `graph-fts.search.spec.ts`
   - FTS search queries expecting this column
   - **Resolution (November 2025):** This column was intentionally removed. The TTL-based expiration feature (Task 7c) was planned but never implemented. Backward compatibility code referencing this column has been cleaned up.

**Impact**: ~30 test failures across graph, relationship, and chat modules

**Root Cause**:

- E2E_MINIMAL_DB schema is outdated compared to production schema
- Tests use different schema initialization than production migrations
- Schema drift between test and production environments

**Fix Required**:

1. Update `DatabaseService.ensureMinimalSchema()` to include missing columns
2. Alternatively, disable E2E_MINIMAL_DB and use full schema in tests
3. Add schema validation test to catch future drift

**Estimated Effort**: 2-4 hours (investigate schema differences, update initialization)

---

### 3. Row-Level Security (RLS) Policy Violations (MEDIUM PRIORITY)

**Issue**: Tests failing with RLS policy violations when inserting data.

**Error Pattern**:

```
[ERROR] new row violates row-level security policy for table "graph_objects"
error: new row violates row-level security policy for table "graph_objects"
    at GraphService.createObject (src/modules/graph/graph.service.ts:175:25)
```

**Affected Tests**:

- Graph traversal tests
- Merge/apply tests
- Multiple graph service tests

**Impact**: ~40 test failures

**Root Cause**:

- Tests running in E2E_MINIMAL_DB mode which skips RLS setup
- Some tests not properly setting tenant context before operations
- Mismatch between bypass role expectations and actual role configuration

**From Log**:

```
[DatabaseService] [E2E mode] Skipping RLS setup - not needed when AuthGuard is bypassed
[DatabaseService] Using non-bypass role 'spec' (bypass=false, super=false) – no switch needed
```

**Fix Required**:

1. Ensure tests call `db.setTenantContext(orgId, projectId)` before creating objects
2. Consider using RLS bypass role for test mode
3. Add helper that automatically sets context in test setup

**Estimated Effort**: 3-4 hours (review all graph tests, add proper context setup)

---

### 4. Database Connection Pool Issues (MEDIUM PRIORITY)

**Issue**: Tests attempting to use database connection pool after it's been closed.

**Error Pattern**:

```
[ERROR] processBatch failed
[ERROR] Error: Cannot use a pool after calling end on the pool
```

**Affected**: ExtractionWorkerService tests

**Impact**: ~8 test failures

**Root Cause**:

- Test teardown closing connection pool
- Subsequent tests or background workers trying to use closed pool
- Improper test isolation

**Fix Required**:

1. Review test lifecycle - ensure pools are properly managed
2. Mock database connection in worker service tests
3. Add pool state validation before operations

**Estimated Effort**: 2-3 hours

---

### 5. Security/Scope Enforcement Issues (MEDIUM PRIORITY)

**Issue**: Security guards not properly enforcing 403 responses in tests.

**Failing Tests**:

- `tests/auth-scope-denied.spec.ts` - expecting 403, getting 200
- `tests/error-envelope.spec.ts` - expecting 403 envelope, getting 200
- Multiple OpenAPI scope validation tests

**Error Example**:

```typescript
expect(res.status).toBe(403);
// Received: 200
```

**Impact**: ~48 test failures (all scope-related tests)

**Root Cause**:

- E2E mode bypassing AuthGuard
- Scope validation not running in test environment
- OpenAPI enrichment not happening during test builds

**From Log**:

```
DEBUG /auth/me no-scope status 200 { sub: 'mock-user-id', email: 'demo@example.com' }
```

**Fix Required**:

1. Review E2E mode auth bypass configuration
2. Ensure ScopesGuard runs even in test mode
3. Re-enable OpenAPI enrichment for tests

**Estimated Effort**: 4-6 hours (security-critical, needs careful review)

---

### 6. OpenAPI Contract Drift (LOW PRIORITY)

**Issue**: OpenAPI schema hash mismatch and missing enrichment.

**Error**:

```
expected 'a822a330c9fa215653521bc1548e95091bf19…'
     to be 'f408826cf4afb53f3cc9d044fd18e5191f89a…'
```

**Impact**: 1 test failure (hash validation)

**Root Cause**:

- API routes changed without updating expected hash
- Need to regenerate OpenAPI spec

**Fix Required**:

1. Run OpenAPI generation
2. Update `EXPECTED_HASH` in test
3. Review what changed in API

**Estimated Effort**: 30 minutes (after confirming changes are intentional)

---

### 7. Test Timeout Issues (LOW PRIORITY)

**Issue**: Multiple tests timing out at 5-10 second limits.

**Affected Tests**:

- Graph merge tests
- Embedding worker tests
- RLS initialization tests

**Error Pattern**:

```
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument
```

**Impact**: ~12 test failures

**Root Cause**:

- Tests hanging on database operations
- Likely related to RLS/connection pool issues above
- May be deadlocks or race conditions

**Fix Required**:

1. Fix underlying database issues first
2. Then investigate specific timeout causes
3. May need to increase timeouts for integration-heavy tests

**Estimated Effort**: 2-3 hours (after fixing database issues)

---

### 8. Graph Traversal/Search Failures (MEDIUM PRIORITY)

**Issue**: Graph traversal and search operations returning empty results.

**Pattern**:

```typescript
expect(result.nodes.length).toBe(3);
// Received: 0
```

**Affected Tests**:

- `tests/graph.traverse.pagination.spec.ts`
- `tests/graph.traversal-advanced.spec.ts`
- `src/modules/graph/__tests__/graph-fts.search.spec.ts`

**Impact**: ~35 test failures

**Root Cause**:

- Likely related to RLS policy violations (objects not visible)
- Or schema mismatch (missing columns in queries)
- Tests may not be properly seeding data

**Fix Required**:

1. Fix RLS issues first
2. Verify test data seeding
3. Review traversal query SQL for schema compatibility

**Estimated Effort**: 2-3 hours (dependent on RLS fixes)

---

### 9. Path Summary Service Failures (LOW PRIORITY)

**Issue**: PathSummaryService returning empty results or undefined.

**Error Pattern**:

```typescript
expect(result.size).toBe(1);
// Received: 0

expect(pathData.summary).toContain('implements');
// TypeError: Cannot read properties of undefined (reading 'summary')
```

**Impact**: ~11 test failures

**Root Cause**:

- Service not properly querying database
- Mock database not configured correctly
- May be dependent on graph traversal fixes

**Fix Required**:

1. Review PathSummaryService database queries
2. Fix mock database setup in tests
3. Verify integration with graph service

**Estimated Effort**: 2-3 hours

---

## Recommended Fix Priority

### Phase 1: Quick Wins (1-2 hours)

1. ✅ **Testing Framework Mismatch** - Replace `jest` with `vi` (30 min)
2. ✅ **OpenAPI Hash Update** - Regenerate and update hash (30 min)

### Phase 2: Schema Issues (4-6 hours)

3. 🔴 **Database Schema Mismatches** - Update E2E_MINIMAL_DB schema (2-4 hours)
4. 🔴 **RLS Policy Setup** - Ensure proper tenant context (3-4 hours)

### Phase 3: Service Issues (6-8 hours)

5. 🟡 **Connection Pool Management** - Fix test isolation (2-3 hours)
6. 🟡 **Security/Scope Enforcement** - Re-enable guards in tests (4-6 hours)

### Phase 4: Integration Issues (4-6 hours)

7. 🟡 **Graph Traversal** - Fix empty result issues (2-3 hours)
8. 🟡 **Path Summary Service** - Fix database queries (2-3 hours)
9. 🟢 **Test Timeouts** - Investigate hangs (2-3 hours)

**Total Estimated Effort**: 17-25 hours of development work

---

## Test Execution Details

### Command Run

```bash
npm --prefix apps/server run test
```

### Environment

- **Database Mode**: E2E_MINIMAL_DB enabled
- **Auth Mode**: Bypass mode (E2E)
- **Database User**: spec (non-super, non-bypass)
- **RLS**: Skipped in E2E mode
- **Test Runner**: Vitest 3.2.4

### Statistics by Category

**Passing Tests**:

- Unit tests: ~450 passed
- Service layer tests: ~100 passed
- Utility tests: ~82 passed

**Failing Tests**:

- Graph/Traversal: 35 failures
- Scope/Security: 48 failures
- Type Registry: 24 failures
- Template Packs: 13 failures
- Relationships: 12 failures
- Misc: 42 failures

---

## Next Steps

### Immediate Actions (User Decision Required):

1. **Continue with remaining tests?**

   - Admin unit tests
   - Admin E2E tests
   - MCP tests
   - Get full picture of test health

2. **Fix server tests first?**

   - Block on fixing these 174 failures
   - Ensure backend is stable before testing frontend

3. **Create GitHub issues?**
   - Document each category as separate issue
   - Assign priorities and owners
   - Track progress

### Recommendations:

Given that:

- 76% of tests are passing (632/827)
- Core functionality appears to work (services are running)
- Issues are mostly in test setup, not production code

**Recommended**: Continue with remaining test suites to get full picture, then prioritize fixes based on:

1. Tests blocking critical features
2. Tests that would catch real bugs
3. Tests that are just outdated

---

## References

- Test Output: See full output above
- Test Framework: Vitest 3.2.4
- Database: PostgreSQL with RLS
- Related Docs:
  - `.github/instructions/testing.instructions.md`
  - `docs/TEST_ID_CONVENTIONS.md`
  - `scripts/ensure-e2e-deps.mjs`
