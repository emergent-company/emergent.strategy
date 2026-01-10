## 1. Create Schema Context Document

- [x] 1.1 Create `docs/database/schema-context.md` with schema overview
- [x] 1.2 Add quick reference table with schema.table_name mappings
- [x] 1.3 Document the `kb` schema tables (documents, objects, relationships, jobs)
- [x] 1.4 Document the `core` schema tables (user_profiles, user_emails)
- [x] 1.5 Add common query patterns section with examples
- [x] 1.6 Add column naming conventions section
- [x] 1.7 Add "Last Updated" timestamp and link to DBML

## 2. Update Agent Instructions

- [x] 2.1 Add "Database Queries" section to `.opencode/instructions.md`
- [x] 2.2 Document when to consult schema context (before any `postgres_query`)
- [x] 2.3 Add guidance on schema-qualified table names
- [x] 2.4 Add common troubleshooting tips for database queries

## 3. Update Documentation Workflow

- [x] 3.1 Update `docs/guides/database-documentation.md` to mention schema context
- [x] 3.2 Add schema context update reminder to migration workflow section
- [x] 3.3 Link schema context from database documentation guide

## 4. Validation

- [x] 4.1 Test schema context with sample database queries
- [x] 4.2 Verify AI assistant can find correct tables using context
- [x] 4.3 Confirm schema context matches current DBML

## 5. Database Query Subagent

- [x] 5.1 Create `scripts/get-schema.sh` for dynamic schema retrieval
- [x] 5.2 Create `.opencode/agent/database.md` subagent definition
- [x] 5.3 Configure subagent with postgres_query and bash access
- [x] 5.4 Set low temperature for consistent query generation
- [x] 5.5 Test subagent with common database queries <!-- verified working in production use -->
