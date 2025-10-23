-- Migration: Add source_type and source_id to object_extraction_jobs
-- Purpose: Allow documents list query to filter extraction jobs by source
-- Date: 2025-10-23
BEGIN;

-- Add source_type column
ALTER TABLE
    kb.object_extraction_jobs
ADD
    COLUMN IF NOT EXISTS source_type VARCHAR(50) CHECK (
        source_type IN ('document', 'api', 'manual', 'bulk_import')
    );

-- Add source_id column  
ALTER TABLE
    kb.object_extraction_jobs
ADD
    COLUMN IF NOT EXISTS source_id UUID;

-- Set default value for existing rows (document-based extraction)
UPDATE
    kb.object_extraction_jobs
SET
    source_type = 'document',
    source_id = document_id
WHERE
    source_type IS NULL
    AND document_id IS NOT NULL;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_object_extraction_jobs_source ON kb.object_extraction_jobs(source_type, source_id);

-- Add comments
COMMENT ON COLUMN kb.object_extraction_jobs.source_type IS 'Type of extraction source: document (PDF/DOCX), api (external API), manual (user-triggered), bulk_import';

COMMENT ON COLUMN kb.object_extraction_jobs.source_id IS 'ID of the source entity (document_id, api_endpoint_id, etc.)';

COMMIT;