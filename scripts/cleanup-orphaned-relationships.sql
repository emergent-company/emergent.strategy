-- Cleanup orphaned relationships (relationships pointing to/from soft-deleted objects)
-- Run this with: psql $DATABASE_URL -f scripts/cleanup-orphaned-relationships.sql

BEGIN;

-- Count before
SELECT COUNT(*) as orphaned_before
FROM kb.graph_relationships r
JOIN kb.graph_objects src ON r.src_id = src.id
JOIN kb.graph_objects dst ON r.dst_id = dst.id
WHERE r.deleted_at IS NULL
  AND (src.deleted_at IS NOT NULL OR dst.deleted_at IS NOT NULL);

-- Soft-delete orphaned relationships
UPDATE kb.graph_relationships r
SET deleted_at = NOW()
FROM kb.graph_objects src, kb.graph_objects dst
WHERE r.src_id = src.id 
  AND r.dst_id = dst.id
  AND r.deleted_at IS NULL
  AND (src.deleted_at IS NOT NULL OR dst.deleted_at IS NOT NULL);

-- Count after (should be 0)
SELECT COUNT(*) as orphaned_after
FROM kb.graph_relationships r
JOIN kb.graph_objects src ON r.src_id = src.id
JOIN kb.graph_objects dst ON r.dst_id = dst.id
WHERE r.deleted_at IS NULL
  AND (src.deleted_at IS NOT NULL OR dst.deleted_at IS NOT NULL);

COMMIT;
