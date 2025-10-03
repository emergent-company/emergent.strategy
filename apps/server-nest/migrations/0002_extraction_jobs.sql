-- Migration: Extraction Jobs Table
-- Description: Tracking table for document extraction jobs (Phase 1 stub for Phase 2 extraction workers)
-- Purpose: Track job lifecycle (pending → running → completed/failed) and store results/errors
-- Phase 1: Basic job tracking with status
-- Phase 2+: Integration with Bull queue for async extraction workers
-- ============================================================================
-- Table: kb.extraction_jobs
-- ============================================================================
-- Purpose: Track extraction job lifecycle and results
-- RLS: Project-scoped (users can only see jobs in their projects)
CREATE TABLE IF NOT EXISTS kb.extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Ownership
    org_id UUID NOT NULL,
    project_id UUID NOT NULL,
    -- Job source
    source_type VARCHAR(50) NOT NULL CHECK (
        source_type IN ('document', 'api', 'manual', 'bulk_import')
    ),
    source_id UUID NULL,
    -- Reference to source document/object (optional)
    source_metadata JSONB DEFAULT '{}',
    -- Job configuration
    extraction_config JSONB NOT NULL DEFAULT '{}',
    -- Extraction parameters (target types, filters, etc.)
    -- Job status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'running',
            'completed',
            'failed',
            'cancelled'
        )
    ),
    -- Progress tracking
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    successful_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    -- Results
    discovered_types JSONB DEFAULT '[]',
    -- Array of discovered type names
    created_objects JSONB DEFAULT '[]',
    -- Array of created object IDs
    -- Error tracking
    error_message TEXT NULL,
    error_details JSONB NULL,
    -- Timing
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NULL,
    -- User who initiated the job
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Foreign keys
    CONSTRAINT fk_extraction_jobs_org FOREIGN KEY (org_id) REFERENCES kb.orgs(id) ON DELETE CASCADE,
    CONSTRAINT fk_extraction_jobs_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE,
    -- Constraints
    CONSTRAINT check_progress_values CHECK (
        processed_items >= 0
        AND successful_items >= 0
        AND failed_items >= 0
        AND processed_items = successful_items + failed_items
    ),
    CONSTRAINT check_timing_order CHECK (
        (
            started_at IS NULL
            OR started_at >= created_at
        )
        AND (
            completed_at IS NULL
            OR (
                started_at IS NOT NULL
                AND completed_at >= started_at
            )
        )
    )
);

-- ============================================================================
-- Indexes
-- ============================================================================
-- Primary lookup by project (most common query)
CREATE INDEX idx_extraction_jobs_project ON kb.extraction_jobs(project_id, created_at DESC);

-- Filter by status (pending jobs, failed jobs, etc.)
CREATE INDEX idx_extraction_jobs_status ON kb.extraction_jobs(status, created_at DESC);

-- Combined project + status (very common pattern)
CREATE INDEX idx_extraction_jobs_project_status ON kb.extraction_jobs(project_id, status, created_at DESC);

-- Lookup by source (find jobs for a specific document)
CREATE INDEX idx_extraction_jobs_source ON kb.extraction_jobs(source_type, source_id)
WHERE
    source_id IS NOT NULL;

-- Find jobs by user (audit trail)
CREATE INDEX idx_extraction_jobs_created_by ON kb.extraction_jobs(created_by, created_at DESC)
WHERE
    created_by IS NOT NULL;

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================
ALTER TABLE
    kb.extraction_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view jobs in their accessible projects
CREATE POLICY extraction_jobs_select_policy ON kb.extraction_jobs FOR
SELECT
    USING (
        -- Project-scoped: user has access to the project
        project_id IN (
            SELECT
                p.id
            FROM
                kb.projects p
                JOIN kb.orgs o ON p.org_id = o.id
            WHERE
                p.id = extraction_jobs.project_id
        )
    );

-- Policy: Users can insert jobs in projects they can access
CREATE POLICY extraction_jobs_insert_policy ON kb.extraction_jobs FOR
INSERT
    WITH CHECK (
        project_id IN (
            SELECT
                p.id
            FROM
                kb.projects p
                JOIN kb.orgs o ON p.org_id = o.id
        )
    );

-- Policy: Users can update jobs in their accessible projects
CREATE POLICY extraction_jobs_update_policy ON kb.extraction_jobs FOR
UPDATE
    USING (
        project_id IN (
            SELECT
                p.id
            FROM
                kb.projects p
                JOIN kb.orgs o ON p.org_id = o.id
            WHERE
                p.id = extraction_jobs.project_id
        )
    );

-- Policy: Users can delete jobs in their accessible projects
CREATE POLICY extraction_jobs_delete_policy ON kb.extraction_jobs FOR DELETE USING (
    project_id IN (
        SELECT
            p.id
        FROM
            kb.projects p
            JOIN kb.orgs o ON p.org_id = o.id
        WHERE
            p.id = extraction_jobs.project_id
    )
);

-- ============================================================================
-- Functions
-- ============================================================================
-- Function: Update updated_at timestamp on modification
CREATE
OR REPLACE FUNCTION kb.update_extraction_jobs_updated_at() RETURNS TRIGGER AS $ $ BEGIN NEW.updated_at = NOW();

RETURN NEW;

END;

$ $ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on row modification
CREATE TRIGGER extraction_jobs_updated_at_trigger BEFORE
UPDATE
    ON kb.extraction_jobs FOR EACH ROW EXECUTE FUNCTION kb.update_extraction_jobs_updated_at();

-- Function: Auto-calculate completed_at when status changes to completed/failed/cancelled
CREATE
OR REPLACE FUNCTION kb.extraction_jobs_complete_timestamp() RETURNS TRIGGER AS $ $ BEGIN -- If status changed to terminal state and completed_at not set, set it now
IF NEW.status IN ('completed', 'failed', 'cancelled')
AND OLD.status NOT IN ('completed', 'failed', 'cancelled') THEN IF NEW.completed_at IS NULL THEN NEW.completed_at = NOW();

END IF;

END IF;

-- If status changed to running and started_at not set, set it now
IF NEW.status = 'running'
AND OLD.status != 'running' THEN IF NEW.started_at IS NULL THEN NEW.started_at = NOW();

END IF;

END IF;

RETURN NEW;

END;

$ $ LANGUAGE plpgsql;

-- Trigger: Auto-set timestamps based on status
CREATE TRIGGER extraction_jobs_status_timestamp_trigger BEFORE
UPDATE
    ON kb.extraction_jobs FOR EACH ROW
    WHEN (
        OLD.status IS DISTINCT
        FROM
            NEW.status
    ) EXECUTE FUNCTION kb.extraction_jobs_complete_timestamp();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE kb.extraction_jobs IS 'Extraction job tracking table - tracks lifecycle of document extraction jobs (Phase 1 stub)';

COMMENT ON COLUMN kb.extraction_jobs.source_type IS 'Type of extraction source: document (PDF/DOCX), api (external API), manual (user-triggered), bulk_import';

COMMENT ON COLUMN kb.extraction_jobs.source_id IS 'Optional reference to source object (e.g., document object ID)';

COMMENT ON COLUMN kb.extraction_jobs.extraction_config IS 'Extraction configuration: target types, filters, extraction rules, etc.';

COMMENT ON COLUMN kb.extraction_jobs.status IS 'Job status: pending (queued), running (in progress), completed (success), failed (error), cancelled (user cancelled)';

COMMENT ON COLUMN kb.extraction_jobs.discovered_types IS 'Array of type names discovered during extraction (for auto-discovery feature)';

COMMENT ON COLUMN kb.extraction_jobs.created_objects IS 'Array of object IDs created during extraction';

COMMENT ON COLUMN kb.extraction_jobs.error_message IS 'Human-readable error message (if status=failed)';

COMMENT ON COLUMN kb.extraction_jobs.error_details IS 'Detailed error information (stack trace, context) for debugging';