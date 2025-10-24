-- Migration: Rename org_id to organization_id across all tables
-- This migration standardizes on organization_id everywhere, eliminating org_id
BEGIN;

-- 1. kb.projects
ALTER TABLE
    kb.projects RENAME COLUMN org_id TO organization_id;

-- 2. kb.organization_memberships
ALTER TABLE
    kb.organization_memberships RENAME COLUMN org_id TO organization_id;

-- 3. kb.invites
ALTER TABLE
    kb.invites RENAME COLUMN org_id TO organization_id;

-- 4. kb.graph_objects
ALTER TABLE
    kb.graph_objects RENAME COLUMN org_id TO organization_id;

-- 5. kb.graph_relationships
ALTER TABLE
    kb.graph_relationships RENAME COLUMN org_id TO organization_id;

-- 6. kb.documents
ALTER TABLE
    kb.documents RENAME COLUMN org_id TO organization_id;

-- 7. kb.chunks
ALTER TABLE
    kb.chunks RENAME COLUMN org_id TO organization_id;

-- 8. kb.integrations
ALTER TABLE
    kb.integrations RENAME COLUMN org_id TO organization_id;

-- 9. kb.llm_call_logs (if it has org_id)
DO $ $ BEGIN IF EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_schema = 'kb'
        AND table_name = 'llm_call_logs'
        AND column_name = 'org_id'
) THEN
ALTER TABLE
    kb.llm_call_logs RENAME COLUMN org_id TO organization_id;

END IF;

END $ $;

-- Update any indexes that reference org_id
-- Note: PostgreSQL automatically updates index column names when columns are renamed
-- Update any foreign key constraints that reference org_id
-- Note: PostgreSQL automatically updates FK column names when columns are renamed
COMMIT;