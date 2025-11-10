# E2E Test Database Setup

This directory contains the ephemeral E2E test database configuration.

## Overview

E2E tests use a **completely isolated, ephemeral PostgreSQL database** that is:

- ✅ Destroyed and recreated for each test run
- ✅ Running on port **5438** (separate from dev DB on 5437)
- ✅ No persistent volumes (data never preserved)
- ✅ Optimized for test performance (fsync off, etc.)

## Quick Start

### Run All E2E Tests (Recommended)

```bash
npm run test:e2e
```

This command automatically:

1. Stops any existing E2E database container
2. Starts a fresh E2E database container
3. Waits for it to be ready
4. Runs all E2E tests
5. Stops and removes the container

### Manual Database Management

If you want to run tests multiple times without restarting the database:

```bash
# Start E2E database
npm run db:e2e:up

# Run tests (can run multiple times)
npx nx run server-nest:test-e2e

# Stop and remove database
npm run db:e2e:down
```

### Run Single Test

```bash
# Start database
npm run db:e2e:up

# Run specific test
npx nx run server-nest:test-e2e --testFile=apps/server-nest/tests/e2e/document-ingestion.spec.ts

# Clean up
npm run db:e2e:down
```

### Other Commands

```bash
# Restart database (stops, recreates, starts)
npm run db:e2e:restart

# View database logs
npm run db:e2e:logs

# Remove database and volumes (nuclear option)
npm run db:e2e:clean
```

## Architecture

### Database Configuration

- **Image**: `pgvector/pgvector:pg16`
- **Port**: 5438 (host) → 5432 (container)
- **Database**: `spec_e2e`
- **User/Pass**: `spec/spec`
- **Container Name**: `spec-e2e-db`

### Environment Variables

E2E tests load configuration from `.env.e2e`:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5438
POSTGRES_USER=spec
POSTGRES_PASSWORD=spec
POSTGRES_DB=spec_e2e
AUTH_TEST_STATIC_TOKENS=1
SCOPES_DISABLED=0
EXTRACTION_WORKER_ENABLED=false
```

### Performance Optimizations

The E2E database uses aggressive settings for speed:

- `fsync=off` - Skip disk sync (data loss acceptable in tests)
- `synchronous_commit=off` - Don't wait for commits
- `full_page_writes=off` - Skip extra write safety
- `shared_buffers=256MB` - Larger buffer cache

⚠️ **Never use these settings in production!**

## Why Ephemeral?

### Before (Old Approach)

- ❌ Cleanup code runs before each test
- ❌ Unique constraint violations from leftover data
- ❌ Tests interfere with each other
- ❌ Hard to debug failures

### After (Ephemeral Database)

- ✅ Fresh database every run
- ✅ No cleanup code needed
- ✅ True test isolation
- ✅ Parallel test runs possible
- ✅ CI/CD friendly

## Troubleshooting

### Port Already in Use

If port 5438 is already taken:

```bash
# Find what's using the port
lsof -i :5438

# Or force remove the container
docker stop spec-e2e-db && docker rm spec-e2e-db
```

### Database Not Ready

If tests fail with connection errors:

```bash
# Check database health
docker ps | grep spec-e2e-db

# View logs
npm run db:e2e:logs

# Wait for healthy status
docker inspect spec-e2e-db --format='{{.State.Health.Status}}'
```

### Clean Slate

To completely reset everything:

```bash
npm run db:e2e:clean
npm run db:e2e:up
```

## CI/CD Integration

For GitHub Actions or other CI systems:

```yaml
- name: Start E2E Database
  run: npm run db:e2e:up

- name: Wait for Database
  run: |
    timeout 30 sh -c 'until docker inspect spec-e2e-db --format="{{.State.Health.Status}}" | grep -q healthy; do sleep 1; done'

- name: Run E2E Tests
  run: npx nx run server-nest:test-e2e

- name: Stop E2E Database
  if: always()
  run: npm run db:e2e:down
```

Or use the all-in-one command:

```yaml
- name: Run E2E Tests
  run: npm run test:e2e
```
