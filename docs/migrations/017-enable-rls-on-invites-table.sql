-- Migration: Enable RLS on invites table
-- Created: 2025-11-19
-- Purpose: Enforce project and organization-level isolation for invitations

-- Enable RLS on invites table
ALTER TABLE kb.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.invites FORCE ROW LEVEL SECURITY;

-- SELECT policy: Invites can be at project-level OR organization-level
-- Users can see invites for their current project OR their current organization
CREATE POLICY invites_select_policy ON kb.invites
FOR SELECT
USING (
  -- Allow if no context set (wildcard mode for admins)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if invite belongs to current project
  project_id::text = current_setting('app.current_project_id', true)
  OR
  -- Allow if invite belongs to current organization (org-level invites)
  (project_id IS NULL AND organization_id::text = current_setting('app.current_organization_id', true))
);

-- INSERT policy: Can create invites for current project or organization
CREATE POLICY invites_insert_policy ON kb.invites
FOR INSERT
WITH CHECK (
  -- Allow if no context (should not happen - controller enforces)
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Allow if creating invite for current project
  project_id::text = current_setting('app.current_project_id', true)
  OR
  -- Allow if creating org-level invite for current organization
  (project_id IS NULL AND organization_id::text = current_setting('app.current_organization_id', true))
);

-- UPDATE policy: Can only update invites for current project/organization
CREATE POLICY invites_update_policy ON kb.invites
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND organization_id::text = current_setting('app.current_organization_id', true))
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND organization_id::text = current_setting('app.current_organization_id', true))
);

-- DELETE policy: Can only delete invites for current project/organization
CREATE POLICY invites_delete_policy ON kb.invites
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND organization_id::text = current_setting('app.current_organization_id', true))
);

-- Verification queries
-- Check RLS is enabled:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'invites' AND relnamespace = 'kb'::regnamespace;

-- Check policies exist:
-- SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename='invites';
