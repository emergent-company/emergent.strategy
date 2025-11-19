-- Migration: Enable RLS on product management tables
-- Created: 2025-11-19
-- Purpose: Enforce project-level isolation for product version management

-- ============================================================================
-- kb.merge_provenance - Filter via child_version_id/parent_version_id JOIN
-- ============================================================================

ALTER TABLE kb.merge_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.merge_provenance FORCE ROW LEVEL SECURITY;

CREATE POLICY merge_provenance_select_policy ON kb.merge_provenance
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = merge_provenance.child_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY merge_provenance_insert_policy ON kb.merge_provenance
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = merge_provenance.child_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY merge_provenance_update_policy ON kb.merge_provenance
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = merge_provenance.child_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = merge_provenance.child_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY merge_provenance_delete_policy ON kb.merge_provenance
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = merge_provenance.child_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
);

-- ============================================================================
-- kb.product_version_members - Filter via product_version_id JOIN
-- ============================================================================

ALTER TABLE kb.product_version_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.product_version_members FORCE ROW LEVEL SECURITY;

CREATE POLICY product_version_members_select_policy ON kb.product_version_members
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = product_version_members.product_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY product_version_members_insert_policy ON kb.product_version_members
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = product_version_members.product_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY product_version_members_update_policy ON kb.product_version_members
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = product_version_members.product_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
)
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = product_version_members.product_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
);

CREATE POLICY product_version_members_delete_policy ON kb.product_version_members
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  EXISTS (
    SELECT 1 
    FROM kb.product_versions 
    WHERE product_versions.id = product_version_members.product_version_id
      AND product_versions.project_id::text = current_setting('app.current_project_id', true)
  )
);
