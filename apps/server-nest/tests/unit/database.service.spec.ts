import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/common/database/database.service';
import { AppConfigService } from '../../src/common/config/config.service';
import { validate } from '../../src/common/config/config.schema';

// We will mock 'pg' Pool so we don't need a real Postgres instance.
// Each test can override implementation details via mock implementations.
vi.mock('pg', () => {
    class MockClient { release = vi.fn(); }
    class MockPool {
        async query() { return { rows: [], rowCount: 0, command: 'SELECT', fields: [], oid: 0 }; }
        async connect() { return new MockClient(); }
        async end() { /* noop */ }
    }
    return { Pool: MockPool };
});

// Helper to build fresh config + db per test with current process.env
function buildServices(overrides: Record<string, string | undefined> = {}) {
    Object.entries(overrides).forEach(([k, v]) => {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    });
    const envVars = validate({ DB_AUTOINIT: (process.env.DB_AUTOINIT === '1' || process.env.DB_AUTOINIT === 'true') });
    const config = new AppConfigService(envVars);
    const db = new DatabaseService(config);
    return { config, db };
}

describe('DatabaseService extended behaviour', () => {
    const ORIGINAL_ENV = { ...process.env };
    afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.clearAllMocks(); });
    beforeEach(() => { vi.useRealTimers(); });

    it('lazy init success path (autoInitDb=false) sets online=true and does not mark schemaEnsured', async () => {
        delete process.env.DB_AUTOINIT; // autoInitDb false
        const { db } = buildServices();
        expect(db.isOnline()).toBe(false);
        // Call query before onModuleInit to trigger lazy path
        await db.query('SELECT 42');
        expect(db.isOnline()).toBe(true);
        expect(db.hasSchema()).toBe(false); // ensureSchema not called
    });

    it('lazy init failure leaves service offline', async () => {
        const { Pool }: any = await import('pg');
        // First call (connectivity check) throws
        vi.spyOn(Pool.prototype as any, 'query').mockRejectedValueOnce(new Error('connectivity fail'));
        const { db } = buildServices();
        await db.query('SELECT 1');
        expect(db.isOnline()).toBe(false);
    });

    it('minimal schema path increments minimalSchemaBoots and sets schemaEnsured', async () => {
        process.env.DB_AUTOINIT = '1';
        process.env.E2E_MINIMAL_DB = 'true';
        const { Pool }: any = await import('pg');
        // Provide targeted responses for schema inspection queries used by minimal path
        vi.spyOn(Pool.prototype as any, 'query').mockImplementation(async (sql: any) => {
            if (sql === 'SELECT 1') {
                return { rows: [{ one: 1 }], rowCount: 1, command: 'SELECT', fields: [], oid: 0 };
            }
            if (sql.includes("to_regclass('kb.projects')")) {
                return { rows: [{ exists: null }], rowCount: 1 };
            }
            if (sql.includes("to_regclass('kb.schema_reset_guard')")) {
                return { rows: [{ exists: null }], rowCount: 1 };
            }
            // All other DDL we just acknowledge success
            return { rows: [], rowCount: 0, command: 'SELECT', fields: [], oid: 0 };
        });
        const { db } = buildServices();
        await db.onModuleInit();
        // autoInitDb triggers ensureSchema which sets hasSchema true in minimal path
        expect(db.hasSchema()).toBe(true);
        const metrics = db.getMetrics();
        expect(metrics.minimalSchemaBoots).toBe(1);
        expect(metrics.fullSchemaEnsures).toBe(0);
        // Second ensureSchema call (simulate idempotent re-entry) should not bump minimalSchemaBoots again
        await (db as any).ensureSchema();
        const metrics2 = db.getMetrics();
        expect(metrics2.minimalSchemaBoots).toBe(1);
    });

    it('full schema path increments fullSchemaEnsures and sets schemaEnsured', async () => {
        process.env.DB_AUTOINIT = '1';
        delete process.env.E2E_MINIMAL_DB;
        const { db } = buildServices();
        await db.onModuleInit();
        expect(db.hasSchema()).toBe(true);
        const metrics = db.getMetrics();
        expect(metrics.fullSchemaEnsures).toBe(1);
        expect(metrics.minimalSchemaBoots).toBe(0);
    });

    it('query returns empty rows when offline (after induced failure)', async () => {
        const { Pool }: any = await import('pg');
        vi.spyOn(Pool.prototype as any, 'query').mockRejectedValueOnce(new Error('offline now'));
        const { db } = buildServices();
        const res = await db.query('SELECT 1');
        expect(res.rows).toEqual([]);
        expect(db.isOnline()).toBe(false);
    });

    it('getClient throws offline error when pool defined but online=false', async () => {
        process.env.DB_AUTOINIT = '1';
        const { Pool }: any = await import('pg');
        // Success for connectivity check, then failure during ensureSchema (second query call)
        const qSpy = vi.spyOn(Pool.prototype as any, 'query');
        qSpy.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT 1
        qSpy.mockRejectedValueOnce(new Error('ensureSchema fail')); // first ensureSchema statement
        const { db } = buildServices();
        await db.onModuleInit().catch(() => { });
        expect(db.isOnline()).toBe(false);
        await expect(db.getClient()).rejects.toThrow(/Database offline/);
    });

    it('restores base tenant context after overlapping runWithTenantContext calls', async () => {
        const { db } = buildServices();
        const originalApply = (db as any).applyTenantContext.bind(db);
        const applied: Array<{ org: string | null; project: string | null }> = [];
        vi.spyOn(db as any, 'applyTenantContext').mockImplementation(async (org: unknown, project: unknown) => {
            const normalizedOrg = (org ?? null) as string | null;
            const normalizedProject = (project ?? null) as string | null;
            applied.push({ org: normalizedOrg, project: normalizedProject });
            return await originalApply(normalizedOrg, normalizedProject);
        });

        await db.setTenantContext('base-org', 'base-project');

        const first = db.runWithTenantContext('org-1', 'proj-1', async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        const second = db.runWithTenantContext('org-2', 'proj-2', async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
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
