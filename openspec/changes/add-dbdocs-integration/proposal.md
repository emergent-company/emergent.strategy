# Change: Add dbdocs Integration for Database Documentation

## Why

The project currently lacks visual, web-based documentation for the PostgreSQL database schema. While TypeORM migrations and SQL dumps exist, they are developer-focused and not easily navigable. dbdocs provides automated, interactive database documentation that can be generated from the existing schema and kept in sync through CI/CD, improving onboarding and schema understanding for developers and stakeholders.

## What Changes

- Add dbdocs CLI tooling to generate DBML from PostgreSQL database
- Create single DBML schema file at `docs/database/schema.dbml` from existing database structure
- Add npm scripts for local DBML generation and validation
- Document workflow for generating and updating database documentation
- Local-only documentation approach (no web publishing or CI integration)

## Impact

- **Affected specs:** New capability `database-documentation`
- **Affected code:**
  - `package.json` - new dbdocs dev dependency and scripts
  - New `docs/database/` directory for DBML file and documentation
  - `docs/technical/DATABASE_MIGRATIONS.md` - add DBML regeneration reminder
- **Documentation:** New guide in `docs/guides/database-documentation.md`
- **Testing:** Manual verification of DBML generation and validation
