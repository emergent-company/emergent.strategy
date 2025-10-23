# Database Migration Quick Reference

## Most Common Commands

```bash
# Check migration status
npx nx run server-nest:migrate -- --list

# Preview what would be applied (dry run)
npx nx run server-nest:migrate -- --dry-run

# Apply all pending migrations
npx nx run server-nest:migrate
```

## Creating a New Migration

```bash
# Create migration file
touch apps/server-nest/migrations/$(date +%Y%m%d)_your_description.sql

# Edit the file with your SQL
# Test with dry run
npx nx run server-nest:migrate -- --dry-run

# Apply it
npx nx run server-nest:migrate
```

## Query Migration History

```sql
-- See all applied migrations
SELECT filename, applied_at, execution_time_ms 
FROM kb.schema_migrations 
ORDER BY applied_at DESC;

-- Find failures
SELECT filename, error_message 
FROM kb.schema_migrations 
WHERE success = FALSE;
```

## Troubleshooting

**Migration shows as pending but was already applied:**
```sql
-- Manually mark as applied
INSERT INTO kb.schema_migrations (filename, checksum, success)
VALUES ('YOUR_FILE.sql', 'MANUAL', TRUE);
```

**Connection issues:**
```bash
# Check Docker container
docker ps | grep spec_pg
docker start spec_pg

# Test connection
docker exec -it spec_pg psql -U spec -d spec -c '\dt kb.*'
```

## Full Documentation

See [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md) for complete guide.
