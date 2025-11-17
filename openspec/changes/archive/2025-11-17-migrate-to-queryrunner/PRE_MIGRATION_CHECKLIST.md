# Pre-Migration Checklist

**Migration:** Migrate to TypeORM QueryRunner  
**Date:** 2025-11-13  
**Estimated Duration:** 8-15 hours

## ✅ Prerequisites Verified

### Documentation Verification

- [x] TypeORM 0.3.27 documentation verified via Context7
- [x] QueryRunner lifecycle pattern confirmed (connect → use → release)
- [x] Transaction management API verified (startTransaction/commit/rollback)
- [x] RLS context pattern validated (set_config via queryRunner.query())
- [x] DataSource connection pooling behavior confirmed

### Current State Analysis

- [x] DatabaseService currently uses `pg.Pool` (line 50)
- [x] TypeORM DataSource exists at `apps/server/src/typeorm.config.ts`
- [x] 3 services already using `dataSource.createQueryRunner()`:
  - InvitesService (line 225)
  - ProjectsService (line 112)
  - OrgsService (line 132)
- [x] RLS tenant context applied via `set_config()` on PoolClient (lines 354-364, 415-425)
- [x] 23+ direct Pool method calls identified in DatabaseService

### Environment Preparation

#### 1. Baseline Performance Metrics

Run these benchmarks before starting migration:

```bash
# Document ingestion performance
npm run test:e2e -- --grep "document ingestion"

# Semantic search performance
npm run test:e2e -- --grep "semantic search"

# Chat streaming performance
npm run test:e2e -- --grep "chat streaming"
```

**Action:** Record baseline metrics in `MIGRATION_METRICS.md`

#### 2. Database Connection Pool Settings

Current pg.Pool configuration (implicit defaults):

- No explicit `max` setting (defaults to 10)
- No explicit `idleTimeoutMillis` setting (defaults to 10000)
- No explicit `connectionTimeoutMillis` setting (defaults to 0 = no timeout)

TypeORM DataSource configuration (`typeorm.config.ts`):

- No explicit pool size configuration
- Uses underlying pg driver defaults

**Action:** Document current pool behavior:

```sql
-- Run this query to check current connection counts
SELECT
  count(*) as total_connections,
  sum(case when state = 'active' then 1 else 0 end) as active,
  sum(case when state = 'idle' then 1 else 0 end) as idle
FROM pg_stat_activity
WHERE datname = current_database();
```

**Expected Result:** Should see ~10 max connections (pg.Pool default)

#### 3. Test Suite Status

Run full test suite to establish baseline:

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Lint
npm run lint
```

**Action:** Ensure all tests pass before migration. Document any flaky tests.

#### 4. Git Preparation

```bash
# Create migration branch
git checkout -b feat/migrate-to-queryrunner

# Ensure clean working directory
git status

# Create backup of current database service
cp apps/server/src/common/database/database.service.ts apps/server/src/common/database/database.service.ts.backup
```

## 📋 Phase 1 Implementation Plan (2-4 hours)

### Critical Files to Modify

1. `apps/server/src/common/database/database.service.ts` - Core migration
2. `apps/server/src/common/database/database.module.ts` - DataSource injection

### Step-by-Step Implementation

#### Step 1.1: Import TypeORM DataSource into DatabaseService

**File:** `database.service.ts`

- [ ] Add TypeORM imports:
  ```typescript
  import { DataSource, QueryRunner } from 'typeorm';
  ```
- [ ] Import the existing TypeORM config:
  ```typescript
  import typeormConfig from '../../typeorm.config';
  ```

#### Step 1.2: Replace Pool with DataSource

**File:** `database.service.ts`

- [ ] Replace `private pool!: Pool;` with `private dataSource!: DataSource;`
- [ ] Remove `import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';`
- [ ] Keep `QueryResult, QueryResultRow` import (still needed for return types)

#### Step 1.3: Update onModuleInit()

**File:** `database.service.ts` (lines 110-181)

- [ ] Replace Pool initialization with DataSource:

  ```typescript
  // Before:
  this.pool = new Pool({...});

  // After:
  this.dataSource = new DataSource({
    type: 'postgres',
    host: this.config.dbHost,
    port: this.config.dbPort,
    username: this.config.dbUser,
    password: this.config.dbPassword,
    database: this.config.dbName,
    entities: typeormConfig.options.entities,
    migrations: typeormConfig.options.migrations,
    synchronize: false,
    logging: typeormConfig.options.logging,
  });

  if (!this.dataSource.isInitialized) {
    await this.dataSource.initialize();
  }
  ```

- [ ] Update `waitForDatabase()` method to use DataSource:

  ```typescript
  // Line 210: Replace
  await this.pool.query('SELECT 1');

  // With:
  await this.dataSource.query('SELECT 1');
  ```

- [ ] Update `runMigrations()` to reuse initialized DataSource instead of creating new one

#### Step 1.4: Update query() method

**File:** `database.service.ts` (lines 313-380)

Replace PoolClient logic with QueryRunner:

```typescript
async query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  if (!this.dataSource) {
    await this.lazyInit();
  }
  if (!this.online) {
    return {
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      fields: [],
      oid: 0,
    } as unknown as QueryResult<T>;
  }

  // If tenant context has been set, use a temporary QueryRunner
  const store = this.tenantContextStorage.getStore();
  const effectiveOrgRaw = store?.orgId ?? this.currentOrgId ?? null;
  const effectiveProjectRaw = store?.projectId ?? this.currentProjectId ?? null;
  const hasContext =
    store !== undefined ||
    this.currentOrgId !== undefined ||
    this.currentProjectId !== undefined;

  if (hasContext) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      const effectiveOrg = effectiveOrgRaw ?? '';
      const effectiveProject = effectiveProjectRaw ?? '';
      const wildcard = effectiveOrg === '' && effectiveProject === '';

      if (process.env.DEBUG_TENANT === 'true') {
        console.log('[db.query][set_config]', {
          org: effectiveOrg,
          project: effectiveProject,
          rowSecurity: wildcard ? 'on (wildcard)' : 'on (scoped)',
        });
      }

      await queryRunner.query(
        'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
        [
          'app.current_organization_id',
          effectiveOrg,
          'app.current_project_id',
          effectiveProject,
          'row_security',
          'on',
        ]
      );

      if (process.env.DEBUG_TENANT === 'true') {
        console.log('[db.query][execute]', { text });
      }

      return await queryRunner.query<T>(text, params);
    } finally {
      await queryRunner.release();
    }
  }

  return this.dataSource.query<T>(text, params);
}
```

#### Step 1.5: Update getClient() method

**File:** `database.service.ts` (lines 382-431)

Replace PoolClient return with QueryRunner:

```typescript
async getClient(): Promise<QueryRunner> {
  if (!this.dataSource) {
    await this.lazyInit();
  }

  if (!this.dataSource) {
    throw new Error(
      'Database disabled (SKIP_DB set) – transactional operation not permitted. Unset SKIP_DB or run with DB_AUTOINIT=true for tests.'
    );
  }

  if (!this.online) {
    throw new Error(
      'Database offline – cannot acquire client. Check connectivity or initialization logs.'
    );
  }

  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    const store = this.tenantContextStorage.getStore();
    const orgRaw = store?.orgId ?? this.currentOrgId ?? null;
    const projectRaw = store?.projectId ?? this.currentProjectId ?? null;
    const orgId = orgRaw ?? '';
    const projectId = projectRaw ?? '';
    const wildcard = orgId === '' && projectId === '';

    if (process.env.DEBUG_TENANT === 'true') {
      console.log('[db.getClient][set_config]', {
        org: orgId,
        project: projectId,
        rowSecurity: wildcard ? 'on (wildcard)' : 'on (scoped)',
      });
    }

    await queryRunner.query(
      'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
      [
        'app.current_organization_id',
        orgId,
        'app.current_project_id',
        projectId,
        'row_security',
        'on',
      ]
    );

    return queryRunner;
  } catch (err) {
    await queryRunner.release();
    throw err;
  }
}
```

#### Step 1.6: Update getPool() method

**File:** `database.service.ts` (lines 86-92)

Decision: Return DataSource for now, deprecate later

```typescript
/**
 * @deprecated Use getClient() for transactional operations or query() for simple queries
 * Returns the DataSource manager's connection for legacy compatibility
 */
getPool(): any {
  return this.dataSource?.manager?.connection || null;
}
```

#### Step 1.7: Update remaining Pool references

**File:** `database.service.ts`

- [ ] Line 184-190: `onModuleDestroy()` - Replace `this.pool.end()` with `this.dataSource.destroy()`
- [ ] Line 452-458: `lazyInit()` - Replace Pool initialization with DataSource
- [ ] Line 459: Replace `this.pool.query('SELECT 1')` with `this.dataSource.query('SELECT 1')`
- [ ] Line 479-568: `switchToRlsApplicationRole()` - Replace all `this.pool.query()` with `this.dataSource.query()`
- [ ] Line 541-548: Replace Pool recreation with DataSource recreation
- [ ] Line 583-615: `getRlsPolicyStatus()` - Replace `this.pool.query()` with `this.dataSource.query()`
- [ ] Line 652-672: `applyTenantContext()` - Replace `this.pool.query()` with `this.dataSource.query()`
- [ ] Line 780-788: `ensureCanonicalGraphPolicies()` - Replace `this.pool.query()` with `this.dataSource.query()`

#### Step 1.8: Update method signatures that reference PoolClient

- [ ] Export `QueryRunner` type from database.service.ts for consumers
- [ ] Add type alias for backward compatibility if needed:
  ```typescript
  export type { QueryRunner };
  ```

### Step 1.9: Run Unit Tests

```bash
# Test DatabaseService specifically
npm run test -- database.service.spec.ts

# If no specific tests exist, run full unit test suite
npm run test
```

**Expected:** All tests should pass or require minor mock updates

### Step 1.10: Verify Database Connectivity

```bash
# Start development server
npm run dev

# Check logs for successful initialization
# Look for: "✓ Database connection successful"
# Look for: "✓ Database schema is up to date"
```

## 🎯 Phase 1 Success Criteria

- [ ] DatabaseService compiles without TypeScript errors
- [ ] Application starts successfully
- [ ] Database connection established (check logs)
- [ ] Migrations run successfully
- [ ] RLS role switch completes
- [ ] Health check endpoint returns 200
- [ ] Unit tests pass

## 🚨 Rollback Trigger Conditions

If any of these occur, execute rollback:

1. Application fails to start
2. Database connection fails after retry logic
3. Migration execution fails
4. RLS policies fail to apply
5. Critical tests fail with database errors

**Rollback Command:**

```bash
git checkout apps/server/src/common/database/database.service.ts
npm run dev
```

## 📊 Post-Phase-1 Validation

### 1. Connection Pool Verification

```sql
-- Should show similar connection counts as baseline
SELECT
  count(*) as total_connections,
  sum(case when state = 'active' then 1 else 0 end) as active,
  sum(case when state = 'idle' then 1 else 0 end) as idle
FROM pg_stat_activity
WHERE datname = current_database();
```

### 2. RLS Context Verification

```bash
# Run E2E test that exercises tenant isolation
npm run test:e2e -- --grep "tenant isolation"
```

### 3. Query Performance Spot Check

```bash
# Run a simple performance test
npm run test:e2e -- --grep "query performance"
```

## 📝 Notes for Phase 2

After Phase 1 completion:

- Update service consumers (OrgsService, InvitesService, ProjectsService)
- These services already use `createQueryRunner()`, but may need updates if they interact with DatabaseService's `getClient()`
- Check advisory lock utility usage
- Update test utilities

## 🔗 References

- Design Doc: `openspec/changes/migrate-to-queryrunner/design.md`
- Spec: `openspec/changes/migrate-to-queryrunner/specs/database-access/spec.md`
- TypeORM Config: `apps/server/src/typeorm.config.ts`
- Context7 Verification: (completed 2025-11-13)
