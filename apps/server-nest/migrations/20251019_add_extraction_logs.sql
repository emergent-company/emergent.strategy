-- Migration: Add extraction logs table for detailed LLM interaction tracking
-- Date: 2025-10-19
-- Purpose: Store detailed logs of each extraction step (prompts, responses, errors) for debugging and UI inspection
CREATE TABLE IF NOT EXISTS kb.object_extraction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_job_id UUID NOT NULL REFERENCES kb.object_extraction_jobs(id) ON DELETE CASCADE,
    -- Timestamp and step info
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    step_index INTEGER NOT NULL,
    -- Order of operations within the job
    operation_type TEXT NOT NULL,
    -- e.g., 'llm_call', 'chunk_processing', 'object_creation', 'relationship_creation', 'error'
    -- Operation details
    operation_name TEXT,
    -- e.g., 'extract_entities', 'create_graph_object', 'link_entities'
    status TEXT NOT NULL DEFAULT 'success',
    -- 'success', 'error', 'warning'
    -- Input/Output data (can be large, so stored as JSONB for flexibility)
    input_data JSONB,
    -- Prompt, chunk text, entity data, etc.
    output_data JSONB,
    -- LLM response, created IDs, etc.
    -- Error tracking
    error_message TEXT,
    error_stack TEXT,
    -- Performance metrics
    duration_ms INTEGER,
    -- How long this step took
    tokens_used INTEGER,
    -- If applicable (LLM calls)
    -- Metadata
    metadata JSONB,
    -- Additional context (model name, chunk index, etc.)
    -- Indexes for efficient querying
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching logs by job
CREATE INDEX IF NOT EXISTS idx_extraction_logs_job_id ON kb.object_extraction_logs(extraction_job_id);

-- Index for chronological ordering
CREATE INDEX IF NOT EXISTS idx_extraction_logs_job_step ON kb.object_extraction_logs(extraction_job_id, step_index);

-- Index for filtering by operation type
CREATE INDEX IF NOT EXISTS idx_extraction_logs_operation ON kb.object_extraction_logs(extraction_job_id, operation_type);

-- Index for error logs
CREATE INDEX IF NOT EXISTS idx_extraction_logs_errors ON kb.object_extraction_logs(extraction_job_id)
WHERE
    status = 'error';

-- Add comment for documentation
COMMENT ON TABLE kb.object_extraction_logs IS 'Detailed logs of extraction job operations for debugging and UI inspection';

COMMENT ON COLUMN kb.object_extraction_logs.operation_type IS 'Type of operation: llm_call, chunk_processing, object_creation, relationship_creation, error';

COMMENT ON COLUMN kb.object_extraction_logs.input_data IS 'Input to the operation (prompt, chunk text, entity data)';

COMMENT ON COLUMN kb.object_extraction_logs.output_data IS 'Output from the operation (LLM response, created IDs)';