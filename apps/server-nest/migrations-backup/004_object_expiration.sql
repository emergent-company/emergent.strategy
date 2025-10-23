-- Migration: Add TTL-based expiration support to graph objects
-- This enables objects to have optional expiration timestamps and
-- provides infrastructure for excluding expired content from queries.
BEGIN;

-- Add expires_at column to graph_objects table
-- When set, objects become inaccessible after this timestamp
-- NULL means the object never expires (default behavior)
ALTER TABLE
    kb.graph_objects
ADD
    COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN kb.graph_objects.expires_at IS 'Optional expiration timestamp. When set, the object is excluded from search and traversal queries after this time. NULL means never expires.';

-- Create index for efficient expiration queries
-- This index supports:
-- 1. Background jobs finding expired objects
-- 2. Search/traversal queries filtering out expired objects
-- 3. Expiration status checks
CREATE INDEX IF NOT EXISTS idx_graph_objects_expires_at ON kb.graph_objects(expires_at)
WHERE
    expires_at IS NOT NULL;

-- Create composite index for active object queries
-- Supports efficient filtering of non-expired, non-deleted objects
-- Used by search and traversal to exclude expired content
CREATE INDEX IF NOT EXISTS idx_graph_objects_active ON kb.graph_objects(deleted_at, expires_at)
WHERE
    deleted_at IS NULL
    OR expires_at IS NULL;

-- Create index for expired object cleanup queries
-- Supports background jobs that need to find and process expired objects
CREATE INDEX IF NOT EXISTS idx_graph_objects_expired ON kb.graph_objects(expires_at, deleted_at)
WHERE
    expires_at IS NOT NULL
    AND expires_at <= now();

COMMIT;