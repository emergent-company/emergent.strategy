-- Test Migration Queries
-- Run these queries to verify Phase 2 migration success

-- ============================================================================
-- PRE-MIGRATION CHECKS
-- ============================================================================

-- 1. Count embedded relationships (before migration)
SELECT 
  COUNT(*) FILTER (WHERE properties->>'parties' IS NOT NULL) as parties_count,
  COUNT(*) FILTER (WHERE properties->>'participants' IS NOT NULL) as participants_count,
  COUNT(*) FILTER (WHERE properties->>'witnesses' IS NOT NULL) as witnesses_count,
  COUNT(*) FILTER (WHERE properties->>'performer' IS NOT NULL) as performer_count,
  COUNT(*) FILTER (WHERE properties->>'participants_canonical_ids' IS NOT NULL) as canonical_ids_count,
  COUNT(*) as total_objects
FROM kb.graph_objects;

-- Expected:
--  parties | participants | witnesses | performer | canonical_ids | total
-- ---------+--------------+-----------+-----------+---------------+-------
--    170   |     570      |    357    |    454    |      12       | 6,337


-- 2. Sample objects with embedded relationships
SELECT 
  id,
  type,
  properties->>'name' as name,
  properties->>'parties' as parties,
  properties->>'participants' as participants,
  properties->>'witnesses' as witnesses,
  properties->>'performer' as performer
FROM kb.graph_objects
WHERE properties->>'parties' IS NOT NULL
   OR properties->>'participants' IS NOT NULL
   OR properties->>'witnesses' IS NOT NULL
   OR properties->>'performer' IS NOT NULL
LIMIT 10;


-- 3. Count explicit relationships (should be 0 before migration)
SELECT COUNT(*) as explicit_relationships
FROM kb.graph_relationships;

-- Expected: 0


-- ============================================================================
-- POST-MIGRATION CHECKS
-- ============================================================================

-- 4. Count migrated relationships (after migration)
SELECT COUNT(*) as migrated_relationships
FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;

-- Expected: ~1,551


-- 5. Breakdown by relationship type
SELECT 
  relationship_type,
  properties->>'_migrated_from' as migrated_from,
  COUNT(*) as count
FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL
GROUP BY relationship_type, properties->>'_migrated_from'
ORDER BY relationship_type;

-- Expected:
--  relationship_type  | migrated_from               | count
-- --------------------+-----------------------------+-------
--  HAS_PARTICIPANT    | participants                |  ~570
--  HAS_PARTICIPANT    | participants_canonical_ids  |   ~12
--  HAS_PARTY          | parties                     |  ~170
--  HAS_WITNESS        | witnesses                   |  ~357
--  PERFORMED_BY       | performer                   |  ~454


-- 6. Sample migrated relationships with object details
SELECT 
  r.id,
  r.relationship_type,
  r.properties->>'_migrated_from' as migrated_from,
  r.created_at,
  o1.type as from_type,
  o1.properties->>'name' as from_name,
  o2.type as to_type,
  o2.properties->>'name' as to_name
FROM kb.graph_relationships r
JOIN kb.graph_objects o1 
  ON o1.canonical_id = r.from_canonical_id 
  AND o1.branch_id = r.branch_id
  AND o1.deleted_at IS NULL
JOIN kb.graph_objects o2 
  ON o2.canonical_id = r.to_canonical_id 
  AND o2.branch_id = r.branch_id
  AND o2.deleted_at IS NULL
WHERE r.properties->>'_migrated_from' IS NOT NULL
ORDER BY r.created_at DESC
LIMIT 20;


-- 7. Verify source object types match expectations
SELECT 
  o.type as source_object_type,
  r.relationship_type,
  r.properties->>'_migrated_from' as migrated_from,
  COUNT(*) as count
FROM kb.graph_relationships r
JOIN kb.graph_objects o 
  ON o.canonical_id = r.from_canonical_id 
  AND o.branch_id = r.branch_id
WHERE r.properties->>'_migrated_from' IS NOT NULL
GROUP BY o.type, r.relationship_type, r.properties->>'_migrated_from'
ORDER BY o.type, r.relationship_type;

-- Expected:
--  source_type | relationship_type  | migrated_from  | count
-- -------------+--------------------+----------------+-------
--  Covenant    | HAS_PARTY          | parties        |  ~170
--  Event       | HAS_PARTICIPANT    | participants   |  ~570
--  Event       | HAS_PARTICIPANT    | participants_...|   ~12
--  Miracle     | HAS_WITNESS        | witnesses      |  ~357
--  Miracle     | PERFORMED_BY       | performer      |  ~454


-- 8. Check for duplicate relationships
SELECT 
  from_canonical_id,
  to_canonical_id,
  relationship_type,
  COUNT(*) as duplicate_count
FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL
GROUP BY from_canonical_id, to_canonical_id, relationship_type
HAVING COUNT(*) > 1;

-- Expected: 0 rows (no duplicates)


-- 9. Find objects that still have embedded properties after migration
SELECT 
  id,
  type,
  properties->>'name' as name,
  CASE 
    WHEN properties->>'parties' IS NOT NULL THEN 'parties'
    WHEN properties->>'participants' IS NOT NULL THEN 'participants'
    WHEN properties->>'witnesses' IS NOT NULL THEN 'witnesses'
    WHEN properties->>'performer' IS NOT NULL THEN 'performer'
  END as embedded_property_type
FROM kb.graph_objects
WHERE (properties->>'parties' IS NOT NULL
   OR properties->>'participants' IS NOT NULL
   OR properties->>'witnesses' IS NOT NULL
   OR properties->>'performer' IS NOT NULL)
  AND (properties->>'_schema_version')::text = '2.0.0'
LIMIT 100;

-- Note: These should still exist (we keep embedded properties for backwards compatibility)


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- 10. Compare embedded vs explicit relationship counts
WITH embedded_counts AS (
  SELECT 
    type,
    COUNT(*) FILTER (WHERE properties->>'parties' IS NOT NULL) as parties,
    COUNT(*) FILTER (WHERE properties->>'participants' IS NOT NULL) as participants,
    COUNT(*) FILTER (WHERE properties->>'witnesses' IS NOT NULL) as witnesses,
    COUNT(*) FILTER (WHERE properties->>'performer' IS NOT NULL) as performer
  FROM kb.graph_objects
  GROUP BY type
),
explicit_counts AS (
  SELECT 
    o.type,
    COUNT(*) FILTER (WHERE r.relationship_type = 'HAS_PARTY') as has_party,
    COUNT(*) FILTER (WHERE r.relationship_type = 'HAS_PARTICIPANT') as has_participant,
    COUNT(*) FILTER (WHERE r.relationship_type = 'HAS_WITNESS') as has_witness,
    COUNT(*) FILTER (WHERE r.relationship_type = 'PERFORMED_BY') as performed_by
  FROM kb.graph_relationships r
  JOIN kb.graph_objects o ON o.canonical_id = r.from_canonical_id AND o.branch_id = r.branch_id
  WHERE r.properties->>'_migrated_from' IS NOT NULL
  GROUP BY o.type
)
SELECT 
  COALESCE(e.type, x.type) as object_type,
  e.parties as embedded_parties,
  x.has_party as explicit_parties,
  e.participants as embedded_participants,
  x.has_participant as explicit_participants,
  e.witnesses as embedded_witnesses,
  x.has_witness as explicit_witnesses,
  e.performer as embedded_performer,
  x.performed_by as explicit_performer
FROM embedded_counts e
FULL OUTER JOIN explicit_counts x ON e.type = x.type
ORDER BY object_type;


-- 11. Find specific examples for manual verification
-- Example 1: Event with participants
SELECT 
  o.id,
  o.properties->>'name' as event_name,
  o.properties->>'participants' as embedded_participants,
  array_agg(o2.properties->>'name') as explicit_participants
FROM kb.graph_objects o
LEFT JOIN kb.graph_relationships r 
  ON r.from_canonical_id = o.canonical_id 
  AND r.relationship_type = 'HAS_PARTICIPANT'
  AND r.properties->>'_migrated_from' = 'participants'
LEFT JOIN kb.graph_objects o2 
  ON o2.canonical_id = r.to_canonical_id
  AND o2.branch_id = o.branch_id
WHERE o.type = 'Event'
  AND o.properties->>'participants' IS NOT NULL
GROUP BY o.id, o.properties
LIMIT 5;


-- 12. Find unresolved references (objects without matching relationships)
SELECT 
  o.id,
  o.type,
  o.properties->>'name' as name,
  o.properties->>'participants' as participants_embedded,
  COUNT(r.id) as relationships_created
FROM kb.graph_objects o
LEFT JOIN kb.graph_relationships r 
  ON r.from_canonical_id = o.canonical_id 
  AND r.relationship_type = 'HAS_PARTICIPANT'
  AND r.properties->>'_migrated_from' IS NOT NULL
WHERE o.properties->>'participants' IS NOT NULL
GROUP BY o.id, o.type, o.properties
HAVING COUNT(r.id) = 0
LIMIT 20;

-- These are objects where entity resolution failed


-- 13. Migration metadata summary
SELECT 
  properties->>'_migrated_from' as source_property,
  COUNT(*) as relationship_count,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created,
  COUNT(DISTINCT from_canonical_id) as unique_source_objects,
  COUNT(DISTINCT to_canonical_id) as unique_target_objects
FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL
GROUP BY properties->>'_migrated_from'
ORDER BY source_property;


-- ============================================================================
-- PERFORMANCE COMPARISON QUERIES
-- ============================================================================

-- 14. Before: Find events Moses participated in (using embedded properties)
EXPLAIN ANALYZE
SELECT * FROM kb.graph_objects
WHERE type = 'Event'
  AND properties->'participants' @> '["Moses"]'::jsonb;


-- 15. After: Find events Moses participated in (using explicit relationships)
EXPLAIN ANALYZE
SELECT DISTINCT e.* 
FROM kb.graph_objects e
JOIN kb.graph_relationships r 
  ON r.from_canonical_id = e.canonical_id
  AND r.branch_id = e.branch_id
JOIN kb.graph_objects m
  ON m.canonical_id = r.to_canonical_id
  AND m.branch_id = r.branch_id
WHERE e.type = 'Event'
  AND m.properties->>'name' = 'Moses'
  AND r.relationship_type = 'HAS_PARTICIPANT';


-- 16. Graph traversal: Find all people who witnessed miracles performed by Jesus
SELECT DISTINCT
  witness.properties->>'name' as witness_name,
  COUNT(DISTINCT miracle.id) as miracles_witnessed
FROM kb.graph_objects performer
JOIN kb.graph_relationships r_performer
  ON r_performer.to_canonical_id = performer.canonical_id
  AND r_performer.relationship_type = 'PERFORMED_BY'
JOIN kb.graph_objects miracle
  ON miracle.canonical_id = r_performer.from_canonical_id
  AND miracle.branch_id = r_performer.branch_id
JOIN kb.graph_relationships r_witness
  ON r_witness.from_canonical_id = miracle.canonical_id
  AND r_witness.relationship_type = 'HAS_WITNESS'
  AND r_witness.branch_id = miracle.branch_id
JOIN kb.graph_objects witness
  ON witness.canonical_id = r_witness.to_canonical_id
  AND witness.branch_id = r_witness.branch_id
WHERE performer.properties->>'name' = 'Jesus'
GROUP BY witness.properties->>'name'
ORDER BY miracles_witnessed DESC;


-- ============================================================================
-- CLEANUP QUERIES (USE WITH CAUTION!)
-- ============================================================================

-- 17. ROLLBACK: Delete all migrated relationships
-- ⚠️  Only run this if you need to undo the migration!
-- DELETE FROM kb.graph_relationships
-- WHERE properties->>'_migrated_from' IS NOT NULL;


-- 18. CLEANUP: Remove embedded properties (after thorough testing)
-- ⚠️  Only run this after verifying migration success!
-- ⚠️  This is IRREVERSIBLE without a backup!
-- 
-- UPDATE kb.graph_objects
-- SET properties = properties - 'parties' - 'participants' - 'witnesses' - 'performer' - 'participants_canonical_ids'
-- WHERE properties ?| array['parties', 'participants', 'witnesses', 'performer', 'participants_canonical_ids'];


-- ============================================================================
-- TROUBLESHOOTING QUERIES
-- ============================================================================

-- 19. Find relationship type distribution
SELECT 
  relationship_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE properties->>'_migrated_from' IS NOT NULL) as migrated,
  COUNT(*) FILTER (WHERE properties->>'_migrated_from' IS NULL) as manual
FROM kb.graph_relationships
GROUP BY relationship_type
ORDER BY count DESC;


-- 20. Find objects with mismatched types (debugging)
SELECT 
  r.id,
  r.relationship_type,
  o1.type as from_type,
  o2.type as to_type,
  r.properties->>'_migrated_from' as migrated_from
FROM kb.graph_relationships r
JOIN kb.graph_objects o1 ON o1.canonical_id = r.from_canonical_id AND o1.branch_id = r.branch_id
JOIN kb.graph_objects o2 ON o2.canonical_id = r.to_canonical_id AND o2.branch_id = r.branch_id
WHERE r.properties->>'_migrated_from' IS NOT NULL
  AND (
    (r.relationship_type = 'HAS_PARTY' AND o1.type != 'Covenant')
    OR (r.relationship_type = 'HAS_PARTICIPANT' AND o1.type != 'Event')
    OR (r.relationship_type = 'HAS_WITNESS' AND o1.type NOT IN ('Miracle', 'Event', 'Covenant'))
    OR (r.relationship_type = 'PERFORMED_BY' AND o1.type NOT IN ('Miracle', 'Event'))
  )
LIMIT 20;

-- Expected: 0 rows (all types should match schema definitions)
