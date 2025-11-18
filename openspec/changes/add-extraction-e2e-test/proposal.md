# Change: Add E2E Test for Extraction Workflow

## Why

The extraction feature lacks comprehensive E2E test coverage. The existing `extraction.manual-flow.spec.ts` test is disabled and uses complex mocking that doesn't reflect real-world extraction behavior. We need a test that validates the complete extraction workflow from document upload through successful entity extraction using real backend services.

**Note**: This is a test-only change that validates existing functionality. No specification changes are required as we're testing behavior that already exists and is documented.

## What Changes

- Remove disabled and mock-heavy `extraction.manual-flow.spec.ts` test
- Add new `extraction.full-flow.e2e.spec.ts` test that validates:
  - Document upload with file fixture
  - Chunk creation verification
  - Extraction job creation with default settings
  - Extraction job completion
  - Entity extraction from demo pack classes (Person, Organization, Location)
- Add test data fixture file (`extraction-test.md`) with known entities
- Verify extraction with real LLM backend (not mocked)

## Impact

- Affected specs: None (test-only change, validates existing functionality)
- Affected code:
  - Remove: `apps/admin/tests/e2e/specs/extraction.manual-flow.spec.ts`
  - Add: `apps/admin/tests/e2e/specs/extraction.full-flow.e2e.spec.ts`  
  - Add: `apps/admin/tests/e2e/test-data/extraction-test.md`
- Test reliability: Improves confidence in extraction feature
- CI/CD: May increase test execution time due to real LLM API calls
- No breaking changes
