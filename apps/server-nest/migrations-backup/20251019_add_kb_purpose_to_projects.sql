-- Migration: Add KB Purpose field to projects
-- Date: 2025-10-19
-- Description: Adds kb_purpose field for storing markdown description of project domain/scope
BEGIN;

-- Add kb_purpose column to projects table
ALTER TABLE
    kb.projects
ADD
    COLUMN IF NOT EXISTS kb_purpose TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN kb.projects.kb_purpose IS 'Markdown description of the knowledge base purpose, domain, and scope. Used by auto-discovery to understand context and guide type/relationship discovery.';

COMMIT;