-- Migration: Add scheduled_at column to object_extraction_jobs
-- Purpose: Enable job scheduling for rate-limited extractions
-- Related: Bug #016 - Extraction Rate Limiting Causes Job Failures
--
-- This migration adds a scheduled_at column to support deferred job execution
-- when rate limits are hit. Jobs can be scheduled for future processing instead
-- of being marked as failed.

-- Add scheduled_at column (nullable, defaults to NULL)
-- NULL means "process immediately"
-- Non-NULL means "don't process until this time"
ALTER TABLE kb.object_extraction_jobs
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient dequeue queries
-- The dequeue query filters by: status = 'pending' AND (scheduled_at IS NULL OR scheduled_at <= NOW())
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_scheduled_dequeue 
ON kb.object_extraction_jobs (status, scheduled_at)
WHERE status = 'pending';

-- Add comment explaining the column
COMMENT ON COLUMN kb.object_extraction_jobs.scheduled_at IS 
'Timestamp when job should be processed. NULL = process immediately. Used to defer jobs when rate limits are hit.';

-- Verify the migration
DO $$
BEGIN
    -- Check that column was added
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'kb' 
        AND table_name = 'object_extraction_jobs' 
        AND column_name = 'scheduled_at'
    ) THEN
        RAISE EXCEPTION 'Migration failed: scheduled_at column not found';
    END IF;
    
    -- Check that index was created
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE schemaname = 'kb' 
        AND tablename = 'object_extraction_jobs' 
        AND indexname = 'idx_extraction_jobs_scheduled_dequeue'
    ) THEN
        RAISE EXCEPTION 'Migration failed: idx_extraction_jobs_scheduled_dequeue index not found';
    END IF;
    
    RAISE NOTICE 'Migration 029 completed successfully';
END $$;
