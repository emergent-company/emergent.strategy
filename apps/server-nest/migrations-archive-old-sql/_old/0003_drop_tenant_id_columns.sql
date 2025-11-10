-- Migration: Drop tenant_id columns (duplicate of organization_id)
-- Author: AI Assistant
-- Date: 2025-10-24
-- Description: Remove tenant_id columns as they are duplicates of organization_id.
--              User directive: "I don't want to see org_id or tenant_id anymore"
--              No backward compatibility required.
-- Drop tenant_id from notifications table
ALTER TABLE
    kb.notifications DROP COLUMN IF EXISTS tenant_id;

-- Drop tenant_id from discovery_jobs table  
ALTER TABLE
    kb.discovery_jobs DROP COLUMN IF EXISTS tenant_id;

-- Drop tenant_id from object_extraction_jobs table
ALTER TABLE
    kb.object_extraction_jobs DROP COLUMN IF EXISTS tenant_id;

-- Drop tenant_id from project_object_type_registry table
ALTER TABLE
    kb.project_object_type_registry DROP COLUMN IF EXISTS tenant_id;

-- Drop tenant_id from project_template_packs table
ALTER TABLE
    kb.project_template_packs DROP COLUMN IF EXISTS tenant_id;

-- Note: These tables now only use organization_id for tenant identification
-- All code has been updated to use organization_id exclusively