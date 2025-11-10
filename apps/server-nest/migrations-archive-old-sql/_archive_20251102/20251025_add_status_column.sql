-- Migration: Add status column to graph_objects table
-- Date: 2025-10-25
-- 
-- The code references this column but it was missing from the consolidated 0001_init.sql
-- Status is an optional text field used for object lifecycle management (e.g., "draft", "active", "archived")
--
-- This was in the old migration 0005_add_status_column.sql but not merged into the consolidated schema

ALTER TABLE kb.graph_objects
    ADD COLUMN IF NOT EXISTS status TEXT NULL;

COMMENT ON COLUMN kb.graph_objects.status IS 'Optional status field for object lifecycle management (e.g., "draft", "active", "archived")';

-- Create index for status queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_graph_objects_status ON kb.graph_objects(status) WHERE status IS NOT NULL;
