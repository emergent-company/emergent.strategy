-- Migration: Enable RLS on global and shared resource tables
-- Created: 2025-11-19
-- Purpose: Enforce appropriate access control for shared/global resources

-- ============================================================================
-- kb.graph_template_packs - Global templates, accessible to all users
-- No project-level filtering needed, these are shared across all projects
-- ============================================================================

ALTER TABLE kb.graph_template_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.graph_template_packs FORCE ROW LEVEL SECURITY;

-- Allow read access to all users (template packs are global resources)
-- Write access only when no project context is set (admin/import operations)
CREATE POLICY graph_template_packs_select_policy ON kb.graph_template_packs
FOR SELECT
USING (true);

CREATE POLICY graph_template_packs_insert_policy ON kb.graph_template_packs
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY graph_template_packs_update_policy ON kb.graph_template_packs
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY graph_template_packs_delete_policy ON kb.graph_template_packs
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

-- ============================================================================
-- kb.settings - Global settings table, accessible by admins only
-- ============================================================================

ALTER TABLE kb.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.settings FORCE ROW LEVEL SECURITY;

CREATE POLICY settings_select_policy ON kb.settings
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY settings_insert_policy ON kb.settings
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY settings_update_policy ON kb.settings
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

CREATE POLICY settings_delete_policy ON kb.settings
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
);

-- ============================================================================
-- kb.branch_lineage - Filter via branch_id JOIN to branches table
-- ============================================================================

ALTER TABLE kb.branch_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.branch_lineage FORCE ROW LEVEL SECURITY;

CREATE POLICY branch_lineage_select_policy ON kb.branch_lineage
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.branches 
    WHERE branches.id = branch_lineage.branch_id
      AND branches.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY branch_lineage_insert_policy ON kb.branch_lineage
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.branches 
    WHERE branches.id = branch_lineage.branch_id
      AND branches.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY branch_lineage_update_policy ON kb.branch_lineage
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.branches 
    WHERE branches.id = branch_lineage.branch_id
      AND branches.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.branches 
    WHERE branches.id = branch_lineage.branch_id
      AND branches.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY branch_lineage_delete_policy ON kb.branch_lineage
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.branches 
    WHERE branches.id = branch_lineage.branch_id
      AND branches.project_id::text = current_setting('app.current_project_id', true)
  )
);
