# TypeORM Migrations

This directory contains TypeORM migrations for the database schema.

## Migration Commands

All commands should be run from the **project root** directory:

### Run Pending Migrations

```bash
npm run db:migrate
```

### Generate a New Migration

After modifying entities, generate a migration to capture the changes:

```bash
npm run db:migrate:generate src/migrations/MigrationName
```

### Revert Last Migration

```bash
npm run db:migrate:revert
```

## Migration Workflow

1. **Modify entities** in `src/entities/`
2. **Generate migration**: `npm run db:migrate:generate src/migrations/DescriptiveName`
3. **Review generated migration** in this directory
4. **Run migration**: `npm run db:migrate`
5. **Commit** both the entity changes and migration file

## Important Notes

- **Never** modify existing migrations that have been applied to production
- **Always review** generated migrations before running them
- Migrations are tracked in the `typeorm_migrations` table
- All migrations use transactions by default for safety
- The `synchronize: false` setting in typeorm.config.ts ensures we always use migrations

## Migration History

All migrations are TypeORM migrations (`.ts` files). The old SQL-based migration system has been archived in `apps/server/migrations-archive-old-sql/`.
