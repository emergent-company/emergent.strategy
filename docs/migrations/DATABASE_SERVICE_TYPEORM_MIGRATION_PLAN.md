# DatabaseService → TypeORM QueryRunner Migration Plan

## Document Status

**Date**: 2024-11-13  
**Status**: 📚 DOCUMENTATION ONLY - NOT RECOMMENDED FOR IMPLEMENTATION  
**Recommendation**: Keep dual-architecture (see [TYPEORM_DATABASE_SERVICE_ARCHITECTURE_ANALYSIS.md](./TYPEORM_DATABASE_SERVICE_ARCHITECTURE_ANALYSIS.md))  
**Estimated Effort**: 3-5 days  
**Risk Level**: MODERATE-HIGH

---

## Purpose

This document provides a **detailed implementation guide** for refactoring `DatabaseService` to use TypeORM's `DataSource.createQueryRunner()` instead of a separate `pg.Pool`.

**⚠️ Important**: This refactoring is **NOT recommended** based on our analysis (low value, high risk, 15-30% connection overhead is negligible). This document serves as:

1. **Educational reference** - Understanding TypeORM QueryRunner API
2. **Future-proofing** - If connection limits become a bottleneck
3. **Proof of feasibility** - Showing consolidation IS possible if needed

---

## Migration Overview

### Current Architecture

```typescript
// DatabaseService maintains its own pg.Pool
class DatabaseService {
  private pool: Pool; // Separate connection pool

  async query<T>(text: string, params?: any[]) {
    const client = await this.pool.connect();
    try {
      // Set RLS context on THIS specific connection
      await this.setTenantContext(orgId, projectId);
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect(); // Caller must release()
  }
}
```

### Target Architecture

```typescript
// DatabaseService uses TypeORM's connection pool via QueryRunner
class DatabaseService {
  constructor(private readonly dataSource: DataSource) {} // Inject TypeORM

  async query<T>(text: string, params?: any[]) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      // Set RLS context on THIS specific connection
      await this.setTenantContext(queryRunner);
      return await queryRunner.query(text, params);
    } finally {
      await queryRunner.release();
    }
  }

  async getClient(): Promise<QueryRunner> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    return queryRunner; // Caller must release()
  }
}
```

### Key Changes

| Aspect                | Current (pg.Pool)                            | Target (QueryRunner)                        |
| --------------------- | -------------------------------------------- | ------------------------------------------- |
| **Connection Source** | `this.pool.connect()`                        | `dataSource.createQueryRunner()`            |
| **Connection Type**   | `pg.PoolClient`                              | `TypeORM QueryRunner`                       |
| **Context Injection** | `client.query('SELECT set_config...')`       | `queryRunner.query('SELECT set_config...')` |
| **Transaction API**   | `client.query('BEGIN')`                      | `queryRunner.startTransaction()`            |
| **Release**           | `client.release()`                           | `queryRunner.release()`                     |
| **Connection Pools**  | 2 separate pools (TypeORM + DatabaseService) | 1 shared pool (TypeORM only)                |

---

## Phase 1: DatabaseService Core Refactoring

### File: `apps/server/src/common/database/database.service.ts`

**Lines to Modify**: 50, 110-181, 313-431, 478-569

### Step 1.1: Replace Constructor Dependency

**Current** (lines 48-52):

```typescript
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool; // ❌ Remove this
  private logger: LoggerService;

  constructor(
    @Inject(forwardRef(() => AppConfigService))
    private readonly configService: AppConfigService
  ) {
    this.logger = new LoggerService(DatabaseService.name);
  }
}
```

**Target**:

```typescript
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private logger: LoggerService;

  constructor(
    @Inject(forwardRef(() => AppConfigService))
    private readonly configService: AppConfigService,
    private readonly dataSource: DataSource // ✅ Add TypeORM DataSource
  ) {
    this.logger = new LoggerService(DatabaseService.name);
  }
}
```

**Testing**:

- ✅ Verify NestJS dependency injection resolves `DataSource`
- ✅ Check `dataSource` is defined in constructor

---

### Step 1.2: Update Module Initialization

**Current** (lines 110-181):

```typescript
async onModuleInit() {
  this.pool = new Pool({ // ❌ Remove pool creation
    host: this.configService.dbHost,
    port: this.configService.dbPort,
    user: this.configService.dbUser,
    password: this.configService.dbPassword,
    database: this.configService.dbName,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Test connection
  const client = await this.pool.connect();
  try {
    await client.query('SELECT 1');
    this.logger.log('Database pool connected successfully');
  } finally {
    client.release();
  }

  // Switch to RLS role
  await this.switchToRlsApplicationRole();
}
```

**Target**:

```typescript
async onModuleInit() {
  // No pool creation needed - TypeORM already initialized

  // Test connection using TypeORM's pool
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query('SELECT 1');
    this.logger.log('Database connection verified via TypeORM DataSource');
  } finally {
    await queryRunner.release();
  }

  // Switch to RLS role (uses TypeORM pool now)
  await this.switchToRlsApplicationRole();
}
```

**Testing**:

- ✅ Verify application starts without errors
- ✅ Check log message "Database connection verified via TypeORM DataSource" appears
- ✅ Confirm no "pool not defined" errors

---

### Step 1.3: Refactor `query()` Method

**Current** (lines 313-380):

```typescript
async query<T = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  const client = await this.pool.connect(); // ❌ Uses separate pool
  try {
    // Set RLS context on this specific connection
    const org = this.tenantContext.getStore()?.organizationId;
    const proj = this.tenantContext.getStore()?.projectId;

    await client.query(
      'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
      [
        'app.current_organization_id', org ?? '',
        'app.current_project_id', proj ?? '',
        'row_security', 'on',
      ],
    );

    return await client.query(text, params);
  } finally {
    client.release();
  }
}
```

**Target**:

```typescript
async query<T = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  const queryRunner = this.dataSource.createQueryRunner(); // ✅ Use TypeORM pool
  await queryRunner.connect();

  try {
    // Set RLS context on this specific connection
    const org = this.tenantContext.getStore()?.organizationId;
    const proj = this.tenantContext.getStore()?.projectId;

    await queryRunner.query(
      'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
      [
        'app.current_organization_id', org ?? '',
        'app.current_project_id', proj ?? '',
        'row_security', 'on',
      ],
    );

    // TypeORM QueryRunner.query() returns different shape than pg.PoolClient.query()
    // pg returns: { rows: T[], rowCount: number, command: string, ... }
    // TypeORM returns: T[] (just the rows array)
    const result = await queryRunner.query(text, params);

    // Wrap in pg.QueryResult shape for backward compatibility
    return {
      rows: Array.isArray(result) ? result : [],
      rowCount: Array.isArray(result) ? result.length : 0,
      command: text.split(' ')[0].toUpperCase(),
      oid: 0,
      fields: [],
    } as QueryResult<T>;
  } finally {
    await queryRunner.release();
  }
}
```

**⚠️ Breaking Change**: TypeORM's `queryRunner.query()` returns `T[]` instead of `pg.QueryResult<T>`. We wrap it in a compatible shape, but this may cause issues if consumers rely on other `QueryResult` properties.

**Testing**:

- ✅ Verify `result.rows` contains expected data
- ✅ Verify `result.rowCount` matches `result.rows.length`
- ✅ Test with parameterized queries ($1, $2 syntax)
- ✅ Verify RLS context is set correctly (queries only return tenant data)

---

### Step 1.4: Refactor `getClient()` Method

**Current** (lines 382-431):

```typescript
async getClient(): Promise<PoolClient> {
  const client = await this.pool.connect();

  // Set RLS context immediately
  const org = this.tenantContext.getStore()?.organizationId;
  const proj = this.tenantContext.getStore()?.projectId;

  await client.query(
    'SELECT set_config($1,$2,false), set_config($3,$4,false)',
    ['app.current_organization_id', org ?? '', 'app.current_project_id', proj ?? ''],
  );

  return client; // Caller must release()
}
```

**Target**:

```typescript
async getClient(): Promise<QueryRunner> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();

  // Set RLS context immediately
  const org = this.tenantContext.getStore()?.organizationId;
  const proj = this.tenantContext.getStore()?.projectId;

  await queryRunner.query(
    'SELECT set_config($1,$2,false), set_config($3,$4,false)',
    ['app.current_organization_id', org ?? '', 'app.current_project_id', proj ?? ''],
  );

  return queryRunner; // Caller must release()
}
```

**⚠️ Breaking Change**: Return type changed from `PoolClient` → `QueryRunner`. All callers must update their code.

**Callers to Update**:

1. `ChatService` (lines 397-426) - Transaction with multi-INSERT
2. `PermissionService` - RLS enforcement checks
3. `AuthService` - Token introspection before tenant context

**Testing**:

- ✅ Verify TypeScript compilation succeeds (all callers updated)
- ✅ Test transaction behavior (BEGIN/COMMIT/ROLLBACK)
- ✅ Test QueryRunner memory leaks (connection not released)

---

### Step 1.5: Refactor `switchToRlsApplicationRole()`

**Current** (lines 478-569):

```typescript
private async switchToRlsApplicationRole(): Promise<void> {
  const client = await this.pool.connect(); // ❌ Uses separate pool
  try {
    // Check current role
    const roleResult = await client.query('SELECT current_user');
    const currentRole = roleResult.rows[0].current_user;

    if (currentRole === 'app_rls') {
      this.logger.log('Already connected as app_rls role');
      return;
    }

    // Switch to app_rls role
    await client.query('SET ROLE app_rls');

    this.logger.log(`Switched from ${currentRole} to app_rls role`);
  } catch (error) {
    this.logger.error('Failed to switch to app_rls role', error);
    throw error;
  } finally {
    client.release();
  }
}
```

**Target**:

```typescript
private async switchToRlsApplicationRole(): Promise<void> {
  const queryRunner = this.dataSource.createQueryRunner(); // ✅ Use TypeORM pool
  await queryRunner.connect();

  try {
    // Check current role
    const roleResult = await queryRunner.query('SELECT current_user');
    const currentRole = roleResult[0]?.current_user; // TypeORM returns T[] not QueryResult<T>

    if (currentRole === 'app_rls') {
      this.logger.log('Already connected as app_rls role');
      return;
    }

    // Switch to app_rls role for THIS connection
    await queryRunner.query('SET ROLE app_rls');

    // ⚠️ CRITICAL: This only sets role for THIS QueryRunner connection
    // When released back to pool, next connection may be different role
    // TypeORM doesn't have "SET ROLE for all connections" mechanism

    this.logger.log(`Switched from ${currentRole} to app_rls role (single connection test)`);
  } catch (error) {
    this.logger.error('Failed to switch to app_rls role', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

**⚠️ CRITICAL ISSUE**: With `pg.Pool`, we could set `ROLE app_rls` for all new connections via pool configuration. With TypeORM's QueryRunner, we can only set role for individual connections.

**Solution**: Update TypeORM configuration to connect as `app_rls` user:

```typescript
// apps/server/src/typeorm.config.ts
export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: 'app_rls', // ✅ Change from 'bypass' to 'app_rls'
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // ...
};
```

**Alternative**: Use TypeORM's `extra` configuration to run `SET ROLE` on connection:

```typescript
export const typeOrmConfig: TypeOrmModuleOptions = {
  // ...
  extra: {
    onConnect: async (client) => {
      await client.query('SET ROLE app_rls');
    },
  },
};
```

**Testing**:

- ✅ Verify all QueryRunner connections use `app_rls` role
- ✅ Test that RLS policies are enforced correctly
- ✅ Verify migrations still work (migrations need bypass role)

---

### Step 1.6: Update `onModuleDestroy()`

**Current** (lines 183-192):

```typescript
async onModuleDestroy() {
  if (this.pool) {
    await this.pool.end();
    this.logger.log('Database pool closed');
  }
}
```

**Target**:

```typescript
async onModuleDestroy() {
  // No pool cleanup needed - TypeORM handles it via DataSource.destroy()
  this.logger.log('DatabaseService cleanup complete (no manual pool to close)');
}
```

**Testing**:

- ✅ Verify no connection leaks during shutdown
- ✅ Test application graceful shutdown (`SIGTERM`)

---

## Phase 2: Update Service Consumers

### File: `apps/server/src/modules/chat/chat.service.ts`

**Lines to Modify**: 397-426

**Current** (Transaction Pattern):

```typescript
async createMessage(...) {
  const client = await this.db.getClient(); // Returns PoolClient
  try {
    await client.query('BEGIN');

    // Insert graph object
    await client.query(
      'INSERT INTO graph_objects (id, organization_id, project_id, ...) VALUES ($1, $2, $3, ...)',
      [objectId, orgId, projectId, ...]
    );

    // Insert chat message
    await client.query(
      'INSERT INTO chat_messages (id, conversation_id, graph_object_id, ...) VALUES ($1, $2, $3, ...)',
      [messageId, conversationId, objectId, ...]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Target**:

```typescript
async createMessage(...) {
  const queryRunner = await this.db.getClient(); // Returns QueryRunner
  try {
    await queryRunner.startTransaction(); // ✅ Use TypeORM transaction API

    // Insert graph object
    await queryRunner.query(
      'INSERT INTO graph_objects (id, organization_id, project_id, ...) VALUES ($1, $2, $3, ...)',
      [objectId, orgId, projectId, ...]
    );

    // Insert chat message
    await queryRunner.query(
      'INSERT INTO chat_messages (id, conversation_id, graph_object_id, ...) VALUES ($1, $2, $3, ...)',
      [messageId, conversationId, objectId, ...]
    );

    await queryRunner.commitTransaction(); // ✅ Commit
  } catch (error) {
    await queryRunner.rollbackTransaction(); // ✅ Rollback
    throw error;
  } finally {
    await queryRunner.release(); // ✅ Must await
  }
}
```

**Key Changes**:

- `client.query('BEGIN')` → `queryRunner.startTransaction()`
- `client.query('COMMIT')` → `queryRunner.commitTransaction()`
- `client.query('ROLLBACK')` → `queryRunner.rollbackTransaction()`
- `client.release()` → `await queryRunner.release()` (must await!)

**Testing**:

- ✅ Test successful transaction (both inserts succeed)
- ✅ Test rollback on error (second insert fails, first should rollback)
- ✅ Verify RLS context persists across transaction queries
- ✅ Test concurrent transactions (multiple users creating messages simultaneously)

---

### File: `apps/server/src/modules/auth/permission.service.ts`

**Pattern**: RLS enforcement checks

**Current**:

```typescript
async checkPermission(orgId: string, projectId: string, objectId: string) {
  const client = await this.db.getClient();
  try {
    await this.db.setTenantContext(orgId, projectId);

    const result = await client.query(
      'SELECT id FROM graph_objects WHERE id = $1',
      [objectId]
    );

    return result.rows.length > 0; // If RLS blocks it, returns empty array
  } finally {
    client.release();
  }
}
```

**Target**:

```typescript
async checkPermission(orgId: string, projectId: string, objectId: string) {
  const queryRunner = await this.db.getClient();
  try {
    await this.db.setTenantContext(orgId, projectId);

    const result = await queryRunner.query(
      'SELECT id FROM graph_objects WHERE id = $1',
      [objectId]
    );

    // TypeORM returns T[] not QueryResult<T>
    return Array.isArray(result) && result.length > 0;
  } finally {
    await queryRunner.release();
  }
}
```

**Testing**:

- ✅ Test with valid tenant context (should find object)
- ✅ Test with wrong tenant context (RLS should block, return false)
- ✅ Test with no tenant context (should block all rows)

---

### File: `apps/server/src/modules/auth/auth.service.ts`

**Pattern**: Pre-tenant-context operations (token introspection)

**Current**:

```typescript
async introspectToken(token: string) {
  // No tenant context yet - we don't know who this user is
  const client = await this.db.getClient();
  try {
    const result = await client.query(
      'SELECT user_id, organization_id FROM tokens WHERE token_hash = $1',
      [hashToken(token)]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}
```

**Target**:

```typescript
async introspectToken(token: string) {
  // No tenant context yet - we don't know who this user is
  const queryRunner = await this.db.getClient();
  try {
    const result = await queryRunner.query(
      'SELECT user_id, organization_id FROM tokens WHERE token_hash = $1',
      [hashToken(token)]
    );

    // TypeORM returns T[] not QueryResult<T>
    return Array.isArray(result) ? result[0] : undefined;
  } finally {
    await queryRunner.release();
  }
}
```

**Testing**:

- ✅ Test with valid token (should return user/org)
- ✅ Test with invalid token (should return undefined)
- ✅ Verify works BEFORE tenant context is established

---

## Phase 3: TypeORM Configuration Updates

### File: `apps/server/src/typeorm.config.ts`

**Change**: Connect as `app_rls` role by default

**Current**:

```typescript
export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'bypass', // ❌ Uses bypass role
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // ...
};
```

**Target** (Option A - Change username):

```typescript
export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'app_rls', // ✅ Use RLS-enforcing role
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // ...
};
```

**Target** (Option B - Use `extra.onConnect`):

```typescript
export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'bypass',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  extra: {
    // Run on every new connection from pool
    onConnect: async (client) => {
      await client.query('SET ROLE app_rls');
    },
  },
  // ...
};
```

**⚠️ Migration Conflict**: If we connect as `app_rls`, migrations may fail (migrations need bypass role to ALTER TABLE).

**Solution**: Use environment variable to switch roles:

```typescript
export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username:
    process.env.DB_USER ||
    (process.env.RUN_MIGRATIONS === '1' ? 'bypass' : 'app_rls'),
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // ...
};
```

**Testing**:

- ✅ Verify all repository operations use `app_rls` role
- ✅ Verify migrations still work with `RUN_MIGRATIONS=1`
- ✅ Test RLS enforcement on TypeORM entities

---

## Phase 4: Testing & Validation

### 4.1: RLS Enforcement Tests

**Test File**: `apps/server/test/database-service.e2e-spec.ts`

```typescript
describe('DatabaseService RLS Enforcement (QueryRunner)', () => {
  let db: DatabaseService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(typeOrmConfig)],
      providers: [DatabaseService, AppConfigService],
    }).compile();

    db = module.get(DatabaseService);
    dataSource = module.get(DataSource);
  });

  it('should enforce RLS with tenant context', async () => {
    // Create test data in org1
    await dataSource.query(
      'INSERT INTO graph_objects (id, organization_id, project_id, type, data) VALUES ($1, $2, $3, $4, $5)',
      ['obj-1', 'org-1', 'proj-1', 'test', {}]
    );

    // Query with correct context
    const result1 = await db.runWithTenantContext(
      'org-1',
      'proj-1',
      async () => {
        return db.query('SELECT * FROM graph_objects WHERE id = $1', ['obj-1']);
      }
    );
    expect(result1.rows.length).toBe(1);

    // Query with wrong context - should be blocked by RLS
    const result2 = await db.runWithTenantContext(
      'org-2',
      'proj-2',
      async () => {
        return db.query('SELECT * FROM graph_objects WHERE id = $1', ['obj-1']);
      }
    );
    expect(result2.rows.length).toBe(0);
  });

  it('should persist RLS context across multiple queries', async () => {
    const queryRunner = await db.getClient();
    try {
      await db.setTenantContext('org-1', 'proj-1');

      // First query
      const result1 = await queryRunner.query('SELECT current_setting($1)', [
        'app.current_organization_id',
      ]);
      expect(result1[0].current_setting).toBe('org-1');

      // Second query on SAME connection
      const result2 = await queryRunner.query('SELECT current_setting($1)', [
        'app.current_project_id',
      ]);
      expect(result2[0].current_setting).toBe('proj-1');
    } finally {
      await queryRunner.release();
    }
  });

  it('should not leak RLS context between connections', async () => {
    // Set context on connection 1
    const qr1 = await db.getClient();
    try {
      await db.setTenantContext('org-1', 'proj-1');
      const result1 = await qr1.query('SELECT current_setting($1)', [
        'app.current_organization_id',
      ]);
      expect(result1[0].current_setting).toBe('org-1');
    } finally {
      await qr1.release();
    }

    // Get connection 2 - should NOT have org-1 context
    const qr2 = await db.getClient();
    try {
      await db.setTenantContext('org-2', 'proj-2');
      const result2 = await qr2.query('SELECT current_setting($1)', [
        'app.current_organization_id',
      ]);
      expect(result2[0].current_setting).toBe('org-2'); // NOT 'org-1'
    } finally {
      await qr2.release();
    }
  });
});
```

### 4.2: Transaction Tests

```typescript
describe('DatabaseService Transactions (QueryRunner)', () => {
  it('should commit transaction on success', async () => {
    const queryRunner = await db.getClient();
    try {
      await queryRunner.startTransaction();
      await queryRunner.query(
        'INSERT INTO test_table (id, value) VALUES ($1, $2)',
        ['test-1', 'value1']
      );
      await queryRunner.commitTransaction();
    } finally {
      await queryRunner.release();
    }

    // Verify data was inserted
    const result = await db.query('SELECT * FROM test_table WHERE id = $1', [
      'test-1',
    ]);
    expect(result.rows.length).toBe(1);
  });

  it('should rollback transaction on error', async () => {
    const queryRunner = await db.getClient();
    try {
      await queryRunner.startTransaction();
      await queryRunner.query(
        'INSERT INTO test_table (id, value) VALUES ($1, $2)',
        ['test-2', 'value2']
      );
      throw new Error('Simulated error');
    } catch (error) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }

    // Verify data was NOT inserted
    const result = await db.query('SELECT * FROM test_table WHERE id = $1', [
      'test-2',
    ]);
    expect(result.rows.length).toBe(0);
  });
});
```

### 4.3: Memory Leak Tests

```typescript
describe('DatabaseService Memory Leaks', () => {
  it('should not leak connections when QueryRunner not released', async () => {
    // Get current connection count
    const before = await dataSource.query(
      'SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()'
    );
    const beforeCount = parseInt(before[0].count);

    // Create 100 QueryRunners and forget to release them
    for (let i = 0; i < 100; i++) {
      const qr = await db.getClient();
      await qr.query('SELECT 1');
      // ❌ Intentionally forget to call qr.release()
    }

    // Wait for connections to idle out
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check connection count
    const after = await dataSource.query(
      'SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()'
    );
    const afterCount = parseInt(after[0].count);

    // Should have cleaned up idle connections
    expect(afterCount - beforeCount).toBeLessThan(10);
  });
});
```

---

## Phase 5: Rollback Plan

### If RLS Issues Arise

**Symptom**: Queries returning wrong data / cross-tenant data leakage

**Rollback Steps**:

1. Revert DatabaseService to use `pg.Pool`
2. Revert consumers to use `PoolClient` instead of `QueryRunner`
3. Redeploy application
4. Verify RLS enforcement with tenant isolation tests

**Git Commands**:

```bash
# Revert to previous commit
git revert HEAD

# Or reset to specific commit before migration
git reset --hard <commit-hash-before-migration>

# Force push if already deployed
git push --force-with-lease
```

### If Connection Pool Exhaustion

**Symptom**: "sorry, too many clients already" errors

**Immediate Fix**:

```typescript
// Increase TypeORM pool size temporarily
export const typeOrmConfig: TypeOrmModuleOptions = {
  // ...
  extra: {
    max: 50, // Increase from default 20 to 50
    idleTimeoutMillis: 10000, // Reduce idle timeout from 30s to 10s
  },
};
```

**Long-term Fix**: Find and fix QueryRunner leaks (connections not released)

### If Transaction Failures

**Symptom**: Partial data inserted / transactions not atomic

**Debug Steps**:

```typescript
// Add verbose logging to transaction operations
async createMessage(...) {
  const queryRunner = await this.db.getClient();
  this.logger.log(`Transaction started: ${queryRunner.connection.id}`);
  try {
    await queryRunner.startTransaction();
    this.logger.log('Transaction BEGIN successful');

    await queryRunner.query('INSERT INTO graph_objects ...');
    this.logger.log('Insert 1 successful');

    await queryRunner.query('INSERT INTO chat_messages ...');
    this.logger.log('Insert 2 successful');

    await queryRunner.commitTransaction();
    this.logger.log('Transaction COMMIT successful');
  } catch (error) {
    this.logger.error('Transaction error', error);
    await queryRunner.rollbackTransaction();
    this.logger.log('Transaction ROLLBACK successful');
    throw error;
  } finally {
    await queryRunner.release();
    this.logger.log('QueryRunner released');
  }
}
```

---

## Phase 6: Timeline & Effort Breakdown

### Day 1: DatabaseService Core Refactoring

**Tasks**:

- ✅ Step 1.1: Replace constructor dependency (30 min)
- ✅ Step 1.2: Update module initialization (1 hour)
- ✅ Step 1.3: Refactor `query()` method (2 hours)
- ✅ Step 1.4: Refactor `getClient()` method (1 hour)
- ✅ Step 1.5: Refactor `switchToRlsApplicationRole()` (2 hours)
- ✅ Step 1.6: Update `onModuleDestroy()` (30 min)

**Total**: 7 hours

### Day 2: Update Service Consumers

**Tasks**:

- ✅ Update ChatService transaction logic (2 hours)
- ✅ Update PermissionService RLS checks (1 hour)
- ✅ Update AuthService pre-context operations (1 hour)
- ✅ Search for other `getClient()` usages (1 hour)
- ✅ Update any additional consumers found (2 hours)

**Total**: 7 hours

### Day 3: TypeORM Configuration & Testing Setup

**Tasks**:

- ✅ Update TypeORM config for app_rls role (1 hour)
- ✅ Test migrations still work with bypass role (1 hour)
- ✅ Write RLS enforcement tests (3 hours)
- ✅ Write transaction tests (2 hours)

**Total**: 7 hours

### Day 4: Comprehensive Testing

**Tasks**:

- ✅ Run all unit tests (1 hour)
- ✅ Run all e2e tests (2 hours)
- ✅ Manual testing of critical flows (2 hours)
- ✅ Load testing (connection pool exhaustion) (1 hour)
- ✅ Memory leak testing (1 hour)

**Total**: 7 hours

### Day 5: Bug Fixes & Documentation

**Tasks**:

- ✅ Fix any issues found during testing (4 hours)
- ✅ Update inline documentation (1 hour)
- ✅ Update architecture docs (1 hour)
- ✅ Code review & final checks (1 hour)

**Total**: 7 hours

**GRAND TOTAL**: 35 hours (5 days @ 7 hours/day)

---

## Risk Matrix

| Risk                                          | Likelihood | Impact   | Mitigation                                                      |
| --------------------------------------------- | ---------- | -------- | --------------------------------------------------------------- |
| **RLS bypass** (cross-tenant data leak)       | MEDIUM     | CRITICAL | Comprehensive RLS tests, manual tenant isolation verification   |
| **Transaction failures** (data inconsistency) | LOW        | HIGH     | Transaction-specific tests, rollback testing                    |
| **Memory leaks** (connection not released)    | MEDIUM     | MEDIUM   | Static analysis for `finally` blocks, load testing              |
| **QueryResult API incompatibility**           | HIGH       | LOW      | Wrapper layer in `query()` method, backward compatibility       |
| **Migration failures** (role permissions)     | LOW        | HIGH     | Environment-based role switching, test migrations before deploy |
| **Performance regression**                    | LOW        | MEDIUM   | Load testing, query performance benchmarks                      |

---

## Decision Checklist

Before implementing this migration, ask:

- [ ] **Is connection pool overhead actually a problem?** (Currently ~30 connections = 15-30% of capacity)
- [ ] **Do we have connection limit issues in production?** (Check monitoring)
- [ ] **Is the refactor effort (5 days) justified?** (What problem are we solving?)
- [ ] **Do we have comprehensive RLS tests?** (Required before touching RLS code)
- [ ] **Do we have a rollback plan?** (Can we revert in production if issues arise?)
- [ ] **Is there lower-hanging fruit?** (Other optimizations with better ROI?)

**If you answered NO to any of these, reconsider this migration.**

---

## Alternative: Enhance Documentation Instead

### Option: Document the Dual-Architecture Pattern

**File**: `docs/architecture/DATABASE_CONNECTION_STRATEGY.md`

**Contents**:

```markdown
# Database Connection Strategy

## Why Two Connection Pools?

### TypeORM DataSource

- **Purpose**: ORM operations, entity management, migrations
- **Users**: Services using @InjectRepository() or DataSource.query()
- **Connection count**: ~20 connections

### DatabaseService pg.Pool

- **Purpose**: RLS-enforced raw SQL, tenant context management
- **Users**: Services requiring session variable persistence (ChatService, PermissionService, AuthService)
- **Connection count**: ~10 connections

## When to Use Each

### Use TypeORM

✅ Entity CRUD (User, Project, Document)
✅ Simple queries with QueryBuilder
✅ Read-heavy operations with caching

### Use DatabaseService

✅ Cross-tenant queries (admin)
✅ Multi-step operations with RLS context
✅ PostgreSQL-specific features (pgvector, JSONB operators, advisory locks)
✅ Operations before tenant context established (authentication)

## Why Not Consolidate?

- Connection overhead is negligible (~30 connections = 15-30% of capacity)
- Consolidation effort is high (3-5 days)
- Consolidation risk is moderate-high (RLS security)
- Consolidation value is low (no functional improvements)
```

---

## Conclusion

This migration plan demonstrates that **consolidation is feasible** but **not recommended** based on our cost-benefit analysis.

**Recommendation**: Keep the dual-architecture, enhance documentation instead.

**If you still want to proceed**: Follow this plan step-by-step, prioritize RLS testing, and have a rollback plan ready.

---

## References

- [TypeORM QueryRunner Documentation](https://typeorm.io/query-runner)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Architecture Analysis](./TYPEORM_DATABASE_SERVICE_ARCHITECTURE_ANALYSIS.md)
- TypeORM Transaction Guide: https://github.com/typeorm/typeorm/blob/master/docs/transactions.md
