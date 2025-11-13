# Implementation Tasks

## 1. Pre-Migration Validation

- [ ] 1.1 Run full test suite and document current pass/fail state
- [ ] 1.2 Run performance benchmarks on critical paths (ingestion, search, chat)
- [ ] 1.3 Document all current usages of `getPool()`, `getClient()`, and `query()` methods
- [ ] 1.4 Review all files importing from 'pg' to understand migration scope
- [ ] 1.5 Create feature branch: `migrate-to-queryrunner`

## 2. DatabaseService Core Migration ✅ COMPLETE

- [x] 2.1 Import TypeORM DataSource into DatabaseService
- [x] 2.2 Inject or import DataSource instance (evaluated: used import from TypeORM config)
- [x] 2.3 Replace `this.pool = new Pool()` with DataSource initialization
- [x] 2.4 Update `query()` method to use `DataSource.query()` instead of `Pool.query()`
- [x] 2.5 Update `getClient()` to return QueryRunnerAdapter (wraps QueryRunner with pg-compatible interface)
- [x] 2.6 Apply RLS tenant context in getClient() using QueryRunner.query()
- [x] 2.7 Update `getPool()` method (returns DataSource instead of Pool)
- [x] 2.8 Update `onModuleInit()` to use DataSource lifecycle
- [x] 2.9 Update `onModuleDestroy()` to use DataSource.destroy()
- [x] 2.10 Update `waitForDatabase()` to use DataSource.query()
- [x] 2.11 Update `switchToRlsApplicationRole()` to use DataSource
- [x] 2.12 Removed pg Pool imports, kept PoolClient type for compatibility
- [x] 2.13 Build successful, unit tests running (migrated successfully)

## 3. Service Transaction Updates

- [ ] 3.1 Update OrgsService createQueryRunner() usage to match new patterns
- [ ] 3.2 Update InvitesService createQueryRunner() usage
- [ ] 3.3 Update ProjectsService createQueryRunner() usage
- [ ] 3.4 Search for all getClient() call sites and update to QueryRunner API
- [ ] 3.5 Verify transaction patterns (startTransaction, commit, rollback, release)
- [ ] 3.6 Run service-specific unit tests and fix failures
- [ ] 3.7 Verify RLS tenant context works in service transactions

## 4. Test Infrastructure Migration

- [ ] 4.1 Update apps/server/tests/setup.ts to use TypeORM DataSource
- [ ] 4.2 Update apps/server/tests/e2e/e2e-context.ts to create DataSource instead of Pool
- [ ] 4.3 Update E2E test fixtures to use QueryRunner
- [ ] 4.4 Update mock DatabaseService in unit test helpers
- [ ] 4.5 Add integration tests for QueryRunner RLS behavior
- [ ] 4.6 Run full E2E test suite and fix failures
- [ ] 4.7 Verify multi-tenant test isolation still works

## 5. Utility and Script Updates

- [ ] 5.1 Update apps/server/src/common/database/sql-patterns/advisory-lock.util.ts
- [ ] 5.2 Update advisory lock tests to use QueryRunner
- [ ] 5.3 Evaluate scripts/seed-extraction-demo.ts (decide: migrate or keep pg)
- [ ] 5.4 Evaluate scripts/seed-meeting-pack.ts (decide: migrate or keep pg)
- [ ] 5.5 Evaluate scripts/reset-db.ts (decide: migrate or keep pg)
- [ ] 5.6 Evaluate scripts/full-reset-db.ts (decide: migrate or keep pg)
- [ ] 5.7 Evaluate scripts/migrate-embedding-dimension.ts (decide: migrate or keep pg)
- [ ] 5.8 Update scripts that benefit from TypeORM (seed scripts using entities)
- [ ] 5.9 Document scripts that remain with direct pg and rationale
- [ ] 5.10 Test updated scripts in local environment

## 6. Type and Import Cleanup

- [ ] 6.1 Search codebase for remaining `import { Pool, PoolClient } from 'pg'` in server code
- [ ] 6.2 Remove unused pg imports from services
- [ ] 6.3 Update type definitions (replace PoolClient with QueryRunner where needed)
- [ ] 6.4 Verify no lingering references to Pool/PoolClient in application code
- [ ] 6.5 Update ESLint rules if needed to prevent future pg imports in app code

## 7. Validation and Testing

- [ ] 7.1 Run full unit test suite
- [ ] 7.2 Run full E2E test suite
- [ ] 7.3 Manual testing: user authentication with RLS
- [ ] 7.4 Manual testing: document ingestion flow
- [ ] 7.5 Manual testing: semantic search with tenant isolation
- [ ] 7.6 Manual testing: chat with MCP integration
- [ ] 7.7 Run performance benchmarks (compare to pre-migration baseline)
- [ ] 7.8 Load test critical endpoints to verify connection pooling works
- [ ] 7.9 Verify RLS policies enforce correctly with QueryRunner
- [ ] 7.10 Check for connection leaks (connections not released)

## 8. Documentation and Cleanup

- [ ] 8.1 Update inline code comments in DatabaseService
- [ ] 8.2 Update JSDoc for public methods (query, getClient, etc.)
- [ ] 8.3 Update developer documentation if DatabaseService API changed
- [ ] 8.4 Document QueryRunner usage patterns for new developers
- [ ] 8.5 Update CONTRIBUTING.md or architecture docs if patterns changed
- [ ] 8.6 Add migration notes to CHANGELOG.md
- [ ] 8.7 Review and remove any temporary migration comments/TODOs

## 9. Final Review and Merge

- [ ] 9.1 Self-review all changes
- [ ] 9.2 Ensure all tasks in this checklist are complete
- [ ] 9.3 Commit changes with clear commit message
- [ ] 9.4 Push feature branch
- [ ] 9.5 Create pull request with proposal linked
- [ ] 9.6 Address code review feedback
- [ ] 9.7 Obtain approval from maintainers
- [ ] 9.8 Merge to main branch
- [ ] 9.9 Monitor production deployment for issues
- [ ] 9.10 Archive this change proposal using `openspec archive migrate-to-queryrunner`
