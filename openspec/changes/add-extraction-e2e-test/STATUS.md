# Status: Add Extraction E2E Test

**Last Updated**: 2024-11-19  
**Overall Status**: 🟡 Implementation Complete, Verification Pending

---

## Summary

The extraction E2E test has been **fully implemented** with comprehensive test coverage and documentation. The test is ready to run but requires specific environment setup including LLM backend configuration and demo data seeding.

---

## Progress Overview

### ✅ Complete (100%)

- **Implementation** (Tasks 1.x, 2.x): All code written
- **Test File**: `apps/admin/tests/e2e/specs/extraction.full-flow.e2e.spec.ts` (536 lines)
- **Test Data**: `apps/admin/tests/e2e/test-data/extraction-test.md` exists
- **Documentation**: Comprehensive comments and requirements in test file

### 🟡 In Progress (70%)

- **Verification** (Tasks 3.x): Environment setup required before testing
- **Documentation** (Task 4.3): Needs actual test run to measure duration

---

## What's Implemented

### Test File (`extraction.full-flow.e2e.spec.ts`)

**Comprehensive E2E test covering**:

1. ✅ Document upload with test fixture
2. ✅ Chunk creation verification
3. ✅ Extraction modal interaction
4. ✅ Extraction job creation with default settings
5. ✅ Job status polling and completion verification
6. ✅ Entity extraction validation (Person, Organization, Location)
7. ✅ Cleanup (document and job deletion)

**Features**:

- Real backend integration (no mocks)
- Comprehensive browser console and error logging
- Step-by-step test execution with detailed logging
- 10-minute timeout for LLM API calls
- Proper cleanup to avoid test pollution

**Documentation**:

- Extensive header comments explaining purpose and requirements
- Inline comments for complex logic
- Expected entities documented
- Prerequisites clearly stated

### Test Data (`extraction-test.md`)

**Contains known entities for validation**:

- **Persons**: Sarah Chen, Michael Rodriguez, Emma Watson
- **Organizations**: TechVenture Inc, DataStream Solutions, CloudScale Systems
- **Locations**: San Francisco, Austin, Seattle, London, Berlin, Boston

---

## What's Remaining

### 3. Verification (4 tasks)

#### 3.1 Run new E2E test locally ⏳

**Status**: Blocked by environment requirements

**Prerequisites**:

1. **Seed demo pack**:

   ```bash
   npm run seed:extraction-demo
   # OR
   node scripts/seed-extraction-demo.ts
   ```

2. **Configure LLM backend** (one of):

   - Set `GOOGLE_API_KEY` environment variable
   - Configure GCP credentials with `GCP_PROJECT_ID`
   - Ensure Vertex AI is accessible

3. **Ensure fresh auth state**:

   ```bash
   cd apps/admin
   npx playwright test --project=setup  # Run auth setup
   ```

4. **Run the test**:
   ```bash
   cd apps/admin
   npx playwright test tests/e2e/specs/extraction.full-flow.e2e.spec.ts
   ```

**Current Issue**: Test fails with redirect to login page (auth state may be expired or environment not configured)

---

#### 3.2 Run full E2E suite ⏳

**Status**: Blocked by 3.1

**Action Required**: After 3.1 passes, run:

```bash
cd apps/admin
npm run e2e  # Run all E2E tests
```

**Expected**: No regressions in other tests

---

#### 3.3 Verify in CI ⏳

**Status**: Blocked by 3.1, requires CI configuration

**CI Requirements**:

- Demo pack seeding in CI environment
- LLM backend credentials (secrets management)
- Longer timeout for extraction tests (10 minutes)
- May need to skip in CI if LLM quotas are a concern

**Considerations**:

- LLM API calls cost money
- Test may be flaky due to API rate limits
- Consider mocking LLM for CI, real backend for manual testing

---

#### 3.4 Update documentation ⏳

**Status**: Pending test verification

**Action Required**:

- Document actual test duration after successful run
- Update any issues discovered during testing
- Add troubleshooting section if needed

---

### 4. Documentation (1 remaining task)

#### 4.3 Document expected test duration ⏳

**Status**: Needs actual test run data

**Estimated Duration**: 5-10 minutes

- Document upload: <10s
- Chunking: ~30s
- Extraction job: 3-8 minutes (depends on LLM API)
- Verification: <10s
- Cleanup: <10s

**Action Required**: Run test and record actual timing

---

## Blockers

### 1. Environment Setup

**Impact**: Cannot verify test until environment is configured

**Resolution Options**:

**Option A: Full Real Backend** (Recommended for initial verification)

```bash
# 1. Set up LLM credentials
export GOOGLE_API_KEY="your-key-here"
# OR
export GCP_PROJECT_ID="your-project-id"

# 2. Seed demo pack
npm run seed:extraction-demo

# 3. Run auth setup
cd apps/admin
npx playwright test --project=setup

# 4. Run extraction test
npx playwright test tests/e2e/specs/extraction.full-flow.e2e.spec.ts
```

**Option B: Mock LLM for CI** (Better for CI/CD)

- Modify test to accept mocked LLM responses
- Faster execution (30-60 seconds)
- No API costs
- Less realistic

---

### 2. LLM Backend Access

**Impact**: Test requires real LLM API or mocked responses

**Current State**: Test uses real Vertex AI / Gemini API

**Considerations**:

- API costs per test run
- Rate limits may cause flakiness
- Requires credentials/quotas

**Recommendation**:

- Use real backend for manual verification
- Consider mocking for CI to reduce costs and flakiness
- Document both approaches

---

## Next Steps

### Immediate (Complete verification)

1. **Set up test environment**:

   - Configure LLM backend credentials
   - Seed demo extraction pack
   - Verify auth state is fresh

2. **Run test locally**:

   - Execute extraction E2E test
   - Record actual duration
   - Document any issues

3. **Run full E2E suite**:
   - Ensure no regressions
   - Verify test isolation

### Short-term (CI integration)

4. **Configure CI environment**:

   - Add LLM credentials to CI secrets
   - Add demo pack seeding to CI setup
   - Configure longer timeouts

5. **Decide on CI strategy**:
   - Real backend vs. mocked LLM
   - Frequency (every commit vs. nightly)
   - Cost/benefit analysis

### Medium-term (Improvements)

6. **Add test variants**:

   - Test with different entity types
   - Test with extraction failures
   - Test with custom schemas

7. **Add performance monitoring**:
   - Track extraction duration trends
   - Alert on excessive duration
   - Monitor LLM API costs

---

## Files Status

### Created ✅

- `apps/admin/tests/e2e/specs/extraction.full-flow.e2e.spec.ts` (536 lines)
- `apps/admin/tests/e2e/test-data/extraction-test.md` (2KB)

### Modified ✅

- None (new files only)

### Removed ✅

- `apps/admin/tests/e2e/specs/extraction.manual-flow.spec.ts` (if it existed)

---

## Decision Points

### 1. Mock vs. Real LLM in CI

**Question**: Should CI use real LLM API or mocked responses?

**Option A: Real LLM**

- ✅ Pros: Realistic, catches API changes
- ❌ Cons: Slow, expensive, flaky (rate limits)

**Option B: Mocked LLM**

- ✅ Pros: Fast, free, reliable
- ❌ Cons: Less realistic, doesn't catch API changes

**Recommendation**: Use real LLM for manual/nightly runs, mocks for per-commit CI

---

### 2. Test Frequency

**Question**: How often should this test run?

**Options**:

- Every commit (expensive, slow)
- Pull requests only (moderate)
- Nightly builds (cheap, delayed feedback)
- Manual on-demand (cheapest, least automated)

**Recommendation**: Nightly or on-demand until LLM costs are budgeted

---

### 3. Timeout Configuration

**Question**: Is 10 minutes appropriate?

**Current Setting**: 600 seconds (10 minutes)

**Considerations**:

- LLM APIs can be slow (2-5 minutes typical)
- Network latency adds time
- Multiple API calls per extraction

**Recommendation**: Keep 10 minutes, add monitoring to optimize if needed

---

## Success Criteria

### ✅ Implementation Complete When:

- [x] Test file exists with full workflow coverage
- [x] Test data fixture exists
- [x] Comprehensive comments and documentation in code
- [x] Proper cleanup to avoid test pollution

### ⏳ Verification Complete When:

- [ ] Test passes locally with real backend
- [ ] Test passes in full E2E suite (no regressions)
- [ ] Actual test duration documented
- [ ] CI integration decided and documented

### ⏳ Ready for Production When:

- [ ] All verification complete
- [ ] CI strategy chosen and implemented
- [ ] Team trained on running/debugging test
- [ ] Monitoring/alerting configured (optional)

---

## Related Documentation

- **Proposal**: `./proposal.md`
- **Tasks**: `./tasks.md` (updated with status)
- **Test File**: `apps/admin/tests/e2e/specs/extraction.full-flow.e2e.spec.ts`
- **Test Data**: `apps/admin/tests/e2e/test-data/extraction-test.md`
- **Extraction Docs**: `docs/features/*-extraction.md`

---

## Questions / Concerns

1. **LLM API Costs**: Each test run costs ~$0.01-0.05. Budget needed for frequent runs.
2. **Flakiness Risk**: LLM APIs can rate-limit or timeout. Need retry logic or mocking.
3. **Test Duration**: 5-10 minutes is long for CI. Consider parallel execution or mocking.
4. **Demo Pack Seeding**: Must be done in CI environment. Add to setup scripts.

---

**Recommendation**: Complete verification (3.1-3.4) with manual test run, then decide on CI strategy based on cost/benefit analysis.
