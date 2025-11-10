-- Migration: Update embedding_vec dimensions from 32 to 768
-- Date: 2025-11-10
-- Purpose: Fix dimension mismatch for text-embedding-004 model (768 dimensions)
--
-- Background:
-- The embedding_vec column was originally created as vector(32) but the code
-- uses Google's text-embedding-004 model which produces 768-dimensional vectors.
-- This causes insertion errors: "expected 32 dimensions, not 768"
--
-- This migration:
-- 1. Changes embedding_vec from vector(32) to vector(768)
-- 2. Preserves all existing data (NULL values or compatible vectors)
-- 3. Enables graph vector search tests to pass

BEGIN;

-- Step 1: Alter the embedding_vec column to support 768 dimensions
ALTER TABLE kb.graph_objects 
    ALTER COLUMN embedding_vec TYPE vector(768);

-- Step 2: Add a comment documenting the dimension
COMMENT ON COLUMN kb.graph_objects.embedding_vec IS 
    'Vector embedding for semantic search. Uses text-embedding-004 (768 dimensions).';

COMMIT;
