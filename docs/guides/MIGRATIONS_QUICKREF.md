# Database Migration Quick Reference

## Automatic Migration System

**Migrations run automatically on application startup** via `DatabaseService.onModuleInit()`.

No manual commands needed - just start the server:
```bash
npm --prefix apps/server run start:dev
```

Migrations execute before the app accepts requests, ensuring schema is always up-to-date.

## Creating a New Migration

```bash
# 1. Create migration file in the migrations directory
touch apps/server/src/common/database/migrations/$(date +%Y%m%d)_your_description.sql

# 2. Edit the file with your SQL (make it idempotent!)
# Example: CREATE TABLE IF NOT EXISTS ...

# 3. Restart the server - migrations run automatically
npm --prefix apps/server run start:dev
```

## Skipping Migrations (Development Only)

If you need to skip migrations temporarily:
```bash
SKIP_MIGRATIONS=1 npm --prefix apps/server run start:dev
```

## Migration Flow

```
1. Application starts
2. DatabaseService.onModuleInit() is called
3. runMigrations() reads .sql files from src/common/database/migrations/
4. Files are sorted alphabetically and executed in order
5. Advisory lock prevents concurrent runs
6. Each migration is executed (warnings logged on errors, but continues)
7. Application becomes ready for requests
```

## Monitoring Migrations

Check the application logs:
```bash
# Look for migration execution logs
[DatabaseService] Running database migrations...
[DatabaseService] Running migration: 20251018_add_extraction_progress_columns.sql
[DatabaseService] ✓ Migration 20251018_add_extraction_progress_columns.sql completed
[DatabaseService] All migrations completed in 156ms
```

## Migration File Best Practices

1. **Idempotent**: Use `IF NOT EXISTS`, `IF EXISTS`, etc.
2. **Alphabetical ordering**: Use date prefix `YYYYMMDD_description.sql`
3. **Single purpose**: One logical change per file
4. **Safe operations**: Avoid destructive changes without backups

Example:
```sql
-- 20251102_add_user_preferences.sql
CREATE TABLE IF NOT EXISTS kb.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
ON kb.user_preferences(user_id);
```

## Troubleshooting

**Migrations not running:**
- Check logs for "Running database migrations..." message
- Verify files are in `apps/server/src/common/database/migrations/`
- Ensure files end with `.sql` extension
- Check for `SKIP_MIGRATIONS=1` environment variable

**Migration errors:**
- Check application logs for error details
- Migrations log warnings but continue (non-blocking)
- Advisory lock prevents concurrent runs

## Legacy Migration Script (Removed)

Previous versions used `scripts/migrate.mjs` with Nx commands:
```bash
# OBSOLETE - No longer available
npx nx run server:migrate
```

This script was removed as migrations now run automatically in the application lifecycle.

## Related Documentation

- [Migration Lifecycle Fix](../MIGRATION_LIFECYCLE_FIX.md) - How automatic migrations were implemented
- [Migration Naming Conventions](../../apps/server/MIGRATION_NAMING_CONVENTIONS.md) - File naming patterns
