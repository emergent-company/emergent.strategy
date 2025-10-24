# Test Cleanup Progress - Session 5

## Summary

Fixed 2 test files completely during this session, reducing failing test files from **20 to 18**.

**Test Suite Status:**
- ✅ **108 passing** test files (127 total)
- ❌ **18 failing** test files  
- ⏭️ **1 skipped** test file
- 📊 **1018 passing** individual tests (1073 total)
- ❌ **16 failing** individual tests
- ⏭️ **39 skipped** individual tests

## ✅ Fully Fixed This Session

### 1. `tests/unit/embeddings.service.spec.ts` 
**Status:** ✅ All 6 tests passing

**Problem:** Tests were setting `process.env.EMBEDDING_PROVIDER` and `process.env.GOOGLE_API_KEY` AFTER calling the `build()` function that creates the service. However, the `ConfigService.embeddingsEnabled` getter reads `process.env.EMBEDDING_PROVIDER` directly at runtime, not from the validated env passed to the constructor.

**Solution:** Set environment variables BEFORE calling `build()` function.

**Changes:**
- Lines 46-48: Added `process.env.EMBEDDING_PROVIDER = 'google'` without API key (for error path test)
- Lines 50-52: Added both `process.env.GOOGLE_API_KEY = 'test-key'` and `process.env.EMBEDDING_PROVIDER = 'google'`
- Lines 65-67: Same fix for `embedDocuments` test
- Lines 77-79: Same fix for error propagation test

**Key Insight:** Config service reads `process.env` at runtime, not constructor-time validated env.

### 2. `tests/projects.service.spec.ts`
**Status:** ✅ All 12 tests passing

**Problem 1:** Mock FK error used old constraint name `"projects_org_id_fkey"` instead of new name `"projects_organization_id_fkey"` after org_id → organization_id migration.

**Solution 1:** Updated FK constraint name in mock error (line 137).

**Problem 2:** Test "create success without userId" had inconsistent mock data vs expectations.
- Mock returned: `{ id: uuid(4), name: 'Proj3', organization_id: uuid(1) }`  
- Test expected: `{ id: uuid(2), name: 'Proj', orgId: uuid(1) }`

**Solution 2:** Fixed mock to return `uuid(2)` and `'Proj'` to match expectations (line 93).

**Key Insight:** Test infrastructure (FakeClient mock) had mismatched data between setup and assertions.

## 📋 Remaining Test Failures by Category

### 🗄️ Database Schema Dependent (11 files)
**Root Cause:** Tests need consolidated migration applied to test database. All graph validation, RLS, and relationship tests are skipped until schema matches expectations.

**Files:**
1. `src/modules/graph/__tests__/graph-validation.spec.ts` (10 tests skipped)
2. `src/modules/graph/__tests__/graph-validation.schema-negative.spec.ts` (2 tests skipped)
3. `src/modules/graph/__tests__/graph-rls.strict-init.spec.ts` (1 test failed - `db.isOnline()` false)
4. `src/modules/graph/__tests__/graph-rls.security.spec.ts` (3 tests skipped)
5. `src/modules/graph/__tests__/graph-rls.policies.spec.ts` (1 test skipped)
6. `src/modules/graph/__tests__/graph-branching.spec.ts` (5 tests skipped)
7. `src/modules/graph/__tests__/graph-relationship.multiplicity.spec.ts` (4 tests skipped)
8. `src/modules/graph/__tests__/graph-relationship.multiplicity.negative.spec.ts` (3 tests skipped)
9. `src/modules/graph/__tests__/graph-embedding.enqueue.spec.ts` (3 tests skipped)
10. `src/modules/graph/__tests__/graph-fts.search.spec.ts` (3 tests skipped)
11. `src/modules/graph/__tests__/embedding-worker.spec.ts` (1 test skipped)
12. `src/modules/graph/__tests__/embedding-worker.backoff.spec.ts` (1 test skipped)
13. `tests/unit/schema.indexes.spec.ts` (1 test failed - database connection)

**Next Steps:**
1. Apply consolidated migration (`migrations/0001_init.sql`) to test database
2. Verify all `organization_id` columns exist with proper constraints
3. Re-run graph test suite

### 🔌 ClickUp Integration (1 file - API dependent)

**File:** `tests/clickup-real.integration.spec.ts` (8/9 tests failing)

**Root Cause:** Tests require live ClickUp API token (`CLICKUP_API_TOKEN` env var) and real API access.

**Error:** `ClickUpApiClient.sdkCall` failures - likely missing/invalid API token.

**Next Steps:**
- Set valid `CLICKUP_API_TOKEN` environment variable
- Or skip these tests in CI (integration tests only)

### 🤖 LLM/Chat/Embeddings (3 files)

#### `tests/chat-generation.service.spec.ts` (2/4 tests failing)

**Failing Tests:**
1. "invokes real model path and streams tokens with logging enabled"
2. "logs warning and rethrows on model failure"

**Root Cause:** Vertex AI authentication/configuration issues
```
Gaxios._request → UserRefreshClient.requestAsync → GAuthClient._fetch
```

**Next Steps:** Configure GCP credentials or mock LLM provider for tests.

#### `src/modules/chat/__tests__/chat-generation.spec.ts` (2/18 tests failing)

**Failing Tests:**
1. "should build specialized prompt for schema changes query"
2. "should build specialized prompt for type info query"

**Root Cause:** Prompt building logic errors (need to inspect specific assertion failures).

#### `src/modules/graph/__tests__/embedding-provider.vertex.spec.ts` (1/4 tests failing)

**Failing Test:** "throws embeddings_disabled when no key"

**Root Cause:** Test expects different error message or behavior.

### 🎬 End-to-End Scenario (1 file)

**File:** `tests/scenarios/user-first-run.spec.ts` (1/1 test failing)

**Test:** "provisions org & project, ingests a document, creates a chat, streams answer with optional citations"

**Root Cause:** Database connection error in `createE2EContext`.

**Next Steps:** Requires full test database with applied migrations and proper connection config.

## 📊 Progress Metrics

### Before This Session
- **20 failing test files**
- Major issues: org_id vs organization_id inconsistencies

### After This Session  
- **18 failing test files** (✅ 2 files fully fixed)
- **108 passing test files**
- **1018 passing tests** (95% pass rate for individual tests)

### Categorization
- **Database-dependent:** 11 files (blocked by migration)
- **API-dependent:** 1 file (needs CLICKUP_API_TOKEN)
- **LLM-dependent:** 3 files (needs GCP/Vertex AI config)
- **E2E:** 1 file (needs full stack)

## 🔑 Key Learnings

### 1. Config Service Runtime Behavior
The `ConfigService.embeddingsEnabled` getter reads `process.env.EMBEDDING_PROVIDER` directly at runtime:

```typescript
get embeddingsEnabled(): boolean {
    return !!process.env.EMBEDDING_PROVIDER;
}
```

This means tests MUST set `process.env` BEFORE creating service instances, not in test setup functions.

### 2. Mock Data Consistency
FakeClient mocks must return data that matches test expectations exactly. UUID and name mismatches indicate setup/assertion disconnect.

### 3. FK Constraint Name Changes
After migration, FK constraint names changed:
- Old: `projects_org_id_fkey`
- New: `projects_organization_id_fkey`

All mock database errors must use new names.

## 🎯 Recommended Next Actions

### Priority 1: Database Migration (11 files)
Apply `migrations/0001_init.sql` to test database to unblock all graph validation and RLS tests.

### Priority 2: LLM Test Fixes (3 files)
Either configure real GCP credentials or mock the LLM provider for deterministic testing.

### Priority 3: ClickUp Integration (1 file)
Add `CLICKUP_API_TOKEN` to test environment or mark as manual-only integration tests.

### Priority 4: E2E Scenario (1 file)
Fix database connection in `createE2EContext` helper (likely same as migration issue).

## 📂 Files Modified This Session

1. `tests/unit/embeddings.service.spec.ts` - Fixed env var timing
2. `tests/projects.service.spec.ts` - Fixed FK name and UUID mock data

## 🎉 Success Stories

- **Embeddings tests:** Went from 2/6 passing to 6/6 passing by fixing env var setup timing
- **Projects tests:** Went from 10/12 passing to 12/12 passing by fixing mock data consistency
- **Overall improvement:** 95% of individual tests now passing (1018/1073)
- **Clear path forward:** Remaining failures are well-categorized with actionable next steps
