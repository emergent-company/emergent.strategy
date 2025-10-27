-- Rollback partial migration
ALTER TABLE core.user_profiles DROP COLUMN IF EXISTS id;
ALTER TABLE core.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_zitadel_user_id_key;
DROP INDEX IF EXISTS user_profiles_zitadel_user_id_idx;
ALTER TABLE core.user_profiles RENAME COLUMN zitadel_user_id TO subject_id;

-- Restore foreign keys
ALTER TABLE core.user_emails 
    ADD CONSTRAINT user_emails_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE kb.user_notification_preferences 
    ADD CONSTRAINT user_notification_preferences_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE kb.notifications 
    ADD CONSTRAINT notifications_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE kb.organization_memberships 
    ADD CONSTRAINT organization_memberships_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE kb.project_memberships 
    ADD CONSTRAINT project_memberships_subject_id_fkey 
    FOREIGN KEY (subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE CASCADE;

ALTER TABLE kb.chat_conversations 
    ADD CONSTRAINT chat_conversations_owner_subject_id_fkey 
    FOREIGN KEY (owner_subject_id) REFERENCES core.user_profiles(subject_id) ON DELETE SET NULL;
