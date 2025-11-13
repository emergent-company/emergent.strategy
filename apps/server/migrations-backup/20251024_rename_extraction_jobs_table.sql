-- Migration: Rename extraction_jobs to object_extraction_jobs
-- Description: Align table name with code expectations
-- Purpose: Fix 500 errors caused by table name mismatch
-- Date: 2025-10-24
-- ============================================================================

-- Rename the table
ALTER TABLE IF EXISTS kb.extraction_jobs RENAME TO object_extraction_jobs;

-- Update sequence name if it exists
ALTER SEQUENCE IF EXISTS kb.extraction_jobs_id_seq RENAME TO object_extraction_jobs_id_seq;

-- Rename constraints
DO $$
BEGIN
    -- Foreign key constraints
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_extraction_jobs_org') THEN
        ALTER TABLE kb.object_extraction_jobs RENAME CONSTRAINT fk_extraction_jobs_org TO fk_object_extraction_jobs_org;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_extraction_jobs_project') THEN
        ALTER TABLE kb.object_extraction_jobs RENAME CONSTRAINT fk_extraction_jobs_project TO fk_object_extraction_jobs_project;
    END IF;
    
    -- Check constraints
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_progress_values') THEN
        ALTER TABLE kb.object_extraction_jobs RENAME CONSTRAINT check_progress_values TO object_extraction_jobs_progress_check;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_timing_order') THEN
        ALTER TABLE kb.object_extraction_jobs RENAME CONSTRAINT check_timing_order TO object_extraction_jobs_timing_check;
    END IF;
END $$;

-- Rename indexes
ALTER INDEX IF EXISTS kb.idx_extraction_jobs_project RENAME TO idx_object_extraction_jobs_project;
ALTER INDEX IF EXISTS kb.idx_extraction_jobs_status RENAME TO idx_object_extraction_jobs_status;
ALTER INDEX IF EXISTS kb.idx_extraction_jobs_project_status RENAME TO idx_object_extraction_jobs_project_status;
ALTER INDEX IF EXISTS kb.idx_extraction_jobs_source RENAME TO idx_object_extraction_jobs_source;
ALTER INDEX IF EXISTS kb.idx_extraction_jobs_created_by RENAME TO idx_object_extraction_jobs_created_by;

-- Rename functions and triggers
ALTER FUNCTION IF EXISTS kb.update_extraction_jobs_updated_at() RENAME TO update_object_extraction_jobs_updated_at;
ALTER FUNCTION IF EXISTS kb.extraction_jobs_complete_timestamp() RENAME TO object_extraction_jobs_complete_timestamp;

-- Drop old triggers and recreate with new names
DROP TRIGGER IF EXISTS extraction_jobs_updated_at_trigger ON kb.object_extraction_jobs;
CREATE TRIGGER object_extraction_jobs_updated_at_trigger 
    BEFORE UPDATE ON kb.object_extraction_jobs
    FOR EACH ROW EXECUTE FUNCTION kb.update_object_extraction_jobs_updated_at();

DROP TRIGGER IF EXISTS extraction_jobs_status_timestamp_trigger ON kb.object_extraction_jobs;
CREATE TRIGGER object_extraction_jobs_status_timestamp_trigger 
    BEFORE UPDATE ON kb.object_extraction_jobs
    FOR EACH ROW 
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION kb.object_extraction_jobs_complete_timestamp();

-- Update table comment
COMMENT ON TABLE kb.object_extraction_jobs IS 'Object extraction job tracking table - tracks lifecycle of document extraction jobs';
