# Complete Guide: Migrating Embedded Relationships to Explicit Table

**Status:** Phase 1 ✅ Complete | Phase 2 🚧 Ready to Execute  
**Last Updated:** 2025-11-21

## Quick Start

```bash
# 1. Verify Phase 1 (should show 23 relationship types)
./scripts/verify-phase1-complete.sh

# 2. Dry run to see what would be migrated
npm run migrate:embedded-relationships:dry-run

# 3. Run actual migration
npm run migrate:embedded-relationships

# 4. Verify results
npm run migrate:embedded-relationships:dry-run  # Should show 0 to migrate
```

## Overview

This guide covers the complete migration from embedded JSONB relationship properties to explicit relationship records in `kb.graph_relationships` table.

### Problem We're Solving

**Before (Embedded):**
```json
{
  "type": "Event",
  "properties": {
    "name": "Crossing the Red Sea",
    "participants": ["Moses", "Israelites", "Pharaoh"]
  }
}
```

**Issues:**
- ❌ Slow JSONB array scans
- ❌ No referential integrity
- ❌ No relationship versioning
- ❌ Difficult graph traversal

**After (Explicit):**
```sql
-- Object (clean)
{
  "type": "Event",
  "properties": {
    "name": "Crossing the Red Sea"
  }
}

-- Relationships (explicit, indexed)
event -[HAS_PARTICIPANT]-> moses
event -[HAS_PARTICIPANT]-> israelites
event -[HAS_PARTICIPANT]-> pharaoh
```

**Benefits:**
- ✅ Fast indexed lookups
- ✅ Referential integrity
- ✅ Relationship versioning
- ✅ Efficient graph queries

## Two-Phase Migration

### Phase 1: Schema Updates ✅ COMPLETE

**What we did:**
1. Added user-friendly labels to all 23 relationship types
2. Created 4 new relationship types (HAS_PARTY, HAS_PARTICIPANT, HAS_WITNESS, PERFORMED_BY)
3. Removed embedded properties from Event, Covenant, Miracle schemas (v2.0.0 → v3.0.0)
4. Updated extraction prompts to use explicit relationships
5. Deployed changes via seed script

**Status:** ✅ Complete - All schema changes deployed to database

**Documentation:**
- [Phase 1 Complete Summary](./PHASE1_COMPLETE_SUMMARY.md)
- [Relationship Types with User-Friendly Names](./relationship-types-user-friendly-names.md)
- [Add Relationship Types to Template Pack](./add-relationship-types-to-template-pack.md)
- [Remove Embedded Relationships from Schemas](./remove-embedded-relationships-from-schemas.md)

### Phase 2: Data Migration 🚧 READY

**What to do:**
1. Run migration script on existing 1,551 embedded relationships
2. Resolve entity name references to canonical_ids
3. Create explicit relationship records
4. Verify migration success

**Status:** 🚧 Ready to execute - Script created, needs database running

**Documentation:**
- [Run Phase 2 Migration Guide](./run-phase2-migration.md)

## Current State

### Database Schema
- ✅ Template pack updated with 23 relationship types
- ✅ 4 new relationship types available
- ✅ UI configs with labels, icons, colors
- ✅ Event, Covenant, Miracle schemas at v3.0.0

### Existing Data (Pre-Migration)
- 6,337 objects total
- 1,551 embedded relationships to migrate:
  - `properties.parties`: 170 objects
  - `properties.participants`: 570 objects
  - `properties.participants_canonical_ids`: 12 objects (ready - already has UUIDs)
  - `properties.witnesses`: 357 objects
  - `properties.performer`: 454 objects
- 0 explicit relationships (migration pending)

### Extraction Behavior
- ✅ New extractions: Will use explicit relationships (schema v3.0.0)
- ℹ️ Old objects: Still have embedded properties (backwards compatible)

## Migration Mapping

| Embedded Property | Relationship Type | Source Types | Dest Types | Multiplicity |
|-------------------|-------------------|--------------|------------|--------------|
| `properties.parties` | `HAS_PARTY` | Covenant | Person, Group, Angel | one-to-many |
| `properties.participants` | `HAS_PARTICIPANT` | Event | Person, Group, Angel | one-to-many |
| `properties.participants_canonical_ids` | `HAS_PARTICIPANT` | Event | Person, Group, Angel | one-to-many |
| `properties.witnesses` | `HAS_WITNESS` | Miracle, Event, Covenant | Person, Group, Angel | one-to-many |
| `properties.performer` | `PERFORMED_BY` | Miracle, Event | Person, Angel | one-to-one |

## Step-by-Step Migration Guide

### Prerequisites

1. **Database running:**
   ```bash
   docker compose -f docker/docker-compose.yml up -d db
   # Wait for database to be ready
   ```

2. **Phase 1 complete:**
   ```bash
   ./scripts/verify-phase1-complete.sh
   # Should show: ✅ All 23 relationship types present
   ```

3. **Backup (optional but recommended):**
   ```bash
   pg_dump $DATABASE_URL > backup_before_migration.sql
   ```

### Step 1: Dry Run

```bash
npm run migrate:embedded-relationships:dry-run
```

**Expected output:**
```
=== Embedded Relationships Migration ===

Options: { dryRun: true, objectType: 'all', batchSize: 100 }

--- Processing HAS_PARTY (parties) ---
  Found 170 objects to process
  Progress: 170/170

--- Processing HAS_PARTICIPANT (participants) ---
  Found 570 objects to process
  Progress: 570/570

--- Processing HAS_PARTICIPANT (participants_canonical_ids) ---
  Found 12 objects to process
  Progress: 12/12

--- Processing HAS_WITNESS (witnesses) ---
  Found 357 objects to process
  Progress: 357/357

--- Processing PERFORMED_BY (performer) ---
  Found 454 objects to process
  Progress: 454/454

=== Migration Summary ===

Total objects found:        1,563
Objects processed:          1,563
Relationships created:      1,551
Objects skipped:            12
Errors:                     0
Unresolved references:      0

⚠️  DRY RUN - No changes were made to the database
```

**⚠️ Important:** Review unresolved references! If there are many, you may need to:
- Create missing entities
- Fix name variations
- Manually create some relationships

### Step 2: Run Migration

```bash
npm run migrate:embedded-relationships
```

**Duration:** ~5-10 minutes for 1,551 relationships

**What happens:**
1. Scans objects with embedded relationships
2. Resolves entity names to canonical_ids
3. Creates explicit relationship records
4. Adds migration metadata
5. Skips duplicates
6. Reports statistics

### Step 3: Verify Results

```bash
# Should show 0 objects to migrate
npm run migrate:embedded-relationships:dry-run

# Check relationship count
psql $DATABASE_URL -c "
  SELECT COUNT(*) as migrated_relationships
  FROM kb.graph_relationships
  WHERE properties->>'_migrated_from' IS NOT NULL;
"
# Expected: ~1,551

# View sample relationships
psql $DATABASE_URL -c "
  SELECT 
    r.relationship_type,
    o1.type as from_type,
    o1.properties->>'name' as from_name,
    o2.type as to_type,
    o2.properties->>'name' as to_name,
    r.properties->>'_migrated_from' as migrated_from
  FROM kb.graph_relationships r
  JOIN kb.graph_objects o1 ON o1.canonical_id = r.from_canonical_id AND o1.branch_id = r.branch_id
  JOIN kb.graph_objects o2 ON o2.canonical_id = r.to_canonical_id AND o2.branch_id = r.branch_id
  WHERE r.properties->>'_migrated_from' IS NOT NULL
  LIMIT 10;
"
```

### Step 4: Test in UI

1. Open admin UI: http://localhost:5176
2. Navigate to Documents
3. Open an Event, Covenant, or Miracle object
4. Verify relationships tab shows explicit relationships
5. Test creating new relationships manually

### Step 5: Performance Testing (Optional)

```bash
# Run graph traversal benchmarks
npm run bench:graph:relationships
npm run bench:graph:traverse

# Compare before/after query times
```

## Advanced Usage

### Migrate Specific Object Type

```bash
# Migrate only Events
npm run migrate:embedded-relationships -- --type=Event

# Migrate only Covenants
npm run migrate:embedded-relationships -- --type=Covenant

# Migrate only Miracles
npm run migrate:embedded-relationships -- --type=Miracle
```

### Custom Batch Size

```bash
# Smaller batches (slower, less memory)
npm run migrate:embedded-relationships -- --batch-size=50

# Larger batches (faster, more memory)
npm run migrate:embedded-relationships -- --batch-size=200
```

### Verbose Logging

```bash
npm run migrate:embedded-relationships -- --verbose
```

Shows every relationship being created (useful for debugging).

### Combined Options

```bash
npm run migrate:embedded-relationships -- --dry-run --type=Event --verbose
```

## Handling Unresolved References

If the migration reports unresolved references, see [Run Phase 2 Migration Guide](./run-phase2-migration.md#handling-unresolved-references) for detailed solutions.

**Quick fixes:**

1. **Create missing entity:**
   ```sql
   INSERT INTO kb.graph_objects (...)
   VALUES (...);
   ```

2. **Fix name variation:**
   ```sql
   UPDATE kb.graph_objects
   SET properties = jsonb_set(properties, '{name}', '"Exact Name"')
   WHERE id = 'object-id';
   ```

3. **Re-run migration:**
   ```bash
   npm run migrate:embedded-relationships
   ```
   The script will attempt to resolve previously unresolved references.

## Rollback

If needed, delete migrated relationships:

```sql
DELETE FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;
```

Embedded properties remain unchanged, so you can re-run migration after fixing issues.

## Post-Migration

### Immediate Tasks

1. ✅ Verify relationship count: `SELECT COUNT(*) FROM kb.graph_relationships;`
2. ✅ Test UI displays relationships correctly
3. ✅ Test graph queries work as expected
4. ✅ Check for unresolved references and handle manually

### Optional Tasks

1. 📝 Remove embedded properties (after thorough testing):
   ```sql
   UPDATE kb.graph_objects
   SET properties = properties - 'parties' - 'participants' - 'witnesses' - 'performer'
   WHERE ...;
   ```

2. 📝 Update extraction service to only create explicit relationships

3. 📝 Add migration tracking table to record migration history

4. 📝 Update admin UI to show migration status per object

5. 📝 Create automated tests for explicit relationship queries

## Files Reference

### Scripts
- `scripts/seed-bible-template-pack.ts` - Template pack with relationship types
- `scripts/migrate-embedded-relationships.ts` - Phase 2 migration script
- `scripts/verify-phase1-complete.sh` - Verification script
- `scripts/lib/relationship-type-schemas.ts` - TypeScript type definitions

### Documentation
- `docs/migrations/MIGRATION_COMPLETE_GUIDE.md` - This file
- `docs/migrations/PHASE1_COMPLETE_SUMMARY.md` - Phase 1 summary
- `docs/migrations/run-phase2-migration.md` - Phase 2 detailed guide
- `docs/migrations/relationship-types-user-friendly-names.md` - Labels guide
- `docs/migrations/add-relationship-types-to-template-pack.md` - New types implementation
- `docs/migrations/remove-embedded-relationships-from-schemas.md` - Schema cleanup
- `docs/plans/migrate-embedded-relationships-to-table.md` - Overall migration plan

## Troubleshooting

See [Run Phase 2 Migration Guide](./run-phase2-migration.md#troubleshooting) for detailed troubleshooting steps.

**Common issues:**
- Database not running → Start database
- Unresolved references → Create missing entities or fix names
- Slow migration → Reduce batch size or migrate by type

## Support

If you encounter issues:

1. Check documentation files listed above
2. Review migration script comments: `scripts/migrate-embedded-relationships.ts`
3. Check logs: `nx run workspace-cli:workspace:logs --service=database`
4. Review database state:
   ```sql
   SELECT * FROM kb.graph_relationships WHERE properties->>'_migrated_from' IS NOT NULL LIMIT 10;
   ```

## Success Criteria

Migration is complete when:

- [x] Phase 1: All schema updates deployed
- [ ] Phase 2: Dry run shows ~1,551 relationships to migrate
- [ ] Phase 2: Migration runs successfully
- [ ] Phase 2: Dry run shows 0 relationships to migrate (all done)
- [ ] Verification: `kb.graph_relationships` has ~1,551 records
- [ ] Verification: UI displays explicit relationships correctly
- [ ] Verification: Graph queries work as expected
- [ ] Verification: No critical errors in logs

**Current Status:**
- ✅ Phase 1 Complete
- 🚧 Phase 2 Ready to Execute

---

**Next Step:** Run `npm run migrate:embedded-relationships:dry-run`
