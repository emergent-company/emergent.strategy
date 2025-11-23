# Migrations Documentation

This directory contains documentation for database and schema migrations.

## Current Migrations

### Embedded Relationships → Explicit Table (2025-11-21)

**Status:** Phase 1 Complete ✅ | Phase 2 Ready 🚧

Migration from embedded JSONB relationship properties to explicit records in `kb.graph_relationships` table.

**Quick Start:**
```bash
# Verify Phase 1
./scripts/verify-phase1-complete.sh

# Dry run migration
npm run migrate:embedded-relationships:dry-run

# Run migration
npm run migrate:embedded-relationships
```

**Documentation:**

| Document | Purpose |
|----------|---------|
| [**MIGRATION_COMPLETE_GUIDE.md**](./MIGRATION_COMPLETE_GUIDE.md) | 📖 **START HERE** - Complete guide with quick start |
| [SESSION_SUMMARY_2025-11-21.md](./SESSION_SUMMARY_2025-11-21.md) | 📝 Detailed session log and work accomplished |
| [PHASE1_COMPLETE_SUMMARY.md](./PHASE1_COMPLETE_SUMMARY.md) | ✅ Phase 1 accomplishments and testing checklist |
| [run-phase2-migration.md](./run-phase2-migration.md) | 🚀 Phase 2 execution guide with examples |
| [relationship-types-user-friendly-names.md](./relationship-types-user-friendly-names.md) | 🏷️ Bidirectional relationship labels guide |
| [add-relationship-types-to-template-pack.md](./add-relationship-types-to-template-pack.md) | ➕ New relationship types implementation |
| [remove-embedded-relationships-from-schemas.md](./remove-embedded-relationships-from-schemas.md) | 🧹 Schema cleanup changes |

**Related Documentation:**
- [Migration Plan](../plans/migrate-embedded-relationships-to-table.md) - Overall strategy

**Scripts:**
- `scripts/migrate-embedded-relationships.ts` - Phase 2 migration script
- `scripts/verify-phase1-complete.sh` - Verification script
- `scripts/seed-bible-template-pack.ts` - Template pack with updated schemas
- `scripts/lib/relationship-type-schemas.ts` - TypeScript type definitions

## Migration Index

### Schema Migrations

| Date | Migration | Status | Files |
|------|-----------|--------|-------|
| 2025-11-21 | **Embedded Relationships → Table** | Phase 1 ✅ | [Guide](./MIGRATION_COMPLETE_GUIDE.md) |
| 2025-11-21 | Add Relationship Labels | ✅ Complete | [Doc](./relationship-types-user-friendly-names.md) |
| 2025-11-21 | Add HAS_PARTY, HAS_PARTICIPANT, etc. | ✅ Complete | [Doc](./add-relationship-types-to-template-pack.md) |
| 2025-11-21 | Clean Event/Covenant/Miracle Schemas | ✅ Complete | [Doc](./remove-embedded-relationships-from-schemas.md) |

### Data Migrations

| Date | Migration | Status | Records | Files |
|------|-----------|--------|---------|-------|
| 2025-11-21 | Migrate 1,551 Embedded Relationships | 🚧 Ready | 1,551 | [Guide](./run-phase2-migration.md) |

## Quick Reference

### Phase 1: Schema Updates ✅
- Added user-friendly labels to all 23 relationship types
- Created 4 new relationship types
- Cleaned Event, Covenant, Miracle schemas (v2.0.0 → v3.0.0)
- Updated extraction prompts
- Deployed via `npm run seed:bible-template`

### Phase 2: Data Migration 🚧
- Convert 1,551 embedded relationships to explicit table records
- Resolve entity names to canonical_ids
- Create relationships with migration metadata
- Verify with `npm run migrate:embedded-relationships:dry-run`
- Execute with `npm run migrate:embedded-relationships`

## Migration Best Practices

1. ✅ **Always dry run first** - Preview changes before executing
2. ✅ **Backup database** - Create backup before major migrations
3. ✅ **Test on subset** - Use `--type=Event` to test on single object type
4. ✅ **Verify results** - Run verification queries after migration
5. ✅ **Document changes** - Update migration docs with results
6. ✅ **Keep rollback option** - Don't delete old data immediately

## Common Commands

```bash
# Seed template pack (Phase 1)
npm run seed:bible-template

# Verify Phase 1 complete
./scripts/verify-phase1-complete.sh

# Migration dry run
npm run migrate:embedded-relationships:dry-run

# Migration by type
npm run migrate:embedded-relationships -- --type=Event

# Full migration
npm run migrate:embedded-relationships

# Verify migration complete
npm run migrate:embedded-relationships:dry-run  # Should show 0
```

## Database Queries

### Check Embedded Relationships
```sql
SELECT 
  COUNT(*) FILTER (WHERE properties->>'parties' IS NOT NULL) as parties,
  COUNT(*) FILTER (WHERE properties->>'participants' IS NOT NULL) as participants,
  COUNT(*) FILTER (WHERE properties->>'witnesses' IS NOT NULL) as witnesses,
  COUNT(*) FILTER (WHERE properties->>'performer' IS NOT NULL) as performer
FROM kb.graph_objects;
```

### Check Explicit Relationships
```sql
SELECT COUNT(*) FROM kb.graph_relationships;

SELECT COUNT(*) FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;
```

### View Migrated Relationships
```sql
SELECT 
  r.relationship_type,
  o1.type || ': ' || (o1.properties->>'name') as from_obj,
  o2.type || ': ' || (o2.properties->>'name') as to_obj,
  r.properties->>'_migrated_from' as source
FROM kb.graph_relationships r
JOIN kb.graph_objects o1 ON o1.canonical_id = r.from_canonical_id AND o1.branch_id = r.branch_id
JOIN kb.graph_objects o2 ON o2.canonical_id = r.to_canonical_id AND o2.branch_id = r.branch_id
WHERE r.properties->>'_migrated_from' IS NOT NULL
LIMIT 10;
```

## Troubleshooting

**Issue:** Database not running  
**Solution:** `docker compose -f docker/docker-compose.yml up -d db`

**Issue:** Unresolved references  
**Solution:** See [run-phase2-migration.md](./run-phase2-migration.md#handling-unresolved-references)

**Issue:** Migration script errors  
**Solution:** Check `nx run workspace-cli:workspace:logs --service=database`

## Support

- **Migration Guide:** [MIGRATION_COMPLETE_GUIDE.md](./MIGRATION_COMPLETE_GUIDE.md)
- **Troubleshooting:** [run-phase2-migration.md](./run-phase2-migration.md#troubleshooting)
- **Session Notes:** [SESSION_SUMMARY_2025-11-21.md](./SESSION_SUMMARY_2025-11-21.md)
- **Overall Plan:** [../plans/migrate-embedded-relationships-to-table.md](../plans/migrate-embedded-relationships-to-table.md)

## Contributing

When creating new migrations:

1. Create documentation in `docs/migrations/` before coding
2. Include rollback procedures
3. Add verification queries
4. Update this README with new migration entry
5. Test on sample data first
6. Document actual results vs expected

## Template

Use `TEMPLATE.md` as starting point for new migration documentation.
