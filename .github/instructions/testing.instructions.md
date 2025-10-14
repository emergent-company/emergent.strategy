---
applyTo: "**"
---

# Testing Infrastructure - AI Assistant Instructions

## Overview

This project uses a comprehensive testing strategy across multiple applications and frameworks. Understanding how to run tests correctly is critical for maintaining code quality and ensuring CI/CD pipeline success.

## Project Structure & Test Types

### 1. Admin Frontend (React + Vite)
**Location:** `apps/admin/`
**Framework:** Vitest (unit), Playwright (E2E)

#### Test Types:
- **Unit Tests**: Component and hook testing with React Testing Library
- **E2E Tests**: Browser automation tests with Playwright
- **Storybook**: Component visual testing and documentation

#### Running Admin Tests:

**Unit Tests:**
```bash
# Run all unit tests
mcp_dev-manager_run_script({ app: "admin", action: "test" })

# Run with coverage
mcp_dev-manager_run_script({ app: "admin", action: "test:coverage" })

# Or using npm directly
npm --prefix apps/admin run test
npm --prefix apps/admin run test:coverage
```

**E2E Tests (Playwright):**

⚠️ **CRITICAL**: Always use MCP tools for E2E tests, never `run_in_terminal`:

```typescript
// ✅ CORRECT: Run all E2E tests
mcp_dev-manager_run_script({ app: "admin", action: "e2e" })

// ✅ Run specific test suite
mcp_dev-manager_run_script({ app: "admin", action: "e2e:clickup" })
mcp_dev-manager_run_script({ app: "admin", action: "e2e:chat" })

// ❌ WRONG: Never run manually
run_in_terminal({ command: "npx playwright test ..." })
```

**Available E2E Scripts:**
- `admin:e2e` - Run all E2E tests (non-interactive, chromium only)
- `admin:e2e:clickup` - Run ClickUp integration tests
- `admin:e2e:chat` - Run chat feature tests
- `admin:e2e:ui` - ⚠️ Interactive UI mode (use `run_in_terminal` with `isBackground: false`)
- `admin:e2e:headed` - ⚠️ Interactive headed mode (use `run_in_terminal`)
- `admin:e2e:debug` - ⚠️ Interactive debug mode (use `run_in_terminal`)

**Storybook:**
```bash
# Start Storybook dev server (background)
mcp_dev-manager_run_script({ app: "admin", action: "storybook" })

# Build static Storybook
npm --prefix apps/admin run build-storybook
```

**Type Checking:**
```bash
# Type check without building
npm --prefix apps/admin run build

# Or use VS Code task
run_task({ workspaceFolder: "/Users/mcj/code/spec-server", id: "Typecheck admin" })
```

### 2. Server Backend (NestJS)
**Location:** `apps/server-nest/`
**Framework:** Jest (unit & E2E)

#### Test Types:
- **Unit Tests**: Service, controller, and utility tests with mocks
- **E2E Tests**: Integration tests hitting actual API endpoints
- **Coverage Reports**: Full code coverage metrics

#### Database-dependent Suites
- Use `describeWithDb` from `apps/server-nest/tests/utils/db-describe.ts` for any spec that boots the full Nest application or requires a live PostgreSQL connection.
- Treat shared application handles as nullable and guard each request: capture `const currentApp = app; if (!currentApp) throw new Error(...)` before using `getHttpServer()`.
- Always close the Nest app (or context) in `afterAll`, setting locals back to `null` to avoid leaking handles.
- The helper automatically skips suites when the database is unavailable or when `SKIP_DB_TESTS=1` is set, so tests remain green in environments without Postgres.

#### Running Server Tests:

**Unit Tests:**
```bash
# Run all unit tests
mcp_dev-manager_run_script({ app: "server", action: "test" })

# Run with coverage
mcp_dev-manager_run_script({ app: "server", action: "test:coverage" })

# Watch mode (for development)
npm --prefix apps/server-nest run test:watch

# Or using npm directly
npm --prefix apps/server-nest run test
```

**E2E Tests:**
```bash
# Run all E2E integration tests
mcp_dev-manager_run_script({ app: "server", action: "test:e2e" })

# Or using npm directly
npm --prefix apps/server-nest run test:e2e
```

**Test Specific Files:**
```bash
# Run specific test file
npm --prefix apps/server-nest run test -- path/to/test.spec.ts

# Run tests matching pattern
npm --prefix apps/server-nest run test -- --testNamePattern="pattern"
```

**Type Checking:**
```bash
# Build to verify types
mcp_dev-manager_run_script({ app: "server", action: "build" })

# Or
npm --prefix apps/server-nest run build
```

### 3. MCP Dev Manager
**Location:** `mcp-dev-manager/`
**Framework:** Vitest

#### Running MCP Tests:
```bash
# Run MCP dev manager tests
npm --prefix mcp-dev-manager run test

# With coverage
npm --prefix mcp-dev-manager run test:coverage
```

### 4. Utility Scripts
**Location:** `scripts/`

Some scripts have associated tests:
```bash
# Run script validation
npm run validate:scripts
```

## Complete Test Suite Execution

### Run ALL Tests Across Entire Project

**Sequential Execution (Recommended):**
```bash
# 1. Server unit tests
mcp_dev-manager_run_script({ app: "server", action: "test" })

# 2. Server E2E tests
mcp_dev-manager_run_script({ app: "server", action: "test:e2e" })

# 3. Admin unit tests
mcp_dev-manager_run_script({ app: "admin", action: "test" })

# 4. Admin E2E tests
mcp_dev-manager_run_script({ app: "admin", action: "e2e" })

# 5. MCP Dev Manager tests
npm --prefix mcp-dev-manager run test
```

**Manual Script for Complete Run:**
```bash
#!/bin/bash
# Run all tests in the project

set -e  # Exit on first failure

echo "🧪 Running Server Unit Tests..."
npm --prefix apps/server-nest run test

echo "🧪 Running Server E2E Tests..."
npm --prefix apps/server-nest run test:e2e

echo "🧪 Running Admin Unit Tests..."
npm --prefix apps/admin run test

echo "🧪 Running Admin E2E Tests..."
cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test --config=e2e/playwright.config.ts --project=chromium

echo "🧪 Running MCP Dev Manager Tests..."
npm --prefix mcp-dev-manager run test

echo "✅ All tests passed!"
```

## Test Coverage Reports

### Generate Coverage for All Apps

**Server Coverage:**
```bash
mcp_dev-manager_run_script({ app: "server", action: "test:coverage" })
# Report: apps/server-nest/coverage/
```

**Admin Coverage:**
```bash
mcp_dev-manager_run_script({ app: "admin", action: "test:coverage" })
# Report: apps/admin/coverage/
```

**View HTML Coverage Reports:**
```bash
# Server
open apps/server-nest/coverage/lcov-report/index.html

# Admin
open apps/admin/coverage/lcov-report/index.html
```

## CI/CD Pipeline

The project uses GitHub Actions for automated testing. Configuration in `.github/workflows/`:

**Key Workflows:**
- `test-server.yml` - Server unit & E2E tests
- `test-admin.yml` - Admin unit tests & E2E tests
- `build.yml` - Type checking and builds

**CI Test Commands:**
All CI tests use the same MCP scripts to ensure consistency between local and CI environments.

## Test Dependencies

### Prerequisites for E2E Tests

**Admin E2E (Playwright):**
- PostgreSQL database running (port 5432)
- Zitadel auth server running (port 8080)
- Backend server running (port 3001)
- Admin dev server running (port 5175)

**Auto-Dependency Management:**
The `scripts/ensure-e2e-deps.mjs` script automatically checks and starts required services when using MCP tools.

**Manual Dependency Check:**
```bash
# Check all service status
mcp_dev-manager_check_status()

# Start required services
mcp_dev-manager_run_script({ app: "docker", action: "up" })
mcp_dev-manager_run_script({ app: "server", action: "start" })
mcp_dev-manager_run_script({ app: "admin", action: "dev" })
```

### Environment Variables

**Required for E2E Tests:**
```bash
E2E_FORCE_TOKEN=1  # Force token-based auth (no browser flow)
```

**Database Connection:**
```bash
PGHOST=localhost
PGPORT=5432
PGUSER=spec
PGPASSWORD=spec
PGDATABASE=spec
```

## Debugging Failed Tests

### Playwright Test Failures

**When tests fail, check:**
1. `apps/admin/test-results/<test-name>/error-context.md` - Contains page snapshot, console errors, URL
2. `apps/admin/test-results/<test-name>/test-failed-*.png` - Screenshots
3. `apps/admin/test-results/<test-name>/video.webm` - Video recording

**Common Issues:**
- **Selectors not found**: Check `error-context.md` for current page state
- **Timing issues**: Review video for race conditions
- **Auth failures**: Verify E2E_FORCE_TOKEN=1 is set
- **Missing dependencies**: Run `node scripts/ensure-e2e-deps.mjs`

**Debug Mode:**
```bash
# Run single test with debug UI (interactive - use run_in_terminal)
npm --prefix apps/admin run e2e:debug -- tests/example.spec.ts
```

### Jest/Vitest Test Failures

**Run with verbose output:**
```bash
npm --prefix apps/server-nest run test -- --verbose

# Show full error stack
npm --prefix apps/server-nest run test -- --no-coverage --maxWorkers=1
```

**Debug single test:**
```bash
# Jest (server)
npm --prefix apps/server-nest run test -- --testNamePattern="test name" --runInBand

# Vitest (admin)
npm --prefix apps/admin run test -- -t "test name"
```

## Best Practices

### For AI Assistants

1. **Always Use MCP Tools First**: Use `mcp_dev-manager_run_script` for all non-interactive test runs
2. **Check Dependencies**: Verify services are running before E2E tests
3. **Sequential Execution**: Don't run E2E tests in parallel (they share database state)
4. **Read Error Context**: Always check `error-context.md` files before suggesting fixes
5. **Respect Test Boundaries**: Don't mock what should be tested (e.g., database queries in E2E tests)
6. **Use DB Helpers**: When adding or updating Nest specs that need the real database, wrap them with `describeWithDb` and ensure all shared state is null-guarded.

### For Developers

1. **Run Tests Before Commit**: Ensure at least unit tests pass
2. **Watch Mode for Development**: Use `test:watch` during active development
3. **Full E2E Before PR**: Run complete E2E suite before opening pull requests
4. **Check Coverage**: Aim for >80% coverage on new code
5. **Update Tests First**: Follow TDD when adding new features

## Test File Patterns

### Finding Test Files

**Server (Jest):**
- Unit tests: `**/*.spec.ts` (next to source files)
- E2E tests: `test/**/*.e2e-spec.ts`

**Admin (Vitest):**
- Unit tests: `**/*.test.tsx` or `**/*.test.ts`
- E2E tests: `e2e/specs/**/*.spec.ts`

**Search Commands:**
```bash
# Find all test files
find apps/server-nest -name "*.spec.ts" -o -name "*.e2e-spec.ts"
find apps/admin/src -name "*.test.ts" -o -name "*.test.tsx"
find apps/admin/e2e/specs -name "*.spec.ts"
```

## Quick Reference

### Test Command Matrix

| App | Test Type | Command | Interactive? | Use MCP? |
|-----|-----------|---------|--------------|----------|
| Server | Unit | `server:test` | ❌ | ✅ |
| Server | E2E | `server:test:e2e` | ❌ | ✅ |
| Server | Coverage | `server:test:coverage` | ❌ | ✅ |
| Admin | Unit | `admin:test` | ❌ | ✅ |
| Admin | E2E | `admin:e2e` | ❌ | ✅ |
| Admin | E2E (ClickUp) | `admin:e2e:clickup` | ❌ | ✅ |
| Admin | E2E (Chat) | `admin:e2e:chat` | ❌ | ✅ |
| Admin | E2E UI | `admin:e2e:ui` | ✅ | Use `run_in_terminal` |
| Admin | E2E Debug | `admin:e2e:debug` | ✅ | Use `run_in_terminal` |
| Admin | Coverage | `admin:test:coverage` | ❌ | ✅ |
| MCP | Unit | N/A (use npm) | ❌ | ❌ |

### Common Test Scenarios

**Scenario: Running tests after code change**
```typescript
// 1. Run affected unit tests
mcp_dev-manager_run_script({ app: "server", action: "test" })

// 2. Run specific E2E test if integration affected
mcp_dev-manager_run_script({ app: "admin", action: "e2e:clickup" })

// 3. Check coverage if new code added
mcp_dev-manager_run_script({ app: "server", action: "test:coverage" })
```

**Scenario: Debugging E2E test failure**
```typescript
// 1. Check error context
mcp_dev-manager_browse_logs({
  action: "cat",
  logFile: "apps/admin/test-results/<test-name>/error-context.md"
})

// 2. Re-run specific test with headed browser (interactive)
run_in_terminal({
  command: "cd apps/admin && E2E_FORCE_TOKEN=1 npx playwright test tests/integrations.clickup.spec.ts --headed",
  isBackground: false
})

// 3. Fix and verify
mcp_dev-manager_run_script({ app: "admin", action: "e2e:clickup" })
```

**Scenario: Pre-commit validation**
```bash
# Quick validation (unit tests + type check)
npm --prefix apps/server-nest run test && npm --prefix apps/server-nest run build
npm --prefix apps/admin run test && npm --prefix apps/admin run build
```

## Troubleshooting

### "Port already in use"
```bash
# Check what's using ports
lsof -ti:3001,5175,5432,8080

# Kill processes if needed
mcp_dev-manager_run_script({ app: "docker", action: "down" })
pkill -f "node.*vite"
pkill -f "node.*nest"
```

### "Database connection failed"
```bash
# Restart PostgreSQL
mcp_dev-manager_run_script({ app: "docker", action: "restart" })

# Check database status
mcp_dev-manager_check_status()
```

### "Playwright browser not installed"
```bash
# Install Playwright browsers
npx playwright install chromium
npx playwright install-deps
```

### "Test timeout"
- Increase timeout in test config
- Check for hanging async operations
- Verify dependencies are healthy (database, auth server)

## Related Documentation

- `.github/instructions/admin.instructions.md` - Admin build & test loop
- `.github/instructions/mcp-dev-manager.instructions.md` - MCP tool usage
- `docs/CLICKUP_E2E_TESTING_STATUS.md` - ClickUp E2E test documentation
- `docs/CLICKUP_E2E_TESTS.md` - Detailed ClickUp test scenarios
- `scripts/README-dev-manager.md` - Development manager documentation

## Remember

- **Never skip tests** - They catch bugs before production
- **Use MCP tools** - They ensure proper setup and consistency
- **Read error context** - Test failures provide detailed debugging info
- **Keep tests fast** - Slow tests won't be run regularly
- **Test behavior, not implementation** - Focus on user-facing functionality
