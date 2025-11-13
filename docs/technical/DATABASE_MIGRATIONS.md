# Database Migration System

## Overview

The migration system provides automated tracking and application of SQL schema changes to the PostgreSQL database. It handles migration order, prevents duplicate applications, and records execution history.

## Quick Start

```bash
# List current migration status
npx nx run server:migrate -- --list

# Preview pending migrations (dry run)
npx nx run server:migrate -- --dry-run

# Apply all pending migrations
npx nx run server:migrate
```

## Features

- **Automatic Tracking**: Records which migrations have been applied in `kb.schema_migrations` table
- **Idempotent**: Safe to run multiple times - only applies new migrations
- **Ordered Execution**: Migrations run in alphabetical order (use numbered prefixes)
- **Checksum Validation**: Detects if migration files were modified after application
- **Error Handling**: Stops on first failure and records errors in database
- **Flexible Connection**: Works with Docker container or direct database connection
- **Performance Metrics**: Tracks execution time for each migration

## Migration Naming Convention

Migrations must follow these naming patterns for proper ordering:

```
YYYY-MM-DD_description.sql       # Date-based (recommended for new migrations)
NNNN_description.sql             # Sequential numbers (legacy compatibility)
```

**Examples:**

- `20251018_add_extraction_progress_columns.sql`
- `0002_extraction_jobs.sql`
- `0003_integrations_system.sql`

## Creating New Migrations

1. Create a new SQL file in `apps/server/migrations/`:

```bash
# Use date-based naming for new migrations
touch apps/server/migrations/$(date +%Y%m%d)_add_user_preferences.sql
```

2. Write your SQL statements:

```sql
-- Migration: Add user preferences table
-- Date: 2025-10-18

BEGIN;

CREATE TABLE IF NOT EXISTS kb.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
    theme VARCHAR(50) DEFAULT 'light',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE kb.user_preferences IS 'Stores user-specific UI preferences';

CREATE INDEX idx_user_preferences_theme ON kb.user_preferences(theme);

COMMIT;
```

3. Test with dry run first:

```bash
npx nx run server:migrate -- --dry-run
```

4. Apply the migration:

```bash
npx nx run server:migrate
```

## Migration Best Practices

### DO ✅

- **Use transactions** (`BEGIN`/`COMMIT`) for atomic operations
- **Add comments** explaining purpose and date
- **Test in development** before committing to version control
- **Make migrations idempotent** using `IF NOT EXISTS`, `IF EXISTS`, etc.
- **Keep migrations focused** - one logical change per file
- **Document complex changes** with inline SQL comments
- **Update database documentation** after schema changes (see below)

### DON'T ❌

- **Don't modify applied migrations** - create a new migration to fix issues
- **Don't use destructive operations without backups** (`DROP TABLE`, `DELETE`)
- **Don't assume data state** - check existence before operations
- **Don't mix DDL and DML** - separate schema changes from data migrations
- **Don't hardcode sensitive data** - use environment variables

### After Schema Changes

When migrations modify the database schema, update the database documentation:

```bash
# Apply the migration
npm run db:migrate

# Regenerate DBML documentation
npm run db:docs:generate

# Validate the documentation
npm run db:docs:validate
```

This keeps the `docs/database/schema.dbml` file in sync with the actual database structure. See the [Database Documentation Guide](../guides/database-documentation.md) for details.

## Migration Tracking Table

The system automatically creates and manages `kb.schema_migrations`:

```sql
CREATE TABLE kb.schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
    checksum VARCHAR(64),              -- MD5 of file content
    execution_time_ms INTEGER,         -- Performance metric
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT                 -- Populated on failure
);
```

**Query migration history:**

```sql
-- See all applied migrations
SELECT filename, applied_at, execution_time_ms
FROM kb.schema_migrations
ORDER BY applied_at DESC;

-- Find failed migrations
SELECT filename, applied_at, error_message
FROM kb.schema_migrations
WHERE success = FALSE;

-- Check if specific migration was applied
SELECT EXISTS(
    SELECT 1 FROM kb.schema_migrations
    WHERE filename = '20251018_add_extraction_progress_columns.sql'
);
```

## CLI Commands

### List Migration Status

Shows which migrations have been applied and which are pending:

```bash
npx nx run server:migrate -- --list
```

**Output:**

```
Applied Migrations:
  ✓ 0002_extraction_jobs.sql (2025-10-18 19:30:15)
  ✓ 0003_integrations_system.sql (2025-10-18 19:30:18)

Pending Migrations:
  • 20251019_add_user_preferences.sql

Total: 2 applied, 1 pending
```

### Dry Run

Preview what would be applied without making changes:

```bash
npx nx run server:migrate -- --dry-run
```

### Apply Migrations

Run all pending migrations:

```bash
npx nx run server:migrate
```

**Output:**

```
Applying 1 pending migration(s)...

  Applying: 20251019_add_user_preferences.sql
  ✓ Applied in 234ms
    NOTICE: Table kb.user_preferences created

Migration Summary
  Success: 1
  Total applied: 3 migrations
```

## Rollback Strategy

The system does not support automatic rollback. To undo a migration:

1. **Create a new migration** that reverses the changes:

```sql
-- Migration: Rollback user preferences
-- Reverts: 20251019_add_user_preferences.sql

BEGIN;

DROP TABLE IF EXISTS kb.user_preferences CASCADE;

COMMIT;
```

2. **Apply the rollback migration:**

```bash
npx nx run server:migrate
```

3. **Document the rollback** in the migration filename:

```
20251019_rollback_user_preferences.sql
```

## Database Connection

The script automatically detects and uses available connection methods:

### 1. Docker Container (Default)

Connects to `spec_pg` container:

```bash
# No configuration needed - works out of the box
npx nx run server:migrate
```

### 2. Direct Connection (Fallback)

Uses environment variables if Docker is unavailable:

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=spec
export POSTGRES_DB=spec
export POSTGRES_PASSWORD=spec

npx nx run server:migrate
```

## Troubleshooting

### Migration Fails to Apply

**Check the error message:**

```bash
npx nx run server:migrate -- --list
```

Query the failed migration:

```sql
SELECT filename, error_message
FROM kb.schema_migrations
WHERE success = FALSE;
```

**Fix the issue and create a corrective migration** - never modify the original.

### Migration Already Applied But Shows as Pending

Check if the migration was partially applied:

```sql
SELECT * FROM kb.schema_migrations
WHERE filename = 'YOUR_MIGRATION.sql';
```

If the record exists, it was applied. If not, manually insert:

```sql
INSERT INTO kb.schema_migrations (filename, checksum, execution_time_ms, success)
VALUES ('YOUR_MIGRATION.sql', 'MANUAL', 0, TRUE);
```

### Connection Issues

**Docker container not running:**

```bash
docker ps | grep spec_pg
docker start spec_pg
```

**Wrong credentials:**

```bash
docker exec spec_pg env | grep POSTGRES
```

**Test connection manually:**

```bash
docker exec -it spec_pg psql -U spec -d spec -c '\dt kb.*'
```

### Permission Issues

Ensure the database user has schema privileges:

```sql
GRANT USAGE ON SCHEMA kb TO spec;
GRANT CREATE ON SCHEMA kb TO spec;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA kb TO spec;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA kb TO spec;
```

## CI/CD Integration

Add to your deployment pipeline:

```yaml
# .github/workflows/deploy.yml
- name: Run Database Migrations
  run: npx nx run server:migrate
  env:
    POSTGRES_HOST: ${{ secrets.DB_HOST }}
    POSTGRES_PORT: ${{ secrets.DB_PORT }}
    POSTGRES_USER: ${{ secrets.DB_USER }}
    POSTGRES_DB: ${{ secrets.DB_NAME }}
    POSTGRES_PASSWORD: ${{ secrets.DB_PASSWORD }}
```

**Best practices for CI:**

- Run migrations before deploying new code
- Use a dedicated migration user with limited privileges
- Always test migrations in staging first
- Set up alerts for migration failures
- Keep migration execution time under 30 seconds

## Performance Considerations

- **Index creation** can take time on large tables - consider `CONCURRENTLY`
- **Table alterations** may lock tables - plan for maintenance windows
- **Data migrations** on large datasets - use batching and progress logging
- **Foreign keys** - add constraints after data is populated

**Example of concurrent index creation:**

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_large_table_column
ON kb.large_table(column_name);
```

## Schema Versioning

The migration system provides automatic versioning through:

1. **Ordered filenames** - chronological application
2. **Applied timestamps** - when each migration ran
3. **Checksum tracking** - detects unauthorized changes
4. **Version queries** - programmable schema version checks

**Get current schema version:**

```sql
SELECT COUNT(*) as version
FROM kb.schema_migrations
WHERE success = TRUE;
```

## Related Documentation

- [Extraction Progress Implementation](./EXTRACTION_PROGRESS_IMPLEMENTATION_COMPLETE.md)
- [NestJS Instructions](../.github/instructions/nestjs.instructions.md)
- [Testing Infrastructure](../.github/instructions/testing.instructions.md)

## Support

For issues or questions:

1. Check this documentation
2. Review migration error messages in `kb.schema_migrations`
3. Consult logs with `npm run workspace:logs`
4. Check self-learning log: `.github/instructions/self-learning.instructions.md`
