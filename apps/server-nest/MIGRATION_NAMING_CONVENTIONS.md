# Database Migration Guidelines

This document defines the naming conventions and best practices for database migrations in this project.

## Migration Naming Convention

All migration files must follow this strict naming pattern:

```
####_descriptive_name.sql
```

Where:
- `####` = 4-digit sequential number (with leading zeros)
- `descriptive_name` = lowercase words separated by underscores
- `.sql` = file extension

### Examples

✅ **CORRECT**:
```
0001_complete_schema.sql
0002_create_tags_table.sql
0003_add_user_preferences.sql
0004_create_audit_log.sql
0005_add_document_versioning.sql
```

❌ **INCORRECT**:
```
20251024_add_column.sql           ❌ Uses date prefix instead of number
1_add_column.sql                   ❌ Not padded to 4 digits
0001-create-table.sql              ❌ Uses hyphens instead of underscores
0002_CreateTable.sql               ❌ Uses CamelCase instead of snake_case
add_column.sql                     ❌ Missing sequential number
```

## Migration Numbering Rules

1. **Start at 0001**: The first migration after initial schema is always `0001_`

2. **Sequential**: Each new migration increments by 1
   - After `0001_complete_schema.sql` comes `0002_create_tags_table.sql`
   - After `0009_something.sql` comes `0010_something_else.sql`

3. **No gaps**: Don't skip numbers. If you delete a migration, don't reuse its number.

4. **Four digits**: Always pad to 4 digits (0001, 0002, ... 0099, 0100, ... 9999)

5. **No dates**: Don't use date prefixes like `20251024_`. Use sequential numbers only.

## Migration File Structure

Each migration should follow this template:

```sql
-- Migration: [Short Title]
-- Description: [Detailed description of what this migration does]
-- Date: YYYY-MM-DD
-- ============================================================================

-- Your SQL statements here

-- Table/column comments
COMMENT ON TABLE ... IS '...';
COMMENT ON COLUMN ... IS '...';
```

### Example

```sql
-- Migration: Create tags table
-- Description: Add tags table for product version tagging system
-- Date: 2025-10-24
-- ============================================================================

CREATE TABLE kb.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tags_project_id ON kb.tags(project_id);

-- Table comment
COMMENT ON TABLE kb.tags IS 'Tags for organizing product versions';
```

## Migration Best Practices

### 1. One Logical Change Per Migration

Each migration should address ONE logical change:

✅ Good:
- `0002_create_tags_table.sql` - Creates one table
- `0003_add_user_preferences_columns.sql` - Adds related columns

❌ Bad:
- `0002_various_changes.sql` - Creates tables + modifies columns + adds indexes

### 2. Idempotency

Where possible, make migrations idempotent using:
- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`

### 3. Transactions

The migration runner wraps each migration in a transaction, but you can use explicit transactions for complex multi-step migrations:

```sql
BEGIN;

-- Multiple related changes
CREATE TABLE ...;
ALTER TABLE ...;

COMMIT;
```

### 4. Rollback Strategy

Migrations are forward-only. To undo a migration:
1. Create a NEW migration that reverses the changes
2. Number it sequentially (don't delete the original)

Example:
- `0005_add_email_column.sql` - Added email column
- `0006_remove_email_column.sql` - Removed email column (rollback)

### 5. Testing

Before committing a migration:
1. Test on local database: `npx node scripts/migrate.mjs`
2. Verify no errors in server logs after restart
3. Check the schema: `\d table_name` in psql

## Column Naming Conventions

To maintain consistency across the codebase:

### Organization/Tenant Columns

**Use `org_id` or `organization_id` consistently**:
- Tables with RLS: Use `organization_id` (clearer in policies)
- Service layer: Check what the code already uses
- **Don't mix both** in the same table

Example from this codebase:
- `object_extraction_jobs` uses `organization_id` ✅
- `tags` uses `org_id` ✅
- `documents` uses `org_id` ✅

### Standard Column Names

Use these consistent patterns:

| Column Type | Standard Name | Type | Notes |
|-------------|---------------|------|-------|
| Primary key | `id` | UUID | Use `gen_random_uuid()` |
| Organization | `org_id` or `organization_id` | UUID | Be consistent |
| Project | `project_id` | UUID | Always this name |
| User reference | `user_id` | TEXT | For Zitadel user IDs |
| Created timestamp | `created_at` | TIMESTAMPTZ | Always include |
| Updated timestamp | `updated_at` | TIMESTAMPTZ | Always include |
| Boolean flags | `is_active`, `enabled` | BOOLEAN | Positive naming |
| JSON data | `*_metadata`, `*_config` | JSONB | Use JSONB not JSON |

### Avoid

❌ `created_by` when you mean `user_id`  
❌ `tenant_id` (we use `organization_id` or `org_id`)  
❌ `modified_at` (use `updated_at`)  
❌ Abbreviations like `usr_id`, `proj_id` (use full words)

## Checking Migration Status

View applied migrations:
```bash
docker exec -i spec-server-2-db-1 psql -U spec -d spec -c "SELECT * FROM kb.schema_migrations ORDER BY id"
```

List migration files:
```bash
ls -1 apps/server-nest/migrations/
```

## Migration Runner

Run migrations:
```bash
cd apps/server-nest
npx node scripts/migrate.mjs
```

Options:
- `--list` - Show migration status without applying
- `--dry-run` - Show what would be applied without executing

## Troubleshooting

### Migration Failed Mid-Execution

The migration runner uses transactions, so partial migrations should rollback automatically. Check:
1. Error message in migration runner output
2. Server error logs: `tail -100 apps/logs/server/error.log`
3. Database schema: Did any changes persist?

### Wrong Migration Number

If you created a migration with the wrong number:
1. Rename the file to the correct number
2. The checksum will change, so the runner will see it as new
3. If already applied, create a new migration with correct number and delete the old entry from `schema_migrations`

### Need to Rollback

Create a reverse migration:
```bash
# If 0005_add_column.sql added a column
# Create 0006_remove_column.sql that drops it
```

## Summary

✅ **DO**:
- Use 4-digit sequential numbers (0001, 0002, ...)
- Use snake_case for descriptive names
- One logical change per migration
- Test locally before committing
- Add comments explaining purpose

❌ **DON'T**:
- Use date prefixes (20251024_)
- Mix naming styles in same table
- Skip numbers or reuse numbers
- Modify migrations after they're applied
- Create migrations without testing

Following these conventions ensures:
- Clean migration history
- Easy collaboration
- Predictable database state
- No conflicts between branches
