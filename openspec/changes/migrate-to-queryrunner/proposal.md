# Change: Migrate from Direct PostgreSQL Driver to TypeORM QueryRunner

## Why

The codebase currently uses a mix of direct PostgreSQL driver (`pg` Pool/PoolClient) and TypeORM DataSource/Repository patterns. This creates inconsistency and makes transaction management more complex. The DatabaseService directly manages a `pg.Pool` instance with 23+ direct pool operations, while other services use TypeORM's DataSource for transactions via `createQueryRunner()`. This dual approach:

- Creates confusion about which pattern to use for new code
- Makes it harder to leverage TypeORM's transaction management features
- Requires maintaining two different connection patterns (pg Pool vs TypeORM DataSource)
- Complicates tenant context (RLS) management across different query patterns

Migrating to a unified TypeORM QueryRunner approach will standardize database access patterns and simplify the codebase.

## What Changes

- Replace `pg.Pool` with TypeORM DataSource in DatabaseService
- Replace `pg.PoolClient` with TypeORM QueryRunner for transactional operations
- Maintain existing RLS (Row Level Security) tenant context functionality
- Update all services that currently use DatabaseService.getClient() to use QueryRunner
- Update test utilities and E2E test setup to use TypeORM patterns
- Update scripts that directly instantiate `pg.Pool` or `pg.Client` to use TypeORM where appropriate
- Keep backward compatibility for critical bootstrap/seed scripts that need direct access

## Impact

- **Affected specs:** database-access (new capability spec)
- **Affected code:**
  - `apps/server/src/common/database/database.service.ts` (primary migration)
  - Services using `db.getClient()`: OrgsService, InvitesService, ProjectsService
  - Test utilities: `apps/server/tests/e2e/e2e-context.ts`, `apps/server/tests/setup.ts`
  - Advisory lock utility: `apps/server/src/common/database/sql-patterns/advisory-lock.util.ts`
  - Seed scripts: `scripts/seed-*.ts` (evaluation needed per script)
- **Breaking changes:** None for external API consumers; internal DatabaseService API will change but maintain equivalent functionality
- **Migration strategy:** Incremental migration with feature parity validation at each step
