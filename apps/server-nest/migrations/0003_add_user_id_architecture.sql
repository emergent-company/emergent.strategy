-- Migration: Add proper user ID architecture
-- Current state: subject_id (TEXT, PK) = Zitadel user ID
-- Target state: id (UUID, PK) = Internal user ID, zitadel_user_id (TEXT, UNIQUE) = External Zitadel ID

-- Step 1: Add id column with UUID values
ALTER TABLE core.user_profiles ADD COLUMN id UUID DEFAULT gen_random_uuid() NOT NULL;

-- Step 2: Add unique constraint on id (will become PK later)
ALTER TABLE core.user_profiles ADD CONSTRAINT user_profiles_id_unique UNIQUE (id);

-- Step 3: Rename subject_id to zitadel_user_id
ALTER TABLE core.user_profiles RENAME COLUMN subject_id TO zitadel_user_id;

-- Step 4: Drop all foreign key constraints that reference the old PK
ALTER TABLE kb.organization_memberships DROP CONSTRAINT IF EXISTS organization_memberships_subject_id_fkey;
ALTER TABLE kb.project_memberships DROP CONSTRAINT IF EXISTS project_memberships_subject_id_fkey;
ALTER TABLE core.user_emails DROP CONSTRAINT IF EXISTS user_emails_subject_id_fkey;
ALTER TABLE kb.user_notification_preferences DROP CONSTRAINT IF EXISTS user_notification_preferences_subject_id_fkey;
ALTER TABLE kb.notifications DROP CONSTRAINT IF EXISTS notifications_subject_id_fkey;
ALTER TABLE kb.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_owner_subject_id_fkey;

-- Step 5: Drop old PK on zitadel_user_id
ALTER TABLE core.user_profiles DROP CONSTRAINT user_profiles_pkey;

-- Step 6: Create new PK on id
ALTER TABLE core.user_profiles ADD PRIMARY KEY (id);

-- Step 7: Add unique constraint on zitadel_user_id
ALTER TABLE core.user_profiles ADD CONSTRAINT user_profiles_zitadel_user_id_unique UNIQUE (zitadel_user_id);

-- Step 8: Create index on zitadel_user_id for lookups
CREATE INDEX user_profiles_zitadel_user_id_idx ON core.user_profiles(zitadel_user_id);

-- Step 9: Rename subject_id columns in referencing tables to user_id
-- organization_memberships
ALTER TABLE kb.organization_memberships RENAME COLUMN subject_id TO zitadel_user_id_old;
ALTER TABLE kb.organization_memberships ADD COLUMN user_id UUID;

-- Populate user_id by looking up the UUID from user_profiles
UPDATE kb.organization_memberships om
SET user_id = up.id
FROM core.user_profiles up
WHERE om.zitadel_user_id_old = up.zitadel_user_id;

-- Make user_id NOT NULL and add FK
ALTER TABLE kb.organization_memberships ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE kb.organization_memberships 
    ADD CONSTRAINT organization_memberships_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- Drop old column
ALTER TABLE kb.organization_memberships DROP COLUMN zitadel_user_id_old;

-- Create index
CREATE INDEX organization_memberships_user_id_idx ON kb.organization_memberships(user_id);

-- Step 10: project_memberships
ALTER TABLE kb.project_memberships RENAME COLUMN subject_id TO zitadel_user_id_old;
ALTER TABLE kb.project_memberships ADD COLUMN user_id UUID;

UPDATE kb.project_memberships pm
SET user_id = up.id
FROM core.user_profiles up
WHERE pm.zitadel_user_id_old = up.zitadel_user_id;

ALTER TABLE kb.project_memberships ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE kb.project_memberships 
    ADD CONSTRAINT project_memberships_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

ALTER TABLE kb.project_memberships DROP COLUMN zitadel_user_id_old;
CREATE INDEX project_memberships_user_id_idx ON kb.project_memberships(user_id);

-- Step 11: user_emails
ALTER TABLE core.user_emails RENAME COLUMN subject_id TO zitadel_user_id_old;
ALTER TABLE core.user_emails ADD COLUMN user_id UUID;

UPDATE core.user_emails ue
SET user_id = up.id
FROM core.user_profiles up
WHERE ue.zitadel_user_id_old = up.zitadel_user_id;

ALTER TABLE core.user_emails ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE core.user_emails 
    ADD CONSTRAINT user_emails_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

ALTER TABLE core.user_emails DROP COLUMN zitadel_user_id_old;

-- Step 12: user_notification_preferences
ALTER TABLE kb.user_notification_preferences RENAME COLUMN subject_id TO zitadel_user_id_old;
ALTER TABLE kb.user_notification_preferences ADD COLUMN user_id UUID;

UPDATE kb.user_notification_preferences unp
SET user_id = up.id
FROM core.user_profiles up
WHERE unp.zitadel_user_id_old = up.zitadel_user_id;

ALTER TABLE kb.user_notification_preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE kb.user_notification_preferences 
    ADD CONSTRAINT user_notification_preferences_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

ALTER TABLE kb.user_notification_preferences DROP COLUMN zitadel_user_id_old;

-- Step 13: notifications
ALTER TABLE kb.notifications RENAME COLUMN subject_id TO zitadel_user_id_old;
ALTER TABLE kb.notifications ADD COLUMN user_id UUID;

UPDATE kb.notifications n
SET user_id = up.id
FROM core.user_profiles up
WHERE n.zitadel_user_id_old = up.zitadel_user_id;

ALTER TABLE kb.notifications ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE kb.notifications 
    ADD CONSTRAINT notifications_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

ALTER TABLE kb.notifications DROP COLUMN zitadel_user_id_old;

-- Step 14: chat_conversations (nullable owner)
ALTER TABLE kb.chat_conversations RENAME COLUMN owner_subject_id TO owner_zitadel_user_id_old;
ALTER TABLE kb.chat_conversations ADD COLUMN owner_user_id UUID;

UPDATE kb.chat_conversations cc
SET owner_user_id = up.id
FROM core.user_profiles up
WHERE cc.owner_zitadel_user_id_old = up.zitadel_user_id;

ALTER TABLE kb.chat_conversations 
    ADD CONSTRAINT chat_conversations_owner_user_id_fkey 
    FOREIGN KEY (owner_user_id) REFERENCES core.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE kb.chat_conversations DROP COLUMN owner_zitadel_user_id_old;

-- Step 15: Handle extraction jobs if they have subject_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'kb' 
        AND table_name = 'object_extraction_jobs' 
        AND column_name = 'subject_id'
    ) THEN
        ALTER TABLE kb.object_extraction_jobs RENAME COLUMN subject_id TO zitadel_user_id_old;
        ALTER TABLE kb.object_extraction_jobs ADD COLUMN user_id UUID;
        
        UPDATE kb.object_extraction_jobs oej
        SET user_id = up.id
        FROM core.user_profiles up
        WHERE oej.zitadel_user_id_old = up.zitadel_user_id;
        
        ALTER TABLE kb.object_extraction_jobs DROP COLUMN zitadel_user_id_old;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'object_extraction_jobs_user_id_fkey'
        ) THEN
            ALTER TABLE kb.object_extraction_jobs 
                ADD CONSTRAINT object_extraction_jobs_user_id_fkey 
                FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- Final: Add helpful comments
COMMENT ON COLUMN core.user_profiles.id IS 'Internal UUID primary key for user profiles - use this for all FK relationships';
COMMENT ON COLUMN core.user_profiles.zitadel_user_id IS 'External Zitadel subject ID - only used for auth lookups and if user changes email in Zitadel';
COMMENT ON TABLE core.user_profiles IS 'User profiles: id (UUID PK) for internal use, zitadel_user_id (TEXT UNIQUE) for auth';
