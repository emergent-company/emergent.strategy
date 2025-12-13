## ADDED Requirements

### Requirement: Database Schema Context for AI Assistants

The system SHALL provide a concise schema context document that AI assistants can reference before executing database queries.

#### Scenario: AI assistant queries database with schema context

- **GIVEN** an AI assistant needs to query the database
- **AND** the assistant has access to `docs/database/schema-context.md`
- **WHEN** the assistant consults the schema context before querying
- **THEN** the assistant SHALL identify the correct schema (e.g., `kb`, `core`, `public`)
- **AND** the assistant SHALL identify the correct table name
- **AND** the assistant SHALL use valid column names in the query

#### Scenario: Schema context lists all database schemas

- **GIVEN** the schema context document exists
- **WHEN** an AI assistant reads the document
- **THEN** the document SHALL list all database schemas (kb, core, public)
- **AND** each schema SHALL have a brief purpose description
- **AND** each schema SHALL list its tables with descriptions

#### Scenario: Schema context provides common query patterns

- **GIVEN** the schema context document exists
- **WHEN** an AI assistant needs to perform a common task (e.g., find extraction jobs)
- **THEN** the document SHALL provide example qualified table names
- **AND** the document SHALL describe key columns for common queries

### Requirement: AI Agent Database Query Instructions

The AI agent instructions SHALL guide assistants to consult schema context before database queries.

#### Scenario: Agent instructions reference schema context

- **GIVEN** an AI assistant is configured with `.opencode/instructions.md`
- **WHEN** the assistant prepares to query the database
- **THEN** the instructions SHALL direct the assistant to read `docs/database/schema-context.md` first
- **AND** the instructions SHALL explain when to use schema context

#### Scenario: Agent avoids trial-and-error queries

- **GIVEN** an AI assistant follows the agent instructions
- **AND** the assistant needs to query `object_extraction_jobs`
- **WHEN** the assistant consults schema context
- **THEN** the assistant SHALL directly query `kb.object_extraction_jobs`
- **AND** the assistant SHALL NOT attempt queries against non-existent tables

### Requirement: Schema Context Maintenance

The schema context document SHALL be maintained alongside database schema changes.

#### Scenario: Schema context includes update timestamp

- **GIVEN** the schema context document exists
- **WHEN** a developer reviews the document
- **THEN** the document SHALL include a "Last Updated" timestamp
- **AND** the timestamp SHALL reflect when the schema was last synchronized

#### Scenario: Migration workflow mentions schema context

- **GIVEN** a developer creates a new TypeORM migration
- **WHEN** the developer follows the database documentation guide
- **THEN** the guide SHALL remind the developer to update schema context
- **AND** the guide SHALL provide steps for updating the document

### Requirement: Database Query Subagent

The system SHALL provide a dedicated subagent for database queries with dynamic schema retrieval and log access.

#### Scenario: Subagent retrieves schema before querying

- **GIVEN** the database subagent is invoked
- **WHEN** the subagent receives a query request
- **THEN** the subagent SHALL first run `./scripts/get-schema.sh columns` to get current schema
- **AND** the subagent SHALL use the retrieved schema to identify correct table and column names
- **AND** the subagent SHALL NOT rely on stale embedded schema information

#### Scenario: Subagent has postgres, bash, and workspace access

- **GIVEN** the database subagent is invoked
- **WHEN** the subagent processes a query request
- **THEN** the subagent SHALL have access to the `postgres_query` MCP tool
- **AND** the subagent SHALL have access to `bash` for running schema retrieval
- **AND** the subagent SHALL have access to `workspace_docker_logs` for database logs
- **AND** the subagent SHALL NOT have access to write or edit tools

#### Scenario: Subagent can check database logs for errors

- **GIVEN** the database subagent is invoked
- **AND** a query fails or the user asks about database errors
- **WHEN** the subagent investigates the issue
- **THEN** the subagent SHALL use `workspace_docker_logs(container: "postgres")` to check logs
- **AND** the subagent SHALL filter logs with `grep: "ERROR"` to find relevant entries
- **AND** the subagent SHALL include log excerpts in error reports

#### Scenario: Subagent generates accurate queries

- **GIVEN** the database subagent has retrieved the current schema
- **AND** the request is to "find recent extraction jobs"
- **WHEN** the subagent generates the SQL query
- **THEN** the subagent SHALL use the correct qualified table name `kb.object_extraction_jobs`
- **AND** the subagent SHALL use valid column names from the schema
- **AND** the subagent SHALL NOT attempt trial-and-error queries

#### Scenario: Subagent uses low temperature for consistency

- **GIVEN** the database subagent configuration
- **WHEN** the subagent generates SQL queries
- **THEN** the subagent SHALL use temperature 0.1 or lower
- **AND** the queries SHALL be consistent and predictable

### Requirement: Schema Retrieval Script

The system SHALL provide a script to retrieve the current database schema dynamically.

#### Scenario: Script outputs table list

- **GIVEN** the script `scripts/get-schema.sh` exists
- **WHEN** the script is run with argument `tables`
- **THEN** the script SHALL output all table names in `schema.table` format
- **AND** the output SHALL include tables from `kb` and `core` schemas

#### Scenario: Script outputs tables with columns

- **GIVEN** the script `scripts/get-schema.sh` exists
- **WHEN** the script is run with argument `columns`
- **THEN** the script SHALL output each table with its column names
- **AND** the format SHALL be `schema.table | col1, col2, col3, ...`

#### Scenario: Script retrieves from live database

- **GIVEN** the script `scripts/get-schema.sh` exists
- **WHEN** a new migration adds a table or column
- **THEN** the script output SHALL include the new table or column
- **AND** no manual updates to documentation SHALL be required
