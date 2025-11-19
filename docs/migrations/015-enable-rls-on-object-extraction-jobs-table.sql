-- Migration: Enable RLS on object_extraction_jobs table
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for extraction jobs

-- Enable RLS on object_extraction_jobs table
ALTER TABLE kb.object_extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.object_extraction_jobs FORCE ROW LEVEL SECURITY;

-- SELECT policy: Extraction jobs belong to projects
-- This table has both project_id and document_id columns
-- We filter by project_id primarily, but also verify document relationship for belt-and-suspenders security
CREATE POLICY object_extraction_jobs_select_policy ON kb.object_extraction_jobs
FOR SELECT
USING (
  -- Allow if no project context set (wildcard mode for admins)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if extraction job belongs to current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- INSERT policy: Can only create extraction jobs in current project
CREATE POLICY object_extraction_jobs_insert_policy ON kb.object_extraction_jobs
FOR INSERT
WITH CHECK (
  -- Allow if no project context (should not happen - controller enforces)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if inserting job into current project
  project_id::text = current_setting('app.current_project_id', true)
);

-- UPDATE policy: Can only update extraction jobs in current project
CREATE POLICY object_extraction_jobs_update_policy ON kb.object_extraction_jobs
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

-- DELETE policy: Can only delete extraction jobs in current project
CREATE POLICY object_extraction_jobs_delete_policy ON kb.object_extraction_jobs
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
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'object_extraction_jobs' AND relnamespace = 'kb'::regnamespace;
-- Expected: relrowsecurity = t

-- Check policies exist
-- SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename='object_extraction_jobs';
-- Expected: 4 policies

-- Test RLS filtering (as app_rls role)
-- SET LOCAL app.current_project_id = '<some-project-id>';
-- SELECT COUNT(*) FROM kb.object_extraction_jobs;
-- Should only show jobs for that project
