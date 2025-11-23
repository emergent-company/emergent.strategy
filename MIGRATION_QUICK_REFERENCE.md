# Migration Quick Reference Card

**Keep this handy during Phase 2 execution**

## 🚀 Essential Commands

```bash
# Check status
./scripts/migration-helper.sh status

# Dry run (ALWAYS RUN FIRST)
./scripts/migration-helper.sh dry-run

# Execute migration
./scripts/migration-helper.sh migrate

# Verify complete
./scripts/migration-helper.sh verify-phase2

# View stats
./scripts/migration-helper.sh stats

# Rollback if needed
./scripts/migration-helper.sh rollback

# Get help
./scripts/migration-helper.sh help
```

## 📊 Expected Numbers

| Metric | Expected Value |
|--------|----------------|
| Embedded relationships | 1,551 |
| Objects affected | 1,563 |
| Explicit relationships created | ~1,551 |
| Unresolved references | < 5% |
| Execution time | ~10 minutes |

## ✅ Pre-Migration Checklist

- [ ] Database is running
- [ ] Phase 1 verified (`./scripts/migration-helper.sh verify-phase1`)
- [ ] Dry run shows expected numbers
- [ ] Backup created (optional)
- [ ] Read documentation

## 🔍 Verification Queries

```sql
-- Count embedded (before migration)
SELECT 
  COUNT(*) FILTER (WHERE properties->>'parties' IS NOT NULL) as parties,
  COUNT(*) FILTER (WHERE properties->>'participants' IS NOT NULL) as participants,
  COUNT(*) FILTER (WHERE properties->>'witnesses' IS NOT NULL) as witnesses,
  COUNT(*) FILTER (WHERE properties->>'performer' IS NOT NULL) as performer
FROM kb.graph_objects;

-- Count migrated (after migration)
SELECT COUNT(*) FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL;

-- Breakdown by type
SELECT relationship_type, COUNT(*) 
FROM kb.graph_relationships
WHERE properties->>'_migrated_from' IS NOT NULL
GROUP BY relationship_type;
```

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| Database not accessible | `docker compose -f docker/docker-compose.yml up -d db` |
| Migration fails | Check logs, fix issue, rollback, retry |
| High unresolved refs | Review list, create missing entities, re-run |
| Duplicate relationships | Script handles this automatically |

## 📖 Documentation Paths

- **Quick Start:** `MIGRATION_README.md`
- **Checklist:** `MIGRATION_CHECKLIST.md`
- **Full Guide:** `docs/migrations/MIGRATION_COMPLETE_GUIDE.md`
- **Troubleshooting:** `docs/migrations/run-phase2-migration.md#troubleshooting`
- **Architecture:** `docs/migrations/ARCHITECTURE_DIAGRAM.md`

## 🎯 Success Criteria

- [ ] Dry run shows 0 objects to migrate (after execution)
- [ ] ~1,551 explicit relationships created
- [ ] Unresolved references < 5%
- [ ] No critical errors in migration output
- [ ] Sample queries return expected results
- [ ] UI displays relationships correctly

## 🔄 Migration Flow

```
1. Check Status
   ↓
2. Verify Phase 1
   ↓
3. Dry Run (preview)
   ↓
4. Review unresolved refs
   ↓
5. Execute Migration
   ↓
6. Verify Success
   ↓
7. Test UI/Queries
   ↓
8. ✅ Complete
```

## 💡 Pro Tips

- **Always dry run first** - Preview before executing
- **Review unresolved refs** - Fix before or after migration
- **Monitor progress** - Watch batch completion messages
- **Keep embedded data** - Don't remove until thoroughly tested
- **Easy rollback** - Can delete migrated relationships safely

## 📞 Get Help

- Run: `./scripts/migration-helper.sh help`
- Check: `docs/migrations/run-phase2-migration.md#troubleshooting`
- Test queries: `scripts/test-migration-queries.sql`

## 🔐 Safety Features

✅ Dry run mode  
✅ Backwards compatible  
✅ Easy rollback  
✅ Batch processing  
✅ Duplicate detection  
✅ Migration metadata  

---

**Phase 1:** ✅ Complete  
**Phase 2:** 🚧 Ready  
**Next:** `./scripts/migration-helper.sh status`
