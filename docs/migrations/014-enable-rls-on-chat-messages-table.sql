-- Migration: Enable RLS on chat_messages table
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for chat messages via conversation relationship

-- Enable RLS on chat_messages table
ALTER TABLE kb.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.chat_messages FORCE ROW LEVEL SECURITY;

-- SELECT policy: Messages belong to conversations which belong to projects
-- Filter via JOIN to chat_conversations table (similar to chunks → documents pattern)
CREATE POLICY chat_messages_select_policy ON kb.chat_messages
FOR SELECT
USING (
  -- Allow if no project context set (wildcard mode for admins)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if message belongs to a conversation in current project
  EXISTS (
    SELECT 1 FROM kb.chat_conversations c
    WHERE c.id = chat_messages.conversation_id
    AND c.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- INSERT policy: Can only create messages in conversations that belong to current project
CREATE POLICY chat_messages_insert_policy ON kb.chat_messages
FOR INSERT
WITH CHECK (
  -- Allow if no project context (should not happen - controller enforces)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if inserting message into conversation in current project
  EXISTS (
    SELECT 1 FROM kb.chat_conversations c
    WHERE c.id = chat_messages.conversation_id
    AND c.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- UPDATE policy: Can only update messages in conversations that belong to current project
CREATE POLICY chat_messages_update_policy ON kb.chat_messages
FOR UPDATE
USING (
  -- Must be in conversation that belongs to current project
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 FROM kb.chat_conversations c
    WHERE c.id = chat_messages.conversation_id
    AND c.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  -- After update, must still be in valid conversation (prevent conversation reassignment)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 FROM kb.chat_conversations c
    WHERE c.id = chat_messages.conversation_id
    AND c.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- DELETE policy: Can only delete messages in conversations that belong to current project
CREATE POLICY chat_messages_delete_policy ON kb.chat_messages
FOR DELETE
USING (
  -- Must be in conversation that belongs to current project
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 FROM kb.chat_conversations c
    WHERE c.id = chat_messages.conversation_id
    AND c.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- Verification queries
-- Run these after applying migration to verify RLS is working:

-- Check RLS is enabled
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'chat_messages' AND relnamespace = 'kb'::regnamespace;
-- Expected: relrowsecurity = t

-- Check policies exist
-- SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename='chat_messages';
-- Expected: 4 policies

-- Test RLS filtering (as app_rls role)
-- First, get a conversation ID and its project:
-- SELECT c.id as conv_id, c.project_id FROM kb.chat_conversations c LIMIT 1;
-- Then set context and query:
-- SET LOCAL app.current_project_id = '<project-id-from-above>';
-- SELECT COUNT(*) FROM kb.chat_messages WHERE conversation_id = '<conv-id-from-above>';
-- Should return messages only if conversation belongs to that project
