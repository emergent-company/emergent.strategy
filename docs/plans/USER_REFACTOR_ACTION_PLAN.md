# CRITICAL: User Reference Refactor - Action Plan

## ⚠️ WARNING: BREAKING CHANGE

This migration will **BREAK ALL EXISTING CODE** until corresponding code changes are made.

**DO NOT RUN THIS MIGRATION** until you're ready to update all the code immediately after.

## Current Situation

We discovered that:
1. `core.user_profiles` uses `subject_id` (text, Zitadel ID) as primary key
2. Some tables have `created_by` (uuid) that CANNOT reference users (type mismatch!)
3. Inconsistent naming: `subject_id`, `owner_subject_id`, `created_by`, `user_id`

## The Fix

**Migration:** `20251025_refactor_user_references.sql`
- Add UUID `id` column to `user_profiles` 
- Rename `subject_id` → `zitadel_user_id`
- Update all 9 tables to reference `user_profiles(id)` consistently
- Add proper foreign key constraints

## Before Running Migration

### 1. Complete Test Fixes First ✅ Priority
We were in the middle of fixing E2E tests (21/68 failing). We should:
1. Finish the current `org_id` → `organization_id` test fixes
2. Get test suite to 100% passing
3. THEN tackle this larger refactor

### 2. Create Feature Branch
```bash
git checkout -b feature/user-reference-refactor
git add docs/USER_REFERENCE_REFACTOR.md
git add apps/server/src/migrations/20251025_refactor_user_references.sql
git commit -m "docs: add user reference refactor plan"
```

### 3. Backup Database
```bash
# Backup entire database
docker exec spec-server-2-db-1 pg_dump -U spec spec > backup_before_user_refactor_$(date +%Y%m%d_%H%M%S).sql
```

## After Migration - Required Code Changes

See `docs/USER_REFERENCE_REFACTOR.md` for full details. Summary:

### High Priority (Will Break Immediately)
1. **Auth Module** - JWT payload must include both `zitadel_user_id` and `id`
2. **User Profile Service** - All queries need column name updates
3. **Organization/Project Memberships** - `subject_id` → `user_id`

### Medium Priority (May Work But Unsafe)
4. **Chat Service** - `owner_subject_id` → `owner_id`
5. **Integrations** - `created_by` type change
6. **Audit Log** - `user_id` type change

### Low Priority (Already UUID)
7. **Extraction Jobs** - Just add FK (already uuid)
8. **Type Registry** - Just add FK (already uuid)

## Execution Plan

### Phase 1: Finish Current Test Fixes (DO THIS FIRST)
```bash
# We were working on phase1.workflows test failures
# Complete those fixes before starting this refactor
npm run test:e2e -- tests/e2e/phase1.workflows.e2e.spec.ts
```

### Phase 2: User Refactor (After Tests Pass)
```bash
# 1. Create feature branch
git checkout -b feature/user-reference-refactor

# 2. Backup database  
docker exec spec-server-2-db-1 pg_dump -U spec spec > backup.sql

# 3. Run migration
npx tsx scripts/run-migrations.ts

# 4. Update code (see USER_REFERENCE_REFACTOR.md)
# 5. Update tests
# 6. Verify everything works
# 7. Create PR
```

## Decision Point

**What should we do NOW?**

### Option A: Continue Test Fixes (RECOMMENDED)
- Finish fixing the 21 failing E2E tests
- Get to 100% test passing
- Commit that work
- THEN start user refactor in new PR

### Option B: Start User Refactor Now
- Run migration immediately
- Fix all breaking code
- Fix all tests
- Higher risk, longer session

## Recommendation: Option A

**Reason:** The user asked about `owner_subject_id` and `organization_id` relationships while we were debugging test failures. This revealed the larger architectural issue, but we should finish the current task first.

**Next Steps:**
1. Document this refactor (✅ DONE)
2. Go back to fixing `phase1.workflows` test failures
3. Get all 68 tests passing
4. Commit that work
5. Start new session for user refactor

## Files Created

- ✅ Migration: `apps/server/src/migrations/20251025_refactor_user_references.sql`
- ✅ Documentation: `docs/USER_REFERENCE_REFACTOR.md`
- ✅ This file: `docs/USER_REFACTOR_ACTION_PLAN.md`

## To Resume Test Fixes

We were investigating why `getJobStatistics()` was returning 500. We discovered:
- Schema detection is correct (`organization_id`)
- But `discovered_types` column is JSONB, not array
- SQL uses `unnest()` and `array_length()` on JSONB (wrong!)

**Next:** Fix the statistics query to handle JSONB `discovered_types` column.

