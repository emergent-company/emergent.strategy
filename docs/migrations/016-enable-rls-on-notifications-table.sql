-- Migration: Enable RLS on notifications table
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for user notifications

-- Enable RLS on notifications table
ALTER TABLE kb.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.notifications FORCE ROW LEVEL SECURITY;

-- SELECT policy: Notifications belong to projects
CREATE POLICY notifications_select_policy ON kb.notifications
FOR SELECT
USING (
  -- Allow if no project context set (wildcard mode for admins)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if notification belongs to current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- INSERT policy: Can only create notifications in current project
CREATE POLICY notifications_insert_policy ON kb.notifications
FOR INSERT
WITH CHECK (
  -- Allow if no project context (should not happen - controller enforces)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if inserting notification into current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- UPDATE policy: Can only update notifications in current project
CREATE POLICY notifications_update_policy ON kb.notifications
FOR UPDATE
USING (
  -- Must exist in current project to update
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
)
WITH CHECK (
  -- After update, must still be in current project (prevent project reassignment)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- DELETE policy: Can only delete notifications in current project
CREATE POLICY notifications_delete_policy ON kb.notifications
FOR DELETE
USING (
  -- Must exist in current project to delete
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- Verification queries
-- Run these after applying migration to verify RLS is working:

-- Check RLS is enabled
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'notifications' AND relnamespace = 'kb'::regnamespace;
-- Expected: relrowsecurity = t

-- Check policies exist
-- SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename='notifications';
-- Expected: 4 policies

-- Test RLS filtering (as app_rls role)
-- SET LOCAL app.current_project_id = '<some-project-id>';
-- SELECT COUNT(*) FROM kb.notifications;
-- Should only show notifications for that project
