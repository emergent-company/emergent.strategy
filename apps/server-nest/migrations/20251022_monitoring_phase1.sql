-- Migration: System Monitoring Phase 1 - Extraction Jobs Monitoring
-- Date: 2025-10-22
-- Description: Create tables for logging process events and LLM calls
-- Scope: Extraction job monitoring with cost tracking
-- =============================================================================
-- Table: kb.system_process_logs
-- Purpose: General text logs for any process (extraction jobs, syncs, etc.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb.system_process_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id TEXT NOT NULL,
    process_type TEXT NOT NULL,
    level TEXT NOT NULL CHECK (
        level IN ('debug', 'info', 'warn', 'error', 'fatal')
    ),
    message TEXT NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    org_id TEXT,
    project_id UUID,
    -- Performance indexes
    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_system_process_logs_process_id ON kb.system_process_logs(process_id);

CREATE INDEX IF NOT EXISTS idx_system_process_logs_process_type_timestamp ON kb.system_process_logs(process_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_system_process_logs_org_timestamp ON kb.system_process_logs(org_id, timestamp DESC)
WHERE
    org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_process_logs_project_timestamp ON kb.system_process_logs(project_id, timestamp DESC)
WHERE
    project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_process_logs_level_timestamp ON kb.system_process_logs(level, timestamp DESC);

-- RLS Policies
ALTER TABLE
    kb.system_process_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_process_logs_tenant_isolation ON kb.system_process_logs USING (
    project_id IS NULL
    OR project_id IN (
        SELECT
            id
        FROM
            kb.projects
        WHERE
            organization_id = current_setting('app.current_tenant', true) :: text
    )
);

-- =============================================================================
-- Table: kb.llm_call_logs
-- Purpose: Track every LLM API call with request/response and cost
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb.llm_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id TEXT NOT NULL,
    process_type TEXT NOT NULL,
    -- Request details
    request_payload JSONB NOT NULL,
    model_name TEXT NOT NULL,
    -- Response details
    response_payload JSONB,
    status TEXT NOT NULL CHECK (
        status IN ('success', 'error', 'timeout', 'pending')
    ),
    error_message TEXT,
    -- Usage metrics
    usage_metrics JSONB,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    -- Cost tracking
    cost_usd DECIMAL(10, 6),
    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    -- Tenant context
    org_id TEXT,
    project_id UUID,
    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_llm_call_logs_process_id ON kb.llm_call_logs(process_id);

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_model_timestamp ON kb.llm_call_logs(model_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_org_timestamp ON kb.llm_call_logs(org_id, started_at DESC)
WHERE
    org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_project_timestamp ON kb.llm_call_logs(project_id, started_at DESC)
WHERE
    project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_status ON kb.llm_call_logs(status, started_at DESC);

-- RLS Policies
ALTER TABLE
    kb.llm_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY llm_call_logs_tenant_isolation ON kb.llm_call_logs USING (
    project_id IS NULL
    OR project_id IN (
        SELECT
            id
        FROM
            kb.projects
        WHERE
            organization_id = current_setting('app.current_tenant', true) :: text
    )
);

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE kb.system_process_logs IS 'General process logging for extraction jobs, syncs, and other background tasks. Part of System Monitoring feature.';

COMMENT ON COLUMN kb.system_process_logs.process_id IS 'Identifier of the process being logged (e.g., job_id, session_id)';

COMMENT ON COLUMN kb.system_process_logs.process_type IS 'Type of process: extraction_job, sync, chat_session, etc.';

COMMENT ON COLUMN kb.system_process_logs.metadata IS 'Additional structured data (e.g., step_name, entity_count, etc.)';

COMMENT ON TABLE kb.llm_call_logs IS 'Tracks all LLM API calls with full request/response payloads, token usage, and cost calculation. Part of System Monitoring feature.';

COMMENT ON COLUMN kb.llm_call_logs.usage_metrics IS 'Raw usage data from LLM provider (tokens, model info, etc.)';

COMMENT ON COLUMN kb.llm_call_logs.cost_usd IS 'Calculated cost in USD based on model pricing configuration';

-- =============================================================================
-- Rollback instructions (for reference)
-- =============================================================================
-- To rollback this migration:
-- DROP TABLE IF EXISTS kb.llm_call_logs CASCADE;
-- DROP TABLE IF EXISTS kb.system_process_logs CASCADE;