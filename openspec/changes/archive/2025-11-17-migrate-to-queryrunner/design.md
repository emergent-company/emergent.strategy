# Design: Migrate to TypeORM QueryRunner

## Context

The Spec Server currently uses TypeORM 0.3.27 as its ORM layer with NestJS 10.3.0. The codebase has evolved to use TypeORM Repositories and DataSource for most entity operations, but the core DatabaseService still maintains a direct `pg.Pool` instance for raw SQL queries and RLS tenant context management.

**Current Architecture:**

- DatabaseService manages a `pg.Pool` with 23+ direct pool method calls
- Services use TypeORM DataSource for transactions via `createQueryRunner()`
- RLS tenant context applied via `set_config()` calls on Pool connections
- Mix of `db.query()` (pg Pool) and `dataSource.query()` (TypeORM) in services

**Stakeholders:**

- Backend developers implementing new features
- Test infrastructure (E2E and unit tests)
- Database migration scripts and seed utilities
- Production deployment (RLS security enforcement)

## Goals / Non-Goals

**Goals:**

- Standardize on TypeORM QueryRunner for all database operations
- Maintain RLS tenant context functionality with identical behavior
- Preserve transaction semantics (BEGIN/COMMIT/ROLLBACK)
- Keep existing API surface of DatabaseService as compatible as possible
- Ensure zero regression in security (RLS policies must work identically)
- Maintain or improve test reliability

**Non-Goals:**

- Rewrite services to use Repository pattern instead of raw SQL
- Change database schema or migration strategy
- Modify RLS policy implementation
- Optimize query performance (maintain current performance characteristics)
- Convert all scripts to TypeORM (allow pragmatic exceptions for bootstrap scripts)

## Decisions

### Decision 1: Replace Pool with TypeORM DataSource

**What:** Replace the `pg.Pool` instance in DatabaseService with TypeORM DataSource.

**Why:** TypeORM DataSource already exists in the application (used by migrations and some services). It provides connection pooling equivalent to pg.Pool and supports QueryRunner creation for transactions.

**How:**

- Inject or import TypeORM DataSource into DatabaseService
- Replace `this.pool.query()` with `this.dataSource.query()`
- Replace `this.pool.connect()` with `this.dataSource.createQueryRunner()`
- Maintain connection initialization and lifecycle hooks (onModuleInit, onModuleDestroy)

**Alternatives considered:**

- Keep pg.Pool and wrap it: Would perpetuate dual pattern
- Create new abstraction layer: Over-engineering for standardization goal

### Decision 2: Use QueryRunner for Transactional Operations

**What:** Replace `PoolClient` returns with TypeORM QueryRunner.

**Why:** QueryRunner is TypeORM's equivalent to PoolClient for transactional operations. It provides:

- `.query(sql, params)` method (same signature as PoolClient)
- Transaction management: `.startTransaction()`, `.commitTransaction()`, `.rollbackTransaction()`
- Connection lifecycle: `.connect()`, `.release()`

**How:**

- Change `getClient()` to return `QueryRunner` instead of `PoolClient`
- Update call sites to use QueryRunner API (mostly compatible)
- Update RLS context application to work with QueryRunner.query()

**Alternatives considered:**

- Keep PoolClient interface: Would require maintaining pg dependency
- Use EntityManager: Less explicit about transaction boundaries

### Decision 3: Maintain RLS Tenant Context Pattern

**What:** Apply RLS tenant context via `set_config()` calls on QueryRunner connections.

**Why:** RLS policies depend on session-level GUCs (`app.current_organization_id`, `app.current_project_id`). The pattern of applying these before each query/transaction must be preserved.

**How:**

- Before returning QueryRunner from `getClient()`, call `queryRunner.query()` with `set_config()` SQL
- For non-transactional `query()` calls, use temporary QueryRunner with RLS context
- Preserve async-local-storage tenant context for concurrent test isolation

**Alternatives considered:**

- Database-level context: Not practical with connection pooling
- Per-query context: Overhead and race conditions

### Decision 4: Incremental Migration Strategy

**What:** Migrate in phases: DatabaseService first, then consuming services, then tests, then scripts.

**Why:** Reduces blast radius, allows validation at each step, maintains working system throughout.

**How:**

1. Update DatabaseService internal implementation (Pool → DataSource)
2. Update getClient() signature and implementation (PoolClient → QueryRunner)
3. Update consuming services (OrgsService, InvitesService, ProjectsService)
4. Update test utilities (e2e-context.ts, setup.ts)
5. Update advisory lock utility
6. Evaluate and update scripts case-by-case

**Alternatives considered:**

- Big bang migration: Higher risk, harder to debug
- Maintain both patterns: Defeats purpose of standardization

## Risks / Trade-offs

### Risk: QueryRunner API Differences

- **Impact:** Code using PoolClient-specific methods may break
- **Mitigation:** QueryRunner API is highly compatible with PoolClient for query operations. Review all getClient() call sites. Add adapter methods if needed.
- **Likelihood:** Low - most usage is `.query(sql, params)` which is identical

### Risk: RLS Context Behavior Change

- **Impact:** Security vulnerability if tenant isolation breaks
- **Mitigation:**
  - Write comprehensive tests for RLS with QueryRunner
  - Validate that set_config() behaves identically on QueryRunner connections
  - Run full E2E test suite with focus on multi-tenant scenarios
- **Likelihood:** Low - set_config() is connection-level, not Pool vs QueryRunner specific

### Risk: Transaction Semantics Change

- **Impact:** Data corruption if transaction boundaries not preserved
- **Mitigation:**
  - Review all transaction usage patterns
  - Ensure QueryRunner.connect() + release() semantics match PoolClient
  - Test transaction rollback scenarios explicitly
- **Likelihood:** Very Low - QueryRunner is designed for this use case

### Risk: Performance Impact

- **Impact:** Query latency increase or connection pool exhaustion
- **Mitigation:**
  - TypeORM DataSource uses connection pooling (same as pg.Pool)
  - Monitor query performance during migration
  - Benchmark critical paths (ingestion, search, chat) before/after
- **Likelihood:** Very Low - underlying connection pool mechanism unchanged

### Trade-off: Script Migration Complexity

- **Trade-off:** Some scripts use direct pg.Client/Pool for bootstrap operations
- **Decision:** Pragmatic approach - migrate scripts that benefit from TypeORM (seeds using entities), keep direct pg for simple bootstrap scripts
- **Rationale:** Not all scripts need ORM overhead; focus on application code standardization

## Migration Plan

### Phase 1: DatabaseService Core (2-4 hours)

1. Add TypeORM DataSource injection to DatabaseService
2. Replace pool initialization with DataSource usage
3. Update internal query() method to use DataSource.query()
4. Update getClient() to return QueryRunner with RLS context
5. Remove pg.Pool instance and related imports
6. Update getPool() method (consider deprecation or return DataSource)
7. Run unit tests for DatabaseService

### Phase 2: Service Updates (2-3 hours)

1. Update OrgsService transaction usage
2. Update InvitesService transaction usage
3. Update ProjectsService transaction usage
4. Update any other services using getClient()
5. Run service-specific unit tests

### Phase 3: Test Infrastructure (1-2 hours)

1. Update apps/server/tests/e2e/e2e-context.ts
2. Update apps/server/tests/setup.ts
3. Update mock DatabaseService in unit tests
4. Run full E2E test suite

### Phase 4: Utilities and Scripts (2-4 hours)

1. Update advisory-lock.util.ts
2. Evaluate seed scripts (seed-extraction-demo, seed-meeting-pack, etc.)
3. Update scripts that benefit from TypeORM
4. Document which scripts remain with direct pg (if any)
5. Run integration tests for updated scripts

### Phase 5: Validation and Documentation (1-2 hours)

1. Run full test suite (unit + E2E)
2. Manual testing of critical flows (ingestion, search, chat with RLS)
3. Update inline code documentation
4. Update developer docs if DatabaseService usage patterns changed
5. Performance benchmark comparison

### Rollback Plan

- Revert DatabaseService changes (git revert)
- Restore pg.Pool implementation
- Revert service changes
- Re-run test suite to confirm stability
- Post-mortem on failure cause

**Estimated Total Effort:** 8-15 hours depending on issues encountered

## Open Questions

1. **Should getPool() be removed or return DataSource?**

   - Current usage: UserProfileService calls getPool() for raw Pool access
   - Options: (a) Return DataSource.manager.connection (b) Deprecate and update call sites (c) Keep for backward compat
   - **Resolution needed before Phase 1**

2. **How to handle scripts/lib/preflight-validators.ts?**

   - Uses direct pg.Client for connection validation
   - Keep as-is (preflight checks should be independent) or migrate?
   - **Resolution: Keep direct pg for preflight checks (independence from app layer)**

3. **Should we update TypeORM version as part of this change?**

   - Current: TypeORM 0.3.27
   - Latest: TypeORM 0.3.x series
   - Risk: Separate concern, but could address QueryRunner improvements
   - **Resolution: Out of scope - maintain current version**

4. **Test coverage for QueryRunner RLS behavior?**

   - Need explicit tests that set_config on QueryRunner works identically to PoolClient
   - Should these be unit tests (mocked) or integration tests (real DB)?
   - **Resolution: Add integration tests in Phase 3 using real PostgreSQL**

5. **Migration impact on hot-path performance?**
   - Critical paths: document ingestion, semantic search, chat streaming
   - Should we establish performance baselines before migration?
   - **Resolution: Yes - run benchmark suite before Phase 1 and after Phase 5**
