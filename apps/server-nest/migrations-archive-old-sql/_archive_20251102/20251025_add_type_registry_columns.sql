-- Migration: Add missing columns to project_object_type_registry
-- Date: 2025-10-25
-- Purpose: Restore columns from old schema that code still expects
-- Add all the columns that existed in the old schema but are missing from refactored schema
ALTER TABLE
    kb.project_object_type_registry
ADD
    COLUMN IF NOT EXISTS template_pack_id UUID,
ADD
    COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1 NOT NULL,
ADD
    COLUMN IF NOT EXISTS json_schema JSONB,
ADD
    COLUMN IF NOT EXISTS ui_config JSONB DEFAULT '{}' :: jsonb,
ADD
    COLUMN IF NOT EXISTS extraction_config JSONB DEFAULT '{}' :: jsonb,
ADD
    COLUMN IF NOT EXISTS discovery_confidence REAL,
ADD
    COLUMN IF NOT EXISTS description TEXT,
ADD
    COLUMN IF NOT EXISTS created_by TEXT,
ADD
    COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

-- Add foreign key for template_pack_id
ALTER TABLE
    kb.project_object_type_registry
ADD
    CONSTRAINT fk_project_type_registry_template_pack FOREIGN KEY (template_pack_id) REFERENCES kb.graph_template_packs(id) ON DELETE
SET
    NULL;

-- Create index for template_pack_id lookups
CREATE INDEX IF NOT EXISTS idx_project_type_registry_template_pack ON kb.project_object_type_registry(template_pack_id);