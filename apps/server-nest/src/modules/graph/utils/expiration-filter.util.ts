/**
 * TTL-Based Auto-Expiration Utilities (Phase 3 - Task 7c)
 *
 * Provides utilities for filtering expired objects from search and graph traversal queries.
 * Objects with an expires_at timestamp in the past are automatically excluded from results.
 *
 * This implements temporal validity checks to ensure that expired content is not returned
 * in any query results, supporting both search operations and graph traversal.
 */

/**
 * Build SQL WHERE clause to exclude expired objects.
 *
 * Objects are considered expired if:
 * - expires_at IS NOT NULL (expiration is set)
 * - AND expires_at <= current timestamp
 *
 * Objects with NULL expires_at never expire and are always included.
 *
 * @param tableAlias - Optional table alias (e.g., 'o' for 'o.expires_at'). Default is no alias.
 * @returns SQL WHERE clause fragment to exclude expired objects
 *
 * @example
 * // No alias
 * const clause = buildExpirationFilterClause();
 * // Returns: "(expires_at IS NULL OR expires_at > now())"
 *
 * @example
 * // With table alias
 * const clause = buildExpirationFilterClause('o');
 * // Returns: "(o.expires_at IS NULL OR o.expires_at > now())"
 *
 * @example
 * // Usage in a query
 * const sql = `
 *   SELECT * FROM kb.graph_objects o
 *   WHERE o.deleted_at IS NULL
 *     AND ${buildExpirationFilterClause('o')}
 * `;
 */
export function buildExpirationFilterClause(tableAlias?: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `(${prefix}expires_at IS NULL OR ${prefix}expires_at > now())`;
}

/**
 * Check if an object is currently expired based on its expires_at timestamp.
 *
 * @param expiresAt - ISO 8601 timestamp string or null
 * @returns true if the object is expired, false otherwise
 *
 * @example
 * isExpired('2025-01-01T00:00:00Z'); // true if current time > 2025-01-01
 * isExpired(null); // false - never expires
 * isExpired(undefined); // false - never expires
 */
export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) {
    return false; // No expiration set
  }

  const expirationTime = new Date(expiresAt).getTime();
  const now = Date.now();

  return expirationTime <= now;
}

/**
 * Calculate TTL (Time To Live) in seconds for an object.
 *
 * @param expiresAt - ISO 8601 timestamp string or null
 * @returns TTL in seconds, or null if no expiration is set. Returns 0 if already expired.
 *
 * @example
 * getTTL('2025-01-01T00:00:00Z'); // Returns seconds until expiration (or 0 if expired)
 * getTTL(null); // null - never expires
 */
export function getTTL(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) {
    return null; // No expiration set
  }

  const expirationTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const ttlMs = expirationTime - now;

  return Math.max(0, Math.floor(ttlMs / 1000));
}

/**
 * Create an expiration timestamp from a TTL in seconds.
 *
 * @param ttlSeconds - Time to live in seconds from now
 * @returns ISO 8601 timestamp string
 *
 * @example
 * createExpirationTimestamp(3600); // Returns timestamp 1 hour from now
 * createExpirationTimestamp(86400); // Returns timestamp 24 hours from now
 */
export function createExpirationTimestamp(ttlSeconds: number): string {
  const now = Date.now();
  const expirationTime = now + ttlSeconds * 1000;
  return new Date(expirationTime).toISOString();
}
