# User Reference Refactor - Implementation Status

**Migration Applied:** ✅ 2025-10-25 00:16
**Database Backup:** ✅ `backup_before_user_refactor_20251025_001648.sql` (1.7MB)

## ✅ Migration Results

### Database Changes Applied
- **core.user_profiles:**
  - ✅ Added `id` (uuid) as new primary key
  - ✅ Renamed `subject_id` → `zitadel_user_id`
  - ✅ Created unique constraint on `zitadel_user_id`
  - ✅ All 79 users have both `id` and `zitadel_user_id`

### Tables Updated (9 total)
| Table | Old Column | New Column | Records | Status |
|-------|-----------|------------|---------|--------|
| kb.organization_memberships | subject_id (text) | user_id (uuid) | 7/7 | ✅ Migrated |
| kb.project_memberships | subject_id (text) | user_id (uuid) | 7/7 | ✅ Migrated |
| kb.notifications | subject_id + user_id (text) | user_id (uuid) | - | ✅ Consolidated |
| core.user_emails | subject_id (text) | user_id (uuid) | - | ✅ Migrated |
| kb.chat_conversations | owner_subject_id (text) | owner_id (uuid) | 0/0 | ✅ Migrated |
| kb.integrations | created_by (text) | created_by (uuid) | - | ✅ Type changed |
| kb.audit_log | user_id (text) | user_id (uuid) | - | ✅ Type changed |
| kb.object_extraction_jobs | created_by (uuid) | created_by (uuid) | - | ✅ FK added |
| kb.project_object_type_registry | created_by (uuid) | created_by (uuid) | - | ✅ FK added |

## ✅ Code Updates Completed

### 1. User Profile Module
- ✅ `dto/profile.dto.ts` - Added `id` and `zitadelUserId` fields
- ✅ `user-profile.service.ts` - Updated all SQL queries:
  - ✅ `get()` - Uses `zitadel_user_id` for lookup
  - ✅ `getById()` - NEW method for UUID lookup
  - ✅ `upsertBase()` - Uses `zitadel_user_id`
  - ✅ `update()` - Uses `zitadel_user_id` in WHERE clause
  - ✅ `listAlternativeEmails()` - Uses `user_id` FK
  - ✅ `addAlternativeEmail()` - Uses `user_id` FK
  - ✅ `deleteAlternativeEmail()` - Uses `user_id` FK

### 2. Build Status
- ✅ TypeScript compilation successful
- ✅ No lint errors

## ⏳ Code Updates Still Needed

### High Priority (App Won't Work Without These)

#### 1. Auth Module ⚠️ CRITICAL
**File:** `src/modules/auth/*.ts`
**Status:** ❌ Not Updated Yet
**Issue:** Auth guard needs to:
1. Accept Zitadel token with `sub` (zitadel_user_id)
2. Look up user by `zitadel_user_id` 
3. Attach `req.user` with internal UUID `id`
4. All downstream code expects `req.user.id` (UUID)

**Impact:** Auth will break! Tests will fail with user not found errors.

**Files to check:**
- `src/modules/auth/auth.guard.ts`
- `src/modules/auth/jwt.strategy.ts` (if exists)
- Any middleware that sets `req.user`

#### 2. Organization Memberships ⚠️
**Files:** `src/modules/organizations/*.service.ts`
**Status:** ❌ Not Updated Yet
**Changes needed:**
- All queries with `subject_id` → `user_id`
- All inserts use `user_id` (UUID) from `req.user.id`

#### 3. Project Memberships ⚠️
**Files:** `src/modules/projects/*.service.ts`
**Status:** ❌ Not Updated Yet
**Changes needed:**
- All queries with `subject_id` → `user_id`
- All inserts use `user_id` (UUID) from `req.user.id`

### Medium Priority (May Work But Unsafe)

#### 4. Chat Service
**Files:** `src/modules/chat/*.service.ts`
**Changes:** `owner_subject_id` → `owner_id`

#### 5. Integrations Service
**Files:** `src/modules/integrations/*.service.ts`
**Changes:** `created_by` now uses UUID `req.user.id`

#### 6. Audit Log Service  
**Files:** `src/modules/audit/*.service.ts`
**Changes:** `user_id` now uses UUID `req.user.id`

### Low Priority (Already UUID, Just Need FK Handling)

#### 7. Extraction Jobs
**Status:** ✅ Schema correct (UUID `created_by`)
**Action:** Verify code uses `req.user.id` (UUID)

#### 8. Type Registry
**Status:** ✅ Schema correct (UUID `created_by`)
**Action:** Verify code uses `req.user.id` (UUID)

## ⏳ Test Updates Needed

### E2E Test Context
**File:** `tests/e2e/e2e-context.ts`
**Changes needed:**
```typescript
// OLD
ctx.userId = zitadelSubjectId;  // text

// NEW  
ctx.userId = userUuid;  // uuid from user_profiles.id
ctx.zitadelUserId = zitadelSubjectId;  // text - external auth ID
```

### Auth Helpers
**File:** `tests/e2e/auth-helpers.ts`
**Changes:** Token generation must include both IDs

### All E2E Tests
Need review - any test checking user relationships

## Next Steps (Priority Order)

1. **⚠️ URGENT: Fix Auth Module**
   - Without this, NOTHING will work
   - Auth guard must map zitadel_user_id → internal UUID id

2. **Update Organization/Project Membership Services**
   - These are heavily used, will break many operations

3. **Run E2E Tests to Find Other Issues**
   - Tests will reveal which services still need updates
   - Fix as errors appear

4. **Update Remaining Services**
   - Chat, Integrations, Audit Log
   - Less critical, may work temporarily

5. **Update All Tests**
   - Fix E2E context and helpers
   - Update test assertions

## Commands to Check Status

```bash
# Check for remaining subject_id references in code
grep -r "subject_id" apps/server/src/ --include="*.ts" | grep -v "zitadel_user_id" | wc -l

# Check for owner_subject_id references
grep -r "owner_subject_id" apps/server/src/ --include="*.ts" | wc -l

# Run tests to see what breaks
cd apps/server && npm run test:e2e 2>&1 | grep "FAIL" | wc -l
```

## Rollback Plan (If Needed)

```bash
# Stop application
npm run workspace:stop

# Restore database
cat backup_before_user_refactor_20251025_001648.sql | docker exec -i spec-server-2-db-1 psql -U spec spec

# Revert code changes
git checkout apps/server/src/modules/user-profile/

# Restart
npm run workspace:start
```

## Success Criteria

- [ ] All E2E tests passing
- [ ] Auth working with Zitadel tokens
- [ ] User profiles returned with correct UUID ids
- [ ] All memberships using user_id (UUID)
- [ ] No `subject_id` references in non-user-profile code
- [ ] No `owner_subject_id` references anywhere
- [ ] All foreign keys working correctly

