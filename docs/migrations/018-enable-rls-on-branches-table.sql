-- Migration: Enable RLS on branches table
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for version control branches

-- Enable RLS on branches table
ALTER TABLE kb.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.branches FORCE ROW LEVEL SECURITY;

-- SELECT policy: Branches belong to projects
CREATE POLICY branches_select_policy ON kb.branches
FOR SELECT
USING (
  -- Allow if no project context set (wildcard mode for admins)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if branch belongs to current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- INSERT policy: Can only create branches in current project
CREATE POLICY branches_insert_policy ON kb.branches
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- UPDATE policy: Can only update branches in current project
CREATE POLICY branches_update_policy ON kb.branches
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

-- DELETE policy: Can only delete branches in current project
CREATE POLICY branches_delete_policy ON kb.branches
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- Verification queries
-- Check RLS is enabled:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'branches' AND relnamespace = 'kb'::regnamespace;

-- Check policies exist:
-- SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename='branches';
