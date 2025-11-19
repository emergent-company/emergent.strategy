-- Migration: Enable RLS on embedding_policies table
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for embedding configurations

-- Enable RLS on embedding_policies table
ALTER TABLE kb.embedding_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.embedding_policies FORCE ROW LEVEL SECURITY;

-- SELECT policy: Embedding policies belong to projects
CREATE POLICY embedding_policies_select_policy ON kb.embedding_policies
FOR SELECT
USING (
  -- Allow if no project context set (wildcard mode for admins)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if embedding policy belongs to current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- INSERT policy: Can only create embedding policies in current project
CREATE POLICY embedding_policies_insert_policy ON kb.embedding_policies
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- UPDATE policy: Can only update embedding policies in current project
CREATE POLICY embedding_policies_update_policy ON kb.embedding_policies
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- DELETE policy: Can only delete embedding policies in current project
CREATE POLICY embedding_policies_delete_policy ON kb.embedding_policies
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- Verification queries
-- Check RLS is enabled:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'embedding_policies' AND relnamespace = 'kb'::regnamespace;

-- Check policies exist:
-- SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename='embedding_policies';
