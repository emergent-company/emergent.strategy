-- Migration: Add extraction_config to projects table
-- Description: Adds a JSONB column for LLM extraction configuration settings
-- This allows per-project customization of extraction chunk size, method, and timeout

-- Add the column with null default (inherits from server defaults)
ALTER TABLE kb.projects
ADD COLUMN IF NOT EXISTS extraction_config JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN kb.projects.extraction_config IS 'LLM extraction configuration. JSON with optional fields: chunkSize (5000-100000 chars), method (function_calling or responseSchema), timeoutSeconds (60-600).';
