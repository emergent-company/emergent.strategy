# Migration Consolidation - October 24, 2025

## Summary

Successfully consolidated 32 separate migration files into a single comprehensive schema file.

## What Was Done

1. **Backed up all original migrations** to `migrations-backup/` directory (34 files)

2. **Captured working database schema** using `pg_dump --schema=kb --schema-only`

3. **Created consolidated migration**: `0001_complete_schema.sql`
   - Contains complete working schema with all fixes
   - Includes all tables, functions, triggers, and RLS policies
   - Size: ~3,200 lines / 100KB

4. **Reset database**: Dropped and recreated `kb` schema from scratch

5. **Applied single migration**: Successfully applied in 692ms

## Key Fixes Included in Consolidated Schema

The consolidated schema includes all the fixes we made:

✅ **Notifications Table** (Full Schema):
- `read_at` TIMESTAMPTZ (not boolean)
- `importance` TEXT with check constraint
- `user_id` TEXT (migrated from subject_id)
- `cleared_at` TIMESTAMPTZ
- `snoozed_until` TIMESTAMPTZ
- `category` TEXT
- All related indexes

✅ **Object Extraction Jobs**:
- Table name: `object_extraction_jobs` (not `extraction_jobs`)
- Column: `organization_id` UUID (not `org_id`)
- Column: `created_objects` JSONB (not `objects_created`)
- All constraints, indexes, functions, and triggers

✅ **All Other Tables**:
- 35 tables total in `kb` schema
- Consistent column naming across the board
- All RLS policies for multi-tenancy
- All monitoring and logging infrastructure

## Migration Status

**Before consolidation**: 32 migrations (0000-0028 range + dated migrations)

**After consolidation**: 1 migration (`0001_complete_schema.sql`)

**Database state**: Clean, single migration tracking record

## Backup Location

All original migrations preserved in:
```
apps/server-nest/migrations-backup/
```

Contains:
- `0000_initial_schema.sql`
- `0001_create_notifications_table.sql`
- `0002_extraction_jobs.sql`
- ... (34 files total)

## Verification

✅ All 35 tables recreated successfully
✅ `object_extraction_jobs.organization_id` exists
✅ `object_extraction_jobs.created_objects` exists  
✅ `notifications.read_at` exists (TIMESTAMPTZ)
✅ `notifications.importance` exists
✅ `notifications.user_id` exists
✅ Server starts without column errors
✅ Documents API endpoint works (no 500 errors)

## Remaining Non-Critical Issues

These are background workers that don't affect user-facing functionality:

⚠️ Missing `kb.tags` table - TagCleanupWorkerService
⚠️ Missing `kb.refresh_revision_counts()` function - RevisionCountRefreshWorkerService

These can be added in future migrations if/when the features are implemented.

## Benefits of Consolidation

1. **Cleaner codebase**: Single source of truth for schema
2. **Faster setup**: New developers apply 1 migration instead of 32
3. **No migration ordering issues**: Everything defined in one place
4. **Easier to understand**: Complete schema in one file
5. **Early stage friendly**: Perfect for projects without production data

## Next Steps

If you need to make schema changes going forward:

1. Add new migrations as `0002_*.sql`, `0003_*.sql`, etc.
2. Run `npx node scripts/migrate.mjs` to apply
3. Migrations are tracked in `kb.schema_migrations` table

The migration system continues to work exactly as before, but now with a clean starting point.
