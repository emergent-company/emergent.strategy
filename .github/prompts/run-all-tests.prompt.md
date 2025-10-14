---
description: Run all implemented tests in the project (unit, E2E, and coverage)
mode: agent
tools:
  - mcp_dev-manager
  - terminal
---

# Run All Tests in Spec Server Project

Execute the complete test suite across all applications in this monorepo. This prompt guides you through running unit tests, E2E tests, and generating coverage reports for both frontend and backend.

## Project Structure

This is a monorepo with the following testable applications:

1. **Admin Frontend** (`apps/admin/`) - React + Vite + Vitest (unit) + Playwright (E2E)
2. **Server Backend** (`apps/server-nest/`) - NestJS + Jest (unit & E2E)
3. **MCP Dev Manager** (`mcp-dev-manager/`) - Vitest

## Test Execution Order

Follow this sequence to run all tests:

### 1. Server Backend Tests

#### Unit Tests
```typescript
// Run all backend unit tests
mcp_dev-manager_run_script({ app: "server", action: "test" })
```

#### E2E Tests
```typescript
// Run backend API integration tests
mcp_dev-manager_run_script({ app: "server", action: "test:e2e" })
```

#### Coverage Report
```typescript
// Generate backend coverage report
mcp_dev-manager_run_script({ app: "server", action: "test:coverage" })
```

### 2. Admin Frontend Tests

#### Unit Tests
```typescript
// Run all frontend component and hook tests
mcp_dev-manager_run_script({ app: "admin", action: "test" })
```

#### E2E Tests
```typescript
// Run all Playwright E2E tests
mcp_dev-manager_run_script({ app: "admin", action: "e2e" })

// Or run specific test suites:
// ClickUp integration tests
mcp_dev-manager_run_script({ app: "admin", action: "e2e:clickup" })

// Chat feature tests
mcp_dev-manager_run_script({ app: "admin", action: "e2e:chat" })
```

#### Coverage Report
```typescript
// Generate frontend coverage report
mcp_dev-manager_run_script({ app: "admin", action: "test:coverage" })
```

### 3. MCP Dev Manager Tests

```bash
# Run MCP dev manager tests
npm --prefix mcp-dev-manager run test

# With coverage
npm --prefix mcp-dev-manager run test:coverage
```

## Prerequisites

Before running E2E tests, ensure these services are running:

- **PostgreSQL** (port 5432) - Database
- **Zitadel** (port 8080) - Auth server
- **Backend Server** (port 3001) - API
- **Admin Dev Server** (port 5175) - Frontend

### Check Service Status

Use the MCP dev-manager tool to check all service status:

```typescript
mcp_dev-manager_check_status({
  services: ["docker-compose", "npm", "ports"],
  detailed: true
})
```

This will show:
- Docker containers status (PostgreSQL, Zitadel)
- Running npm processes (backend server, frontend dev server)
- Port usage (5432, 8080, 3001, 5175)

### Start Required Services

If services are not running, start them using MCP tools:

```typescript
// Start Docker services (PostgreSQL + Zitadel)
mcp_dev-manager_run_script({ app: "docker", action: "up" })

// Start backend server (runs in background)
mcp_dev-manager_run_script({ app: "server", action: "start" })

// Start admin dev server (runs in background)
mcp_dev-manager_run_script({ app: "admin", action: "dev" })
```

**Note:** The `ensure-e2e-deps.mjs` script automatically checks and starts required services when running E2E tests through MCP tools.

## Full Test Suite Script

Here's a complete bash script that runs all tests sequentially:

```bash
#!/bin/bash
set -e  # Exit on first failure

echo "🧪 Starting Complete Test Suite..."
echo ""

echo "1️⃣ Running Server Unit Tests..."
npm --prefix apps/server-nest run test
echo "✅ Server unit tests passed"
echo ""

echo "2️⃣ Running Server E2E Tests..."
npm --prefix apps/server-nest run test:e2e
echo "✅ Server E2E tests passed"
echo ""

echo "3️⃣ Running Admin Unit Tests..."
npm --prefix apps/admin run test
echo "✅ Admin unit tests passed"
echo ""

echo "4️⃣ Running Admin E2E Tests..."
cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test --config=e2e/playwright.config.ts --project=chromium
cd ../..
echo "✅ Admin E2E tests passed"
echo ""

echo "5️⃣ Running MCP Dev Manager Tests..."
npm --prefix mcp-dev-manager run test
echo "✅ MCP tests passed"
echo ""

echo "🎉 All tests passed successfully!"
```

## Test Results and Coverage

After running tests with coverage, view the HTML reports:

### Server Coverage
```bash
open apps/server-nest/coverage/lcov-report/index.html
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
npm --prefix apps/server-nest run test -- --verbose --testNamePattern="failing test name"

# Admin (Vitest)
npm --prefix apps/admin run test -- -t "failing test name"
```

## Quick Commands

### Run Only Fast Tests (Unit Tests)
```typescript
// Skip E2E, run only unit tests
mcp_dev-manager_run_script({ app: "server", action: "test" })
mcp_dev-manager_run_script({ app: "admin", action: "test" })
```

### Run Only E2E Tests
```typescript
// Server API tests
mcp_dev-manager_run_script({ app: "server", action: "test:e2e" })

// Admin browser tests
mcp_dev-manager_run_script({ app: "admin", action: "e2e" })
```

### Generate All Coverage Reports
```typescript
mcp_dev-manager_run_script({ app: "server", action: "test:coverage" })
mcp_dev-manager_run_script({ app: "admin", action: "test:coverage" })
```

## Important Notes

⚠️ **Always use MCP tools for non-interactive tests** - The `ensure-e2e-deps.mjs` script automatically checks and starts required services.

⚠️ **Don't run E2E tests in parallel** - They share database state and can interfere with each other.

⚠️ **Set E2E_FORCE_TOKEN=1** - Required environment variable for Playwright tests to skip interactive auth flow.

✅ **Sequential execution recommended** - Run tests in the order specified above for best results.

## Related Documentation

For more details, see:
- [Testing Infrastructure Instructions](../../.github/instructions/testing.instructions.md)
- [MCP Dev Manager Instructions](../../.github/instructions/mcp-dev-manager.instructions.md)
- [Admin Build & Test Loop](../../.github/instructions/admin.instructions.md)
