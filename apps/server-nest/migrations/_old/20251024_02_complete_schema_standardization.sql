-- Migration: Complete Schema Standardization - Part 2
-- Description: Rename remaining org_id columns to organization_id and add missing foreign keys
-- Date: 2025-10-24
-- ============================================================================
-- ============================================================================
-- PART 1: Rename remaining org_id -> organization_id
-- ============================================================================
-- graph_relationships
ALTER TABLE
    kb.graph_relationships RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.graph_relationships
ADD
    CONSTRAINT fk_graph_relationships_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

ALTER TABLE
    kb.graph_relationships
ADD
    CONSTRAINT fk_graph_relationships_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

-- invites: Keep as org_id since it follows a different pattern, but add FK if missing
ALTER TABLE
    kb.invites DROP CONSTRAINT IF EXISTS fk_invites_organization;

ALTER TABLE
    kb.invites
ADD
    CONSTRAINT fk_invites_organization FOREIGN KEY (org_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

ALTER TABLE
    kb.invites DROP CONSTRAINT IF EXISTS fk_invites_project;

ALTER TABLE
    kb.invites
ADD
    CONSTRAINT fk_invites_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

-- mcp_tool_calls: Should have been converted in previous migration, but check
-- If it still has org_id (TEXT), this means the conversion failed
DO $ $ BEGIN -- Check if org_id exists and is TEXT
IF EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_schema = 'kb'
        AND table_name = 'mcp_tool_calls'
        AND column_name = 'org_id'
        AND data_type = 'text'
) THEN -- Add organization_id column
ALTER TABLE
    kb.mcp_tool_calls
ADD
    COLUMN organization_id UUID;

-- Migrate valid UUIDs
UPDATE
    kb.mcp_tool_calls
SET
    organization_id = org_id :: uuid
WHERE
    org_id IS NOT NULL
    AND org_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Add foreign key
ALTER TABLE
    kb.mcp_tool_calls
ADD
    CONSTRAINT fk_mcp_tool_calls_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE
SET
    NULL;

-- Drop old column
ALTER TABLE
    kb.mcp_tool_calls DROP COLUMN org_id;

END IF;

END $ $;

-- object_type_schemas
ALTER TABLE
    kb.object_type_schemas RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.object_type_schemas
ADD
    CONSTRAINT fk_object_type_schemas_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

ALTER TABLE
    kb.object_type_schemas
ADD
    CONSTRAINT fk_object_type_schemas_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

-- organization_memberships: Keep as org_id (it's the primary reference)
ALTER TABLE
    kb.organization_memberships DROP CONSTRAINT IF EXISTS fk_organization_memberships_organization;

ALTER TABLE
    kb.organization_memberships
ADD
    CONSTRAINT fk_organization_memberships_organization FOREIGN KEY (org_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- projects: Rename org_id to organization_id
ALTER TABLE
    kb.projects RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.projects
ADD
    CONSTRAINT fk_projects_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- relationship_type_schemas
ALTER TABLE
    kb.relationship_type_schemas RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.relationship_type_schemas
ADD
    CONSTRAINT fk_relationship_type_schemas_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

ALTER TABLE
    kb.relationship_type_schemas
ADD
    CONSTRAINT fk_relationship_type_schemas_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

-- ============================================================================
-- PART 2: Update indexes for renamed columns
-- ============================================================================
-- Drop and recreate any indexes that reference old column names
-- (Most should have been updated in previous migration, but check these)
-- ============================================================================
-- PART 3: Update column comments
-- ============================================================================
COMMENT ON COLUMN kb.graph_relationships.organization_id IS 'Organization this relationship belongs to (FK to orgs.id)';

COMMENT ON COLUMN kb.object_type_schemas.organization_id IS 'Organization this type schema belongs to (FK to orgs.id)';

COMMENT ON COLUMN kb.projects.organization_id IS 'Organization this project belongs to (FK to orgs.id)';

COMMENT ON COLUMN kb.relationship_type_schemas.organization_id IS 'Organization this relationship type belongs to (FK to orgs.id)';

-- ============================================================================
-- Summary
-- ============================================================================
-- Renamed org_id -> organization_id in:
-- - graph_relationships
-- - object_type_schemas  
-- - projects
-- - relationship_type_schemas
--
-- Kept org_id (but added FKs) in:
-- - invites (different naming pattern)
-- - organization_memberships (primary org reference)
--
-- Added missing foreign keys for all organization_id and project_id columns
-- ============================================================================