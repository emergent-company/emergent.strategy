# Integration Tests

This directory contains tests that require external services or infrastructure.

## Categories

### Database-Dependent Tests (`./graph/`)
Tests that require a PostgreSQL database connection:
- Graph validation tests
- RLS (Row Level Security) tests
- Embedding worker tests
- Graph relationship tests
- Full-text search tests

**Requirements:**
- PostgreSQL running on port 5432
- Database migrations applied (`migrations/0001_init.sql`)
- Test database schema initialized

### External API Tests (`./clickup/`)
Tests that make real API calls to external services:
- ClickUp integration tests

**Requirements:**
- Valid API credentials (e.g., `CLICKUP_API_TOKEN`)
- Network connectivity
- API rate limits considered

### E2E Scenario Tests (`./scenarios/`)
Full end-to-end tests requiring complete infrastructure:
- User journey tests
- Multi-service integration tests

**Requirements:**
- All services running
- Database initialized
- Test data seeded

## Running Integration Tests

### All integration tests:
```bash
npm run test:integration
```

### Specific category:
```bash
npm run test:integration -- tests/integration/graph
```

### Single test file:
```bash
npm run test:integration -- tests/integration/graph/graph-validation.spec.ts
```

## Setup for Local Testing

1. **Start PostgreSQL:**
   ```bash
   nx run workspace-cli:workspace:deps:start
   ```

2. **Apply migrations:**
   ```bash
   nx run server-nest:migrate
   ```

3. **Run integration tests:**
   ```bash
   npm run test:integration
   ```

## CI/CD

Integration tests should run:
- On PR merge (not on every commit)
- On scheduled nightly builds
- Before releases

Unit tests (without integration) run on every commit.

## Moving Tests to Integration

If you create a test that requires:
- Database connection
- External API calls
- Real file system operations
- Long-running operations (>5s)

Move it to `tests/integration/` and it will be excluded from unit test runs.
