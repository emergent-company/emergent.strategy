import { describe } from 'vitest';
import { Pool } from 'pg';
import { getTestDbConfig } from '../test-db-config';

let cachedResult: boolean | null = null;

async function checkDatabaseAvailability(): Promise<boolean> {
    if (cachedResult !== null) {
        return cachedResult;
    }

    const skipFlag = process.env.SKIP_DB;
    if (skipFlag === '1' || skipFlag === 'true' || skipFlag === 'TRUE') {
        cachedResult = false;
        return cachedResult;
    }

    // Use centralized test database configuration (no fallbacks)
    const dbConfig = getTestDbConfig();
    const pool = new Pool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        connectionTimeoutMillis: 500,
    });

    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        cachedResult = true;
    } catch (error) {
        cachedResult = false;
        const verbose = process.env.E2E_DEBUG_VERBOSE === 'true';
        if (verbose) {
            // eslint-disable-next-line no-console
            console.warn('[db-describe] Database unavailable; skipping DB-dependent tests:', error);
        }
    } finally {
        await pool.end().catch(() => undefined);
    }

    return cachedResult;
}

export async function isDatabaseAvailable(): Promise<boolean> {
    return checkDatabaseAvailability();
}

export function describeWithDb(title: string, factory: () => void, timeout?: number): void {
    const register = async () => {
        const available = await checkDatabaseAvailability();
        const runner = available ? describe : describe.skip;
        if (!available && process.env.E2E_DEBUG_VERBOSE === 'true') {
            // eslint-disable-next-line no-console
            console.warn(`[db-describe] Skipping "${title}" because database is unavailable.`);
        }
        runner(title, factory, timeout as any);
    };

    void register();
}
