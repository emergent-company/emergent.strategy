-- Migration: Standardize Schema Consistency
-- Description: Fix org_id vs organization_id inconsistencies, remove tenant_id, add proper foreign keys
-- Date: 2025-10-24
-- ============================================================================
--
-- This migration addresses several schema consistency issues:
-- 1. Standardizes all org references to use 'organization_id' (UUID with FK)
-- 2. Removes all tenant_id columns (dual schema removed)
-- 3. Converts TEXT organization/project columns to UUID with foreign keys
-- 4. Ensures all tables follow consistent naming conventions
--
-- ============================================================================
-- ============================================================================
-- PART 1: Remove tenant_id columns (dual schema no longer needed)
-- ============================================================================
-- discovery_jobs: Remove tenant_id
ALTER TABLE
    kb.discovery_jobs DROP COLUMN IF EXISTS tenant_id;

-- project_object_type_registry: Remove tenant_id
ALTER TABLE
    kb.project_object_type_registry DROP COLUMN IF EXISTS tenant_id;

-- project_template_packs: Remove tenant_id
ALTER TABLE
    kb.project_template_packs DROP COLUMN IF EXISTS tenant_id;

-- ============================================================================
-- PART 2: Standardize org_id -> organization_id in tables that use UUID
-- ============================================================================
-- branches: Rename org_id to organization_id, add FK
ALTER TABLE
    kb.branches RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.branches
ADD
    CONSTRAINT fk_branches_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- chat_conversations: Rename org_id to organization_id, add FK
ALTER TABLE
    kb.chat_conversations RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.chat_conversations
ADD
    CONSTRAINT fk_chat_conversations_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- chunks: Rename org_id to organization_id, add FK
ALTER TABLE
    kb.chunks RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.chunks
ADD
    CONSTRAINT fk_chunks_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- documents: Rename org_id to organization_id, add FK
ALTER TABLE
    kb.documents RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.documents
ADD
    CONSTRAINT fk_documents_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- graph_objects: Rename org_id to organization_id, add FK
ALTER TABLE
    kb.graph_objects RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.graph_objects
ADD
    CONSTRAINT fk_graph_objects_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- invites: Already uses org_id (UUID) - add FK
ALTER TABLE
    kb.invites
ADD
    CONSTRAINT fk_invites_organization FOREIGN KEY (org_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- object_extraction_jobs: Rename org_id to organization_id, add FK
ALTER TABLE
    kb.object_extraction_jobs RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.object_extraction_jobs
ADD
    CONSTRAINT fk_extraction_jobs_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- product_versions: Rename org_id to organization_id, add FK
ALTER TABLE
    kb.product_versions RENAME COLUMN org_id TO organization_id;

ALTER TABLE
    kb.product_versions
ADD
    CONSTRAINT fk_product_versions_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- tags: Rename org_id to organization_id (already has FK from 0002)
ALTER TABLE
    kb.tags RENAME COLUMN org_id TO organization_id;

-- Drop old FK constraint and recreate with new column name
ALTER TABLE
    kb.tags DROP CONSTRAINT IF EXISTS fk_tags_organization;

ALTER TABLE
    kb.tags
ADD
    CONSTRAINT fk_tags_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- ============================================================================
-- PART 3: Convert TEXT org_id columns to UUID with foreign keys
-- ============================================================================
-- integrations: Convert org_id TEXT to organization_id UUID
-- First, ensure all org_id values are valid UUIDs or NULL
UPDATE
    kb.integrations
SET
    org_id = NULL
WHERE
    org_id IS NOT NULL
    AND org_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Add new organization_id column
ALTER TABLE
    kb.integrations
ADD
    COLUMN organization_id UUID;

-- Migrate data
UPDATE
    kb.integrations
SET
    organization_id = org_id :: uuid
WHERE
    org_id IS NOT NULL
    AND org_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Add NOT NULL constraint after data migration
ALTER TABLE
    kb.integrations
ALTER COLUMN
    organization_id
SET
    NOT NULL;

-- Add foreign key
ALTER TABLE
    kb.integrations
ADD
    CONSTRAINT fk_integrations_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE CASCADE;

-- Drop old column
ALTER TABLE
    kb.integrations DROP COLUMN org_id;

-- llm_call_logs: Convert org_id TEXT to organization_id UUID
ALTER TABLE
    kb.llm_call_logs
ADD
    COLUMN organization_id UUID;

UPDATE
    kb.llm_call_logs
SET
    organization_id = org_id :: uuid
WHERE
    org_id IS NOT NULL
    AND org_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE
    kb.llm_call_logs
ADD
    CONSTRAINT fk_llm_call_logs_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE
SET
    NULL;

ALTER TABLE
    kb.llm_call_logs DROP COLUMN org_id;

-- mcp_tool_calls: Convert org_id TEXT to organization_id UUID
ALTER TABLE
    kb.mcp_tool_calls
ADD
    COLUMN organization_id UUID;

UPDATE
    kb.mcp_tool_calls
SET
    organization_id = org_id :: uuid
WHERE
    org_id IS NOT NULL
    AND org_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE
    kb.mcp_tool_calls
ADD
    CONSTRAINT fk_mcp_tool_calls_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE
SET
    NULL;

ALTER TABLE
    kb.mcp_tool_calls DROP COLUMN org_id;

-- system_process_logs: Convert org_id TEXT to organization_id UUID
ALTER TABLE
    kb.system_process_logs
ADD
    COLUMN organization_id UUID;

UPDATE
    kb.system_process_logs
SET
    organization_id = org_id :: uuid
WHERE
    org_id IS NOT NULL
    AND org_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE
    kb.system_process_logs
ADD
    CONSTRAINT fk_system_process_logs_organization FOREIGN KEY (organization_id) REFERENCES kb.orgs(id) ON DELETE
SET
    NULL;

ALTER TABLE
    kb.system_process_logs DROP COLUMN org_id;

-- ============================================================================
-- PART 4: Update indexes to use new column names
-- ============================================================================
-- Drop old indexes
DROP INDEX IF EXISTS kb.idx_chat_conversations_org_proj;

DROP INDEX IF EXISTS kb.idx_documents_org;

DROP INDEX IF EXISTS kb.idx_integrations_org;

DROP INDEX IF EXISTS kb.idx_llm_call_logs_org_timestamp;

DROP INDEX IF EXISTS kb.idx_mcp_tool_calls_org;

DROP INDEX IF EXISTS kb.idx_tags_org_id;

-- Recreate indexes with new column names
CREATE INDEX idx_chat_conversations_organization_proj ON kb.chat_conversations(organization_id, project_id, updated_at DESC);

CREATE INDEX idx_documents_organization ON kb.documents(organization_id);

CREATE INDEX idx_integrations_organization ON kb.integrations(organization_id);

CREATE INDEX idx_llm_call_logs_organization_timestamp ON kb.llm_call_logs(organization_id, started_at DESC)
WHERE
    organization_id IS NOT NULL;

CREATE INDEX idx_mcp_tool_calls_organization ON kb.mcp_tool_calls(organization_id, "timestamp");

CREATE INDEX idx_tags_organization_id ON kb.tags(organization_id);

-- ============================================================================
-- PART 5: Update RLS policies to use organization_id
-- ============================================================================
-- Drop existing policies for tables we modified
DROP POLICY IF EXISTS tags_isolation ON kb.tags;

DROP POLICY IF EXISTS tags_read ON kb.tags;

DROP POLICY IF EXISTS tags_insert ON kb.tags;

DROP POLICY IF EXISTS tags_update ON kb.tags;

DROP POLICY IF EXISTS tags_delete ON kb.tags;

-- Recreate tags policies with organization_id
CREATE POLICY tags_isolation ON kb.tags USING (
    organization_id :: text = current_setting('app.current_organization_id', TRUE)
);

CREATE POLICY tags_read ON kb.tags FOR
SELECT
    USING (
        organization_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_insert ON kb.tags FOR
INSERT
    WITH CHECK (
        organization_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_update ON kb.tags FOR
UPDATE
    USING (
        organization_id :: text = current_setting('app.current_organization_id', TRUE)
    );

CREATE POLICY tags_delete ON kb.tags FOR DELETE USING (
    organization_id :: text = current_setting('app.current_organization_id', TRUE)
);

-- ============================================================================
-- PART 6: Add missing foreign keys for project_id columns
-- ============================================================================
-- Add foreign keys where missing (only for tables not already having them)
ALTER TABLE
    kb.branches
ADD
    CONSTRAINT fk_branches_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

ALTER TABLE
    kb.chat_conversations
ADD
    CONSTRAINT fk_chat_conversations_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

ALTER TABLE
    kb.chunks
ADD
    CONSTRAINT fk_chunks_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

ALTER TABLE
    kb.documents
ADD
    CONSTRAINT fk_documents_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

ALTER TABLE
    kb.graph_objects
ADD
    CONSTRAINT fk_graph_objects_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

ALTER TABLE
    kb.integrations
ADD
    CONSTRAINT fk_integrations_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

ALTER TABLE
    kb.invites
ADD
    CONSTRAINT fk_invites_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

ALTER TABLE
    kb.llm_call_logs
ADD
    CONSTRAINT fk_llm_call_logs_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE
SET
    NULL;

ALTER TABLE
    kb.mcp_tool_calls
ADD
    CONSTRAINT fk_mcp_tool_calls_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE
SET
    NULL;

ALTER TABLE
    kb.product_versions
ADD
    CONSTRAINT fk_product_versions_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE;

ALTER TABLE
    kb.system_process_logs
ADD
    CONSTRAINT fk_system_process_logs_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE
SET
    NULL;

-- ============================================================================
-- PART 7: Update table comments to reflect changes
-- ============================================================================
COMMENT ON COLUMN kb.integrations.organization_id IS 'Organization this integration belongs to (FK to orgs.id)';

COMMENT ON COLUMN kb.llm_call_logs.organization_id IS 'Organization context for this LLM call (FK to orgs.id)';

COMMENT ON COLUMN kb.mcp_tool_calls.organization_id IS 'Organization context for this tool call (FK to orgs.id)';

COMMENT ON COLUMN kb.system_process_logs.organization_id IS 'Organization context for this log entry (FK to orgs.id)';

COMMENT ON COLUMN kb.tags.organization_id IS 'Organization this tag belongs to (FK to orgs.id, for RLS)';

-- ============================================================================
-- Summary of Changes
-- ============================================================================
-- 
-- REMOVED:
-- - tenant_id from: discovery_jobs, project_object_type_registry, project_template_packs
--
-- RENAMED (org_id -> organization_id):
-- - branches, chat_conversations, chunks, documents, graph_objects
-- - object_extraction_jobs, product_versions, tags
--
-- CONVERTED (TEXT org_id -> UUID organization_id with FK):
-- - integrations, llm_call_logs, mcp_tool_calls, system_process_logs
--
-- ADDED FOREIGN KEYS:
-- - All organization_id columns now reference kb.orgs(id)
-- - All project_id columns now reference kb.projects(id)
--
-- UPDATED INDEXES:
-- - Recreated all indexes using new column names
--
-- UPDATED RLS POLICIES:
-- - Tags policies updated to use organization_id
--
-- ============================================================================