-- Migration: Enable RLS on integrations table
-- Created: 2025-11-19
-- Purpose: Enforce project and organization-level isolation for integrations

ALTER TABLE kb.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.integrations FORCE ROW LEVEL SECURITY;

-- SELECT policy: Integrations can be project-level or org-level
CREATE POLICY integrations_select_policy ON kb.integrations
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND org_id::text = current_setting('app.current_organization_id', true))
);

CREATE POLICY integrations_insert_policy ON kb.integrations
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND org_id::text = current_setting('app.current_organization_id', true))
);

CREATE POLICY integrations_update_policy ON kb.integrations
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND org_id::text = current_setting('app.current_organization_id', true))
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND org_id::text = current_setting('app.current_organization_id', true))
);

CREATE POLICY integrations_delete_policy ON kb.integrations
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND org_id::text = current_setting('app.current_organization_id', true))
);
