-- Migration: Change all subject_id columns from UUID to TEXT
-- Date: 2025-10-21
-- Reason: Support non-UUID authentication subject identifiers (e.g., numeric Zitadel subject IDs)
BEGIN;

-- Step 1: Drop all foreign key constraints referencing user_profiles.subject_id
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

-- Step 2: Change all subject_id columns from UUID to TEXT
ALTER TABLE
    core.user_profiles
ALTER COLUMN
    subject_id TYPE TEXT USING subject_id :: TEXT;

ALTER TABLE
    core.user_emails
ALTER COLUMN
    subject_id TYPE TEXT USING subject_id :: TEXT;

ALTER TABLE
    kb.user_notification_preferences
ALTER COLUMN
    subject_id TYPE TEXT USING subject_id :: TEXT;

ALTER TABLE
    kb.notifications
ALTER COLUMN
    subject_id TYPE TEXT USING subject_id :: TEXT;

ALTER TABLE
    kb.organization_memberships
ALTER COLUMN
    subject_id TYPE TEXT USING subject_id :: TEXT;

ALTER TABLE
    kb.project_memberships
ALTER COLUMN
    subject_id TYPE TEXT USING subject_id :: TEXT;

-- Step 3: Change kb.chat_conversations.owner_subject_id from UUID to TEXT (if not already done)
DO $ $ BEGIN IF EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_schema = 'kb'
        AND table_name = 'chat_conversations'
        AND column_name = 'owner_subject_id'
        AND data_type = 'uuid'
) THEN
ALTER TABLE
    kb.chat_conversations
ALTER COLUMN
    owner_subject_id TYPE TEXT USING owner_subject_id :: TEXT;

END IF;

END $ $;

-- Step 4: Convert existing UUID values back to numeric format BEFORE recreating FKs
-- UUID 89085f3d-0531-537a-96f6-e19eebd43770 -> numeric 335517149097361411
UPDATE
    core.user_profiles
SET
    subject_id = '335517149097361411'
WHERE
    subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

UPDATE
    core.user_emails
SET
    subject_id = '335517149097361411'
WHERE
    subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

UPDATE
    kb.user_notification_preferences
SET
    subject_id = '335517149097361411'
WHERE
    subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

UPDATE
    kb.notifications
SET
    subject_id = '335517149097361411'
WHERE
    subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

UPDATE
    kb.organization_memberships
SET
    subject_id = '335517149097361411'
WHERE
    subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

UPDATE
    kb.project_memberships
SET
    subject_id = '335517149097361411'
WHERE
    subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

UPDATE
    kb.chat_conversations
SET
    owner_subject_id = '335517149097361411'
WHERE
    owner_subject_id = '89085f3d-0531-537a-96f6-e19eebd43770';

-- Step 5: Recreate foreign key constraints with TEXT type
ALTER TABLE
    core.user_emails
ADD
    CONSTRAINT user_emails_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE
    kb.user_notification_preferences
ADD
    CONSTRAINT user_notification_preferences_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE
    kb.notifications
ADD
    CONSTRAINT notifications_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE
    kb.organization_memberships
ADD
    CONSTRAINT organization_memberships_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE
    kb.project_memberships
ADD
    CONSTRAINT project_memberships_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

COMMIT;