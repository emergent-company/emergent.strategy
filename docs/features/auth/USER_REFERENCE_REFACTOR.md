# User Reference Refactoring

**Date:** 2025-10-25  
**Status:** Migration Created - Pending Application  
**Migration:** `apps/server/src/migrations/20251025_refactor_user_references.sql`

## Problem Statement

The current database schema has inconsistent user references:
1. `core.user_profiles` uses `subject_id` (text) as primary key - this is Zitadel's user ID
2. Some tables reference users with `subject_id` (text) ✅
3. Some tables use `created_by` (uuid) ❌ - Cannot reference users!
4. No way to add future auth providers (Google, Auth0, etc.)

## Solution

### Phase 1: Database Schema Changes

1. **Add UUID primary key to user_profiles**
   - Add `id` (uuid) column
   - Rename `subject_id` → `zitadel_user_id`
   - Make `zitadel_user_id` unique but not PK
   - This allows future `google_user_id`, `auth0_user_id`, etc.

2. **Standardize all user references to UUID**
   - All tables reference `user_profiles(id)` with proper FK constraints
   - Consistent column naming:
     - `user_id` for general user references
     - `owner_id` for ownership
     - `created_by` for audit tracking

### Database Column Changes

| Table | Old Column | New Column | Type | Notes |
|-------|-----------|------------|------|-------|
| **core.user_profiles** | `subject_id` (PK) | `id` (PK) + `zitadel_user_id` (unique) | uuid + text | Core change |
| **kb.organization_memberships** | `subject_id` (text) | `user_id` (uuid) | FK to user_profiles(id) | ✅ |
| **kb.project_memberships** | `subject_id` (text) | `user_id` (uuid) | FK to user_profiles(id) | ✅ |
| **kb.notifications** | `subject_id` (text) + `user_id` (text) | `user_id` (uuid) | FK to user_profiles(id) | Consolidate 2 cols |
| **core.user_emails** | `subject_id` (text) | `user_id` (uuid) | FK to user_profiles(id) | ✅ |
| **kb.chat_conversations** | `owner_subject_id` (text) | `owner_id` (uuid) | FK to user_profiles(id) | ✅ Renamed |
| **kb.integrations** | `created_by` (text) | `created_by` (uuid) | FK to user_profiles(id) | ✅ Type change |
| **kb.audit_log** | `user_id` (text) | `user_id` (uuid) | FK to user_profiles(id) | ✅ Type change |
| **kb.object_extraction_jobs** | `created_by` (uuid) | `created_by` (uuid) | FK to user_profiles(id) | ✅ Add FK |
| **kb.project_object_type_registry** | `created_by` (uuid) | `created_by` (uuid) | FK to user_profiles(id) | ✅ Add FK |

### Phase 2: Code Changes Required

After applying the migration, the following code changes are needed:

#### 1. User Profile Service (`src/modules/user-profile/`)

```typescript
// OLD
interface UserProfile {
  subject_id: string;  // Zitadel ID
  // ...
}

// NEW
interface UserProfile {
  id: string;  // UUID - our internal ID
  zitadel_user_id: string;  // External auth provider ID
  // Future: google_user_id?: string;
  // ...
}
```

**Files to update:**
- `src/modules/user-profile/user-profile.service.ts`
- `src/modules/user-profile/dto/user-profile.dto.ts`
- All SQL queries: `SELECT subject_id` → `SELECT id, zitadel_user_id`

#### 2. Auth Module (`src/modules/auth/`)

**Token payload changes:**
```typescript
// OLD
interface JwtPayload {
  sub: string;  // Zitadel subject_id
}

// NEW
interface JwtPayload {
  sub: string;  // Zitadel subject_id
  userId: string;  // Our internal UUID
}
```

**Auth guard changes:**
- After Zitadel token validation, look up user by `zitadel_user_id`
- Attach `req.user` with internal `id` (uuid)

**Files to update:**
- `src/modules/auth/auth.guard.ts`
- `src/modules/auth/jwt.strategy.ts` (if exists)
- All middleware that sets user context

#### 3. Organization & Project Memberships

```typescript
// OLD
organizationMemberships.subject_id = jwtPayload.sub;

// NEW
organizationMemberships.user_id = req.user.id;  // UUID from auth
```

**Files to update:**
- `src/modules/organizations/organization-membership.service.ts`
- `src/modules/projects/project-membership.service.ts`

#### 4. Chat Conversations

```typescript
// OLD
chat_conversations.owner_subject_id = user.subject_id;

// NEW
chat_conversations.owner_id = user.id;
```

**Files to update:**
- `src/modules/chat/chat.service.ts`
- `src/modules/chat/dto/chat-conversation.dto.ts`

#### 5. Integrations

```typescript
// OLD
integrations.created_by = user.subject_id;  // text

// NEW
integrations.created_by = user.id;  // uuid
```

**Files to update:**
- `src/modules/integrations/integrations.service.ts`

#### 6. Extraction Jobs & Type Registry

These already have `created_by` as uuid, they just need FK constraints:

```typescript
// Already correct in code, migration adds FK
extraction_jobs.created_by = user.id;  // uuid
type_registry.created_by = user.id;  // uuid
```

**Files to update:**
- Verify existing code uses `user.id` not `user.subject_id`

#### 7. Audit Log

```typescript
// OLD
audit_log.user_id = user.subject_id;  // text

// NEW
audit_log.user_id = user.id;  // uuid
```

**Files to update:**
- `src/modules/audit/audit.service.ts` (if exists)

### Phase 3: Test Updates

All E2E tests that reference user fields need updates:

**Test context changes:**
```typescript
// OLD
ctx.userId = 'zitadel-subject-123';  // text

// NEW
ctx.userId = '550e8400-e29b-41d4-a716-446655440000';  // uuid
ctx.zitadelUserId = 'zitadel-subject-123';  // External ID
```

**Test files to update:**
- `tests/e2e/e2e-context.ts` - Core context setup
- `tests/e2e/auth-helpers.ts` - Token generation
- All test files that check user relationships

### Phase 4: Migration Execution Plan

1. **Backup database** (critical!)
2. **Run migration** via `tsx scripts/run-migrations.ts`
3. **Verify data integrity**:
   ```sql
   -- Check all users have UUID ids
   SELECT COUNT(*) FROM core.user_profiles WHERE id IS NULL;
   
   -- Check FK relationships
   SELECT COUNT(*) FROM kb.organization_memberships om
   LEFT JOIN core.user_profiles up ON om.user_id = up.id
   WHERE up.id IS NULL;
   ```
4. **Deploy code changes** (backwards compatible)
5. **Monitor logs** for any `subject_id` references

### Rollback Plan

If issues occur:
1. Stop application
2. Restore database backup
3. Revert code changes
4. Investigate issue
5. Fix migration
6. Retry

### Future Enhancements

After this refactor, we can easily add:

```sql
ALTER TABLE core.user_profiles 
ADD COLUMN google_user_id TEXT UNIQUE,
ADD COLUMN auth0_user_id TEXT UNIQUE;

CREATE INDEX idx_user_profiles_google_user_id 
ON core.user_profiles(google_user_id) 
WHERE google_user_id IS NOT NULL;
```

This allows users to authenticate via multiple providers!

## Benefits

1. ✅ **Type Safety**: UUID references prevent type mismatches
2. ✅ **Data Integrity**: Foreign keys enforce referential integrity
3. ✅ **Future-Proof**: Easy to add new auth providers
4. ✅ **Consistency**: All user references follow same pattern
5. ✅ **Performance**: Proper indexes on UUID columns
6. ✅ **Clarity**: `zitadel_user_id` name makes purpose obvious

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Data loss during migration | Full backup before running |
| Orphaned records | Migration makes `created_by` nullable |
| Auth token issues | Auth guard updated to handle both old/new |
| Test failures | Comprehensive test updates |
| Downtime | Migration runs in transaction (all-or-nothing) |

## Status Tracking

- [x] Migration SQL created
- [ ] Migration tested on development database
- [ ] Code changes implemented
- [ ] Tests updated
- [ ] Code review completed
- [ ] Applied to staging environment
- [ ] Verified in staging
- [ ] Applied to production
- [ ] Monitoring confirms success

## Related Files

- **Migration:** `apps/server/src/migrations/20251025_refactor_user_references.sql`
- **This Document:** `docs/USER_REFERENCE_REFACTOR.md`
- **Test SQL Fixes:** See `docs/TEST_FIX_SESSION_4_FINAL.md` for org_id fixes

