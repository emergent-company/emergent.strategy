-- Migration: Enable RLS on chat_conversations table
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for chat conversations

-- Enable RLS on chat_conversations table
ALTER TABLE kb.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.chat_conversations FORCE ROW LEVEL SECURITY;

-- SELECT policy: Users can see conversations in their current project context
CREATE POLICY chat_conversations_select_policy ON kb.chat_conversations
FOR SELECT
USING (
  -- Allow if no project context set (wildcard mode for admins)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR 
  -- Allow if conversation belongs to current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- INSERT policy: Can only create conversations in current project
CREATE POLICY chat_conversations_insert_policy ON kb.chat_conversations
FOR INSERT
WITH CHECK (
  -- Allow if no project context (should not happen - controller enforces)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if inserting into current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- UPDATE policy: Can only update conversations in current project
CREATE POLICY chat_conversations_update_policy ON kb.chat_conversations
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

-- DELETE policy: Can only delete conversations in current project
CREATE POLICY chat_conversations_delete_policy ON kb.chat_conversations
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
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'chat_conversations' AND relnamespace = 'kb'::regnamespace;
-- Expected: relrowsecurity = t

-- Check policies exist
-- SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename='chat_conversations';
-- Expected: 4 policies

-- Test RLS filtering (as app_rls role)
-- SET LOCAL app.current_project_id = '<some-project-id>';
-- SELECT COUNT(*) FROM kb.chat_conversations;
-- Should only show conversations for that project
