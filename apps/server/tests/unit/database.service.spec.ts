import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/common/database/database.service';
import { AppConfigService } from '../../src/common/config/config.service';
import { validate } from '../../src/common/config/config.schema';

// Mock TypeORM DataSource so we don't need a real Postgres instance.
// Each test can override implementation details via mock implementations.
vi.mock('typeorm', async () => {
  const actual = await vi.importActual<typeof import('typeorm')>('typeorm');

  class MockQueryRunner {
    isReleased = false;
    async connect() {
      return this;
    }
    async query() {
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
    async query() {
      return [];
    }
    async destroy() {
      this.isInitialized = false;
    }
    async runMigrations() {
      return [];
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

// Mock the typeorm.config module that's dynamically imported by DatabaseService
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

// Helper to build fresh config + db per test with current process.env
function buildServices(overrides: Record<string, string | undefined> = {}) {
  Object.entries(overrides).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  const envVars = validate({
    DB_AUTOINIT:
      process.env.DB_AUTOINIT === '1' || process.env.DB_AUTOINIT === 'true',
  });
  const config = new AppConfigService(envVars);
  const db = new DatabaseService(config);
  return { config, db };
}

describe('DatabaseService extended behaviour', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('lazy init success path (autoInitDb=false) sets online=true', async () => {
    delete process.env.DB_AUTOINIT; // autoInitDb false (migrations handle schema)
    const { db } = buildServices();
    expect(db.isOnline()).toBe(false);
    // Call query before onModuleInit to trigger lazy path
    await db.query('SELECT 42');
    expect(db.isOnline()).toBe(true);
    // Schema is now managed by migrations, not by ensureSchema
  });

  it('lazy init failure leaves service offline', async () => {
    const { DataSource }: any = await import('typeorm');
    // Mock initialization to fail
    vi.spyOn(DataSource.prototype as any, 'initialize').mockRejectedValueOnce(
      new Error('connectivity fail')
    );
    const { db } = buildServices();
    await db.query('SELECT 1');
    expect(db.isOnline()).toBe(false);
  });

  it('query returns empty rows when offline (after induced failure)', async () => {
    const { DataSource }: any = await import('typeorm');
    // Mock query to fail during lazy init connectivity check
    vi.spyOn(DataSource.prototype as any, 'query').mockRejectedValueOnce(
      new Error('offline now')
    );
    const { db } = buildServices();
    const res = await db.query('SELECT 1');
    expect(res.rows).toEqual([]);
    expect(db.isOnline()).toBe(false);
  });

  it('getClient throws offline error when pool defined but online=false', async () => {
    process.env.DB_AUTOINIT = '1';
    process.env.SKIP_MIGRATIONS = '1'; // Skip real migrations in unit tests
    const { db } = buildServices();
    // Let initialization succeed
    await db.onModuleInit();
    // Then manually set offline to simulate database becoming unavailable
    (db as any).online = false;
    expect(db.isOnline()).toBe(false);
    await expect(db.getClient()).rejects.toThrow(/Database offline/);
  });

  it('getOrgIdFromProjectId returns cached org ID on subsequent calls', async () => {
    const { db } = buildServices();
    const { DataSource }: any = await import('typeorm');
    
    // Mock query to return org ID
    const mockQuery = vi.fn().mockResolvedValue([
      { organization_id: 'test-org-123' }
    ]);
    vi.spyOn(DataSource.prototype as any, 'query').mockImplementation(mockQuery);
    vi.spyOn(DataSource.prototype as any, 'runMigrations').mockResolvedValue([]);

    await db.onModuleInit();
    
    // Clear mock call count after initialization (which makes many internal queries)
    mockQuery.mockClear();

    // First call should query database
    const result1 = await db.getOrgIdFromProjectId('test-project-456');
    expect(result1).toBe('test-org-123');
    expect(mockQuery).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = await db.getOrgIdFromProjectId('test-project-456');
    expect(result2).toBe('test-org-123');
    expect(mockQuery).toHaveBeenCalledTimes(1); // No additional call
  });

  it('getOrgIdFromProjectId returns null for nonexistent project', async () => {
    const { db } = buildServices();
    const { DataSource }: any = await import('typeorm');
    
    // Mock query to return empty result
    vi.spyOn(DataSource.prototype as any, 'query').mockResolvedValue([]);
    vi.spyOn(DataSource.prototype as any, 'runMigrations').mockResolvedValue([]);

    await db.onModuleInit();

    const result = await db.getOrgIdFromProjectId('nonexistent-project');
    expect(result).toBeNull();
  });

  it('clearOrgIdCache invalidates specific project cache entry', async () => {
    const { db } = buildServices();
    const { DataSource }: any = await import('typeorm');
    
    const mockQuery = vi.fn()
      .mockResolvedValueOnce([{ organization_id: 'org-1' }])
      .mockResolvedValueOnce([{ organization_id: 'org-2' }]);
    vi.spyOn(DataSource.prototype as any, 'query').mockImplementation(mockQuery);
    vi.spyOn(DataSource.prototype as any, 'runMigrations').mockResolvedValue([]);

    await db.onModuleInit();
    
    // Clear mock call count after initialization
    mockQuery.mockClear();
    mockQuery
      .mockResolvedValueOnce([{ organization_id: 'org-1' }])
      .mockResolvedValueOnce([{ organization_id: 'org-2' }]);

    // Cache first project
    await db.getOrgIdFromProjectId('project-1');
    expect(mockQuery).toHaveBeenCalledTimes(1);

    // Clear cache for this project
    db.clearOrgIdCache('project-1');

    // Next call should query again
    await db.getOrgIdFromProjectId('project-1');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('clearOrgIdCache without params clears entire cache', async () => {
    const { db } = buildServices();
    const { DataSource }: any = await import('typeorm');
    
    const mockQuery = vi.fn()
      .mockResolvedValueOnce([{ organization_id: 'org-1' }])
      .mockResolvedValueOnce([{ organization_id: 'org-2' }])
      .mockResolvedValueOnce([{ organization_id: 'org-1' }])
      .mockResolvedValueOnce([{ organization_id: 'org-2' }]);
    vi.spyOn(DataSource.prototype as any, 'query').mockImplementation(mockQuery);
    vi.spyOn(DataSource.prototype as any, 'runMigrations').mockResolvedValue([]);

    await db.onModuleInit();
    
    // Clear mock call count after initialization
    mockQuery.mockClear();
    mockQuery
      .mockResolvedValueOnce([{ organization_id: 'org-1' }])
      .mockResolvedValueOnce([{ organization_id: 'org-2' }])
      .mockResolvedValueOnce([{ organization_id: 'org-1' }])
      .mockResolvedValueOnce([{ organization_id: 'org-2' }]);

    // Cache two projects
    await db.getOrgIdFromProjectId('project-1');
    await db.getOrgIdFromProjectId('project-2');
    expect(mockQuery).toHaveBeenCalledTimes(2);

    // Clear entire cache
    db.clearOrgIdCache();

    // Both should query again
    await db.getOrgIdFromProjectId('project-1');
    await db.getOrgIdFromProjectId('project-2');
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('runWithTenantContext derives org ID from project ID', async () => {
    const { db } = buildServices();
    const { DataSource }: any = await import('typeorm');
    
    // Mock getOrgIdFromProjectId
    const mockGetOrgId = vi.fn().mockResolvedValue('derived-org-123');
    vi.spyOn(db, 'getOrgIdFromProjectId').mockImplementation(mockGetOrgId);

    const originalApply = (db as any).applyTenantContext.bind(db);
    const applied: Array<{ org: string | null; project: string | null }> = [];
    vi.spyOn(db as any, 'applyTenantContext').mockImplementation(
      async (org: unknown, project: unknown) => {
        const normalizedOrg = (org ?? null) as string | null;
        const normalizedProject = (project ?? null) as string | null;
        applied.push({ org: normalizedOrg, project: normalizedProject });
        return await originalApply(normalizedOrg, normalizedProject);
      }
    );

    await db.runWithTenantContext('test-project-456', async () => {
      // Test body
    });

    // Should have called getOrgIdFromProjectId with the project ID
    expect(mockGetOrgId).toHaveBeenCalledWith('test-project-456');
    
    // Should have applied context with derived org ID and provided project ID
    expect(applied).toContainEqual({ 
      org: 'derived-org-123', 
      project: 'test-project-456' 
    });
  });

  it('runWithTenantContext handles null project ID', async () => {
    const { db } = buildServices();
    
    // Mock getOrgIdFromProjectId (should not be called)
    const mockGetOrgId = vi.fn();
    vi.spyOn(db, 'getOrgIdFromProjectId').mockImplementation(mockGetOrgId);

    const originalApply = (db as any).applyTenantContext.bind(db);
    const applied: Array<{ org: string | null; project: string | null }> = [];
    vi.spyOn(db as any, 'applyTenantContext').mockImplementation(
      async (org: unknown, project: unknown) => {
        const normalizedOrg = (org ?? null) as string | null;
        const normalizedProject = (project ?? null) as string | null;
        applied.push({ org: normalizedOrg, project: normalizedProject });
        return await originalApply(normalizedOrg, normalizedProject);
      }
    );

    await db.runWithTenantContext(null, async () => {
      // Test body
    });

    // Should NOT have called getOrgIdFromProjectId
    expect(mockGetOrgId).not.toHaveBeenCalled();
    
    // Should have applied context with null org and project
    expect(applied).toContainEqual({ 
      org: null, 
      project: null 
    });
  });

  it('restores base tenant context after overlapping runWithTenantContext calls', async () => {
    const { db } = buildServices();
    
    // Mock getOrgIdFromProjectId for both projects
    const mockGetOrgId = vi.fn()
      .mockResolvedValueOnce('org-1')
      .mockResolvedValueOnce('org-2');
    vi.spyOn(db, 'getOrgIdFromProjectId').mockImplementation(mockGetOrgId);

    const originalApply = (db as any).applyTenantContext.bind(db);
    const applied: Array<{ org: string | null; project: string | null }> = [];
    vi.spyOn(db as any, 'applyTenantContext').mockImplementation(
      async (org: unknown, project: unknown) => {
        const normalizedOrg = (org ?? null) as string | null;
        const normalizedProject = (project ?? null) as string | null;
        applied.push({ org: normalizedOrg, project: normalizedProject });
        return await originalApply(normalizedOrg, normalizedProject);
      }
    );

    await db.setTenantContext('base-org', 'base-project');

    const first = db.runWithTenantContext('proj-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const second = db.runWithTenantContext('proj-2', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await first;
    await second;

    expect((db as any).currentOrgId).toBe('base-org');
    expect((db as any).currentProjectId).toBe('base-project');
    const storage = (db as any).tenantContextStorage;
    const store = storage?.getStore();
    expect(store).toBeDefined();
    expect(store?.frames?.length ?? 0).toBe(0);
    expect(store?.orgId ?? null).toBe('base-org');
    expect(store?.projectId ?? null).toBe('base-project');
    const lastCall = applied[applied.length - 1];
    expect(lastCall).toEqual({ org: 'base-org', project: 'base-project' });
  });
});
