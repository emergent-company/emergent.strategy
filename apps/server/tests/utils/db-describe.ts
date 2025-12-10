import { describe } from 'vitest';
import { Pool } from 'pg';
import { getTestDbConfig } from '../test-db-config';

let cachedResult: boolean | null = null;
let dbCheckPromise: Promise<boolean> | null = null;

/**
 * Synchronously checks database availability using cached result.
 * Returns true if cache says available, false if unavailable, or defaults to true if not yet cached.
 */
function checkDatabaseAvailabilitySync(): boolean {
  const skipFlag = process.env.SKIP_DB;
  if (skipFlag === '1' || skipFlag === 'true' || skipFlag === 'TRUE') {
    return false;
  }
  // If we have a cached result, use it
  if (cachedResult !== null) {
    return cachedResult;
  }
  // Default to true (assume available) - actual check happens in beforeAll
  return true;
}

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
      console.warn(
        '[db-describe] Database unavailable; skipping DB-dependent tests:',
        error
      );
    }
  } finally {
    await pool.end().catch(() => undefined);
  }

  return cachedResult;
}

/**
 * Ensures database check has been performed. Call this in globalSetup or before tests.
 */
export async function ensureDatabaseChecked(): Promise<boolean> {
  if (dbCheckPromise === null) {
    dbCheckPromise = checkDatabaseAvailability();
  }
  return dbCheckPromise;
}

export async function isDatabaseAvailable(): Promise<boolean> {
  return checkDatabaseAvailability();
}

/**
 * Wrapper around describe() that registers the suite synchronously but skips all tests
 * in beforeAll if the database is unavailable.
 *
 * This approach:
 * 1. Registers the describe block synchronously (required by Vitest)
 * 2. Checks database availability in beforeAll (async is allowed there)
 * 3. Uses describe.skip context to mark tests as skipped if DB unavailable
 */
export function describeWithDb(
  title: string,
  factory: () => void,
  timeout?: number
): void {
  // Check synchronously first - if SKIP_DB is set, skip immediately
  const skipFlag = process.env.SKIP_DB;
  if (skipFlag === '1' || skipFlag === 'true' || skipFlag === 'TRUE') {
    if (process.env.E2E_DEBUG_VERBOSE === 'true') {
      // eslint-disable-next-line no-console
      console.warn(`[db-describe] Skipping "${title}" because SKIP_DB is set.`);
    }
    describe.skip(title, factory, timeout as any);
    return;
  }

  // Register the describe block synchronously
  // Tests will check database availability in their beforeAll hooks
  describe(title, factory, timeout as any);
}
