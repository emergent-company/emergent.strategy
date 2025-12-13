# Database Documentation with dbdocs

This guide explains how to maintain and generate database schema documentation using [dbdocs](https://dbdocs.io/) and DBML (Database Markup Language).

## Overview

The Spec Server project uses dbdocs to generate human-readable documentation from the PostgreSQL database schema. The documentation is maintained as a DBML file at `docs/database/schema.dbml` and can be viewed locally using the dbdocs CLI.

### Related Documentation

- **`docs/database/schema.dbml`** - Complete DBML schema definition
- **`docs/database/schema-context.md`** - AI-friendly schema summary for quick reference (see [Schema Context for AI](#schema-context-for-ai))

## Prerequisites

The dbdocs CLI tool is installed globally:

```bash
npm install -g dbdocs
```

## Available Commands

### Generate Documentation

Extract the current database schema to DBML format:

```bash
npm run db:docs:generate
```

This command:

- Connects to the PostgreSQL database using credentials from `.env`
- Extracts all tables, relationships, indexes, and constraints
- Generates DBML output at `docs/database/schema.dbml`
- **Note:** This will overwrite any manual annotations in the file

### Validate Documentation

Validate the DBML syntax and structure:

```bash
npm run db:docs:validate
```

This ensures the DBML file is correctly formatted and can be processed by dbdocs tools.

### Generate and Validate (Combined)

Run both generation and validation in sequence:

```bash
npm run db:docs:local
```

This is useful for quick verification that the database schema can be successfully extracted and documented.

## Workflow

### After Schema Changes

When database migrations add or modify tables, columns, or relationships:

1. **Apply the migration:**

   ```bash
   npm run db:migrate
   ```

2. **Regenerate the documentation:**

   ```bash
   npm run db:docs:generate
   ```

3. **Re-add annotations** (if needed):
   The generated DBML is minimal and doesn't include:

   - Project-level descriptions
   - Table notes explaining purpose
   - Column comments

   You may want to manually re-add these annotations after regeneration.

4. **Validate:**
   ```bash
   npm run db:docs:validate
   ```

### Viewing Documentation Locally

dbdocs doesn't have a built-in local viewer, but you can:

1. **Read the DBML file directly** - It's human-readable
2. **Use online tools** - Paste the DBML into visualization tools
3. **Review in code editor** - Most editors provide good syntax highlighting for DBML

**Note:** This project intentionally does NOT publish documentation to dbdocs.io. All documentation is local-only.

## DBML File Structure

The `docs/database/schema.dbml` file contains:

### Project Block

Describes the overall database purpose and architecture:

```dbml
Project spec_server {
  database_type: 'PostgreSQL'
  Note: '''
    # Spec Server Database Schema
    ...
  '''
}
```

### Table Definitions

Each table includes:

- Column definitions with types and constraints
- Indexes (including vector indexes)
- Table-level notes explaining purpose

Example:

```dbml
Table "kb"."chunks" {
  "id" uuid [pk, not null, default: `gen_random_uuid()`]
  "embedding" public.vector

  Indexes {
    embedding [type: ivfflat, name: "idx_chunks_embedding"]
  }

  Note: '''
    Text chunks with vector embeddings for semantic search.
  '''
}
```

### Relationships

Foreign key relationships are expressed using `Ref`:

```dbml
Ref "chunks_document_id_fkey":"kb"."documents"."id" < "kb"."chunks"."document_id" [delete: cascade]
```

## Known Limitations

### pgvector Dimension Information

The dbdocs extraction doesn't capture the dimension parameter for pgvector columns:

- **Actual column:** `embedding vector(768)`
- **Extracted DBML:** `"embedding" public.vector`

The dimension (768) is documented in table notes as a workaround.

### Schema Selection

The `db2dbml` command extracts all schemas by default. While this currently includes only `kb` and `public`, future schemas will be automatically included.

## Environment Configuration

The npm scripts read database credentials from `.env`:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5437
POSTGRES_USER=spec
POSTGRES_PASSWORD=spec
POSTGRES_DB=spec
```

These are used to construct the connection string: `postgresql://spec:spec@localhost:5437/spec`

## Best Practices

1. **Regenerate after migrations** - Keep documentation in sync with schema changes
2. **Commit the DBML file** - Track schema evolution in version control
3. **Add meaningful notes** - The auto-generated DBML is minimal; enhance it with context
4. **Validate before committing** - Ensure DBML syntax is correct
5. **Document special cases** - Note pgvector columns, custom types, and extensions

## Troubleshooting

### Connection Errors

If `db:docs:generate` fails to connect:

1. Check database is running: `npm run workspace:deps:start`
2. Verify `.env` credentials match your PostgreSQL setup
3. Test connection manually: `psql -h localhost -p 5437 -U spec -d spec`

### Validation Errors

If `db:docs:validate` fails:

1. Check DBML syntax in `docs/database/schema.dbml`
2. Look for unmatched quotes or brackets
3. Verify table and column names are properly quoted

### Empty Output

If the generated DBML is empty:

1. Ensure migrations have been run: `npm run db:migrate`
2. Check that tables exist in the database
3. Verify the connection string is correct

## Resources

- [DBML Documentation](https://dbml.dbdiagram.io/docs/)
- [dbdocs CLI Reference](https://dbdocs.io/docs)
- [Project Migrations](../technical/DATABASE_MIGRATIONS.md)

## Schema Context for AI

The `docs/database/schema-context.md` file provides a concise schema summary optimized for AI coding assistants. This helps avoid trial-and-error database queries by providing:

- Quick reference table of common tables with schema-qualified names
- Database schema overview (kb, core, public)
- Common query patterns
- Column naming conventions

### When to Update Schema Context

Update `schema-context.md` when:

1. Adding new tables
2. Renaming tables or schemas
3. Adding commonly-queried columns
4. Changing table purposes

### Update Workflow

After creating or applying a migration:

```bash
# 1. Apply migration
npm run db:migrate

# 2. Regenerate DBML
npm run db:docs:generate

# 3. Update schema context (manual)
#    Edit docs/database/schema-context.md to reflect changes
#    Update the "Last Updated" timestamp

# 4. Validate DBML
npm run db:docs:validate
```

The schema context is intentionally concise - it's not a complete schema reference (that's `schema.dbml`), but a quick-lookup tool for AI assistants performing database queries.
