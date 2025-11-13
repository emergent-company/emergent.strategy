-- Migration: Refactor user ID architecture
-- Replace subject_id with proper id/zitadel_user_id pattern
-- All internal relationships use UUID user_id, external Zitadel ID is zitadel_user_id
-- Step 1: Drop all foreign key constraints that reference user_profiles.subject_id
ALTER TABLE
    core.user_emails DROP CONSTRAINT IF EXISTS user_emails_subject_id_fkey;

ALTER TABLE
    kb.user_notification_preferences DROP CONSTRAINT IF EXISTS user_notification_preferences_subject_id_fkey;

ALTER TABLE
    kb.notifications DROP CONSTRAINT IF EXISTS notifications_subject_id_fkey;

ALTER TABLE
    kb.organization_memberships DROP CONSTRAINT IF EXISTS organization_memberships_subject_id_fkey;

ALTER TABLE
    kb.project_memberships DROP CONSTRAINT IF EXISTS project_memberships_subject_id_fkey;

ALTER TABLE
    kb.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_owner_subject_id_fkey;

-- Step 2: Add new id column to user_profiles and populate it
ALTER TABLE
    core.user_profiles
ADD
    COLUMN id UUID DEFAULT gen_random_uuid() NOT NULL;

-- Step 3: Rename subject_id to zitadel_user_id for clarity
ALTER TABLE
    core.user_profiles RENAME COLUMN subject_id TO zitadel_user_id;

-- Step 4: Drop old primary key and create new one on id
ALTER TABLE
    core.user_profiles DROP CONSTRAINT user_profiles_pkey;

ALTER TABLE
    core.user_profiles
ADD
    PRIMARY KEY (id);

-- Step 5: Add unique constraint on zitadel_user_id
ALTER TABLE
    core.user_profiles
ADD
    CONSTRAINT user_profiles_zitadel_user_id_key UNIQUE (zitadel_user_id);

-- Step 5: Create index on zitadel_user_id for lookups
CREATE INDEX user_profiles_zitadel_user_id_idx ON core.user_profiles(zitadel_user_id);

-- Step 6: Add user_id column to organization_memberships
ALTER TABLE
    kb.organization_memberships
ADD
    COLUMN user_id UUID;

-- Step 7: Populate user_id from subject_id lookup
UPDATE
    kb.organization_memberships om
SET
    user_id = up.id
FROM
    core.user_profiles up
WHERE
    om.subject_id = up.zitadel_user_id;

-- Step 8: Make user_id NOT NULL and drop subject_id
ALTER TABLE
    kb.organization_memberships
ALTER COLUMN
    user_id
SET
    NOT NULL;

ALTER TABLE
    kb.organization_memberships DROP CONSTRAINT organization_memberships_subject_id_fkey;

ALTER TABLE
    kb.organization_memberships DROP COLUMN subject_id;

-- Step 9: Add foreign key constraint
ALTER TABLE
    kb.organization_memberships
ADD
    CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- Step 10: Create index on user_id
CREATE INDEX organization_memberships_user_id_idx ON kb.organization_memberships(user_id);

-- Step 11: Add user_id column to project_memberships
ALTER TABLE
    kb.project_memberships
ADD
    COLUMN user_id UUID;

-- Step 12: Populate user_id from subject_id lookup
UPDATE
    kb.project_memberships pm
SET
    user_id = up.id
FROM
    core.user_profiles up
WHERE
    pm.subject_id = up.zitadel_user_id;

-- Step 13: Make user_id NOT NULL and drop subject_id
ALTER TABLE
    kb.project_memberships
ALTER COLUMN
    user_id
SET
    NOT NULL;

ALTER TABLE
    kb.project_memberships DROP CONSTRAINT project_memberships_subject_id_fkey;

ALTER TABLE
    kb.project_memberships DROP COLUMN subject_id;

-- Step 14: Add foreign key constraint
ALTER TABLE
    kb.project_memberships
ADD
    CONSTRAINT project_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- Step 15: Create index on user_id
CREATE INDEX project_memberships_user_id_idx ON kb.project_memberships(user_id);

-- Step 16: Update user_emails table
ALTER TABLE
    core.user_emails
ADD
    COLUMN user_id UUID;

UPDATE
    core.user_emails ue
SET
    user_id = up.id
FROM
    core.user_profiles up
WHERE
    ue.subject_id = up.zitadel_user_id;

ALTER TABLE
    core.user_emails
ALTER COLUMN
    user_id
SET
    NOT NULL;

ALTER TABLE
    core.user_emails DROP CONSTRAINT user_emails_subject_id_fkey;

ALTER TABLE
    core.user_emails DROP COLUMN subject_id;

ALTER TABLE
    core.user_emails
ADD
    CONSTRAINT user_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- Step 17: Update user_notification_preferences table
ALTER TABLE
    kb.user_notification_preferences
ADD
    COLUMN user_id UUID;

UPDATE
    kb.user_notification_preferences unp
SET
    user_id = up.id
FROM
    core.user_profiles up
WHERE
    unp.subject_id = up.zitadel_user_id;

ALTER TABLE
    kb.user_notification_preferences
ALTER COLUMN
    user_id
SET
    NOT NULL;

ALTER TABLE
    kb.user_notification_preferences DROP CONSTRAINT user_notification_preferences_subject_id_fkey;

ALTER TABLE
    kb.user_notification_preferences DROP COLUMN subject_id;

ALTER TABLE
    kb.user_notification_preferences
ADD
    CONSTRAINT user_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- Step 18: Update notifications table (recipient)
ALTER TABLE
    kb.notifications RENAME COLUMN subject_id TO user_id;

ALTER TABLE
    kb.notifications DROP CONSTRAINT notifications_subject_id_fkey;

-- Update data type if needed and add FK
-- First, add temp column, populate, then swap
ALTER TABLE
    kb.notifications
ADD
    COLUMN user_id_temp UUID;

UPDATE
    kb.notifications n
SET
    user_id_temp = up.id
FROM
    core.user_profiles up
WHERE
    n.user_id = up.zitadel_user_id;

ALTER TABLE
    kb.notifications DROP COLUMN user_id;

ALTER TABLE
    kb.notifications RENAME COLUMN user_id_temp TO user_id;

ALTER TABLE
    kb.notifications
ALTER COLUMN
    user_id
SET
    NOT NULL;

ALTER TABLE
    kb.notifications
ADD
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- Step 19: Update chat_conversations owner
ALTER TABLE
    kb.chat_conversations RENAME COLUMN owner_subject_id TO owner_user_id;

ALTER TABLE
    kb.chat_conversations DROP CONSTRAINT chat_conversations_owner_subject_id_fkey;

-- Add temp column, populate, then swap
ALTER TABLE
    kb.chat_conversations
ADD
    COLUMN owner_user_id_temp UUID;

UPDATE
    kb.chat_conversations cc
SET
    owner_user_id_temp = up.id
FROM
    core.user_profiles up
WHERE
    cc.owner_user_id = up.zitadel_user_id;

ALTER TABLE
    kb.chat_conversations DROP COLUMN owner_user_id;

ALTER TABLE
    kb.chat_conversations RENAME COLUMN owner_user_id_temp TO owner_user_id;

ALTER TABLE
    kb.chat_conversations
ADD
    CONSTRAINT chat_conversations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES core.user_profiles(id) ON DELETE
SET
    NULL;

-- Step 20: Update extraction jobs if they have subject_id column
DO $$ BEGIN IF EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_schema = 'kb'
        AND table_name = 'object_extraction_jobs'
        AND column_name = 'subject_id'
) THEN
ALTER TABLE
    kb.object_extraction_jobs
ADD
    COLUMN user_id UUID;

UPDATE
    kb.object_extraction_jobs oej
SET
    user_id = up.id
FROM
    core.user_profiles up
WHERE
    oej.subject_id = up.zitadel_user_id;

ALTER TABLE
    kb.object_extraction_jobs DROP COLUMN subject_id;

IF NOT EXISTS (
    SELECT
        1
    FROM
        information_schema.table_constraints
    WHERE
        constraint_name = 'object_extraction_jobs_user_id_fkey'
) THEN
ALTER TABLE
    kb.object_extraction_jobs
ADD
    CONSTRAINT object_extraction_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE
SET
    NULL;

END IF;

END IF;

END $$;

-- Final step: Add comments for documentation
COMMENT ON COLUMN core.user_profiles.id IS 'Internal UUID primary key for user profiles';

COMMENT ON COLUMN core.user_profiles.zitadel_user_id IS 'External Zitadel subject ID (formerly subject_id)';

COMMENT ON TABLE core.user_profiles IS 'User profiles with internal UUID id and external Zitadel user ID';