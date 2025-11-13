-- Migration: Add integration_metadata column to documents table
-- Date: 2025-10-25
-- Description: Add integration_metadata JSONB column for storing source-specific metadata

-- Add the column
ALTER TABLE kb.documents 
    ADD COLUMN IF NOT EXISTS integration_metadata jsonb DEFAULT '{}'::jsonb;

-- Add comment
COMMENT ON COLUMN kb.documents.integration_metadata IS 'Source-specific metadata (ClickUp doc IDs, page hierarchy, creator info, etc.)';

-- Add GIN index for efficient JSON queries
CREATE INDEX IF NOT EXISTS idx_documents_integration_metadata 
    ON kb.documents USING gin (integration_metadata);

-- Verify
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'kb'
          AND table_name = 'documents'
          AND column_name = 'integration_metadata'
    ) THEN
        RAISE NOTICE 'Migration complete: integration_metadata column added to documents table';
    ELSE
        RAISE WARNING 'Failed to add integration_metadata column!';
    END IF;
END $$;
