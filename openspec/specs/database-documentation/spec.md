# database-documentation Specification

## Purpose
TBD - created by archiving change add-dbdocs-integration. Update Purpose after archive.
## Requirements
### Requirement: DBML Schema Generation

The system SHALL provide tooling to extract the PostgreSQL database schema into DBML (Database Markup Language) format for documentation purposes.

#### Scenario: Generate DBML from local database

- **GIVEN** PostgreSQL database is running locally
- **AND** development environment is configured with DATABASE_URL
- **WHEN** developer runs `npm run db:docs:generate`
- **THEN** DBML file is created at `docs/database/schema.dbml`
- **AND** all tables, columns, indexes, and relationships are captured
- **AND** PostgreSQL-specific extensions (pgvector) are represented

#### Scenario: Generate DBML from SQL dump (fallback)

- **GIVEN** direct database access is not available
- **AND** current schema SQL dump exists
- **WHEN** developer runs sql2dbml conversion command
- **THEN** DBML file is generated from SQL DDL statements
- **AND** developer can review and commit the DBML file

### Requirement: DBML Validation

The system SHALL provide validation for generated DBML files to ensure syntactic correctness.

#### Scenario: Validate DBML syntax

- **GIVEN** DBML file exists at `docs/database/schema.dbml`
- **WHEN** developer runs `npm run db:docs:validate`
- **THEN** dbdocs CLI validates DBML syntax
- **AND** validation errors are reported with line numbers if present
- **AND** validation succeeds with no errors for correctly formatted DBML

### Requirement: Database Documentation Workflow

The system SHALL document clear workflows for generating, updating, and maintaining local database documentation.

#### Scenario: Local documentation workflow

- **GIVEN** developer needs to update database documentation
- **AND** schema migrations have been applied
- **WHEN** developer follows documented workflow
- **THEN** developer can generate DBML file locally
- **AND** developer can validate DBML syntax
- **AND** developer can review changes in git diff
- **AND** developer can commit DBML file to repository

#### Scenario: Schema documentation after migration

- **GIVEN** TypeORM migration has been created and applied
- **WHEN** developer follows database documentation guide
- **THEN** developer is prompted to regenerate DBML file
- **AND** updated DBML reflects new schema changes
- **AND** DBML file is committed alongside migration code

### Requirement: DBML Schema Annotations

The system SHALL support manual enhancement of generated DBML with project-specific documentation and notes.

#### Scenario: Add project-level documentation

- **GIVEN** DBML file has been generated
- **WHEN** developer adds Project block with Note containing markdown
- **THEN** project overview is displayed in web documentation
- **AND** markdown formatting is preserved (headers, lists, links)

#### Scenario: Add table and column notes

- **GIVEN** DBML file contains table definitions
- **WHEN** developer adds Note attributes to tables and columns
- **THEN** notes are displayed in documentation
- **AND** notes explain business logic, constraints, and relationships

### Requirement: Database Documentation Guide

The system SHALL provide comprehensive developer guide for database documentation tooling and workflows.

#### Scenario: Access database documentation guide

- **GIVEN** developer needs to work with database documentation
- **WHEN** developer opens `docs/guides/database-documentation.md`
- **THEN** guide explains dbdocs and DBML concepts
- **AND** local workflow is documented with step-by-step instructions
- **AND** DBML annotation and enhancement techniques are explained
- **AND** troubleshooting section addresses common issues

#### Scenario: Find database documentation from README

- **GIVEN** new developer is onboarding
- **WHEN** developer reads `README.md` or `QUICK_START_DEV.md`
- **THEN** database documentation section is present
- **AND** link to detailed guide is provided
- **AND** quick start commands are shown (`npm run db:docs:local`)

### Requirement: Schema Synchronization Guidelines

The system SHALL provide guidelines for keeping DBML documentation synchronized with schema changes.

#### Scenario: Migration guide mentions documentation

- **GIVEN** developer is creating TypeORM migration
- **WHEN** developer reviews `docs/technical/DATABASE_MIGRATIONS.md`
- **THEN** guide mentions DBML regeneration step
- **AND** workflow for updating documentation is referenced
- **AND** developer is reminded to commit DBML changes with migration

#### Scenario: Documentation drift detection (future)

- **GIVEN** schema has changed but DBML has not been updated
- **WHEN** developer runs `npm run db:docs:validate` (enhanced version)
- **THEN** validation warns about potential drift
- **AND** developer is prompted to regenerate DBML
- **AND** clear instructions are provided to resolve drift

