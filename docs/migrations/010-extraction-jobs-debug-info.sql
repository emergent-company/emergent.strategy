-- Migration 010: Add debug_info column to object_extraction_jobs
-- 
-- Adds a JSONB column to store LLM request/response debug information
-- for troubleshooting and understanding extraction behavior
--
-- Date: 2025-10-05
-- Related: Extraction jobs debugging feature
BEGIN;

-- Add debug_info column
ALTER TABLE
  kb.object_extraction_jobs
ADD
  COLUMN debug_info JSONB NULL;

COMMENT ON COLUMN kb.object_extraction_jobs.debug_info IS 'Debug information including LLM requests, responses, and processing steps for troubleshooting';

-- Create GIN index for efficient querying of debug_info
CREATE INDEX idx_object_extraction_jobs_debug_info ON kb.object_extraction_jobs USING GIN (debug_info)
WHERE
  debug_info IS NOT NULL;

COMMIT;

-- Verification queries:
/*
 -- 1. Verify column exists
 \d kb.object_extraction_jobs
 
 -- 2. Verify index exists
 SELECT indexname, indexdef 
 FROM pg_indexes 
 WHERE tablename = 'object_extraction_jobs' 
 AND indexdef LIKE '%debug_info%';
 
 -- 3. Test insert with debug_info
 UPDATE kb.object_extraction_jobs 
 SET debug_info = '{"llm_calls": [{"type": "test", "duration_ms": 100}]}'::jsonb
 WHERE id = (SELECT id FROM kb.object_extraction_jobs LIMIT 1);
 */