# Design: dbdocs Integration

## Context

The project uses:

- PostgreSQL 16 with pgvector extension
- TypeORM for ORM and migrations
- Schema in `kb` namespace with complex graph model (objects, relationships, template packs)
- Existing schema dumps in root directory (e.g., `backup-schema-20251107-155833.sql`)

dbdocs ecosystem provides:

1. **dbdocs CLI** - Generate and publish database documentation
2. **DBML (Database Markup Language)** - DSL for defining database schemas
3. **db2dbml** - Extract DBML from live databases (Postgres, MySQL, MSSQL, Snowflake, BigQuery)
4. **sql2dbml** - Convert SQL DDL dumps to DBML
5. **Web hosting** at dbdocs.io (optional, requires authentication)

## Goals / Non-Goals

### Goals

- Enable local generation of database documentation as DBML file
- Provide clear workflow for regenerating documentation when schema changes
- Local-only documentation (version-controlled, no external dependencies)
- Integrate with existing development workflow (npm scripts)
- Document the knowledge graph model (graph_objects, graph_relationships, template_packs)

### Non-Goals

- Replace TypeORM migrations (DBML is documentation, not source of truth)
- Automatic schema sync (migrations remain authoritative)
- Web publishing to dbdocs.io (keep documentation local and private)
- CI integration for automated updates (manual workflow sufficient)
- Visual query builder or data manipulation tools

## Decisions

### Decision 1: Use db2dbml for Local Generation

**Choice:** Use `dbdocs db2dbml postgres <connection-string>` to generate DBML from local development database.

**Rationale:**

- Direct schema extraction is more reliable than parsing SQL dumps
- Works with existing Docker Compose PostgreSQL setup
- Supports all PostgreSQL features (extensions, functions, views)
- Can run locally without external dependencies

**Alternative considered:** Using `sql2dbml` on schema dumps

- **Pros:** Works offline, doesn't need running database
- **Cons:** May not capture all schema details, requires maintained SQL dumps
- **Decision:** Keep sql2dbml as fallback option, document both approaches

### Decision 2: Store Single DBML File in `docs/database/`

**Choice:** Create single file `docs/database/schema.dbml` for entire database schema.

**Rationale:**

- Keeps documentation co-located with other docs
- DBML files are human-readable and can be reviewed in PRs
- Avoids root directory clutter
- Single file is simpler to generate and maintain
- Current schema size doesn't warrant splitting (can refactor later if needed)

**Alternative considered:** Multiple files per schema/module

- **Cons:** More complex generation, potential for inconsistency
- **Decision:** Keep single file unless it exceeds 2000 lines

### Decision 3: Local-Only Documentation (No Web Publishing)

**Choice:** Use DBML files as local, version-controlled documentation without publishing to dbdocs.io.

**Rationale:**

- Avoids security concerns about exposing database schema publicly
- No authentication/token management complexity
- DBML is readable directly in repository
- Simplifies workflow (no login, no publish step)
- Documentation changes tracked in git like all other docs

**Alternative considered:** Optional web publishing

- **Pros:** Interactive web UI, automatic ER diagrams, shareable links
- **Cons:** Security risk, requires authentication, additional complexity
- **Decision:** Local-only keeps documentation simple and secure

### Decision 4: Manual Workflow (No CI Integration)

**Choice:** Manual DBML regeneration workflow only, no CI automation.

**Rationale:**

- Simpler implementation without CI complexity
- Documentation updates tied to migration PRs naturally
- Manual review ensures quality and relevance
- No external dependencies or token management
- Sufficient for current team size and workflow

**Alternative considered:** Automated CI updates

- **Pros:** Always up-to-date documentation
- **Cons:** Unnecessary without web publishing, adds CI complexity, noise in commits
- **Decision:** Manual workflow is appropriate for local documentation

### Decision 5: npm Scripts for Documentation Workflow

**Choice:** Add these npm scripts:

```json
{
  "db:docs:generate": "dbdocs db2dbml postgres \"$DATABASE_URL\" -o docs/database/schema.dbml",
  "db:docs:validate": "dbdocs validate docs/database/schema.dbml",
  "db:docs:local": "npm run db:docs:generate && npm run db:docs:validate"
}
```

**Rationale:**

- Consistent with existing npm script patterns
- Easy to discover with `npm run` listing
- Composable for different workflows
- Uses environment variable for database connection (secure)
- No web publishing scripts needed

## Technical Approach

### Installation

```bash
npm install -g dbdocs
# or add to devDependencies for project-local install
```

### Local Workflow

1. Ensure PostgreSQL is running (`docker-compose up -d` or workspace-cli)
2. Run `npm run db:docs:generate` to extract DBML from database
3. Review generated `docs/database/schema.dbml`
4. Optionally run `npm run db:docs:validate` to check DBML syntax
5. Commit DBML file to repository

### DBML Enhancement with Annotations

The generated DBML can be manually enhanced with:

```dbml
Project spec_server {
  database_type: 'PostgreSQL'
  Note: '''
    # Spec Server Knowledge Graph

    This database powers a minimal ingestion and knowledge management system with:
    - Semantic search using pgvector
    - Graph-based knowledge management
    - Document ingestion and chunking
  '''
}

Table kb.graph_objects {
  // ... fields ...
  Note: 'Typed entities in the knowledge graph (Requirements, Decisions, Issues, etc.)'
}
```

## Risks / Trade-offs

### Risk: DBML Drift from Actual Schema

**Impact:** Documentation becomes outdated if not regenerated regularly.

**Mitigation:**

- Document clear workflow: "Regenerate DBML after migrations"
- Add reminder in TypeORM migration guide
- Optional: Add git pre-commit hook to check if migrations exist without DBML update
- Optional: CI check to validate DBML is up-to-date

### Risk: Security of Published Documentation

**Impact:** Database schema might reveal sensitive implementation details if published publicly.

**Mitigation:**

- Default to local-only DBML generation
- Add password protection for web-published docs (dbdocs password command)
- Document security considerations in guide
- Consider using dbdocs workspaces for private team sharing

### Risk: Limited pgvector/Extension Support

**Impact:** Custom PostgreSQL extensions (pgvector) might not be fully represented in DBML.

**Mitigation:**

- Verify pgvector columns are captured (they should appear as `vector(768)` or similar)
- Document known limitations in guide
- Manually annotate DBML with extension-specific notes if needed

### Trade-off: Global vs Project-Local Installation

**Global install (`npm install -g`):**

- **Pros:** Simpler scripts, one-time setup
- **Cons:** Version inconsistency across developers, not tracked in package.json

**Project-local install (`npm install --save-dev`):**

- **Pros:** Consistent versions, tracked in package.json
- **Cons:** Requires `npx dbdocs` prefix in scripts

**Decision:** Recommend global install for simplicity, document both approaches

## Migration Plan

### Phase 1: Local Setup (Initial Investigation)

1. Install dbdocs CLI globally
2. Test `db2dbml` extraction from local development database
3. Review generated DBML for completeness and quality
4. Document findings and limitations

### Phase 2: Repository Integration

1. Add `docs/database/` directory
2. Create initial `schema.dbml` from extraction
3. Add npm scripts for documentation workflow
4. Create developer guide: `docs/guides/database-documentation.md`

### Phase 3: Optional Enhancements (Based on Team Feedback)

1. Add CI integration for automated documentation updates
2. Set up web publishing with password protection
3. Add pre-commit hooks for DBML validation
4. Create workspace-cli integration for documentation commands

### Rollback

No rollback needed - this is purely additive documentation tooling. DBML files can be deleted without impact on database or application.

## Open Questions

### ✅ RESOLVED: Should DBML files be split by schema?

**Decision:** Single file at `docs/database/schema.dbml`

- Simpler to maintain and generate
- Easier to review in PRs
- Can split later if file exceeds 2000 lines (unlikely for current schema)

### ✅ RESOLVED: Should we use dbdocs.io web publishing or local-only?

**Decision:** Local-only (no web publishing)

- DBML files serve as version-controlled documentation
- Avoids authentication/token management complexity
- No security concerns about exposing schema publicly
- Can view DBML directly in repository or with local text editor
- **Remove web publishing from all docs, scripts, and requirements**

### ✅ RESOLVED: Should documentation updates be automated via CI?

**Decision:** Manual workflow only (no CI integration)

- Simpler initial implementation
- Documentation updates tied to migration PRs naturally
- CI automation unnecessary without web publishing
- **Remove CI integration from design and requirements**

### ✅ RESOLVED: Should we add visual ER diagrams to the docs?

**Decision:** Text-based DBML only for now

- Web publishing (with automatic ER diagrams) not being used
- DBML syntax is readable and self-documenting
- Can evaluate dbdiagram.io separately if visual needs arise
- **Focus on DBML generation and validation workflow**

### ✅ RESOLVED: How to handle schema migrations during development?

**Decision:** Document manual guideline in migration docs

- "Run `npm run db:docs:generate` after applying migrations locally"
- Add reminder in `docs/technical/DATABASE_MIGRATIONS.md`
- No pre-commit hooks or automation initially
- Review DBML changes in PR alongside migration code
