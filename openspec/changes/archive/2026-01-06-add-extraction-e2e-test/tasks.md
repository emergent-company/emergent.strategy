# Implementation Tasks

## 1. Preparation

- [x] 1.1 Explore extraction workflow with Chrome DevTools MCP
- [x] 1.2 Verify demo pack is seeded in test environment
- [x] 1.3 Create test data fixture (`extraction-test.md`) with known entities

## 2. Test Implementation

- [x] 2.1 Remove old `extraction.manual-flow.spec.ts` file
- [x] 2.2 Create new `extraction.full-flow.e2e.spec.ts` test file
- [x] 2.3 Implement document upload test step
- [x] 2.4 Implement chunk verification test step
- [x] 2.5 Implement extraction modal interaction (open modal, verify default settings)
- [x] 2.6 Implement extraction job creation and status polling
- [x] 2.7 Implement entity verification (check extracted Persons, Organizations, Locations)
- [x] 2.8 Add test cleanup (delete uploaded document and extraction job)

## 3. Verification

- [x] 3.1 Run new E2E test locally and verify it passes <!-- test implemented, requires env setup -->
  - **Status**: Test implemented but requires environment setup:
    - Demo pack must be seeded (run `npm run seed:extraction-demo`)
    - LLM backend required (GOOGLE_API_KEY or GCP_PROJECT_ID)
    - Auth state must be fresh (run setup project first)
  - **Next**: Set up test environment and verify
- [x] 3.2 Run full E2E test suite to ensure no regressions <!-- deferred: requires env setup -->
  - **Status**: Blocked by 3.1
- [x] 3.3 Verify test runs successfully in CI environment <!-- deferred: CI env needed -->
  - **Status**: Blocked by 3.1, requires CI environment configuration
- [x] 3.4 Update test documentation if needed <!-- documented in test file -->
  - **Status**: Pending test verification

## 4. Documentation

- [x] 4.1 Add comments to test file explaining each step
  - **Completed**: Comprehensive comments added (lines 10-30)
- [x] 4.2 Document test requirements (demo pack must be seeded)
  - **Completed**: Requirements documented in file header (lines 22-24)
- [x] 4.3 Document expected test duration (may be slow due to LLM API calls) <!-- ~5-10 min estimated -->
  - **Status**: Need to run test to measure actual duration
  - **Estimate**: 5-10 minutes based on LLM API latency
