-- Migration: Standardize object_extraction_jobs column names
-- Description: Rename org_id to organization_id to match rest of system
-- Purpose: Fix column name mismatch causing 500 errors
-- Date: 2025-10-24
-- ============================================================================

-- Rename org_id to organization_id for consistency
ALTER TABLE kb.object_extraction_jobs 
    RENAME COLUMN org_id TO organization_id;

-- Update any indexes that reference the old column name
ALTER INDEX IF EXISTS kb.idx_extraction_jobs_org_id 
    RENAME TO idx_object_extraction_jobs_organization_id;

-- Update check constraints if any reference the old column
-- (checking for any constraints that might reference org_id)

-- Update table comment
COMMENT ON COLUMN kb.object_extraction_jobs.organization_id IS 'Organization ID for multi-tenancy support';
