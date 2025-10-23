-- Migration: Add progress tracking columns to extraction jobs
-- Date: 2025-10-18
-- Purpose: Enable real-time progress tracking in UI for long-running extraction jobs
-- Add progress tracking columns
ALTER TABLE
    kb.object_extraction_jobs
ADD
    COLUMN IF NOT EXISTS total_items INTEGER DEFAULT 0,
ADD
    COLUMN IF NOT EXISTS processed_items INTEGER DEFAULT 0,
ADD
    COLUMN IF NOT EXISTS successful_items INTEGER DEFAULT 0,
ADD
    COLUMN IF NOT EXISTS failed_items INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN kb.object_extraction_jobs.total_items IS 'Total number of entities to process (set when LLM returns extraction results)';

COMMENT ON COLUMN kb.object_extraction_jobs.processed_items IS 'Number of entities processed so far (incremented after each entity)';

COMMENT ON COLUMN kb.object_extraction_jobs.successful_items IS 'Number of entities successfully created as graph objects';

COMMENT ON COLUMN kb.object_extraction_jobs.failed_items IS 'Number of entities that failed to be created';

-- Add index for efficient querying of job progress
-- This supports queries like: "show all running jobs with their progress"
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_progress ON kb.object_extraction_jobs(status, processed_items, total_items)
WHERE
    status IN ('running', 'pending');

-- Add check constraint to ensure progress consistency
ALTER TABLE
    kb.object_extraction_jobs
ADD
    CONSTRAINT check_progress_consistency CHECK (
        processed_items >= 0
        AND total_items >= 0
        AND successful_items >= 0
        AND failed_items >= 0
        AND processed_items <= total_items
        AND (successful_items + failed_items) <= processed_items
    );

-- Update existing jobs to have consistent values
-- Set processed_items = 0 for pending/running jobs
-- Set processed_items = total_items for completed jobs (we don't know actual count, so assume all processed)
UPDATE
    kb.object_extraction_jobs
SET
    total_items = COALESCE(objects_created, 0),
    processed_items = CASE
        WHEN status IN ('completed', 'failed', 'cancelled') THEN COALESCE(objects_created, 0)
        ELSE 0
    END,
    successful_items = COALESCE(objects_created, 0),
    failed_items = 0
WHERE
    total_items IS NULL;

-- Verify migration
DO $ $ DECLARE col_count INTEGER;

BEGIN
SELECT
    COUNT(*) INTO col_count
FROM
    information_schema.columns
WHERE
    table_schema = 'kb'
    AND table_name = 'object_extraction_jobs'
    AND column_name IN (
        'total_items',
        'processed_items',
        'successful_items',
        'failed_items'
    );

IF col_count = 4 THEN RAISE NOTICE 'Migration successful: All 4 progress columns added';

ELSE RAISE EXCEPTION 'Migration failed: Only % of 4 columns found',
col_count;

END IF;

END $ $;