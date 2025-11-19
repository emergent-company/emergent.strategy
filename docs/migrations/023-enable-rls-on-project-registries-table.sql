-- Migration: Enable RLS on project_object_type_registry and project_template_packs tables
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for project configuration tables

ALTER TABLE kb.project_object_type_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.project_object_type_registry FORCE ROW LEVEL SECURITY;

CREATE POLICY project_object_type_registry_select_policy ON kb.project_object_type_registry
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

CREATE POLICY project_object_type_registry_insert_policy ON kb.project_object_type_registry
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

CREATE POLICY project_object_type_registry_update_policy ON kb.project_object_type_registry
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

CREATE POLICY project_object_type_registry_delete_policy ON kb.project_object_type_registry
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- Now for project_template_packs
ALTER TABLE kb.project_template_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.project_template_packs FORCE ROW LEVEL SECURITY;

CREATE POLICY project_template_packs_select_policy ON kb.project_template_packs
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

CREATE POLICY project_template_packs_insert_policy ON kb.project_template_packs
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

CREATE POLICY project_template_packs_update_policy ON kb.project_template_packs
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

CREATE POLICY project_template_packs_delete_policy ON kb.project_template_packs
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

-- Also add product_versions
ALTER TABLE kb.product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.product_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY product_versions_select_policy ON kb.product_versions
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

CREATE POLICY product_versions_insert_policy ON kb.product_versions
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

CREATE POLICY product_versions_update_policy ON kb.product_versions
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

CREATE POLICY product_versions_delete_policy ON kb.product_versions
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);
