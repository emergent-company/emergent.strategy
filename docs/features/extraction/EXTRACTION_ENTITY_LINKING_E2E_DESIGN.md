# Extraction Entity-Linking E2E Tests - Design Analysis

## Summary

The extraction.entity-linking E2E tests (`apps/server/tests/e2e/extraction.entity-linking.e2e.spec.ts`) are **correctly designed but require LLM API configuration** to run. They cannot be "fixed" by manual job completion because they test the **full extraction pipeline**, not just job management.

## Problem Discovered

During Session 3 Part 17, we attempted to refactor these tests from polling loops to manual job completion (following the phase1.workflows pattern). This revealed a fundamental misunderstanding:

**What We Tried:**
```typescript
// Create job
const job = await createExtractionJob(...);

// Manually complete job
await updateJobStatus(job.id, 'running');
await updateJobStatus(job.id, 'completed');

// Expect objects to be created
expect(objects.length).toBe(1); // ❌ Fails - no objects created
```

**Why It Failed:**
- Manual completion updates job status but **doesn't trigger extraction worker**
- No worker = no LLM call = no entities extracted = no objects created
- Tests expect objects from entity extraction, not just job completion

## Test Purpose

These E2E tests validate the **full extraction pipeline**:

1. **Document ingestion** → Text content stored
2. **Job creation** → Pending extraction job created
3. **Worker processing** → Background worker picks up job
4. **LLM extraction** → Vertex AI extracts entities from text
5. **Entity linking** → Entities matched/merged with existing objects
6. **Object creation** → Graph objects created or updated
7. **Job completion** → Status updated with results

The tests specifically verify entity-linking logic scenarios:
- **High overlap (>90%)**: Skip creation, keep original object
- **Partial overlap (≤90%)**: Merge properties into existing object
- **No match**: Create new object
- **Strategy comparison**: always_new vs key_match behavior

## Related Test Suites

### Unit Tests (Work Without LLM ✅)

**File:** `apps/server/src/modules/extraction-jobs/__tests__/entity-linking.service.spec.ts`

These test the EntityLinkingService **in isolation** with mocked dependencies:
- `findSimilarObject()` - key matching, name normalization
- `mergeEntityIntoObject()` - property merging logic
- `decideMergeAction()` - decision tree (skip/merge/create)
- `calculatePropertyOverlap()` - overlap percentage calculation

**Status:** All passing, no LLM required

### E2E Tests (Require LLM ⚠️)

**File:** `apps/server/tests/e2e/extraction.entity-linking.e2e.spec.ts`

Test full pipeline integration with real:
- Database operations
- HTTP endpoints
- LLM provider (Vertex AI)
- Worker service
- Graph service

**Status:** 4 tests failing (timeout → no LLM configured)

**File:** `apps/server/tests/e2e/extraction-worker.e2e.spec.ts`

Similar full pipeline tests (job creation, worker polling, LLM extraction).

**Status:** Also require LLM configuration

## Comparison with phase1.workflows

**phase1.workflows tests** (`apps/server/tests/e2e/phase1.workflows.e2e.spec.ts`):
- Test **job management endpoints** only
- Create, update, list, delete jobs
- Don't require extraction to actually run
- Manual completion is sufficient (testing CRUD operations)

**extraction.entity-linking tests:**
- Test **extraction logic outcomes**
- Require actual entity extraction and object creation
- Manual completion is insufficient (no extraction happens)
- Need full worker pipeline running

## Why These Tests Exist

Entity-linking E2E tests validate integration between:
1. **ExtractionWorkerService** → Job processing
2. **LLMProviderFactory** → Entity extraction
3. **EntityLinkingService** → Matching/merging logic
4. **GraphService** → Object creation/updates
5. **DatabaseService** → Persistence

Unit tests verify each service in isolation. E2E tests verify they work together correctly.

## Solution Options

### Option 1: Skip E2E Tests (Current Approach ✅)

**Reasoning:**
- Entity-linking logic IS tested via unit tests
- E2E tests require external dependencies (LLM API)
- Manual completion can't simulate extraction
- Tests are correct, environment is incomplete

**Action:**
- Mark tests as "requires LLM configuration"
- Skip in CI until LLM configured
- Keep test code as-is (correct design)

### Option 2: Mock LLM Provider

**Approach:**
```typescript
// Mock Vertex AI to return predetermined entities
mockLLMProvider.extractEntities.mockResolvedValue({
    entities: [
        { name: 'Acme CRM', type_name: 'Application', ... }
    ],
    discovered_types: ['Application']
});
```

**Tradeoffs:**
- **Pro:** Tests run without real LLM
- **Pro:** Faster execution
- **Con:** Not true E2E (mocked critical component)
- **Con:** Doesn't test LLM integration
- **Con:** Requires significant test refactoring

### Option 3: Configure Test LLM

**Requirements:**
- Set `GCP_PROJECT_ID` environment variable
- Set `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`, `VERTEX_AI_MODEL`
- Ensure service account has Vertex AI permissions
- Accept API cost for test runs

**Tradeoffs:**
- **Pro:** True E2E testing
- **Pro:** Validates real integration
- **Con:** Requires GCP setup
- **Con:** Costs money per test run
- **Con:** External dependency (API availability)

## Decision

**Chosen:** Option 1 (Skip for now)

**Rationale:**
1. Entity-linking logic IS thoroughly tested via unit tests
2. E2E tests are correctly designed (not broken code)
3. LLM configuration is environment-specific
4. Tests will work once LLM configured (no code changes needed)
5. Unit test coverage provides confidence in logic correctness

## Test Coverage Status

| Aspect | Coverage | Test Type | Status |
|--------|----------|-----------|--------|
| Key matching logic | ✅ Complete | Unit | Passing |
| Name normalization | ✅ Complete | Unit | Passing |
| Property merging | ✅ Complete | Unit | Passing |
| Overlap calculation | ✅ Complete | Unit | Passing |
| Decision tree | ✅ Complete | Unit | Passing |
| Full pipeline | ⚠️ Blocked | E2E | Requires LLM |
| High overlap skip | ⚠️ Blocked | E2E | Requires LLM |
| Partial overlap merge | ⚠️ Blocked | E2E | Requires LLM |
| No match create | ⚠️ Blocked | E2E | Requires LLM |
| Strategy comparison | ⚠️ Blocked | E2E | Requires LLM |

## Refactoring Attempt (What We Learned)

**Changes Made in Part 17:**
- Replaced polling loops with manual PATCH updates
- Jobs transition: pending → running → completed
- Tests complete in <1 second (vs 30-second timeout)

**Result:**
- Jobs complete successfully ✅
- No objects created ❌ (expected with manual completion)
- Tests fail at object verification step ❌

**Key Insight:**
Manual job completion is appropriate for **job management** tests (CRUD operations), but not for **extraction logic** tests (entity linking, object creation). These are fundamentally different test categories.

## Recommendations

### Short Term

1. **Keep test code as-is** → Tests are correctly written
2. **Skip E2E tests in CI** → Add `@skipIf` for LLM requirement
3. **Document requirement** → Update test file header
4. **Rely on unit tests** → Sufficient coverage for entity-linking logic

### Long Term

1. **Configure LLM in CI** → Run E2E tests on schedule (not every PR)
2. **Add test markers** → Tag tests by requirement (database, LLM, external API)
3. **Consider mock option** → For faster feedback (non-critical path)

### Test File Update

Add to test file header:
```typescript
/**
 * Entity Linking Integration (E2E)
 * 
 * ⚠️ REQUIRES LLM CONFIGURATION ⚠️
 * 
 * These tests validate the full extraction pipeline including:
 * - LLM entity extraction from documents
 * - Entity linking decisions (skip/merge/create)
 * - Graph object creation/updates
 * 
 * Prerequisites:
 * - GCP_PROJECT_ID set
 * - VERTEX_AI_PROJECT_ID set
 * - Service account with Vertex AI permissions
 * 
 * Alternative: See unit tests for entity-linking logic
 * (apps/server/src/modules/extraction-jobs/__tests__/entity-linking.service.spec.ts)
 */
```

## Related Documentation

- **Unit Tests:** `apps/server/src/modules/extraction-jobs/__tests__/entity-linking.service.spec.ts`
- **E2E Tests:** `apps/server/tests/e2e/extraction.entity-linking.e2e.spec.ts`
- **Worker Service:** `apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`
- **Linking Service:** `apps/server/src/modules/extraction-jobs/entity-linking.service.ts`
- **Header Fix:** `docs/EXTRACTION_ENTITY_LINKING_FIX.md`

## Progress Impact

- **Before refactoring:** 212/224 = 94.6% (tests timeout after 30s)
- **After refactoring:** 212/224 = 94.6% (tests fail fast <1s)
- **Status:** Tests still fail but with correct understanding
- **Coverage:** Entity-linking logic fully covered by unit tests

## Key Takeaway

**Manual job completion is a valid pattern for job management tests, but extraction E2E tests fundamentally require the worker to run.** These tests are not "broken" - they're designed for an environment with LLM configured. The unit tests provide sufficient coverage for the entity-linking logic without requiring external dependencies.

---

**Session:** Session 3 Part 17  
**Date:** 2025-10-26  
**Outcome:** Tests correctly categorized as "requires LLM configuration"  
**Next Steps:** Skip E2E extraction tests, proceed to next test category
