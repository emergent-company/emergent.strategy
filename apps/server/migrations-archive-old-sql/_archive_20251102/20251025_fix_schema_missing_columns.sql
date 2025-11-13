-- Migration: Fix missing columns and functions from refactored schema
-- Date: 2025-10-25
-- Purpose: Add missing columns that exist in production but were lost during refactor

-- ============================================================================
-- Fix graph_embedding_jobs table
-- ============================================================================
-- Missing columns: object_id, attempt_count, last_error, priority, scheduled_at, updated_at
-- Also needs proper constraints

-- Add missing columns
ALTER TABLE kb.graph_embedding_jobs 
    ADD COLUMN IF NOT EXISTS object_id UUID,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

-- Add foreign key for object_id
ALTER TABLE kb.graph_embedding_jobs
    ADD CONSTRAINT fk_graph_embedding_jobs_object
    FOREIGN KEY (object_id) REFERENCES kb.graph_objects(id) ON DELETE CASCADE;

-- Add check constraint for status
ALTER TABLE kb.graph_embedding_jobs
    DROP CONSTRAINT IF EXISTS graph_embedding_jobs_status_check;
ALTER TABLE kb.graph_embedding_jobs
    ADD CONSTRAINT graph_embedding_jobs_status_check 
    CHECK (status IN ('pending', 'processing', 'failed', 'completed'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object_id 
    ON kb.graph_embedding_jobs(object_id);
CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_status_sched 
    ON kb.graph_embedding_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_priority 
    ON kb.graph_embedding_jobs(priority DESC, scheduled_at);

-- ============================================================================
-- Fix object_extraction_jobs table
-- ============================================================================
-- Add missing columns: started_at, completed_at, error_message, debug_info, logs

ALTER TABLE kb.object_extraction_jobs
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS debug_info JSONB,
    ADD COLUMN IF NOT EXISTS logs JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- Create missing database functions
-- ============================================================================

-- Function: refresh_revision_counts
-- Purpose: Refresh materialized view for graph object revision counts
CREATE OR REPLACE FUNCTION kb.refresh_revision_counts()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Note: This is a placeholder. In production, this would refresh
    -- a materialized view that tracks revision counts per object.
    -- Since we don't have that view yet, this is a no-op.
    -- TODO: Create materialized view and implement proper refresh logic
    RETURN;
END;
$$;

-- ============================================================================
-- Add missing RLS policies
-- ============================================================================
-- Note: RLS policies will be added in a separate migration after verifying
-- the exact policy requirements
