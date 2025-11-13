-- Migration: Add graph_object_revision_counts materialized view
-- Date: 2025-10-25
-- 
-- The code references this materialized view but it was missing from consolidated 0001_init.sql
-- This was in old migration 0006_revision_tracking.sql (in migrations-backup) but not merged
-- The refresh_revision_counts() function already exists but the materialized view doesn't

-- ============================================================================
-- 1. CREATE MATERIALIZED VIEW FOR REVISION COUNTS
-- ============================================================================
-- This view pre-computes the number of versions for each canonical object
-- Useful for displaying in UI and filtering by revision count
CREATE MATERIALIZED VIEW IF NOT EXISTS kb.graph_object_revision_counts AS
SELECT
    canonical_id,
    project_id,
    COUNT(*) as revision_count,
    MAX(version) as latest_version,
    MIN(created_at) as first_created_at,
    MAX(created_at) as last_updated_at
FROM
    kb.graph_objects
WHERE
    deleted_at IS NULL
GROUP BY
    canonical_id,
    project_id;

-- Index for fast lookups by canonical_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_revision_counts_canonical ON kb.graph_object_revision_counts(canonical_id);

-- Index for filtering by revision count
CREATE INDEX IF NOT EXISTS idx_revision_counts_count ON kb.graph_object_revision_counts(revision_count DESC);

COMMENT ON MATERIALIZED VIEW kb.graph_object_revision_counts IS 'Pre-computed revision counts for graph objects. Refresh periodically to keep current.';

-- ============================================================================
-- 2. INITIAL REFRESH OF THE MATERIALIZED VIEW
-- ============================================================================
-- Perform initial refresh to populate the view
REFRESH MATERIALIZED VIEW kb.graph_object_revision_counts;
