# Remaining Test Failures Reference

**Last Updated:** October 10, 2025  
**Total Failures:** 6 out of 842 tests (99.3% pass rate)

## Quick Summary

All remaining failures are concentrated in two areas:

1. **Orgs service behavioural shifts** – the service now enforces per-user semantics and no longer auto-creates user profiles, but the legacy unit specs still expect the old behaviour.
2. **Embedding worker metrics probe** – requires live background processing with a minimal database; the deterministic batch never observes a completed job under the current test harness.

None of the failures indicate regressions in production behaviour; they are gaps between updated service logic and the older tests that were never realigned.

## Remote Run Context

- **Environment:** GitHub Actions remote run for the server Vitest suite.
- **Command executed:** `npm --prefix apps/server run test` after installing root and service dependencies with `npm ci`.
- **Result snapshot (October 10, 2025):** identical six failing specs listed below; no additional regressions or flaky jobs observed.
- **Log retrieval:** Navigate to GitHub Actions → select the latest server test run → download the `npm test` step artifacts to review the same stack traces documented here.

The remote runs confirm that remediation work is limited to rebuilding the five org service mocks and retooling the embedding metrics spec; the backend boots cleanly and all migrations succeed prior to the failing assertions.

## Auth Setup Prerequisites

Several org service specs rely on the seeded authentication fixtures that ship with this repository. To reproduce the failures or verify fixes locally:

1. **Start the auth stack** – run `npm run dev-manager:docker:up` to launch PostgreSQL together with the bundled Zitadel instance. Credentials are provisioned from `docker/zitadel.env` and `docker/login-client.pat` during container start.
2. **Populate local env vars** – copy `.env.example` to `.env`, then ensure the following values are present:
   - `E2E_OIDC_EMAIL` / `E2E_OIDC_PASSWORD` (default `admin@nexus.local` / `Passw0rd!`).
   - `VITE_ZITADEL_ISSUER`, `ZITADEL_API_URL`, and `ZITADEL_LOGIN_URL` pointing at the container ports (`https://localhost:8100` / `https://localhost:8101`).
3. **Cache the OIDC storage state** – execute `npm --prefix apps/admin run e2e:setup` so local runs reuse the same login session as CI. This provisions the spec-admin session under the client ID referenced by the server specs.
4. **Verify the service account token** – ensure `docker/login-client.pat` exists; the org service tests read this PAT when exercising membership inserts. Regenerate via `scripts/bootstrap-login-client.mjs` if it is missing.

With the auth fixtures in place, the local environment mirrors CI, making it easier to validate org membership fixes before re-running the full suite.

## The 6 Failing Tests

### 1–4. `tests/orgs.service.spec.ts`
```
Tests: 
  • list() online maps rows
  • create() online limit check (count >=100) rejects
  • create() online success with userId inserts profile + membership
  • create() online table missing falls back to memory path
File: apps/server/tests/orgs.service.spec.ts
Expected: Legacy "global" org list behaviour and unconditional profile/membership inserts
Actual: Empty result sets or TypeErrors when new per-user joins run against the old FakeDb
Blocker: Tests mock an outdated DatabaseService shape (no subject_id joins, no membership rows)
```

**Why they fail:**
- `OrgsService.list` now mandates a `userId` and joins through `kb.organization_memberships`, returning an empty list when no user context exists. The test still calls `list()` with no arguments, so the service intentionally returns `[]`.
- `create()` now counts organizations by subject membership and only inserts into `kb.organization_memberships`. The fake database used in the spec neither records the new join query nor simulates the membership table, yielding `undefined` rows and `TypeError` stacks.
- The service no longer inserts `core.user_profiles` rows; it expects them to exist already. The tests still look for those inserts and fail hard when they are absent.

**How to fix (recommended path):**
1. Update the fake database helpers to understand the new SQL (`INNER JOIN kb.organization_memberships … subject_id = $1`).
2. Supply a `userId` when calling `list()` in the tests and mimic membership rows in the fake responses.
3. Adjust expectations so `create()` with `userId` verifies that the membership insert fires, but **stop** expecting a `core.user_profiles` insert.
4. Consider splitting the spec: one for offline in-memory fallback, another for the online path with richer fakes/mocks.

**Alternative (short-term):** mark the online scenarios with `it.skip` until the mocks are rebuilt, but this should be a last resort.

---

### 5. `tests/orgs.ensure-profile.spec.ts`
```
Test: OrgsService.create ensures user profile before membership insert > inserts user profile row before organization_memberships
File: apps/server/tests/orgs.ensure-profile.spec.ts
Expected: OrgsService.create() inserts into core.user_profiles before kb.organization_memberships
Actual: The query is never issued (service now assumes profile exists)
Blocker: Behaviour intentionally removed from OrgsService during auth/profile refactor
```

**Why it fails:**
- The service relies on the authentication flow to provision user profiles. Auto-backfilling inside `create()` was dropped to avoid duplicate writes and race conditions.
- The spec still asserts that profile inserts precede membership inserts, so the query index lookup returns `-1` and the expectation fails.

**Next steps:**
- Rework the test to exercise the new error path (expect a `BadRequestException` when the FK constraint fires), or delete/replace the spec with coverage inside the auth/profile provisioning flow.

---

### 6. `src/modules/graph/__tests__/embedding-worker.metrics.spec.ts`
```
Test: EmbeddingWorkerService Metrics > increments processed counters and records at least one failure
File: apps/server/src/modules/graph/__tests__/embedding-worker.metrics.spec.ts
Expected: After processBatch runs, at least one job hits a terminal status and metrics counters reflect it
Actual: derivedProcessed === 0 (no completed/failed jobs observed)
Blocker: Batch processing never transitions rows because the dummy embedding provider / minimal DB setup does not advance job state without a running worker loop
```

**Why it fails:**
- The test spins up the worker in isolation, but the manual `processBatch()` call depends on the same transactional semantics as the real worker (locking rows, updating statuses, writing embeddings). With the "dummy" provider plus the minimal schema, no result rows are updated, so the assertions remain at 0.
- Prior to the worker refactor we observed at least one success and one failure; the latest worker + queue changes require additional mocking (e.g., forcing `jobs.markCompleted` to mutate state).

**Suggested remediation:**
1. Replace the live DB interactions with a focused unit test that stubs `jobs.dequeue` / `jobs.markCompleted` / `jobs.markFailed` and verifies that the metrics counters increment.
2. Alternatively, seed `kb.graph_embedding_jobs` with rows already in `processing` state and mock the provider to ensure state transitions.
3. If full rework is not immediate, gate the test behind the presence of `RUN_EMBEDDING_METRICS_IT=1` and skip otherwise, similar to other real-provider specs.

## Categorization

| Category | Count | Tests |
|----------|-------|-------|
| **Outdated Orgs service expectations** | 5 | orgs.service (4 cases), orgs.ensure-profile |
| **Embedding worker instrumentation** | 1 | embedding-worker.metrics |

## Recommended Actions

### Short Term
- ✅ Document the misaligned specs (this file)
- ✅ Keep the suites failing in CI so we do not lose visibility
- 🔁 Create tickets to realign the orgs service mocks and metrics spec

### Medium Term
- ♻️ Refactor the Orgs service specs to incorporate `userId` context and updated SQL joins
- 🔄 Convert the embedding metrics test into a pure unit test around `EmbeddingWorkerService.stats()` with explicit mocks, or guard real DB interactions behind an opt-in flag
- 🧭 Add per-test tags (`{ tags: ['integration'] }`) once the vitest upgrade lands, so we can selectively run these heavier specs

### Long Term
- 🧪 Build a dedicated integration test harness for org provisioning that exercises the real database via `describeWithDb`
- 📊 Extend worker telemetry tests to capture success + failure counters via dependency injection rather than live jobs

## Current Status

Despite these targeted failures, the **overall suite remains healthy (833 passing, 3 skipped)**. The remaining gaps are well-understood mismatches between evolved service behaviour and legacy test doubles. Aligning the mocks or adjusting the assertions will return the suite to green without requiring additional infrastructure.
