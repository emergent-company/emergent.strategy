-- Migration: Add status column to graph_objects table
-- The code has been referencing this column but it was never added to the schema
-- Status is an optional text field used for object lifecycle management (e.g., "draft", "active", "archived")

ALTER TABLE kb.graph_objects
ADD COLUMN IF NOT EXISTS status text;

COMMENT ON COLUMN kb.graph_objects.status IS 'Optional status field for object lifecycle management (e.g., "draft", "active", "archived")';
