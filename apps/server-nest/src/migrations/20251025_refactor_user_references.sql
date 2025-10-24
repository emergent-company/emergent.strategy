-- Migration: Refactor user references to use UUID primary key
-- Author: System
-- Date: 2025-10-25
-- Description: 
--   1. Add UUID 'id' column to core.user_profiles as new primary key
--   2. Rename subject_id to zitadel_user_id (external auth provider reference)
--   3. Update all foreign key references to point to user_profiles(id)
--   4. This allows future addition of other auth providers (google_user_id, etc.)
BEGIN;

-- ============================================================================
-- STEP 1: Add UUID id column to core.user_profiles
-- ============================================================================
-- Add new id column (nullable initially)
ALTER TABLE
    core.user_profiles
ADD
    COLUMN id UUID DEFAULT gen_random_uuid() NOT NULL;

-- Create unique index on new id column
CREATE UNIQUE INDEX user_profiles_id_unique ON core.user_profiles(id);

-- ============================================================================
-- STEP 2: Add user_id columns to tables that reference users
-- ============================================================================
-- Tables with subject_id foreign keys
ALTER TABLE
    kb.organization_memberships
ADD
    COLUMN user_id UUID;

ALTER TABLE
    kb.project_memberships
ADD
    COLUMN user_id UUID;

ALTER TABLE
    kb.notifications
ADD
    COLUMN new_subject_id UUID;

ALTER TABLE
    core.user_emails
ADD
    COLUMN user_id UUID;

-- Tables with owner_subject_id
ALTER TABLE
    kb.chat_conversations
ADD
    COLUMN owner_id UUID;

-- Tables with text created_by (integrations)
ALTER TABLE
    kb.integrations
ADD
    COLUMN created_by_user_id UUID;

-- Tables with text user_id (audit_log, notifications)
ALTER TABLE
    kb.audit_log
ADD
    COLUMN new_user_id UUID;

-- ============================================================================
-- STEP 3: Populate new user_id columns by joining with user_profiles
-- ============================================================================
-- organization_memberships: subject_id → user_id
UPDATE
    kb.organization_memberships om
SET
    user_id = up.id
FROM
    core.user_profiles up
WHERE
    om.subject_id = up.subject_id;

-- project_memberships: subject_id → user_id
UPDATE
    kb.project_memberships pm
SET
    user_id = up.id
FROM
    core.user_profiles up
WHERE
    pm.subject_id = up.subject_id;

-- notifications: subject_id → new_subject_id
UPDATE
    kb.notifications n
SET
    new_subject_id = up.id
FROM
    core.user_profiles up
WHERE
    n.subject_id = up.subject_id;

-- user_emails: subject_id → user_id
UPDATE
    core.user_emails ue
SET
    user_id = up.id
FROM
    core.user_profiles up
WHERE
    ue.subject_id = up.subject_id;

-- chat_conversations: owner_subject_id → owner_id
UPDATE
    kb.chat_conversations cc
SET
    owner_id = up.id
FROM
    core.user_profiles up
WHERE
    cc.owner_subject_id = up.subject_id;

-- integrations: created_by (text) → created_by_user_id
UPDATE
    kb.integrations i
SET
    created_by_user_id = up.id
FROM
    core.user_profiles up
WHERE
    i.created_by = up.subject_id;

-- audit_log: user_id (text) → new_user_id
UPDATE
    kb.audit_log al
SET
    new_user_id = up.id
FROM
    core.user_profiles up
WHERE
    al.user_id = up.subject_id;

-- ============================================================================
-- STEP 4: Drop old foreign key constraints
-- ============================================================================
-- Drop existing foreign keys
ALTER TABLE
    kb.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_owner_subject_id_fkey;

ALTER TABLE
    kb.organization_memberships DROP CONSTRAINT IF EXISTS organization_memberships_subject_id_fkey;

ALTER TABLE
    kb.project_memberships DROP CONSTRAINT IF EXISTS project_memberships_subject_id_fkey;

ALTER TABLE
    core.user_emails DROP CONSTRAINT IF EXISTS user_emails_subject_id_fkey;

-- ============================================================================
-- STEP 5: Switch primary key on user_profiles
-- ============================================================================
-- Drop old primary key
ALTER TABLE
    core.user_profiles DROP CONSTRAINT user_profiles_pkey;

-- Rename subject_id to zitadel_user_id
ALTER TABLE
    core.user_profiles RENAME COLUMN subject_id TO zitadel_user_id;

-- Create new primary key on id
ALTER TABLE
    core.user_profiles
ADD
    CONSTRAINT user_profiles_pkey PRIMARY KEY (id);

-- Create unique constraint on zitadel_user_id (it's the external auth ID)
ALTER TABLE
    core.user_profiles
ADD
    CONSTRAINT user_profiles_zitadel_user_id_unique UNIQUE (zitadel_user_id);

-- Create index for lookups by zitadel_user_id
CREATE INDEX idx_user_profiles_zitadel_user_id ON core.user_profiles(zitadel_user_id);

-- ============================================================================
-- STEP 6: Drop old columns and rename new ones
-- ============================================================================
-- organization_memberships
ALTER TABLE
    kb.organization_memberships DROP COLUMN subject_id CASCADE;

ALTER TABLE
    kb.organization_memberships
ALTER COLUMN
    user_id
SET
    NOT NULL;

-- project_memberships
ALTER TABLE
    kb.project_memberships DROP COLUMN subject_id CASCADE;

ALTER TABLE
    kb.project_memberships
ALTER COLUMN
    user_id
SET
    NOT NULL;

-- notifications
ALTER TABLE
    kb.notifications DROP COLUMN subject_id CASCADE,
    DROP COLUMN user_id CASCADE;

ALTER TABLE
    kb.notifications RENAME COLUMN new_subject_id TO user_id;

ALTER TABLE
    kb.notifications
ALTER COLUMN
    user_id
SET
    NOT NULL;

-- user_emails
ALTER TABLE
    core.user_emails DROP COLUMN subject_id CASCADE;

ALTER TABLE
    core.user_emails
ALTER COLUMN
    user_id
SET
    NOT NULL;

-- chat_conversations
ALTER TABLE
    kb.chat_conversations DROP COLUMN owner_subject_id CASCADE;

-- Note: owner_id is already correctly named, no rename needed
-- integrations
ALTER TABLE
    kb.integrations DROP COLUMN created_by CASCADE;

ALTER TABLE
    kb.integrations RENAME COLUMN created_by_user_id TO created_by;

-- audit_log
ALTER TABLE
    kb.audit_log DROP COLUMN user_id CASCADE;

ALTER TABLE
    kb.audit_log RENAME COLUMN new_user_id TO user_id;

-- ============================================================================
-- STEP 7: Fix tables with UUID created_by that couldn't reference users
-- ============================================================================
-- object_extraction_jobs: Convert created_by from uuid to uuid (already uuid, just add FK)
-- Note: This column was uuid but had no FK. Now it can properly reference users.
ALTER TABLE
    kb.object_extraction_jobs
ALTER COLUMN
    created_by DROP NOT NULL;

-- Make nullable in case of orphaned records
-- project_object_type_registry: Same issue
ALTER TABLE
    kb.project_object_type_registry
ALTER COLUMN
    created_by DROP NOT NULL;

-- ============================================================================
-- STEP 8: Create new foreign key constraints
-- ============================================================================
-- organization_memberships
ALTER TABLE
    kb.organization_memberships
ADD
    CONSTRAINT fk_organization_memberships_user FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- project_memberships
ALTER TABLE
    kb.project_memberships
ADD
    CONSTRAINT fk_project_memberships_user FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- notifications
ALTER TABLE
    kb.notifications
ADD
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- user_emails
ALTER TABLE
    core.user_emails
ADD
    CONSTRAINT fk_user_emails_user FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE CASCADE;

-- chat_conversations
ALTER TABLE
    kb.chat_conversations
ADD
    CONSTRAINT fk_chat_conversations_owner FOREIGN KEY (owner_id) REFERENCES core.user_profiles(id) ON DELETE
SET
    NULL;

-- integrations
ALTER TABLE
    kb.integrations
ADD
    CONSTRAINT fk_integrations_created_by FOREIGN KEY (created_by) REFERENCES core.user_profiles(id) ON DELETE
SET
    NULL;

-- audit_log
ALTER TABLE
    kb.audit_log
ADD
    CONSTRAINT fk_audit_log_user FOREIGN KEY (user_id) REFERENCES core.user_profiles(id) ON DELETE
SET
    NULL;

-- object_extraction_jobs
ALTER TABLE
    kb.object_extraction_jobs
ADD
    CONSTRAINT fk_object_extraction_jobs_created_by FOREIGN KEY (created_by) REFERENCES core.user_profiles(id) ON DELETE
SET
    NULL;

-- project_object_type_registry
ALTER TABLE
    kb.project_object_type_registry
ADD
    CONSTRAINT fk_project_object_type_registry_created_by FOREIGN KEY (created_by) REFERENCES core.user_profiles(id) ON DELETE
SET
    NULL;

-- ============================================================================
-- STEP 9: Create indexes for foreign keys (performance)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_organization_memberships_user_id ON kb.organization_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_project_memberships_user_id ON kb.project_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON kb.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_user_emails_user_id ON core.user_emails(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner_id ON kb.chat_conversations(owner_id);

CREATE INDEX IF NOT EXISTS idx_integrations_created_by ON kb.integrations(created_by);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON kb.audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_object_extraction_jobs_created_by ON kb.object_extraction_jobs(created_by);

CREATE INDEX IF NOT EXISTS idx_project_object_type_registry_created_by ON kb.project_object_type_registry(created_by);

COMMIT;