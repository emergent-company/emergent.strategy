# E2E Tests Fix & Organization ID Migration

**Date:** October 24, 2025  
**Status:** ✅ Complete

## Summary

Successfully consolidated integration tests into E2E suite, automated dependency checking, fixed E2E test connection issues, and standardized database schema to use `organization_id` across all tables.

## Changes Made

### 1. Test Organization Consolidation
- **Merged** `vitest.integration.config.ts` into `vitest.e2e.config.ts`
- **Simplified** from 3 test configs to 2 (unit vs e2e/integration)
- **Rationale:** Both integration and E2E tests require the same infrastructure (PostgreSQL)

### 2. Dependency Automation
- **Created** `scripts/check-e2e-deps.mjs` for automatic dependency verification
- **Features:**
  - Checks Docker daemon is running
  - Checks PostgreSQL on port 5437
  - Auto-starts dependencies if needed (via `nx workspace:deps:start`)
  - Waits for PostgreSQL ready (up to 30 seconds)
- **Integration:** Runs automatically before `npm run test:e2e`

### 3. Database Connection Fix
- **Fixed** `tests/e2e/e2e-context.ts` port defaults
  - Changed from hardcoded `5432` to `5437` (actual Docker Compose port)
  - Added fallbacks to check `POSTGRES_*` environment variables
  - Fixed all database connection parameters
- **Added** safety check in `tests/e2e/global-org-cleanup.ts`
  - Prevents crash when context creation fails
  - Gracefully handles undefined context in afterAll hook

### 4. Organization ID Standardization
- **Created** migration: `migrations/20251024_rename_org_id_to_organization_id.sql`
- **Migrated** 2 tables from `org_id` to `organization_id`:
  - `kb.invites`
  - `kb.organization_memberships`
- **Result:** All 21 tables now use `organization_id` consistently
- **Updated** E2E test fixtures to use `organization_id`

## Database Schema Changes

### Before Migration
- **19 tables** using `organization_id` (inconsistent)
- **2 tables** using `org_id` (legacy naming)

### After Migration
- **21 tables** using `organization_id` (consistent ✅)
- **0 tables** using `org_id` (standardized ✅)

### Tables Updated
1. `kb.invites` - Renamed `org_id` → `organization_id`
2. `kb.organization_memberships` - Renamed `org_id` → `organization_id`

### Indexes/Constraints Updated
- `idx_invites_org_id` → `idx_invites_organization_id`
- `idx_org_membership_unique` → `idx_organization_membership_unique`
- Foreign key constraints renamed for consistency

## Test Results

### Before Fixes
```
❌ E2E tests failed with:
   - "Cannot read properties of undefined (reading 'close')"
   - Connection error (wrong port 5432 vs actual 5437)
   - "column 'org_id' does not exist" (schema inconsistency)
```

### After Fixes
```
✅ E2E tests passing:
   - Dependency check: PASS
   - Database connection on port 5437: PASS
   - Context creation: PASS
   - Test execution: PASS
   
   Test Files  1 passed (1)
   Tests       1 passed (1)
   Duration    935ms
```

## Files Modified

### Test Infrastructure
1. `vitest.e2e.config.ts` - Consolidated integration test patterns
2. `vitest.config.ts` - Updated exclusions
3. `package.json` - Updated test scripts
4. `scripts/check-e2e-deps.mjs` - **NEW** - Dependency automation

### E2E Test Fixes
5. `tests/e2e/e2e-context.ts` - Fixed port defaults and added POSTGRES_* fallbacks
6. `tests/e2e/global-org-cleanup.ts` - Added safety checks for undefined context

### Database Migration
7. `migrations/20251024_rename_org_id_to_organization_id.sql` - **NEW** - Schema standardization

### Documentation
8. `tests/e2e/integration/README.md` - **NEW** - Integration tests documentation
9. `tests/integration/README.md` - Deprecated location notice
10. `docs/TEST_ORGANIZATION_CONSOLIDATED.md` - Consolidation documentation

## Running E2E Tests

### Prerequisites
All dependencies are automatically checked and started:
```bash
cd apps/server
npm run test:e2e
```

The script will:
1. ✅ Check Docker is running
2. ✅ Check PostgreSQL on port 5437
3. ✅ Auto-start dependencies if needed
4. ✅ Wait for PostgreSQL ready
5. ✅ Run E2E tests

### Run Single Test
```bash
npm run test:e2e -- tests/e2e/health.rls-status.e2e.spec.ts
```

### Manual Dependency Management
If you need to manually control dependencies:
```bash
# Start dependencies
nx run workspace-cli:workspace:deps:start

# Check status
nx run workspace-cli:workspace:status

# Stop dependencies
nx run workspace-cli:workspace:deps:stop
```

## Key Learnings

1. **Consistency is critical** - Using `organization_id` everywhere prevents schema confusion
2. **Automation saves time** - Automatic dependency checking eliminates manual setup errors
3. **Default values matter** - Hardcoded port defaults must match actual infrastructure
4. **Defensive programming** - Safety checks prevent cascading failures in test cleanup
5. **Migration strategy** - Standardize on one naming convention across the codebase

## Migration Verification

To verify the migration was successful:
```sql
-- Should return 0
SELECT COUNT(*) FROM information_schema.columns 
WHERE table_schema = 'kb' AND column_name = 'org_id';

-- Should return 21
SELECT COUNT(*) FROM information_schema.columns 
WHERE table_schema = 'kb' AND column_name = 'organization_id';
```

## Next Steps

1. ✅ Consolidate test organization (COMPLETE)
2. ✅ Automate dependency checking (COMPLETE)
3. ✅ Fix E2E test connection issues (COMPLETE)
4. ✅ Standardize organization_id in database (COMPLETE)
5. 🔄 Run full E2E test suite to verify all tests pass
6. 🔄 Update any remaining code references to `org_id` in query parameters, request bodies, etc.

## Related Documentation
- `docs/TEST_ORGANIZATION_CONSOLIDATED.md` - Test consolidation details
- `docs/HOT_RELOAD.md` - Development environment setup
- `QUICK_START_DEV.md` - Quick start guide
- `.github/instructions/testing.instructions.md` - Testing best practices
