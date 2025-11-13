import { PoolClient, QueryResult, QueryResultRow } from 'pg';

/**
 * Advisory Lock Utility
 *
 * Provides reusable functions for PostgreSQL advisory locks to prevent race conditions
 * in concurrent operations. Advisory locks are transaction-scoped (released on COMMIT/ROLLBACK).
 *
 * Pattern: PostgreSQL Advisory Locks
 * See: docs/patterns/STRATEGIC_SQL_PATTERNS.md - Section 1: Duplicate Prevention with Advisory Locks
 *
 * Usage:
 * ```typescript
 * const result = await acquireAdvisoryLock(
 *   client,
 *   'tag|project123|tagname',
 *   async () => {
 *     // Critical section - protected by lock
 *     return await createTag(...);
 *   }
 * );
 * ```
 */

/**
 * Database client interface for advisory lock utilities.
 * Accepts both pg PoolClient and TypeORM QueryRunner adapter.
 */
export interface DatabaseClient {
  query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>>;
}

/**
 * Generate a consistent lock key from a string identifier.
 * Uses PostgreSQL's hashtext function to convert string to bigint.
 *
 * @param key - Logical identifier (e.g., 'tag|projectId|name')
 * @returns Lock key string suitable for pg_advisory_xact_lock
 *
 * @example
 * generateLockKey('tag|project123|tagname')
 * // Returns: 'tag|project123|tagname'
 */
export function generateLockKey(key: string): string {
  return key;
}

/**
 * Execute a function within a PostgreSQL advisory lock transaction.
 *
 * This utility:
 * 1. Begins a transaction
 * 2. Acquires an advisory lock using pg_advisory_xact_lock (transaction-scoped)
 * 3. Executes the provided function
 * 4. Commits on success or rolls back on error
 * 5. Automatically releases client back to pool
 *
 * The lock is automatically released when the transaction ends (COMMIT or ROLLBACK).
 *
 * @param client - Database client from pool (must not be in a transaction)
 * @param lockKey - Logical identifier for the lock (e.g., 'tag|projectId|name')
 * @param fn - Async function to execute within the lock
 * @returns Result from the function
 * @throws Re-throws any error from the function after rolling back transaction
 *
 * @example
 * const client = await db.getClient();
 * try {
 *   const tag = await acquireAdvisoryLock(
 *     client,
 *     `tag|${projectId}|${name.toLowerCase()}`,
 *     async () => {
 *       // Check for duplicates
 *       const existing = await client.query(...);
 *       if (existing.rowCount) throw new Error('exists');
 *
 *       // Insert new record
 *       return await client.query(...);
 *     }
 *   );
 * } finally {
 *   client.release();
 * }
 */
export async function acquireAdvisoryLock<T>(
  client: DatabaseClient,
  lockKey: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    await client.query('BEGIN');

    // Acquire transaction-scoped advisory lock
    // Lock is automatically released on COMMIT or ROLLBACK
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
      lockKey,
    ]);

    // Execute critical section
    const result = await fn();

    // Commit transaction (releases lock automatically)
    await client.query('COMMIT');

    return result;
  } catch (error) {
    // Rollback transaction on error (releases lock automatically)
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }
    throw error;
  }
}

/**
 * Execute a function within a PostgreSQL advisory lock, assuming transaction already started.
 *
 * Use this variant when you need to manage the transaction lifecycle yourself.
 * This only acquires the lock without BEGIN/COMMIT/ROLLBACK.
 *
 * @param client - Database client (must already be in a transaction)
 * @param lockKey - Logical identifier for the lock
 * @param fn - Async function to execute within the lock
 * @returns Result from the function
 * @throws Re-throws any error from the function
 *
 * @example
 * const client = await db.getClient();
 * try {
 *   await client.query('BEGIN');
 *
 *   const result1 = await acquireAdvisoryLockInTransaction(
 *     client,
 *     'resource1',
 *     async () => { ... }
 *   );
 *
 *   const result2 = await acquireAdvisoryLockInTransaction(
 *     client,
 *     'resource2',
 *     async () => { ... }
 *   );
 *
 *   await client.query('COMMIT');
 * } catch (error) {
 *   await client.query('ROLLBACK');
 *   throw error;
 * } finally {
 *   client.release();
 * }
 */
export async function acquireAdvisoryLockInTransaction<T>(
  client: DatabaseClient,
  lockKey: string,
  fn: () => Promise<T>
): Promise<T> {
  // Acquire transaction-scoped advisory lock
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
    lockKey,
  ]);

  // Execute critical section
  return await fn();
}
