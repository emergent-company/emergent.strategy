-- Migration: Remove organization_id from project-scoped tables
-- Date: 2025-10-25
-- Purpose: Template packs and type registry are scoped to projects, not organizations

-- Drop organization_id from project_template_packs
ALTER TABLE kb.project_template_packs
    DROP CONSTRAINT IF EXISTS project_template_packs_organization_id_fkey,
    DROP COLUMN IF EXISTS organization_id;

-- Drop organization_id from project_object_type_registry if it exists
ALTER TABLE kb.project_object_type_registry
    DROP CONSTRAINT IF EXISTS project_object_type_registry_organization_id_fkey,
    DROP COLUMN IF EXISTS organization_id;
