-- ============================================================================
-- Integration Gallery & ClickUp Integration - Database Schema
-- Migration: 0003_integrations_system.sql
-- Created: 2025-10-05
-- Description: Adds support for third-party integrations with ClickUp as first implementation
-- ============================================================================
-- Enable pgcrypto extension for encryption (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Integrations table: stores configuration for all integrations
CREATE TABLE IF NOT EXISTS kb.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    -- e.g., 'clickup', 'jira', 'github'
    display_name VARCHAR(255) NOT NULL,
    -- e.g., 'ClickUp', 'Jira Cloud'
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    -- Scoping: integrations are project-specific
    org_id TEXT NOT NULL,
    project_id UUID NOT NULL,
    -- Encrypted settings (JSON with auth, data mapping, sync settings)
    -- Use pgcrypto for AES-256 encryption/decryption
    settings_encrypted BYTEA,
    -- Metadata
    logo_url TEXT,
    webhook_secret TEXT,
    -- For validating webhook signatures
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT,
    -- User ID who enabled the integration
    CONSTRAINT uq_integration_project UNIQUE(name, project_id) -- One integration instance per project
);

-- Indexes for integrations
CREATE INDEX IF NOT EXISTS idx_integrations_project ON kb.integrations(project_id);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON kb.integrations(org_id);

CREATE INDEX IF NOT EXISTS idx_integrations_enabled ON kb.integrations(enabled)
WHERE
    enabled = true;

CREATE INDEX IF NOT EXISTS idx_integrations_name ON kb.integrations(name);

-- ClickUp sync state: tracks synchronization progress
CREATE TABLE IF NOT EXISTS kb.clickup_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES kb.integrations(id) ON DELETE CASCADE,
    -- Track last sync times per entity type
    last_full_import_at TIMESTAMPTZ,
    last_workspace_sync_at TIMESTAMPTZ,
    last_space_sync_at TIMESTAMPTZ,
    last_folder_sync_at TIMESTAMPTZ,
    last_list_sync_at TIMESTAMPTZ,
    last_task_sync_at TIMESTAMPTZ,
    -- Sync cursors for incremental updates
    sync_cursor TEXT,
    workspace_cursor JSONB,
    -- Per-workspace sync cursors
    -- Import job tracking
    active_import_job_id UUID,
    -- References kb.object_extraction_jobs
    import_status VARCHAR(50),
    -- 'idle', 'running', 'completed', 'failed'
    -- Statistics
    total_imported_objects INT DEFAULT 0,
    total_synced_tasks INT DEFAULT 0,
    total_synced_lists INT DEFAULT 0,
    total_synced_spaces INT DEFAULT 0,
    -- Error tracking
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    consecutive_failures INT DEFAULT 0,
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for clickup_sync_state
CREATE INDEX IF NOT EXISTS idx_clickup_sync_integration ON kb.clickup_sync_state(integration_id);

CREATE INDEX IF NOT EXISTS idx_clickup_sync_status ON kb.clickup_sync_state(import_status);

-- Update trigger function for updated_at timestamps
CREATE
OR REPLACE FUNCTION kb.update_updated_at_column() RETURNS TRIGGER AS $ $ BEGIN NEW.updated_at = now();

RETURN NEW;

END;

$ $ LANGUAGE plpgsql;

-- Apply triggers to integrations table
DROP TRIGGER IF EXISTS trg_integrations_updated_at ON kb.integrations;

CREATE TRIGGER trg_integrations_updated_at BEFORE
UPDATE
    ON kb.integrations FOR EACH ROW EXECUTE FUNCTION kb.update_updated_at_column();

-- Apply triggers to clickup_sync_state table
DROP TRIGGER IF EXISTS trg_clickup_sync_state_updated_at ON kb.clickup_sync_state;

CREATE TRIGGER trg_clickup_sync_state_updated_at BEFORE
UPDATE
    ON kb.clickup_sync_state FOR EACH ROW EXECUTE FUNCTION kb.update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE kb.integrations IS 'Stores configuration for third-party integrations (ClickUp, Jira, etc.)';

COMMENT ON COLUMN kb.integrations.settings_encrypted IS 'Encrypted JSON containing auth tokens, API keys, and configuration';

COMMENT ON COLUMN kb.integrations.webhook_secret IS 'Secret for validating webhook signatures from the integration provider';

COMMENT ON TABLE kb.clickup_sync_state IS 'Tracks synchronization state for ClickUp integrations';

COMMENT ON COLUMN kb.clickup_sync_state.sync_cursor IS 'Cursor for incremental sync (pagination token, timestamp, etc.)';

COMMENT ON COLUMN kb.clickup_sync_state.workspace_cursor IS 'Per-workspace sync cursors for parallel synchronization';

-- Grant permissions (adjust based on actual DB roles in production)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON kb.integrations TO spec;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON kb.clickup_sync_state TO spec;
-- Verification queries
-- To verify the migration:
-- SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'kb' AND tablename IN ('integrations', 'clickup_sync_state');
-- SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'kb' AND table_name IN ('integrations', 'clickup_sync_state');