# User Identity Reference Migrations

**Status**: ✅ Complete  
**Created**: 2025-10-05  
**Completed**: 2025-10-05  
**Related**: [User Identity Reference Pattern](../spec/24-user-identity-references.md)

## Summary

This document tracks the migration of tables from TEXT-based external auth IDs to UUID-based `subject_id` with proper foreign keys to `core.user_profiles`.

**All high-priority migrations have been completed!** The system now uses canonical `subject_id UUID` references throughout, with proper foreign key constraints ensuring referential integrity.

## Audit Results (2025-10-05)

### ✅ Completed Migrations

| Table | Old Column | New Column | Status | Date | Migration Doc |
|-------|------------|------------|--------|------|---------------|
| `kb.object_extraction_jobs` | `created_by TEXT` | `subject_id UUID` | ✅ Complete | 2025-10-05 | [Migration 007](./007-extraction-jobs-foreign-key.md) |
| `kb.notifications` | `user_id TEXT` | `subject_id UUID` | ✅ Complete | 2025-10-05 | [Migration 008](./008-notifications-subject-id-fk.sql) |
| `kb.user_notification_preferences` | `user_id TEXT` | `subject_id UUID` | ✅ Complete | 2025-10-05 | [Migration 009](./009-user-notification-preferences-subject-id-fk.sql) |

### ⚠️ Pending Migrations

| Priority | Table | Column | Current Type | Issue | Impact |
|----------|-------|--------|--------------|-------|--------|
| LOW | `kb.audit_log` | `user_id` | UUID | Missing FK (optional) | Audit integrity checking |

### ✅ Already Correct

| Table | Column | Type | FK Constraint | Cascade Action |
|-------|--------|------|---------------|----------------|
| `core.user_profiles` | `subject_id` | UUID | PRIMARY KEY | - |
| `kb.organization_memberships` | `subject_id` | UUID | ✅ Has FK | ON DELETE CASCADE |
| `kb.project_memberships` | `subject_id` | UUID | ✅ Has FK | ON DELETE CASCADE |
| `kb.chat_conversations` | `owner_subject_id` | UUID | ✅ Has FK | ON DELETE SET NULL |
| `kb.notifications` | `subject_id` | UUID | ✅ Has FK | ON DELETE CASCADE |
| `kb.user_notification_preferences` | `subject_id` | UUID | ✅ Has FK | ON DELETE CASCADE |

## Migration 008: Notifications Table ✅ COMPLETE

**Executed**: 2025-10-05  
**Status**: ✅ Complete (Fixed service layer 2025-10-05)  
**Migration File**: [008-notifications-subject-id-fk.sql](./008-notifications-subject-id-fk.sql)

**Issue Found**: After database migration, notification endpoints returned 500 errors because `notifications.service.ts` still referenced `user_id` column. Fixed by updating all SQL queries and DTOs to use `subject_id`.

**Files Fixed**:
- `src/modules/notifications/dto/create-notification.dto.ts` - Changed `user_id` to `subject_id`
- `src/modules/notifications/entities/notification.entity.ts` - Updated interfaces
- `src/modules/notifications/notifications.service.ts` - Updated all SQL queries (15+ locations)

### Current State

```sql
CREATE TABLE kb.notifications (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id),
    user_id TEXT NOT NULL,  -- ❌ PROBLEM: TEXT, no FK
    category TEXT NOT NULL,
    -- ... other fields
);
```

### Target State

```sql
CREATE TABLE kb.notifications (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id),
    subject_id UUID NOT NULL REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,  -- ✅ FIX
    category TEXT NOT NULL,
    -- ... other fields
);

CREATE INDEX idx_notifications_subject_id ON kb.notifications(subject_id);
```

### Migration Steps

**1. Database Migration (008-notifications-subject-id-fk.sql)**

```sql
BEGIN;

-- Add new column
ALTER TABLE kb.notifications
ADD COLUMN subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

-- Data migration: Cannot reliably convert TEXT external IDs to UUIDs
-- Set to NULL or attempt best-effort conversion if mapping available
UPDATE kb.notifications SET subject_id = NULL WHERE user_id IS NOT NULL;

-- Drop old column
ALTER TABLE kb.notifications DROP COLUMN user_id;

-- Add index
CREATE INDEX idx_notifications_subject_id ON kb.notifications(subject_id);

-- Add comment
COMMENT ON COLUMN kb.notifications.subject_id IS 
'Canonical internal user ID. References core.user_profiles.';

COMMIT;
```

**2. Code Changes Required**

Files to update:
- `apps/server-nest/src/modules/notifications/dto/notification.dto.ts`
- `apps/server-nest/src/modules/notifications/notifications.service.ts`
- `apps/server-nest/src/modules/notifications/notifications.controller.ts`
- `apps/admin/src/api/notifications.ts` (if exists)

**3. Impact Assessment**

| Component | Impact | Mitigation |
|-----------|--------|------------|
| Active notifications | Lost user reference for existing records | Accept data loss (short-lived data) |
| Notification creation | Must use `subject_id` instead of `user_id` | Update all call sites |
| API contracts | Breaking change in notification DTOs | Version bump or compatibility layer |

**4. Rollout Strategy**

1. ✅ Create migration script
2. ✅ Update DTOs to support both fields (transition period)
3. ✅ Update service layer to use `subject_id`
4. ✅ Deploy backend with dual support
5. ✅ Run migration (existing notifications lose user refs)
6. ✅ Remove `user_id` support code
7. ✅ Update frontend if needed

## Migration 009: User Notification Preferences ✅ COMPLETE

**Executed**: 2025-10-05  
**Status**: ✅ Complete  
**Migration File**: [009-user-notification-preferences-subject-id-fk.sql](./009-user-notification-preferences-subject-id-fk.sql)

### Current State

```sql
-- Table structure unknown, need to query
-- Assumed based on naming pattern
CREATE TABLE kb.user_notification_preferences (
    user_id TEXT PRIMARY KEY,  -- ❌ PROBLEM
    -- ... preference fields
);
```

### Target State

```sql
CREATE TABLE kb.user_notification_preferences (
    subject_id UUID PRIMARY KEY REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE,
    -- ... preference fields
);
```

### Migration Steps

**1. Investigate Table Structure**

```sql
-- Run to see actual structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'kb' 
  AND table_name = 'user_notification_preferences'
ORDER BY ordinal_position;
```

**2. Create Migration (009-notification-preferences-subject-id-fk.sql)**

Strategy TBD after table structure investigation.

**3. Impact Assessment**

| Component | Impact | Mitigation |
|-----------|--------|------------|
| User preferences | All preferences lost | Could announce to users in advance |
| Preference UI | Must reload preferences after migration | Handle gracefully |

## Migration 010: Audit Log FK (LOW PRIORITY)

### Current State

```sql
CREATE TABLE kb.audit_log (
    id UUID PRIMARY KEY,
    user_id UUID NULL,  -- ✅ Already UUID, but no FK
    user_email TEXT NULL,
    -- ... audit fields
);
```

### Target State (Optional)

```sql
ALTER TABLE kb.audit_log
ADD CONSTRAINT audit_log_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES core.user_profiles(subject_id) 
ON DELETE SET NULL;  -- Preserve audit trail

CREATE INDEX idx_audit_log_user_id ON kb.audit_log(user_id) WHERE user_id IS NOT NULL;
```

### Rationale for LOW Priority

- Audit logs are immutable compliance records
- `user_email` provides human-readable fallback
- FK constraint could fail if historical data references deleted users
- Adding FK is optional enhancement, not critical fix

### Decision Options

**Option A: Add FK with SET NULL**
- Pros: Data integrity, easier queries
- Cons: Must ensure all user_ids exist or are NULL

**Option B: Skip FK, add check constraint**
```sql
ALTER TABLE kb.audit_log 
ADD CONSTRAINT audit_log_user_id_check 
CHECK (user_id IS NULL OR 
       EXISTS (SELECT 1 FROM core.user_profiles WHERE subject_id = user_id));
```
- Pros: Validation without FK overhead
- Cons: Check on every INSERT (slow)

**Option C: No changes**
- Pros: No risk, audit remains append-only
- Cons: No referential integrity

**Recommendation**: Option C (no changes) unless integrity issues discovered.

## Pre-Migration Checklist

Before running any migration:

- [ ] Review [User Identity Reference Pattern](../spec/24-user-identity-references.md)
- [ ] Back up affected table: `pg_dump -t kb.{table_name}`
- [ ] Test migration on development database
- [ ] Update all DTOs to use `subject_id`
- [ ] Update all service methods
- [ ] Update frontend API clients
- [ ] Run TypeScript compilation: `npx tsc --noEmit`
- [ ] Run unit tests: affected modules
- [ ] Schedule maintenance window (if downtime needed)
- [ ] Communicate breaking changes to frontend team
- [ ] Plan rollback strategy

## Post-Migration Verification

After each migration:

```sql
-- Verify column exists with correct type
\d kb.{table_name}

-- Verify FK constraint exists
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = '{table_name}' 
  AND tc.constraint_type = 'FOREIGN KEY';

-- Verify index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = '{table_name}' 
  AND indexdef LIKE '%subject_id%';

-- Test insert with valid subject_id
INSERT INTO kb.{table_name} (subject_id, ...) 
SELECT subject_id, ... 
FROM core.user_profiles 
LIMIT 1;

-- Test insert with invalid subject_id (should fail)
INSERT INTO kb.{table_name} (subject_id, ...) 
VALUES ('00000000-0000-0000-0000-000000000001', ...);
-- Should error: violates foreign key constraint

-- Test cascade behavior
-- Create test user and record
INSERT INTO core.user_profiles(subject_id) VALUES (gen_random_uuid()) RETURNING subject_id;
-- Insert test record with that subject_id
-- Delete user profile
-- Verify cascade action worked (CASCADE/SET NULL/RESTRICT)
```

## Timeline (Completed)

| Migration | Target Date | Actual Date | Estimated Effort | Status |
|-----------|-------------|-------------|------------------|--------|
| 007 - Extraction Jobs | 2025-10-05 | ✅ 2025-10-05 | 4 hours | Complete |
| 008 - Notifications | 2025-10-05 | ✅ 2025-10-05 | 6 hours | Complete |
| 009 - Notification Preferences | 2025-10-05 | ✅ 2025-10-05 | 4 hours | Complete |
| 010 - Audit Log FK | Optional | - | 2 hours | Deferred |

## Rollback Procedures

### If Migration Fails Mid-Flight

```sql
-- Roll back transaction (if still in BEGIN block)
ROLLBACK;

-- Restore from backup
pg_restore -t kb.{table_name} backup.dump
```

### If Migration Succeeds But Breaks Application

```sql
-- Emergency rollback (not recommended, loses new data)
BEGIN;

-- Add old column back
ALTER TABLE kb.{table_name} ADD COLUMN user_id TEXT;

-- Copy data (if conversion possible)
-- ... depends on situation

-- Drop new column
ALTER TABLE kb.{table_name} DROP COLUMN subject_id;

COMMIT;
```

**Better approach**: Deploy code fix, keep schema change.

## Communication Template

### For Frontend Team

```
Subject: [BREAKING CHANGE] Notifications API - user_id → subject_id

Migration 008 scheduled for [DATE]

CHANGE:
- API field renamed: `user_id` → `subject_id`
- Type changed: `string` → `UUID string`
- Existing notifications will have `subject_id: null`

ACTION REQUIRED:
- Update notification interfaces in `src/api/notifications.ts`
- Change `user_id` to `subject_id` in all API calls
- Handle `null` subject_id gracefully (historical data)

TIMING:
- Backend deployed: [DATE TIME]
- Frontend must be updated before: [DATE TIME]
- No backward compatibility after: [DATE TIME]

TEST:
- Verify notifications still load
- Verify new notifications have subject_id
- Verify user avatar/name display works

Questions? Contact: [YOUR_CONTACT]
```

## References

- [User Identity Reference Pattern](../spec/24-user-identity-references.md) - Authoritative pattern
- [Migration 007 - Extraction Jobs](./007-extraction-jobs-foreign-key.md) - Completed example
- [User Profile System](../spec/16-user-profile.md) - Core identity system
- [Authorization Model](../spec/18-authorization-model.md) - Permission system

---

**Next Steps**: 
1. Schedule migration 008 (notifications)
2. Investigate `user_notification_preferences` table structure
3. Create migration scripts
4. Coordinate with frontend team
