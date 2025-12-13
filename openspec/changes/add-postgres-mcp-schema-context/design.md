## Context

AI coding assistants (OpenCode, Cursor, etc.) use the Postgres MCP server to query the database during debugging and analysis tasks. The standard `@modelcontextprotocol/server-postgres` only provides a `query` tool - it does not expose schema information upfront. This leads to a poor experience where assistants must discover the schema through trial-and-error queries.

**Current Pain Points:**

1. Assistants guess table names (e.g., `extraction_jobs` instead of `kb.object_extraction_jobs`)
2. Assistants forget about schemas (e.g., `public` vs `kb` vs `core`)
3. Assistants guess column names that don't exist
4. Multiple failed queries waste tokens and time
5. User sees confusing error messages

**Stakeholders:**

- AI coding assistants (primary consumer)
- Developers using AI assistants for database debugging
- Maintainers updating schema documentation

## Goals / Non-Goals

**Goals:**

- Provide AI assistants with schema context before they query the database
- Reduce failed database queries due to schema discovery issues
- Maintain schema context that stays synchronized with actual database
- Keep solution simple and maintainable

**Non-Goals:**

- Replace existing DBML documentation (complement it instead)
- Create a fully automated schema sync system (manual updates acceptable for now)
- Support multiple database environments (dev-only scope)

## Decisions

### Decision 1: Schema Context Document Approach

**What:** Create a `docs/database/schema-context.md` file that provides a concise, AI-friendly summary of the database schema including:

- List of schemas (public, kb, core)
- List of tables per schema with brief descriptions
- Key tables for common tasks (documents, objects, relationships, jobs)
- Common column patterns and naming conventions

**Why:**

- Simplest approach - no code changes required
- Can be referenced in AI agent instructions
- Easy to maintain alongside existing DBML
- Works with any AI assistant that reads project files

**Alternatives considered:**

1. **Custom MCP server** - More complex, requires maintaining additional code
2. **Modify postgres wrapper to inject schema** - Fragile, doesn't work well with MCP protocol
3. **Generate context from DBML automatically** - Adds build complexity

### Decision 2: Agent Instruction Update

**What:** Update `.opencode/instructions.md` to instruct AI assistants to consult `docs/database/schema-context.md` before making database queries.

**Why:**

- Ensures assistants are aware of the resource
- Provides guidance on when to use it
- Integrates with existing instruction framework

### Decision 3: Schema Context Format

**What:** Structure the schema context document with:

1. Quick reference table (schema.table_name -> description)
2. Schema overview with purpose of each schema
3. Common query patterns section
4. Column naming conventions

**Why:**

- Quick reference enables fast lookup
- Structured format is easy for AI to parse
- Common patterns reduce need to explore

## Risks / Trade-offs

| Risk                         | Mitigation                                                                |
| ---------------------------- | ------------------------------------------------------------------------- |
| Schema context becomes stale | Add reminder in migration workflow docs, include "last updated" timestamp |
| Document becomes too large   | Keep concise, link to full DBML for details                               |
| AI might not read context    | Explicit instruction in agent instructions                                |
| Multiple sources of truth    | Schema context is summary only, DBML remains authoritative                |

## Migration Plan

1. Create `docs/database/schema-context.md` with current schema summary
2. Update `.opencode/instructions.md` with database query guidance
3. Update `docs/guides/database-documentation.md` to mention schema context
4. Add reminder to migration workflow to update schema context

**Rollback:** Delete the new files and revert instruction changes.

### Decision 4: Database Query Subagent

**What:** Create a dedicated OpenCode subagent (`.opencode/agent/database.md`) specifically for database queries that:

- Has access to `postgres_query` MCP tool and `bash` for schema retrieval
- Retrieves current schema dynamically via `./scripts/get-schema.sh`
- Uses low temperature (0.1) for consistent, accurate query generation
- No file write/edit access

**Why:**

- **Always up-to-date**: Schema retrieved from live database, never stale
- **No maintenance**: No need to update embedded schema after migrations
- **Isolation**: Subagent focused on database operations only
- **Consistency**: Low temperature ensures predictable SQL generation

**Alternatives considered:**

1. **Embed full schema in prompt** - Gets stale after migrations, requires manual updates
2. **Read DBML file** - File can drift from actual schema
3. **Create custom MCP tool** - Over-engineering for this use case

**Configuration:**

```yaml
mode: subagent
temperature: 0.1
tools:
  postgres_query: true
  bash: true # For running get-schema.sh
  read: false
  write: false
  edit: false
```

### Decision 5: Schema Retrieval Script

**What:** Create `scripts/get-schema.sh` that queries PostgreSQL directly for current schema.

**Modes:**

- `tables` - List all table names (fast, ~40 lines)
- `columns` - Tables with column names (compact, ideal for agents)
- `full` - Tables with column names and types (detailed)

**Why:**

- Direct from database = always accurate
- Fast execution (~100ms)
- Multiple output formats for different needs

## Open Questions

1. Should we add a script to generate schema-context.md from DBML? (Future enhancement)
2. ~~Should schema context include example queries?~~ (Resolved: Yes, include in subagent prompt)
