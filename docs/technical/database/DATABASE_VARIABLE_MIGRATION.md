# Database Environment Variable Migration

**Status**: ✅ Completed  
**Date**: October 31, 2025  
**Version**: 2.0.0

---

## Overview

Successfully migrated all database environment variables from PostgreSQL's default `PG*` format to the more explicit `POSTGRES_*` format for better clarity, consistency with Docker conventions, and alignment with modern best practices.

---

## What Changed

### Variable Mapping

| Old (Removed)    | New (Required)      | Purpose                  |
| ---------------- | ------------------- | ------------------------ |
| `PGHOST`         | `POSTGRES_HOST`     | Database server hostname |
| `PGPORT`         | `POSTGRES_PORT`     | Database server port     |
| `PGUSER`         | `POSTGRES_USER`     | Database username        |
| `PGPASSWORD`     | `POSTGRES_PASSWORD` | Database password        |
| `PGDATABASE`     | `POSTGRES_DB`       | Database name            |
| `PGDATABASE_E2E` | `POSTGRES_DB_E2E`   | E2E test database name   |

---

## Files Modified

### Core Application (6 files)

1. ✅ `apps/server/src/common/config/config.schema.ts` - Schema definition
2. ✅ `apps/server/src/common/config/config.service.ts` - Service getters
3. ✅ `apps/server/tests/test-db-config.ts` - Test configuration helper
4. ✅ `apps/server/tests/setup.ts` - Global test setup

### Environment Files (3 files)

5. ✅ `.env` - Local development (user action completed)
6. ✅ `.env.example` - Developer template
7. ✅ `.env.production.example` - Production template
8. ✅ `docker-compose.yml` - Production Docker Compose

### Scripts (11 files)

9. ✅ `scripts/run-migrations.ts`
10. ✅ `scripts/full-reset-db.ts`
11. ✅ `scripts/reset-db.ts`
12. ✅ `scripts/seed-togaf-template.ts`
13. ✅ `scripts/seed-extraction-demo.ts`
14. ✅ `scripts/seed-meeting-pack.ts`
15. ✅ `scripts/seed-emergent-framework.ts`
16. ✅ `scripts/get-clickup-credentials.ts`
17. ✅ `scripts/migrate-embedding-dimension.ts`
18. ✅ `apps/server/scripts/migrate.mjs`

### Test Files (4 files)

19. ✅ `apps/server/tests/e2e/cleanup.cascades.e2e.spec.ts`
20. ✅ `apps/server/tests/e2e/documents.chunking.e2e.spec.ts`
21. ✅ `apps/server/tests/unit/schema.indexes.spec.ts`

### Workspace CLI (1 file)

22. ✅ `tools/workspace-cli/src/config/dependency-processes.ts`

### Documentation (3 files)

23. ✅ `README.md` - Added breaking change notice
24. ✅ `CHANGELOG.md` - Added migration details
25. ✅ `docs/DATABASE_VARIABLE_MIGRATION.md` - This file

**Total**: 25 files modified

---

## Migration Steps (Completed)

### Phase 1: Core Application ✅

- [x] Updated `config.schema.ts` with new variable names
- [x] Updated `config.service.ts` getters
- [x] Updated test configuration helpers
- [x] Updated test setup

### Phase 2: Environment Files ✅

- [x] Updated `.env.example` template
- [x] Cleaned up `.env.production.example`
- [x] Removed duplicate PG\* from docker-compose.yml
- [x] Updated local `.env` file

### Phase 3: Scripts & Tests ✅

- [x] Batch updated all 11 scripts
- [x] Updated all 4 test files
- [x] Updated migrate.mjs (removed fallback)
- [x] Updated workspace CLI

### Phase 4: Documentation ✅

- [x] Added breaking change to CHANGELOG.md
- [x] Added notice to README.md
- [x] Created this migration document

---

## Breaking Changes

### No Backward Compatibility

This is a **clean cut-over** with **NO fallback mechanism**. Old `PG*` variables will **NOT work**.

**Required Action:**
All developers must update their `.env` files immediately.

### Impact Assessment

| Area                  | Impact | Action Required                         |
| --------------------- | ------ | --------------------------------------- |
| **Local Development** | High   | Update `.env` file                      |
| **Scripts**           | High   | Variables required for all scripts      |
| **Tests**             | High   | Tests will fail without new variables   |
| **Docker Compose**    | High   | Production deployment requires new vars |
| **CI/CD**             | High   | Update environment variables            |
| **Deployment**        | High   | Update environment in deployment        |

---

## Migration Guide for Developers

### Quick Migration

```bash
# 1. Backup your current config
cp .env .env.backup

# 2. Update variable names in .env
# Change:
PGHOST=localhost          →  POSTGRES_HOST=localhost
PGPORT=5432              →  POSTGRES_PORT=5432
PGUSER=spec              →  POSTGRES_USER=spec
PGPASSWORD=spec          →  POSTGRES_PASSWORD=spec
PGDATABASE=spec          →  POSTGRES_DB=spec
PGDATABASE_E2E=spec_e2e  →  POSTGRES_DB_E2E=spec_e2e

# 3. Or use sed (macOS):
sed -i '' 's/^PGHOST=/POSTGRES_HOST=/' .env
sed -i '' 's/^PGPORT=/POSTGRES_PORT=/' .env
sed -i '' 's/^PGUSER=/POSTGRES_USER=/' .env
sed -i '' 's/^PGPASSWORD=/POSTGRES_PASSWORD=/' .env
sed -i '' 's/^PGDATABASE=/POSTGRES_DB=/' .env

# 4. Verify
cat .env | grep POSTGRES
```

### For Production/CI

Update environment variables in:

- Deployment configuration
- CI/CD pipelines (GitHub Actions, etc.)
- Any external scripts or tools
- Documentation and runbooks

---

## Rationale

### Why POSTGRES\_\* ?

1. **Docker Standard**: Official PostgreSQL Docker images use `POSTGRES_*`
2. **Explicit Naming**: More clear than abbreviated `PG*`
3. **Consistency**: Matches pattern used by other services (`ZITADEL_*`, `GOOGLE_*`)
4. **Modern Convention**: Industry trend toward explicit variable naming
5. **Deployment Compatible**: New deployment infrastructure uses `POSTGRES_*`

### Why No Fallback?

1. **Cleaner Codebase**: No compatibility layer cruft
2. **Single Source of Truth**: No confusion about which variables to use
3. **Forces Explicit Migration**: Ensures all configs are updated
4. **Better Long-term Maintenance**: No legacy code paths
5. **Clear Breaking Change**: Easier to communicate and track

---

## Verification

### Verify Local Setup

```bash
# Check environment variables
cat .env | grep POSTGRES

# Should show:
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5437
# POSTGRES_USER=spec
# POSTGRES_PASSWORD=spec
# POSTGRES_DB=spec
```

### Verify Configuration Loads

```bash
# Start the server
npm run workspace:start

# Should see in logs:
# Config initialized: PORT= 3002 POSTGRES_HOST= localhost ...
```

### Verify Tests Pass

```bash
# Run unit tests
nx test server

# Run E2E tests
nx test-e2e server
```

---

## Troubleshooting

### Error: "POSTGRES_HOST environment variable is required"

**Cause**: Old `.env` file still using `PG*` variables

**Fix**:

```bash
# Update your .env file
cp .env.example .env
# Fill in your values with POSTGRES_* variable names
```

### Error: "Cannot connect to database"

**Cause**: Variable mismatch between config and actual values

**Fix**:

```bash
# Verify all POSTGRES_* variables are set
env | grep POSTGRES

# Check config service logs for actual values being used
```

### Tests Failing

**Cause**: Test environment not updated

**Fix**:

```bash
# Update .env.test.local with POSTGRES_* variables
cp .env.test.local.example .env.test.local
# Update values
```

---

## Special Cases

### psql Commands

The `migrate.mjs` script uses `PGPASSWORD` in psql commands because that's a PostgreSQL standard:

```bash
PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} ...
```

This is **correct behavior** - `PGPASSWORD` is read FROM `POSTGRES_PASSWORD` variable, then passed to psql.

### Docker Compose

Production docker-compose.yml uses only `POSTGRES_*`:

```yaml
environment:
  POSTGRES_HOST: db
  POSTGRES_PORT: 5432
  POSTGRES_USER: ${POSTGRES_USER:-spec}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  POSTGRES_DB: ${POSTGRES_DB:-spec}
```

Old `PG*` variables removed for clarity.

---

## Success Criteria

- [x] All 25 files updated
- [x] Core configuration uses POSTGRES\_\*
- [x] All scripts migrated
- [x] All tests migrated
- [x] Environment templates updated
- [x] Local .env updated
- [x] Docker compose cleaned up
- [x] Documentation updated
- [x] Breaking change notice added

---

## Next Steps

### For Developers

1. ✅ Update local `.env` file (completed)
2. ⏳ Pull latest changes from main
3. ⏳ Verify tests pass locally
4. ⏳ Update any personal scripts

### For DevOps

1. ⏳ Update deployment environment variables
2. ⏳ Update CI/CD pipelines
3. ⏳ Update production secrets
4. ⏳ Update monitoring/alerting configs

### For Documentation

1. ✅ Update CHANGELOG.md (completed)
2. ✅ Update README.md (completed)
3. ⏳ Update deployment guides
4. ⏳ Update troubleshooting docs

---

## Communication

### Team Announcement Template

```
🚨 Breaking Change: Database Environment Variables

We've migrated from PG* to POSTGRES_* variables for better clarity and Docker compatibility.

**Action Required**: Update your .env file immediately
- PGHOST → POSTGRES_HOST
- PGPORT → POSTGRES_PORT
- PGUSER → POSTGRES_USER
- PGPASSWORD → POSTGRES_PASSWORD
- PGDATABASE → POSTGRES_DB

Quick migration: See docs/DATABASE_VARIABLE_MIGRATION.md

Questions? Check the migration doc or ask in #engineering
```

---

## References

- CHANGELOG.md - Breaking changes section
- README.md - Migration notice
- .env.example - Updated template
- .env.production.example - Production template
- COOLIFY_DEPLOYMENT_READY.md - Deployment guide

---

**Migration completed successfully on October 31, 2025**

All database environment variables now use the `POSTGRES_*` format consistently across the entire codebase.
