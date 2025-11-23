# Embedded Relationships Migration Checklist

**Quick Reference:** Use this checklist to execute Phase 2 migration.

## Pre-Migration Checklist

- [ ] Phase 1 complete (run `./scripts/verify-phase1-complete.sh`)
- [ ] Database is running (`docker compose -f docker/docker-compose.yml ps`)
- [ ] Backup created (optional but recommended)
- [ ] Read migration guide (`docs/migrations/MIGRATION_COMPLETE_GUIDE.md`)

## Phase 2 Execution

### 1. Dry Run (Required)

```bash
npm run migrate:embedded-relationships:dry-run
```

**Expected:**
- [ ] Shows ~1,551 relationships to migrate
- [ ] Breakdown by type (HAS_PARTY: ~170, HAS_PARTICIPANT: ~582, etc.)
- [ ] Unresolved references < 5% (or 0 if all entities exist)
- [ ] No critical errors

**If unresolved references:**
- [ ] Review list of unresolved references
- [ ] Create missing entities OR
- [ ] Fix name variations OR
- [ ] Document for manual creation later

### 2. Test Migration (Optional)

```bash
# Test on single object type first
npm run migrate:embedded-relationships -- --type=Event --dry-run
npm run migrate:embedded-relationships -- --type=Event
```

**Verify:**
- [ ] Relationships created successfully
- [ ] Can query relationships in database
- [ ] UI shows relationships (if applicable)

### 3. Full Migration

```bash
npm run migrate:embedded-relationships
```

**Watch for:**
- [ ] Progress updates (batch completion)
- [ ] Error messages
- [ ] Unresolved reference count
- [ ] Final statistics

**Expected timing:** ~5-10 minutes for 1,551 relationships

### 4. Verify Results

```bash
# Should show 0 objects to migrate
npm run migrate:embedded-relationships:dry-run
```

**Database queries:**

```sql
-- Count migrated relationships (should be ~1,551)
SELECT COUNT(*) FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;

-- Breakdown by type
SELECT 
  relationship_type, 
  COUNT(*) as count
FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL
GROUP BY relationship_type;

-- Sample relationships
SELECT 
  r.relationship_type,
  o1.type as from_type,
  o1.properties->>'name' as from_name,
  o2.type as to_type,
  o2.properties->>'name' as to_name
FROM kb.graph_relationships r
JOIN kb.graph_objects o1 ON o1.canonical_id = r.from_canonical_id
JOIN kb.graph_objects o2 ON o2.canonical_id = r.to_canonical_id
WHERE r.properties->>'_migrated_from' IS NOT NULL
LIMIT 10;
```

**Checks:**
- [ ] Relationship count matches expected (~1,551)
- [ ] All 4 relationship types present (HAS_PARTY, HAS_PARTICIPANT, HAS_WITNESS, PERFORMED_BY)
- [ ] Sample relationships look correct
- [ ] No duplicate relationships

## Post-Migration Testing

### UI Testing
- [ ] Open admin UI: http://localhost:5176
- [ ] Open an Event object
- [ ] Verify relationships tab shows HAS_PARTICIPANT relationships
- [ ] Open a Covenant object
- [ ] Verify relationships tab shows HAS_PARTY relationships
- [ ] Open a Miracle object
- [ ] Verify relationships tab shows HAS_WITNESS and PERFORMED_BY relationships
- [ ] Test creating new relationship manually

### Query Testing
- [ ] Test graph traversal query (find all participants in events)
- [ ] Test reverse query (find all events person participated in)
- [ ] Compare query performance vs embedded properties (optional)

### Extraction Testing
- [ ] Upload new document with Event/Covenant/Miracle objects
- [ ] Verify new objects do NOT have embedded properties
- [ ] Verify explicit relationships created instead
- [ ] Check schema version is 3.0.0 for new objects

## Handling Issues

### Unresolved References

**If > 5% unresolved:**
1. Export unresolved list from migration output
2. Analyze patterns (common names, types)
3. Create missing entities OR
4. Fix name variations OR
5. Manually create relationships for high-priority cases
6. Re-run migration

**Commands:**
```bash
# Create missing entity (example)
psql $DATABASE_URL -c "
  INSERT INTO kb.graph_objects (...)
  VALUES (...);
"

# Fix name variation (example)
psql $DATABASE_URL -c "
  UPDATE kb.graph_objects
  SET properties = jsonb_set(properties, '{name}', '\"Exact Name\"')
  WHERE id = 'object-id';
"

# Re-run migration
npm run migrate:embedded-relationships
```

### Migration Errors

**If migration fails:**
1. Check database logs: `nx run workspace-cli:workspace:logs --service=database`
2. Check error message in migration output
3. Fix underlying issue
4. Rollback if needed (see below)
5. Re-run migration

## Rollback

**If needed, delete migrated relationships:**

```sql
-- Preview what will be deleted
SELECT COUNT(*) FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;

-- Delete migrated relationships
DELETE FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;

-- Verify
SELECT COUNT(*) FROM kb.graph_relationships;
```

**Then:**
- [ ] Fix issues
- [ ] Re-run migration

## Post-Migration Cleanup (Optional)

**Only after thorough testing:**

```sql
-- Remove embedded properties (CAUTION!)
UPDATE kb.graph_objects
SET properties = properties - 'parties' - 'participants' - 'witnesses' - 'performer' - 'participants_canonical_ids'
WHERE properties ?| array['parties', 'participants', 'witnesses', 'performer', 'participants_canonical_ids'];
```

**Before cleanup:**
- [ ] All tests pass
- [ ] UI works correctly
- [ ] Queries work as expected
- [ ] Backup created
- [ ] Team agrees cleanup is safe

## Final Verification

- [ ] Phase 2 dry run shows 0 objects to migrate
- [ ] ~1,551 explicit relationships in database
- [ ] UI displays relationships correctly
- [ ] Graph queries work as expected
- [ ] No critical errors in logs
- [ ] Documentation updated with results

## Documentation Updates

After successful migration:

- [ ] Update `docs/migrations/SESSION_SUMMARY_2025-11-21.md` with actual results
- [ ] Document any issues encountered and resolutions
- [ ] Update `docs/plans/migrate-embedded-relationships-to-table.md` with Phase 2 complete status
- [ ] Create follow-up tasks if needed

## Success Criteria

✅ Migration is successful when:

- [x] Phase 1 complete (schema updates deployed)
- [ ] Phase 2 dry run shows ~1,551 relationships to migrate
- [ ] Migration executes without critical errors
- [ ] ~1,551 explicit relationships created
- [ ] Unresolved references < 5% (acceptable threshold)
- [ ] Dry run shows 0 relationships to migrate (all done)
- [ ] Relationships visible in database queries
- [ ] UI displays relationships correctly
- [ ] Graph traversal queries work
- [ ] No regressions in existing functionality

## Quick Commands Reference

```bash
# Verify Phase 1
./scripts/verify-phase1-complete.sh

# Dry run
npm run migrate:embedded-relationships:dry-run

# Execute migration
npm run migrate:embedded-relationships

# By type (for testing)
npm run migrate:embedded-relationships -- --type=Event

# Verbose (for debugging)
npm run migrate:embedded-relationships -- --verbose

# Verify complete
npm run migrate:embedded-relationships:dry-run  # Should show 0
```

## Support

- **Main Guide:** `docs/migrations/MIGRATION_COMPLETE_GUIDE.md`
- **Phase 2 Details:** `docs/migrations/run-phase2-migration.md`
- **Troubleshooting:** See Phase 2 doc section
- **Session Notes:** `docs/migrations/SESSION_SUMMARY_2025-11-21.md`

---

**Next Step:** Run `npm run migrate:embedded-relationships:dry-run`
