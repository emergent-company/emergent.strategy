import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseService } from '../../src/common/database/database.service';
import { AppConfigService } from '../../src/common/config/config.service';
import { validate } from '../../src/common/config/config.schema';

// Helper to build fresh config + db per test with current process.env
function buildServices() {
    const envVars = validate({});
    const config = new AppConfigService(envVars);
    const db = new DatabaseService(config);
    return { config, db };
}

describe('DatabaseService SKIP_DB semantics', () => {
    const ORIGINAL_ENV = { ...process.env };
    afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

    it('treats SKIP_DB only when value is true/1', async () => {
        process.env.SKIP_DB = 'yes'; // should NOT activate skipDb under new semantics
        const { config } = buildServices();
        expect(config.skipDb).toBe(false);
    });

    it('skipDb=true disables pool and query returns empty rows; getClient throws descriptive error', async () => {
        process.env.SKIP_DB = 'true';
        const { db } = buildServices();
        await db.onModuleInit();
        const res = await db.query('SELECT 1');
        expect(res.rows).toEqual([]);
        await expect(db.getClient()).rejects.toThrow(/Database disabled \(SKIP_DB set\)/);
    });

    it('skipDb=1 also disables pool', async () => {
        process.env.SKIP_DB = '1';
        const { config } = buildServices();
        expect(config.skipDb).toBe(true);
    });

    it('unset SKIP_DB does not use skip mode (any error is not skipDb message)', async () => {
        delete process.env.SKIP_DB;
        const { config, db } = buildServices();
        // When SKIP_DB is unset, skipDb flag should be false
        expect(config.skipDb).toBe(false);
        // Verify getClient throws real connection error, not "Database disabled" error
        // Don't call onModuleInit() as it triggers expensive retry cycle
        try {
            await db.getClient();
            // If we reach here, database connection succeeded (test passes)
        } catch (err: any) {
            // If connection fails, ensure it's not the skipDb error message
            expect(String(err)).not.toMatch(/Database disabled \(SKIP_DB set\)/);
        }
    });
});
