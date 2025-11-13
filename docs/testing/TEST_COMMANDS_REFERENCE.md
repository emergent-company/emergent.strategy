# Test Commands Reference

Complete reference for running all test suites in the Spec Server project.

## Quick Reference

```bash
# Server Tests (Backend API)
cd apps/server
npm test                    # Unit tests only (fast, 805 tests, ~9s)
npm run test:e2e           # E2E + Integration tests (requires database)
npm run test:all           # All tests (unit + e2e)

# Admin Tests (Frontend UI)
cd apps/admin
npm test                   # Component unit tests (Vitest)
npm run e2e                # E2E tests (Playwright)

# From Root Directory
npm run test:e2e:server           # Server E2E tests
npm run test:coverage:server      # Server unit test coverage
npm run test:coverage:server:e2e  # Server E2E test coverage
npm run test:coverage:all         # All coverage reports
```

---

## Server Tests (apps/server)

### Prerequisites

**Unit Tests**: No setup required ✅

**E2E/Integration Tests**: Requires PostgreSQL database

```bash
# Start database (from root)
npm run workspace:deps:start

# Or start everything
npm run workspace:start-all
```

### Unit Tests (Fast, No Dependencies)

Run from `apps/server/` directory:

```bash
# Run all unit tests (default)
npm test
# OR
npm run test:unit

# Watch mode (re-run on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

**Details**:

- **Files**: 126 test files in `tests/unit/`
- **Tests**: 805 passing tests
- **Duration**: ~9 seconds
- **Dependencies**: None
- **Config**: `vitest.config.ts`

### E2E Tests (Requires Database)

Run from `apps/server/` directory:

```bash
# Run all E2E + Integration tests
npm run test:e2e

# Run specific E2E test file
npm run test:e2e:one -- tests/e2e/chat.basic-crud.e2e.spec.ts

# With coverage
npm run test:coverage:e2e
```

**Details**:

- **Files**: 72 E2E test files + 3 integration + 1 scenario
- **Location**: `tests/e2e/`, `tests/integration/`, `tests/e2e/scenarios/`
- **Duration**: Varies (some suites 2-3 minutes)
- **Dependencies**: PostgreSQL database (port 5432)
- **Config**: `vitest.e2e.config.ts`

### Scenario Tests (Complex User Journeys)

Run from `apps/server/` directory:

```bash
# Run scenario tests
npm run test:scenarios
```

**Details**:

- **Files**: `tests/e2e/scenarios/user-first-run.spec.ts`
- **Purpose**: Full user journey tests
- **Requires**: Database

### Integration Tests (Specific Services)

Run from `apps/server/` directory:

```bash
# ClickUp integration test (requires real API access)
npm run test:integration:clickup
```

**Details**:

- **Files**: `tests/integration/clickup*.spec.ts`
- **Purpose**: External API integration testing
- **Requires**: ClickUp API credentials + database

### All Server Tests

Run from `apps/server/` directory:

```bash
# Run unit tests then E2E tests
npm run test:all
```

### CI/CD Commands

Run from `apps/server/` directory:

```bash
# CI mode (with environment variable)
npm run test:ci
```

---

## Admin Tests (apps/admin)

### Component Unit Tests (Vitest)

Run from `apps/admin/` directory:

```bash
# Run component tests
npm test

# Watch mode
npm test -- --watch

# With coverage
npm run test:coverage
```

**Details**:

- **Framework**: Vitest
- **Purpose**: React component unit tests
- **Duration**: Fast
- **Dependencies**: None

### E2E Tests (Playwright)

Run from `apps/admin/` directory:

**Standard E2E (Mock Auth)**:

```bash
# Run all E2E tests
npm run e2e

# Run with HTML report
npm run e2e:with-report

# Interactive UI mode
npm run e2e:ui

# View last report
npm run e2e:report
```

**Specific Test Suites**:

```bash
# Smoke tests (critical user paths)
npm run e2e:smoke

# Onboarding flow
npm run e2e:onboarding

# Authenticated flows (example)
npm run e2e:auth
```

**Real Authentication Tests**:

```bash
# Setup authentication state (run once)
npm run e2e:setup

# Run with real login
npm run e2e:real

# Specific real login test
npm run e2e:login:real
```

**Details**:

- **Framework**: Playwright
- **Location**: `apps/admin/e2e/specs/`
- **Config**: `e2e/playwright.config.ts`
- **Requires**: API server running (or mocked)

---

## Root-Level Commands

Run from project root directory:

### Server Tests

```bash
# E2E tests
npm run test:e2e:server

# Scenario tests
npm run test:scenarios:server
```

### Coverage Reports

```bash
# Admin coverage
npm run test:coverage:admin

# Server unit test coverage
npm run test:coverage:server

# Server E2E coverage
npm run test:coverage:server:e2e

# Server all coverage (unit + e2e)
npm run test:coverage:server:all

# Everything (admin + server)
npm run test:coverage:all
```

### Benchmarks

```bash
# Graph relationship benchmarks
npm run bench:graph:relationships

# Graph object benchmarks
npm run bench:graph:objects

# Graph traversal benchmarks
npm run bench:graph:traverse
```

### Smoke Tests

```bash
# Quick smoke test suite
npm run test:smoke
```

---

## Advanced Usage

### Running Specific Test Files

**Server (Vitest)**:

```bash
cd apps/server

# Specific unit test
npm test -- tests/unit/auth/auth.service.spec.ts

# Specific E2E test
npm run test:e2e:one -- tests/e2e/chat.basic-crud.e2e.spec.ts

# Pattern matching
npm test -- tests/unit/graph/

# With grep filter
npm test -- --grep="should create user"
```

**Admin (Playwright)**:

```bash
cd apps/admin

# Specific test file
npm run e2e -- e2e/specs/smoke.spec.ts

# Specific browser
npm run e2e -- --project=chromium

# Headed mode (see browser)
npm run e2e -- --headed

# Debug mode
npm run e2e -- --debug
```

### Watch Mode

**Server**:

```bash
cd apps/server
npm run test:watch              # Unit tests
npm run test:watch -- tests/unit/auth/  # Specific directory
```

**Admin**:

```bash
cd apps/admin
npm test -- --watch             # Component tests
npm run e2e:ui                  # Interactive E2E
```

### Debugging

**Server Tests (Vitest)**:

```bash
cd apps/server

# Node debugger
node --inspect-brk node_modules/.bin/vitest run tests/unit/auth.service.spec.ts

# With VSCode: Add breakpoint, press F5 (if configured)
```

**Admin E2E (Playwright)**:

```bash
cd apps/admin

# Debug mode (step through)
npm run e2e -- --debug

# Headed mode (watch execution)
npm run e2e -- --headed

# Specific test with debug
npm run e2e -- e2e/specs/smoke.spec.ts --debug
```

---

## Test Organization

### Server Tests Structure

```
apps/server/tests/
├── unit/                   # Unit tests (805 tests)
│   ├── auth/
│   ├── chat/
│   ├── documents/
│   ├── graph/
│   ├── ingestion/
│   └── ...
│
├── e2e/                    # E2E tests (72 files)
│   ├── scenarios/          # User journey tests
│   ├── utils/              # E2E utilities
│   ├── chat.*.e2e.spec.ts
│   ├── documents.*.e2e.spec.ts
│   └── ...
│
├── integration/            # Integration tests (3 files)
│   └── clickup*.spec.ts
│
└── utils/                  # Shared utilities
```

### Admin Tests Structure

```
apps/admin/
├── src/                    # Component tests (co-located)
│   └── components/
│       └── Button/
│           ├── Button.tsx
│           └── Button.test.tsx
│
└── e2e/                    # E2E tests
    ├── specs/
    │   ├── smoke.spec.ts
    │   ├── onboarding.first-login.spec.ts
    │   └── ...
    └── playwright.config.ts
```

---

## Common Workflows

### Local Development (Backend)

```bash
# 1. Fast feedback loop (unit tests only)
cd apps/server
npm test

# 2. Before committing (include E2E)
npm run workspace:deps:start    # Start database (from root)
cd apps/server
npm run test:all                # Run everything
```

### Local Development (Frontend)

```bash
cd apps/admin

# Component testing
npm test -- --watch

# E2E testing
npm run e2e:smoke              # Quick smoke tests
npm run e2e                    # Full suite
```

### CI/CD Pipeline

**On Every Commit**:

```bash
cd apps/server
npm run test:ci                # Unit tests + coverage
npm run build                  # Verify build

cd apps/admin
npm test                       # Component tests
npm run build                  # Verify build
```

**On PR / Nightly**:

```bash
# Full test suite
npm run test:coverage:all      # All coverage (from root)
npm run test:e2e:server        # E2E tests (from root)

cd apps/admin
npm run e2e                    # Admin E2E
```

---

## Troubleshooting

### "Cannot find database" Error

**E2E/Integration tests require database**:

```bash
# From project root
npm run workspace:deps:start

# Verify database is running
docker ps | grep postgres
```

### "Port already in use" Error

**Stop existing services**:

```bash
# From project root
npm run workspace:stop
npm run workspace:deps:stop

# Then restart
npm run workspace:start-all
```

### E2E Tests Timing Out

**Increase timeout** (in test file):

```typescript
describe('slow test', () => {
  it('takes a while', { timeout: 60000 }, async () => {
    // test code
  });
});
```

### Playwright Browser Not Installed

```bash
cd apps/admin
npx playwright install
```

---

## Performance Benchmarks

### Expected Test Durations

| Test Type       | Files  | Tests  | Duration | Dependencies |
| --------------- | ------ | ------ | -------- | ------------ |
| Server Unit     | 126    | 805    | ~9s      | None         |
| Server E2E      | 72+    | Varies | 2-10min  | PostgreSQL   |
| Admin Component | Varies | Varies | <1min    | None         |
| Admin E2E       | ~12    | ~30    | 2-5min   | API server   |

### Tips for Faster Tests

1. **Unit tests first**: Run `npm test` for fast feedback
2. **Targeted E2E**: Run specific test files during development
3. **Watch mode**: Use `--watch` for incremental testing
4. **Parallel execution**: Vitest/Playwright run tests in parallel by default
5. **Database persistence**: Keep database running between test runs

---

## Related Documentation

- [Testing Guide](./TESTING_GUIDE.md) - Comprehensive testing documentation
- [Test Organization](./TEST_ORGANIZATION_CONSOLIDATED.md) - Test architecture
- [Phase 4 Migration](./PHASE4_TEST_IMPORT_PATH_MIGRATION.md) - Recent changes
- [AI Agent Guide](./AI_AGENT_GUIDE.md) - For AI coding assistants

---

## Summary Table

| Command                     | Location            | Purpose           | Requires DB |
| --------------------------- | ------------------- | ----------------- | ----------- |
| `npm test`                  | `apps/server/` | Unit tests        | ❌          |
| `npm run test:e2e`          | `apps/server/` | E2E + Integration | ✅          |
| `npm run test:all`          | `apps/server/` | All server tests  | ✅          |
| `npm test`                  | `apps/admin/`       | Component tests   | ❌          |
| `npm run e2e`               | `apps/admin/`       | Playwright E2E    | ❌\*        |
| `npm run test:coverage:all` | Root                | All coverage      | ✅          |

\* Admin E2E requires API server (can be mocked)

---

**Last Updated**: November 10, 2025  
**Phase 4 Migration**: Complete ✅
