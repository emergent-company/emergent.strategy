-- Migration: Enable RLS on object_type_schemas table
-- Created: 2025-11-19
-- Purpose: Enforce project and organization-level isolation for type schemas

ALTER TABLE kb.object_type_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.object_type_schemas FORCE ROW LEVEL SECURITY;

CREATE POLICY object_type_schemas_select_policy ON kb.object_type_schemas
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND organization_id::text = current_setting('app.current_organization_id', true))
);

CREATE POLICY object_type_schemas_insert_policy ON kb.object_type_schemas
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND organization_id::text = current_setting('app.current_organization_id', true))
);

CREATE POLICY object_type_schemas_update_policy ON kb.object_type_schemas
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

CREATE POLICY object_type_schemas_delete_policy ON kb.object_type_schemas
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
  OR
  (project_id IS NULL AND organization_id::text = current_setting('app.current_organization_id', true))
);
