-- Migration: Add missing source column to project_object_type_registry
-- Date: 2025-10-25
-- Purpose: The source column is required by code but was missing from 0001_init.sql

-- Add source column
ALTER TABLE kb.project_object_type_registry
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'custom';

-- Add check constraint for valid source values
ALTER TABLE kb.project_object_type_registry
    DROP CONSTRAINT IF EXISTS project_object_type_registry_source_check;

ALTER TABLE kb.project_object_type_registry
    ADD CONSTRAINT project_object_type_registry_source_check
    CHECK (source IN ('template', 'custom', 'discovered'));
