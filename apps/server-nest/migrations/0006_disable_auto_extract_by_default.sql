-- Migration: Disable Auto-Extraction by Default
-- Description: Update existing projects to have auto_extract_objects = false
-- Purpose: Auto-extraction should be opt-in, not opt-out
-- Date: 2025-10-22
-- ============================================================================
-- Update all existing projects to disable auto-extraction
UPDATE
    kb.projects
SET
    auto_extract_objects = false
WHERE
    auto_extract_objects = true;

-- Add comment
COMMENT ON COLUMN kb.projects.auto_extract_objects IS 'When true, automatically create extraction jobs when documents are uploaded to this project. Default: false (opt-in)';