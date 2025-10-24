# Integration Tests

This subdirectory contains integration tests that test services/repositories directly (without HTTP layer).

## What Goes Here

Tests that require database but test internal modules directly:
- Graph service database operations
- Repository layer tests
- Worker service tests with real database
- External API integration tests (ClickUp, etc.)

## Difference from Parent E2E Tests

- **E2E tests** (`../`): Test through HTTP endpoints, bootstrap full NestJS app
- **Integration tests** (here): Test services/repositories directly, may use lighter setup

Both require database and run via `npm run test:e2e`.

## Current Integration Tests

These are currently located in other directories but logically belong here:

**Graph Database Tests** (in `src/modules/graph/__tests__/`):
- `embedding-worker.backoff.spec.ts` - Backoff/retry logic with DB
- `embedding-worker.spec.ts` - Embedding worker with DB
- `graph-branching.spec.ts` - Graph branching with DB
- `graph-embedding.enqueue.spec.ts` - Embedding queue with DB
- `graph-fts.search.spec.ts` - Full-text search with DB
- `graph-relationship.multiplicity.negative.spec.ts` - Relationship multiplicity validation with DB
- `graph-relationship.multiplicity.spec.ts` - Relationship multiplicity with DB
- `graph-rls.policies.spec.ts` - RLS policies with DB
- `graph-rls.security.spec.ts` - RLS security with DB
- `graph-rls.strict-init.spec.ts` - RLS strict initialization with DB
- `graph-validation.schema-negative.spec.ts` - Schema validation negative cases with DB
- `graph-validation.spec.ts` - Schema validation with DB

**External API Tests**:
- `tests/clickup-real.integration.spec.ts` - Real ClickUp API calls

**Scenario Tests** (in `tests/scenarios/`):
- `user-first-run.spec.ts` - Full user journey with DB

## Optional Migration

These files can optionally be moved here for better organization:
- Move graph tests: `src/modules/graph/__tests__/*-integration.spec.ts` → `tests/e2e/integration/graph/`
- Move API tests: `tests/clickup-real.integration.spec.ts` → `tests/e2e/integration/clickup/`
- Keep scenarios where they are (full user journeys are a distinct category)

The current setup works well with these files in their current locations - they're properly excluded from unit tests and included in e2e runs.
