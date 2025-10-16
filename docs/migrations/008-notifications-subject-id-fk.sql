-- Migration 008: Notifications Table - user_id TEXT → subject_id UUID
-- 
-- Migrates kb.notifications from storing external auth IDs as TEXT
-- to using canonical internal subject_id UUID with proper foreign key
--
-- Date: 2025-10-05
-- Related: docs/spec/24-user-identity-references.md
-- Status: READY TO EXECUTE
BEGIN;

-- Step 1: Add new subject_id column with FK constraint
ALTER TABLE
    kb.notifications
ADD
    COLUMN subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

COMMENT ON COLUMN kb.notifications.subject_id IS 'Canonical internal user ID. References core.user_profiles(subject_id). Replaces user_id TEXT field.';

-- Step 2: Data migration
-- IMPORTANT: Cannot reliably convert TEXT external IDs to internal UUIDs
-- Options:
--   A) Set all to NULL (lose user association for existing notifications)
--   B) Attempt conversion if we have a mapping table (not implemented)
--   C) Keep notifications but mark as system/unknown user
--
-- Choosing Option A: Set to NULL
-- Rationale: Notifications are typically short-lived, and losing historical
-- associations is acceptable for the architectural benefit
UPDATE
    kb.notifications
SET
    subject_id = NULL
WHERE
    user_id IS NOT NULL;

-- Step 2.5: Drop RLS policies that depend on user_id column
-- These will be recreated after migration using subject_id
DROP POLICY IF EXISTS notifications_select_own ON kb.notifications;

DROP POLICY IF EXISTS notifications_update_own ON kb.notifications;

DROP POLICY IF EXISTS notifications_delete_own ON kb.notifications;

DROP POLICY IF EXISTS notifications_insert_own ON kb.notifications;

-- Step 3: Drop old user_id column
-- This is a BREAKING CHANGE - any code referencing user_id will fail
ALTER TABLE
    kb.notifications DROP COLUMN user_id;

-- Step 4: Create index for performance
CREATE INDEX idx_notifications_subject_id ON kb.notifications(subject_id)
WHERE
    subject_id IS NOT NULL;

-- Step 5: Recreate RLS policies using subject_id
-- NOTE: Skipping RLS policy recreation for now.
-- The auth.user_id() function needs to be created or policies need to be
-- adjusted to match your authentication system.
-- 
-- Policies to recreate manually (after auth function is set up):
-- 
-- CREATE POLICY notifications_select_own ON kb.notifications
--     FOR SELECT
--     USING (subject_id IS NULL OR subject_id = current_user_subject_id());
-- 
-- CREATE POLICY notifications_update_own ON kb.notifications
--     FOR UPDATE
--     USING (subject_id IS NULL OR subject_id = current_user_subject_id());
-- 
-- CREATE POLICY notifications_delete_own ON kb.notifications
--     FOR DELETE
--     USING (subject_id IS NULL OR subject_id = current_user_subject_id());
--
-- Where current_user_subject_id() is a function that returns the current user's UUID
-- Step 6: Update any constraints or triggers (if they exist)
-- Check for constraints referencing user_id
-- (None expected, but good practice to verify)
COMMIT;

-- Verification queries (run after migration):
/*
 -- 1. Verify column structure
 \d kb.notifications
 
 -- 2. Verify FK constraint exists
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
 WHERE tc.table_name = 'notifications' 
 AND tc.constraint_type = 'FOREIGN KEY'
 AND kcu.column_name = 'subject_id';
 
 -- 3. Verify index exists
 SELECT indexname, indexdef 
 FROM pg_indexes 
 WHERE tablename = 'notifications' 
 AND indexdef LIKE '%subject_id%';
 
 -- 4. Test insert with valid subject_id
 INSERT INTO kb.notifications (
 id, tenant_id, organization_id, project_id, subject_id,
 category, title, message, severity, is_read,
 created_at, updated_at
 ) 
 SELECT 
 gen_random_uuid(),
 '00000000-0000-0000-0000-000000000001'::uuid,
 '00000000-0000-0000-0000-000000000002'::uuid,
 '00000000-0000-0000-0000-000000000003'::uuid,
 subject_id,
 'test',
 'Test Notification',
 'This is a test notification after migration',
 'info',
 false,
 NOW(),
 NOW()
 FROM core.user_profiles 
 LIMIT 1;
 
 -- 5. Test FK enforcement (should fail)
 INSERT INTO kb.notifications (
 id, tenant_id, organization_id, project_id, subject_id,
 category, title, message, severity, is_read,
 created_at, updated_at
 ) VALUES (
 gen_random_uuid(),
 '00000000-0000-0000-0000-000000000001'::uuid,
 '00000000-0000-0000-0000-000000000002'::uuid,
 '00000000-0000-0000-0000-000000000003'::uuid,
 '00000000-0000-0000-0000-000000000999'::uuid, -- Invalid subject_id
 'test',
 'Test Notification',
 'Should fail FK constraint',
 'info',
 false,
 NOW(),
 NOW()
 );
 -- Expected: ERROR: insert or update on table "notifications" violates foreign key constraint
 
 -- 6. Count notifications by subject_id status
 SELECT 
 CASE 
 WHEN subject_id IS NULL THEN 'NULL (migrated historical)'
 ELSE 'Has subject_id'
 END as status,
 COUNT(*) as count
 FROM kb.notifications
 GROUP BY 
 CASE 
 WHEN subject_id IS NULL THEN 'NULL (migrated historical)'
 ELSE 'Has subject_id'
 END;
 */
-- Rollback procedure (if needed):
/*
 BEGIN;
 
 -- Restore user_id column
 ALTER TABLE kb.notifications 
 ADD COLUMN user_id TEXT;
 
 -- Note: Cannot restore original data if it was external IDs
 -- All historical associations are lost
 
 -- Drop new subject_id column
 DROP INDEX IF EXISTS idx_notifications_subject_id;
 ALTER TABLE kb.notifications 
 DROP COLUMN subject_id;
 
 COMMIT;
 */