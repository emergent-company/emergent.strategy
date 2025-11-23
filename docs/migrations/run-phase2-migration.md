# Phase 2: Run Embedded Relationships Migration

**Prerequisites:** Phase 1 complete (schema updates deployed)  
**Script:** `scripts/migrate-embedded-relationships.ts`  
**Duration:** ~10-15 minutes for 1,551 relationships

## Overview

This script migrates existing embedded JSONB relationship properties to explicit records in the `kb.graph_relationships` table.

## What It Does

1. **Finds objects with embedded relationships:**
   - `properties.parties` → HAS_PARTY relationships
   - `properties.participants` → HAS_PARTICIPANT relationships
   - `properties.participants_canonical_ids` → HAS_PARTICIPANT relationships (already has UUIDs)
   - `properties.witnesses` → HAS_WITNESS relationships
   - `properties.performer` → PERFORMED_BY relationships

2. **Resolves entity references:**
   - For canonical_ids: Uses UUIDs directly
   - For names: Looks up by `properties.name` or `key` field
   - Handles case-insensitive matching
   - Logs unresolved references for manual review

3. **Creates explicit relationship records:**
   - Inserts into `kb.graph_relationships`
   - Preserves project, branch, organization context
   - Adds migration metadata (`_migrated_from`, `_migrated_at`, `_source_object_id`)
   - Skips duplicates (checks if relationship already exists)

4. **Reports migration statistics:**
   - Total objects processed
   - Relationships created
   - Unresolved references
   - Errors encountered

## Usage

### Dry Run (Recommended First)

```bash
npm run migrate:embedded-relationships:dry-run
```

This will:
- Show what would be migrated
- Report unresolved references
- NOT make any database changes

### Run Migration

```bash
npm run migrate:embedded-relationships
```

### Migrate Specific Object Type

```bash
npm run migrate:embedded-relationships -- --type=Event
npm run migrate:embedded-relationships -- --type=Covenant
npm run migrate:embedded-relationships -- --type=Miracle
```

### Custom Batch Size

```bash
npm run migrate:embedded-relationships -- --batch-size=50
```

### Verbose Output

```bash
npm run migrate:embedded-relationships -- --verbose
```

### Combined Options

```bash
npm run migrate:embedded-relationships -- --dry-run --type=Event --verbose
```

## Expected Results

### Before Migration

```sql
-- Objects: 6,337 total
SELECT 
  COUNT(*) FILTER (WHERE properties->>'parties' IS NOT NULL) as parties,
  COUNT(*) FILTER (WHERE properties->>'participants' IS NOT NULL) as participants,
  COUNT(*) FILTER (WHERE properties->>'witnesses' IS NOT NULL) as witnesses,
  COUNT(*) FILTER (WHERE properties->>'performer' IS NOT NULL) as performer
FROM kb.graph_objects;

-- Result:
--  parties | participants | witnesses | performer
-- ---------+--------------+-----------+-----------
--     170  |      570     |    357    |    454

-- Relationships: 0
SELECT COUNT(*) FROM kb.graph_relationships;
-- Result: 0
```

### After Migration

```sql
-- Relationships created (approximate)
SELECT COUNT(*) FROM kb.graph_relationships;
-- Expected: ~1,551 relationships

-- Breakdown by type
SELECT relationship_type, COUNT(*)
FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL
GROUP BY relationship_type
ORDER BY relationship_type;

-- Expected result:
--  relationship_type  | count
-- --------------------+-------
--  HAS_PARTICIPANT    |  ~570+12
--  HAS_PARTY          |  ~170
--  HAS_WITNESS        |  ~357
--  PERFORMED_BY       |  ~454
```

## Handling Unresolved References

If the migration reports unresolved references, you have several options:

### 1. Review Unresolved References

The script logs all unresolved references:

```
Unresolved References:
  - Event:abc123 -> "Moses" (HAS_PARTICIPANT)
  - Covenant:def456 -> "David" (HAS_PARTY)
  - Miracle:ghi789 -> "Jesus Christ" (PERFORMED_BY)
```

### 2. Create Missing Entities

If entities are missing, create them manually:

```typescript
// Example: Create missing entity via API or script
await graphService.createObject({
  type: 'Person',
  key: 'moses',
  properties: { name: 'Moses' },
  // ... other fields
});
```

### 3. Fix Name Variations

If names don't match exactly:

```sql
-- Find close matches
SELECT id, type, properties->>'name' as name, key
FROM kb.graph_objects
WHERE properties->>'name' ILIKE '%moses%'
   OR key ILIKE '%moses%';

-- Update object to match reference
UPDATE kb.graph_objects
SET properties = jsonb_set(properties, '{name}', '"Moses"')
WHERE id = 'object-id-here';
```

### 4. Manually Create Relationships

For references that can't be resolved automatically:

```sql
-- Create relationship manually
INSERT INTO kb.graph_relationships (
  canonical_id, from_canonical_id, to_canonical_id, relationship_type,
  project_id, branch_id, organization_id, created_by_user_id,
  properties, version, content_hash
) VALUES (
  gen_random_uuid(),
  'source-canonical-id',
  'target-canonical-id',
  'HAS_PARTICIPANT',
  'project-id',
  'branch-id',
  'org-id',
  'user-id',
  '{"_migrated_from": "participants", "_migrated_at": "2025-11-21T00:00:00Z", "_manually_created": true}'::jsonb,
  1,
  md5('...')
);
```

### 5. Re-run Migration

After fixing missing entities or names:

```bash
npm run migrate:embedded-relationships
```

The script will:
- Skip already-migrated relationships
- Attempt to resolve previously unresolved references
- Create new relationships for resolved references

## Verification

### 1. Check Migration Completed

```bash
npm run migrate:embedded-relationships:dry-run
```

Should show:
- Objects processed: 0 (all already migrated)
- Relationships created: 0 (all already exist)

### 2. Verify Relationship Count

```sql
-- Count relationships with migration metadata
SELECT COUNT(*) FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;

-- Should match: ~1,551 (or less if some references couldn't be resolved)
```

### 3. Sample Relationships

```sql
-- View sample migrated relationships
SELECT 
  r.id,
  r.relationship_type,
  r.properties->>'_migrated_from' as migrated_from,
  r.properties->>'_source_object_id' as source_object,
  o1.type as from_type,
  o1.properties->>'name' as from_name,
  o2.type as to_type,
  o2.properties->>'name' as to_name
FROM kb.graph_relationships r
JOIN kb.graph_objects o1 ON o1.canonical_id = r.from_canonical_id AND o1.branch_id = r.branch_id
JOIN kb.graph_objects o2 ON o2.canonical_id = r.to_canonical_id AND o2.branch_id = r.branch_id
WHERE r.properties->>'_migrated_from' IS NOT NULL
LIMIT 10;
```

### 4. Verify Object Types

```sql
-- Verify relationships match expected source types
SELECT 
  o.type as source_type,
  r.relationship_type,
  COUNT(*) as count
FROM kb.graph_relationships r
JOIN kb.graph_objects o ON o.canonical_id = r.from_canonical_id AND o.branch_id = r.branch_id
WHERE r.properties->>'_migrated_from' IS NOT NULL
GROUP BY o.type, r.relationship_type
ORDER BY o.type, r.relationship_type;

-- Expected:
--  source_type | relationship_type  | count
-- -------------+--------------------+-------
--  Covenant    | HAS_PARTY          |  ~170
--  Event       | HAS_PARTICIPANT    |  ~582
--  Event       | HAS_WITNESS        |  (some)
--  Miracle     | HAS_WITNESS        |  ~357
--  Miracle     | PERFORMED_BY       |  ~454
```

## Rollback

If needed, delete migrated relationships:

```sql
-- Delete all migrated relationships
DELETE FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;

-- Verify
SELECT COUNT(*) FROM kb.graph_relationships;
-- Should be 0 (or count of non-migrated relationships)
```

The embedded properties remain unchanged, so you can re-run the migration after fixing issues.

## Post-Migration Cleanup (Optional)

After successful migration, you may want to:

### Option 1: Keep Embedded Properties (Recommended)

- ✅ Backwards compatible
- ✅ Extraction jobs can still read old data
- ✅ Safe rollback possible
- ❌ Redundant data in database

### Option 2: Remove Embedded Properties

```sql
-- Remove parties property
UPDATE kb.graph_objects
SET properties = properties - 'parties'
WHERE properties->>'parties' IS NOT NULL;

-- Remove participants property
UPDATE kb.graph_objects
SET properties = properties - 'participants'
WHERE properties->>'participants' IS NOT NULL;

-- Remove participants_canonical_ids property
UPDATE kb.graph_objects
SET properties = properties - 'participants_canonical_ids'
WHERE properties->>'participants_canonical_ids' IS NOT NULL;

-- Remove witnesses property
UPDATE kb.graph_objects
SET properties = properties - 'witnesses'
WHERE properties->>'witnesses' IS NOT NULL;

-- Remove performer property
UPDATE kb.graph_objects
SET properties = properties - 'performer'
WHERE properties->>'performer' IS NOT NULL;
```

**⚠️ Warning:** Only do this after:
1. Verifying migration success
2. Testing that all queries work with explicit relationships
3. Ensuring no code still reads embedded properties
4. Creating database backup

## Troubleshooting

### Issue: "Cannot resolve entity name"

**Cause:** Entity doesn't exist or name doesn't match exactly

**Solution:**
1. Check if entity exists: `SELECT * FROM kb.graph_objects WHERE properties->>'name' ILIKE '%entity-name%';`
2. Create missing entity or fix name variation
3. Re-run migration

### Issue: "Relationship already exists"

**Cause:** Relationship was created manually or migration ran multiple times

**Solution:** This is expected behavior - the script skips duplicates. No action needed.

### Issue: "Connection refused" or "Database not found"

**Cause:** Database not running or wrong connection string

**Solution:**
1. Start database: `docker compose -f docker/docker-compose.yml up -d db`
2. Check DATABASE_URL in .env file
3. Verify connection: `psql $DATABASE_URL -c "SELECT 1"`

### Issue: Migration is slow

**Cause:** Large batch size or many unresolved references

**Solution:**
1. Reduce batch size: `--batch-size=50`
2. Migrate by type: `--type=Event`
3. Run in stages

## Performance

**Expected timing for 1,551 relationships:**
- Dry run: ~30 seconds
- Actual migration: ~5-10 minutes
- With verbose logging: ~15 minutes

**Database impact:**
- Minimal - inserts are batched
- No table locks
- Safe to run during development
- **NOT recommended during production peak hours**

## Next Steps

After successful migration:

1. ✅ Verify relationship count matches expected
2. ✅ Test UI displays explicit relationships
3. ✅ Test graph traversal queries
4. ✅ Benchmark query performance
5. 📝 Update admin UI to show migration status
6. 📝 Update extraction service to only create explicit relationships
7. 📝 Add migration tracking table (optional)

## References

- [Phase 1 Complete Summary](./PHASE1_COMPLETE_SUMMARY.md)
- [Migration Plan](../plans/migrate-embedded-relationships-to-table.md)
- [Add Relationship Types to Template Pack](./add-relationship-types-to-template-pack.md)
- Migration script: `scripts/migrate-embedded-relationships.ts`
