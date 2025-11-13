-- Migration: Make installed_by nullable in project_template_packs
-- Date: 2025-10-25
-- Purpose: Allow template pack installation even when user lookup fails

-- Drop existing foreign key constraint
ALTER TABLE kb.project_template_packs
    DROP CONSTRAINT IF EXISTS project_template_packs_installed_by_fkey;

-- Make installed_by nullable
ALTER TABLE kb.project_template_packs
    ALTER COLUMN installed_by DROP NOT NULL;

-- Add back foreign key constraint, still enforcing referential integrity when value is present
ALTER TABLE kb.project_template_packs
    ADD CONSTRAINT project_template_packs_installed_by_fkey
    FOREIGN KEY (installed_by) REFERENCES core.user_profiles(id) ON DELETE SET NULL;
