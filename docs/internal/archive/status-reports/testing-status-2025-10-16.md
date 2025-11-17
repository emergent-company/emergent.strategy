# Testing Status — 2025-10-16

**Status:** ✅ All server tests (including scenario and integration suites) are passing.

**Command:**

```bash
RUN_SCENARIOS=1 npm --prefix apps/server run test
```

**Context:**
- Resolved ingestion service transactional fallback so unit tests that rely on mocked `DatabaseService` clients succeed.
- Stabilized `RateLimiterService` spec by running under fake timers to eliminate refill drift.
- Full suite now completes with 118 files, 873 tests passing (3 skipped by design).

**Next Watchpoints:**
- Keep mocks aligned with production database behavior when adding transactional logic.
- Ensure time-dependent specs opt into fake timers or deterministic clock control.
- Re-run this command after major ingestion, rate limiting, or integration changes.
