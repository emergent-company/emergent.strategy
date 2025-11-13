---
description: Run all implemented tests in the project (unit, E2E, and coverage)
mode: agent
---

# Run All Tests in Spec Server Project

Execute the complete test suite across all applications in this monorepo. This prompt guides you through running unit tests, E2E tests, and generating coverage reports for both frontend and backend.

## Project Structure

This is a monorepo with the following testable applications:

1. **Admin Frontend** (`apps/admin/`) - React + Vite + Vitest (unit) + Playwright (E2E)
2. **Server Backend** (`apps/server/`) - NestJS + Jest (unit & E2E)

## Test Execution Order

Follow this sequence to run all tests:

### 1. Server Backend Tests

#### Unit Tests
```bash
npm --prefix apps/server run test
```

#### E2E Tests
```bash
npm --prefix apps/server run test:e2e
```

#### Coverage Report
```bash
npm --prefix apps/server run test:coverage
```

### 2. Admin Frontend Tests

#### Unit Tests
```bash
npm --prefix apps/admin run test
```

#### E2E Tests
```bash
npm --prefix apps/admin run e2e
# Or target specific suites
npm --prefix apps/admin run e2e:clickup
npm --prefix apps/admin run e2e:chat
```

#### Coverage Report
```bash
npm --prefix apps/admin run test:coverage
```

## Prerequisites

Before running E2E tests, ensure these services are running:

- **PostgreSQL** (port 5432) - Database
- **Zitadel** (port 8080) - Auth server
- **Backend Server** (port 3001) - API
- **Admin Dev Server** (port 5175) - Frontend

### Check Service Status

```bash
npm run workspace:status
```

This command aggregates Docker, PM2-managed processes, and port usage for the API, Admin SPA, and shared dependencies.

### Start Required Services

```bash
npm run workspace:deps:start   # Postgres + Zitadel + login portal
npm run workspace:start        # API + Admin SPA under PM2
```

To validate dependencies manually (or before ad-hoc Playwright runs), execute:

```bash
node scripts/ensure-e2e-deps.mjs
```

It checks container health, verifies ports, and seeds auth tokens expected by the E2E suites.

## Full Test Suite Script

Here's a complete bash script that runs all tests sequentially:

```bash
set -e  # Exit on first failure

echo "🧪 Starting Complete Test Suite..."
echo ""

echo "1️⃣ Running Server Unit Tests..."
npm --prefix apps/server run test
echo "✅ Server unit tests passed"
echo ""

echo "2️⃣ Running Server E2E Tests..."
npm --prefix apps/server run test:e2e
echo "✅ Server E2E tests passed"
echo ""

echo "3️⃣ Running Admin Unit Tests..."
npm --prefix apps/admin run test
echo "✅ Admin unit tests passed"
cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test --config=e2e/playwright.config.ts --project=chromium
cd ../..
echo "✅ Admin E2E tests passed"
echo ""

echo "5️⃣ Running Coverage Reports..."
npm --prefix apps/server run test:coverage
npm --prefix apps/admin run test:coverage
echo "✅ Coverage reports generated"
echo ""

echo "🎉 All tests passed successfully!"
```

## Test Results and Coverage

After running tests with coverage, view the HTML reports:

### Server Coverage
```bash
open apps/server/coverage/lcov-report/index.html
```

### Admin Coverage
```bash
open apps/admin/coverage/lcov-report/index.html
```

## Debugging Failed Tests

### Playwright E2E Failures

When Playwright tests fail, check these artifacts in `apps/admin/test-results/<test-name>/`:

1. **error-context.md** - Page URL, console errors, accessibility snapshot
2. **test-failed-*.png** - Screenshot at failure
3. **video.webm** - Video recording of the test

### Jest/Vitest Failures

Run failed tests with verbose output:

```bash
# Server (Jest)
npm --prefix apps/server run test -- --verbose --testNamePattern="failing test name"

# Admin (Vitest)
npm --prefix apps/admin run test -- -t "failing test name"
```

## Quick Commands

### Run Only Unit Tests
```bash
npm --prefix apps/server run test
npm --prefix apps/admin run test
```

### Run Only E2E Tests
```bash
npm --prefix apps/server run test:e2e
npm --prefix apps/admin run e2e
```

### Generate All Coverage Reports
```bash
npm --prefix apps/server run test:coverage
npm --prefix apps/admin run test:coverage
```

## Important Notes

⚠️ **Always use the scripted npm/Nx targets** – they wrap dependency checks and invoke shared tooling like `ensure-e2e-deps.mjs`.

⚠️ **Don't run E2E tests in parallel** - They share database state and can interfere with each other.

⚠️ **Set E2E_FORCE_TOKEN=1** - Required environment variable for Playwright tests to skip interactive auth flow.

✅ **Sequential execution recommended** - Run tests in the order specified above for best results.

## Related Documentation

For more details, see:
- [Testing Infrastructure Instructions](../../.github/instructions/testing.instructions.md)
- [Admin Build & Test Loop](../../.github/instructions/admin.instructions.md)
- [E2E Dependency Checker](../../docs/E2E_DEPENDENCY_CHECKER.md)
