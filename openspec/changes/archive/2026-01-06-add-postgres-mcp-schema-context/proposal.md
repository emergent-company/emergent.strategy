# Change: Add Schema Context to Postgres MCP Server

## Why

When AI assistants use the Postgres MCP server to query the database, they lack schema context and resort to trial-and-error queries. This results in multiple failed queries (e.g., guessing table names like `extraction_jobs` when the actual table is `kb.object_extraction_jobs`), wasting tokens, time, and creating a confusing user experience. The assistant must discover schemas, table names, and column names through repeated `information_schema` queries before executing the intended query.

Example from the user's session:

```
postgres_query: SELECT ... FROM extraction_jobs → "relation does not exist"
postgres_query: SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%extract%'
postgres_query: SELECT ... FROM object_extraction_jobs → "relation does not exist"
postgres_query: SELECT schemaname, tablename FROM pg_tables WHERE tablename LIKE '%extract%'
postgres_query: SELECT ... FROM kb.object_extraction_jobs → "column 'error' does not exist"
postgres_query: SELECT * FROM kb.object_extraction_jobs → finally works
```

## What Changes

- Add a schema context file (`docs/database/schema-context.md`) that provides AI assistants with essential database schema information
- Update AI agent instructions (`.opencode/instructions.md`) to reference the schema context before database queries
- Optionally create a dedicated MCP tool or resource that exposes schema information directly

## Impact

- Affected specs: None (new capability)
- Affected code:
  - `docs/database/schema-context.md` (new)
  - `.opencode/instructions.md` (modification)
  - Possibly `scripts/mcp-postgres-wrapper.sh` or new MCP server
- User impact: AI assistants will make fewer failed queries and provide faster, more accurate database interactions
