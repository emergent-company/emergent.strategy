# Integration Tests (Deprecated Location)

**This directory is deprecated.** Integration tests have been consolidated with E2E tests.

## New Location

All tests requiring external infrastructure (database, services, APIs) now run together:

📂 **New location**: `tests/e2e/integration/`

## Run All Infrastructure Tests

```bash
npm run test:e2e
```

This command now runs:
- HTTP endpoint tests (`tests/e2e/**/*.e2e.spec.ts`)
- Service integration tests (`tests/e2e/integration/**/*.spec.ts`)
- Scenario tests (`tests/scenarios/**/*.spec.ts`)
- Graph DB tests (`src/modules/graph/__tests__/*-integration.spec.ts`)

## Why Consolidated?

Both E2E and integration tests require the same infrastructure (PostgreSQL database). Maintaining separate configurations and commands was unnecessary complexity.

**Simplified model**:
- **Unit tests** (`npm run test` or `npm run test:unit`): Fast, no external dependencies
- **E2E tests** (`npm run test:e2e`): All tests requiring database/services/APIs

See `tests/e2e/integration/README.md` for details on integration test organization.

