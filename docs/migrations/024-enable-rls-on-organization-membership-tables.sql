-- Migration: Enable RLS on organization and membership tables
-- Created: 2025-11-19
-- Purpose: Enforce organization-level and project-level isolation for core access control tables

-- ============================================================================
-- kb.orgs - Users should only see organizations they belong to
-- ============================================================================

ALTER TABLE kb.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.orgs FORCE ROW LEVEL SECURITY;

CREATE POLICY orgs_select_policy ON kb.orgs
FOR SELECT
USING (
  -- Bypass when no context set (migrations, admin queries)
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  -- Filter by organization context
  id::text = current_setting('app.current_organization_id', true)
);

CREATE POLICY orgs_insert_policy ON kb.orgs
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  id::text = current_setting('app.current_organization_id', true)
);

CREATE POLICY orgs_update_policy ON kb.orgs
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  id::text = current_setting('app.current_organization_id', true)
)
WITH CHECK (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  id::text = current_setting('app.current_organization_id', true)
);

CREATE POLICY orgs_delete_policy ON kb.orgs
FOR DELETE
USING (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  id::text = current_setting('app.current_organization_id', true)
);

-- ============================================================================
-- kb.projects - Users should only see projects in their organizations
-- ============================================================================

ALTER TABLE kb.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.projects FORCE ROW LEVEL SECURITY;

CREATE POLICY projects_select_policy ON kb.projects
FOR SELECT
USING (
  -- Bypass when no context set
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  -- Filter by specific project context
  id::text = current_setting('app.current_project_id', true)
  OR
  -- Or filter by organization context (for listing projects in an org)
  (
    COALESCE(current_setting('app.current_project_id', true), '') = ''
    AND
    organization_id::text = current_setting('app.current_organization_id', true)
  )
);

CREATE POLICY projects_insert_policy ON kb.projects
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  organization_id::text = current_setting('app.current_organization_id', true)
);

CREATE POLICY projects_update_policy ON kb.projects
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  id::text = current_setting('app.current_project_id', true)
)
WITH CHECK (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  organization_id::text = current_setting('app.current_organization_id', true)
);

CREATE POLICY projects_delete_policy ON kb.projects
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  id::text = current_setting('app.current_project_id', true)
);

-- ============================================================================
-- kb.organization_memberships - Filter by organization context
-- ============================================================================

ALTER TABLE kb.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.organization_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_memberships_select_policy ON kb.organization_memberships
FOR SELECT
USING (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  organization_id::text = current_setting('app.current_organization_id', true)
);

CREATE POLICY organization_memberships_insert_policy ON kb.organization_memberships
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  organization_id::text = current_setting('app.current_organization_id', true)
);

CREATE POLICY organization_memberships_update_policy ON kb.organization_memberships
FOR UPDATE
USING (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  organization_id::text = current_setting('app.current_organization_id', true)
)
WITH CHECK (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  organization_id::text = current_setting('app.current_organization_id', true)
);

CREATE POLICY organization_memberships_delete_policy ON kb.organization_memberships
FOR DELETE
USING (
  COALESCE(current_setting('app.current_organization_id', true), '') = ''
  OR
  organization_id::text = current_setting('app.current_organization_id', true)
);

-- ============================================================================
-- kb.project_memberships - Filter by project context (via JOIN)
-- ============================================================================

ALTER TABLE kb.project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb.project_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY project_memberships_select_policy ON kb.project_memberships
FOR SELECT
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

CREATE POLICY project_memberships_insert_policy ON kb.project_memberships
FOR INSERT
WITH CHECK (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);

CREATE POLICY project_memberships_update_policy ON kb.project_memberships
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

CREATE POLICY project_memberships_delete_policy ON kb.project_memberships
FOR DELETE
USING (
  COALESCE(current_setting('app.current_project_id', true), '') = ''
  OR
  project_id::text = current_setting('app.current_project_id', true)
);
