-- Migration 009: User Notification Preferences - user_id TEXT → subject_id UUID
-- 
-- Migrates kb.user_notification_preferences from storing external auth IDs as TEXT
-- to using canonical internal subject_id UUID with proper foreign key
--
-- Date: 2025-10-05
-- Related: docs/spec/24-user-identity-references.md
-- Status: READY TO EXECUTE
BEGIN;

-- Step 1: Add new subject_id column with FK constraint
ALTER TABLE
    kb.user_notification_preferences
ADD
    COLUMN subject_id UUID REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

COMMENT ON COLUMN kb.user_notification_preferences.subject_id IS 'Canonical internal user ID. References core.user_profiles(subject_id). Replaces user_id TEXT field.';

-- Step 2: Data migration
-- IMPORTANT: Cannot reliably convert TEXT external IDs to internal UUIDs
-- Options:
--   A) Drop all preferences (users will get defaults on next login)
--   B) Attempt conversion if we have a mapping table (not implemented)
--
-- Choosing Option A: Set to NULL, will delete rows with NULL subject_id
-- Rationale: Preferences can be regenerated, and it's better to start fresh
-- than to have orphaned preferences with invalid user references
UPDATE
    kb.user_notification_preferences
SET
    subject_id = NULL
WHERE
    user_id IS NOT NULL;

-- Step 3: Drop old user_id column
-- This is a BREAKING CHANGE - any code referencing user_id will fail
ALTER TABLE
    kb.user_notification_preferences DROP COLUMN user_id;

-- Step 4: Make subject_id NOT NULL (all current rows will have NULL, so they'll be deleted)
-- First, remove rows with NULL subject_id
DELETE FROM
    kb.user_notification_preferences
WHERE
    subject_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE
    kb.user_notification_preferences
ALTER COLUMN
    subject_id
SET
    NOT NULL;

-- Step 5: Add unique constraint on subject_id + category
-- (This ensures one preference per user per category)
CREATE UNIQUE INDEX idx_user_notification_preferences_unique ON kb.user_notification_preferences(subject_id, category);

-- Step 6: Create index for performance
CREATE INDEX idx_user_notification_preferences_subject_id ON kb.user_notification_preferences(subject_id);

COMMIT;

-- Verification queries (run after migration):
/*
 -- 1. Verify column structure
 \d kb.user_notification_preferences
 
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
 WHERE tc.table_name = 'user_notification_preferences' 
 AND tc.constraint_type = 'FOREIGN KEY'
 AND kcu.column_name = 'subject_id';
 
 -- 3. Verify indexes exist
 SELECT indexname, indexdef 
 FROM pg_indexes 
 WHERE tablename = 'user_notification_preferences' 
 AND indexdef LIKE '%subject_id%';
 
 -- 4. Verify unique constraint
 SELECT indexname, indexdef 
 FROM pg_indexes 
 WHERE tablename = 'user_notification_preferences' 
 AND indexname = 'idx_user_notification_preferences_unique';
 
 -- 5. Test insert with valid subject_id
 INSERT INTO kb.user_notification_preferences (
 id, subject_id, category,
 in_app_enabled, email_enabled,
 created_at, updated_at
 ) 
 SELECT 
 gen_random_uuid(),
 subject_id,
 'test_category',
 true,
 false,
 NOW(),
 NOW()
 FROM core.user_profiles 
 LIMIT 1;
 
 -- 6. Test FK enforcement (should fail)
 INSERT INTO kb.user_notification_preferences (
 id, subject_id, category,
 in_app_enabled, email_enabled,
 created_at, updated_at
 ) VALUES (
 gen_random_uuid(),
 '00000000-0000-0000-0000-000000000999'::uuid, -- Invalid subject_id
 'test_category',
 true,
 false,
 NOW(),
 NOW()
 );
 -- Expected: ERROR: insert or update on table "user_notification_preferences" violates foreign key constraint
 
 -- 7. Test unique constraint (should fail on duplicate)
 INSERT INTO kb.user_notification_preferences (
 id, subject_id, category,
 in_app_enabled, email_enabled,
 created_at, updated_at
 ) 
 SELECT 
 gen_random_uuid(),
 subject_id,
 'test_category', -- Same category as above
 true,
 false,
 NOW(),
 NOW()
 FROM core.user_profiles 
 LIMIT 1;
 -- Expected: ERROR: duplicate key value violates unique constraint
 
 -- 8. Count preferences
 SELECT COUNT(*) as total_preferences
 FROM kb.user_notification_preferences;
 */
-- Rollback procedure (if needed):
/*
 BEGIN;
 
 -- Restore user_id column
 ALTER TABLE kb.user_notification_preferences 
 ADD COLUMN user_id TEXT NOT NULL DEFAULT 'unknown';
 
 -- Note: Cannot restore original data if it was external IDs
 -- All historical preferences are lost
 
 -- Drop constraints and indexes
 DROP INDEX IF EXISTS idx_user_notification_preferences_unique;
 DROP INDEX IF EXISTS idx_user_notification_preferences_subject_id;
 
 -- Drop new subject_id column
 ALTER TABLE kb.user_notification_preferences 
 DROP COLUMN subject_id;
 
 COMMIT;
 */