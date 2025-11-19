-- Migration: Enable RLS on tags table
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for tags

-- Enable RLS on tags table
ALTER TABLE kb.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.tags FORCE ROW LEVEL SECURITY;

-- SELECT policy: Tags belong to projects
CREATE POLICY tags_select_policy ON kb.tags
FOR SELECT
USING (
  -- Allow if no project context set (wildcard mode for admins)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if tag belongs to current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- INSERT policy: Can only create tags in current project
CREATE POLICY tags_insert_policy ON kb.tags
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- UPDATE policy: Can only update tags in current project
CREATE POLICY tags_update_policy ON kb.tags
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

-- DELETE policy: Can only delete tags in current project
CREATE POLICY tags_delete_policy ON kb.tags
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- Verification queries
-- Check RLS is enabled:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'tags' AND relnamespace = 'kb'::regnamespace;

-- Check policies exist:
-- SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename='tags';
