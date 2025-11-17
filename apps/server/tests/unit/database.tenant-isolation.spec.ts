import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/common/database/database.service';
import { AppConfigService } from '../../src/common/config/config.service';
import { validate } from '../../src/common/config/config.schema';

/**
 * Unit tests for tenant context isolation bug fix.
 *
 * Root Cause: PostgreSQL set_config with session-scoped (false) was causing
 * tenant context pollution across connection pool reuse. When background jobs
 * cleared tenant context, subsequent requests using the same connection would
 * inherit the empty context.
 *
 * Fix: Changed all set_config calls from session-scoped (false) to
 * transaction-scoped (true), ensuring tenant context is isolated per transaction.
 */

// Track all query calls for assertion
let queryCalls: Array<{ sql: string; params: any[] }> = [];

// Mock TypeORM DataSource
vi.mock('typeorm', async () => {
  const actual = await vi.importActual<typeof import('typeorm')>('typeorm');

  class MockQueryRunner {
    isReleased = false;
    async connect() {
      return this;
    }
    async query(sql: string, params?: any[]) {
      queryCalls.push({ sql, params: params || [] });
      // Return empty result for set_config calls
      if (sql.includes('set_config')) {
        return [];
      }
      return [];
    }
    async release() {
      this.isReleased = true;
    }
    async startTransaction() {
      /* noop */
    }
    async commitTransaction() {
      /* noop */
    }
    async rollbackTransaction() {
      /* noop */
    }
    get manager() {
      return {
        save: vi.fn(),
        findOne: vi.fn(),
      };
    }
  }

  class MockDataSource {
    isInitialized = false;
    options: any = {
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'test',
      database: 'test',
    };
    async initialize() {
      this.isInitialized = true;
      return this;
    }
    async query(sql: string, params?: any[]) {
      queryCalls.push({ sql, params: params || [] });
      if (sql.includes('set_config')) {
        return [];
      }
      return [];
    }
    async destroy() {
      this.isInitialized = false;
    }
    createQueryRunner() {
      return new MockQueryRunner();
    }
  }

  return {
    ...actual,
    DataSource: MockDataSource,
  };
});

vi.mock('../../src/typeorm.config', async () => {
  const { DataSource } = await import('typeorm');
  const mockDataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'test',
    database: 'test',
  });
  return {
    default: mockDataSource,
  };
});

function buildServices(overrides: Record<string, string | undefined> = {}) {
  Object.entries(overrides).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  const envVars = validate({
    DB_AUTOINIT: true,
  });
  const config = new AppConfigService(envVars);
  const db = new DatabaseService(config);
  return { config, db };
}

describe('DatabaseService - Tenant Context Isolation', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    queryCalls = [];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  describe('Transaction-scoped tenant context (set_config with true)', () => {
    it('should use transaction-scoped set_config in setTenantContext', async () => {
      const { db } = buildServices();

      const orgId = 'org-123';
      const projectId = 'proj-456';

      await db.setTenantContext(orgId, projectId);

      // Find the set_config call
      const setConfigCall = queryCalls.find((call) =>
        call.sql.includes('set_config')
      );

      expect(setConfigCall).toBeDefined();
      expect(setConfigCall?.sql).toContain('set_config($1,$2,true)');
      expect(setConfigCall?.sql).toContain('set_config($3,$4,true)');
      expect(setConfigCall?.sql).toContain('set_config($5,$6,true)');
      expect(setConfigCall?.params).toEqual([
        'app.current_organization_id',
        orgId,
        'app.current_project_id',
        projectId,
        'row_security',
        'on',
      ]);
    });

    it('should use transaction-scoped set_config in runWithTenantContext', async () => {
      const { db } = buildServices();

      const orgId = 'org-789';
      const projectId = 'proj-abc';

      await db.runWithTenantContext(orgId, projectId, async () => {
        // Do nothing, just test the context setup
      });

      // Find all set_config calls
      const setConfigCalls = queryCalls.filter((call) =>
        call.sql.includes('set_config')
      );

      // Should have at least one set_config call
      expect(setConfigCalls.length).toBeGreaterThan(0);

      // All set_config calls should use transaction-scoped (true)
      setConfigCalls.forEach((call) => {
        expect(call.sql).toContain('set_config($1,$2,true)');
        expect(call.sql).toContain('set_config($3,$4,true)');
        expect(call.sql).toContain('set_config($5,$6,true)');
      });
    });

    it('should isolate tenant context between nested calls', async () => {
      const { db } = buildServices();

      const orgId1 = 'org-outer';
      const projectId1 = 'proj-outer';
      const orgId2 = 'org-inner';
      const projectId2 = 'proj-inner';

      await db.runWithTenantContext(orgId1, projectId1, async () => {
        // Nested context
        await db.runWithTenantContext(orgId2, projectId2, async () => {
          // Inner context
        });
        // Back to outer context
      });

      const setConfigCalls = queryCalls.filter((call) =>
        call.sql.includes('set_config')
      );

      // Should have multiple set_config calls (outer, inner, restore)
      expect(setConfigCalls.length).toBeGreaterThanOrEqual(2);

      // All should use transaction-scoped
      setConfigCalls.forEach((call) => {
        expect(call.sql).toMatch(/set_config\(\$\d+,\$\d+,true\)/);
      });
    });

    it('should handle null tenant context with transaction scope', async () => {
      const { db } = buildServices();

      // Simulating background job clearing tenant context
      await db.setTenantContext(null, null);

      const setConfigCall = queryCalls.find((call) =>
        call.sql.includes('set_config')
      );

      expect(setConfigCall).toBeDefined();
      expect(setConfigCall?.sql).toContain('set_config($1,$2,true)');
      expect(setConfigCall?.params).toEqual([
        'app.current_organization_id',
        '',
        'app.current_project_id',
        '',
        'row_security',
        'on',
      ]);
    });
  });

  describe('Regression test: ensure no session-scoped set_config', () => {
    it('should NOT use session-scoped set_config (false) anywhere', async () => {
      const { db } = buildServices();

      // Test various operations
      await db.setTenantContext('org-1', 'proj-1');
      await db.runWithTenantContext('org-2', 'proj-2', async () => {
        /* noop */
      });
      await db.setTenantContext(null, null);

      // Check all set_config calls
      const setConfigCalls = queryCalls.filter((call) =>
        call.sql.includes('set_config')
      );

      // Ensure NONE use session-scoped (false)
      setConfigCalls.forEach((call) => {
        expect(call.sql).not.toContain('set_config($1,$2,false)');
        expect(call.sql).not.toContain('set_config($3,$4,false)');
        expect(call.sql).not.toContain('set_config($5,$6,false)');
      });
    });
  });

  describe('Connection pool isolation scenario', () => {
    it('should prevent tenant context pollution across simulated connection reuse', async () => {
      const { db } = buildServices();

      // Simulate what happens in production:
      // 1. Background job clears context
      queryCalls = [];
      await db.setTenantContext(null, null);

      const clearContextCall = queryCalls.find((call) =>
        call.sql.includes('set_config')
      );
      expect(clearContextCall?.params[1]).toBe(''); // org cleared
      expect(clearContextCall?.params[3]).toBe(''); // project cleared

      // 2. New request sets context
      queryCalls = [];
      await db.setTenantContext('org-request', 'proj-request');

      const setContextCall = queryCalls.find((call) =>
        call.sql.includes('set_config')
      );
      expect(setContextCall?.params[1]).toBe('org-request');
      expect(setContextCall?.params[3]).toBe('proj-request');

      // 3. Both calls should use transaction-scoped (true)
      expect(clearContextCall?.sql).toContain('true');
      expect(setContextCall?.sql).toContain('true');

      // This ensures that the cleared context from step 1 doesn't
      // affect step 2 when the same connection is reused from the pool
    });
  });
});
