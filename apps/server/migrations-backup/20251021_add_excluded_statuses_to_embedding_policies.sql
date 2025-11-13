-- Migration: Add excluded_statuses column to embedding_policies table
-- Date: 2025-10-21
-- Purpose: Allow policies to exclude objects based on status (e.g., 'draft' objects won't be embedded)
BEGIN;

-- Add excluded_statuses column (array of text)
ALTER TABLE
    kb.embedding_policies
ADD
    COLUMN IF NOT EXISTS excluded_statuses TEXT [] NOT NULL DEFAULT '{}';

-- Add comment documenting the column
COMMENT ON COLUMN kb.embedding_policies.excluded_statuses IS 'Status values that prevent embedding if present on the object (e.g., ["draft", "archived"])';

-- Create index for querying policies by excluded statuses (useful for policy management UI)
CREATE INDEX IF NOT EXISTS idx_embedding_policies_excluded_statuses ON kb.embedding_policies USING GIN (excluded_statuses);

COMMIT;