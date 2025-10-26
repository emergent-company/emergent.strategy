-- Migration: Remove project_id from graph_embedding_jobs
-- Date: 2025-10-25
-- Purpose: The old schema doesn't have project_id on this table - only object_id
--          The project association comes from the graph_object, not the job itself

ALTER TABLE kb.graph_embedding_jobs
    DROP COLUMN IF EXISTS project_id CASCADE;

-- Also drop the old columns that don't exist in production schema
ALTER TABLE kb.graph_embedding_jobs
    DROP COLUMN IF EXISTS total_objects CASCADE,
    DROP COLUMN IF EXISTS processed_objects CASCADE,
    DROP COLUMN IF EXISTS failed_objects CASCADE;
