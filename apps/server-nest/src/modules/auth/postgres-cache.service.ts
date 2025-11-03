import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../common/database/database.service';

export interface CachedIntrospection {
    data: Record<string, any>;
    expiresAt: Date;
}

/**
 * PostgreSQL-based cache for Zitadel token introspection results
 * 
 * Purpose:
 * - Reduce load on Zitadel by caching introspection responses
 * - Improve authentication performance (cache hits ~10-50ms vs API calls ~100-200ms)
 * - Graceful degradation (returns null on cache failures)
 * 
 * Security:
 * - Tokens are hashed with SHA-512 before storage (never stored in plaintext)
 * - Cache entries automatically expire based on token TTL
 * - Database-level permissions via RLS
 * 
 * Performance:
 * - Expected cache hit rate: 80-95% in production
 * - Automatic cleanup of expired entries via CacheCleanupService
 */
@Injectable()
export class PostgresCacheService {
    private readonly logger = new Logger(PostgresCacheService.name);

    constructor(private readonly db: DatabaseService) { }

    /**
     * Retrieve cached introspection result for a token
     * 
     * @param token - Access token to look up
     * @returns Cached introspection data and expiry, or null if not found/expired
     */
    async get(token: string): Promise<CachedIntrospection | null> {
        if (!this.db.isOnline()) {
            this.logger.debug('Database offline, cache unavailable');
            return null;
        }

        const tokenHash = this.hashToken(token);

        try {
            const result = await this.db.query(
                `SELECT introspection_data, expires_at
                 FROM kb.auth_introspection_cache
                 WHERE token_hash = $1
                   AND expires_at > NOW()`,
                [tokenHash]
            );

            if (result.rows.length === 0) {
                this.logger.debug('Cache miss');
                return null;
            }

            const row = result.rows[0];
            this.logger.debug('Cache hit');

            return {
                data: row.introspection_data,
                expiresAt: new Date(row.expires_at),
            };
        } catch (error) {
            this.logger.error(
                `Failed to get cached introspection: ${(error as Error).message}`
            );
            return null;
        }
    }

    /**
     * Store introspection result in cache
     * 
     * @param token - Access token (will be hashed)
     * @param introspectionData - Full introspection response from Zitadel
     * @param expiresAt - When cache entry should expire
     */
    async set(
        token: string,
        introspectionData: Record<string, any>,
        expiresAt: Date
    ): Promise<void> {
        if (!this.db.isOnline()) {
            this.logger.debug('Database offline, skipping cache set');
            return;
        }

        const tokenHash = this.hashToken(token);

        try {
            await this.db.query(
                `INSERT INTO kb.auth_introspection_cache (token_hash, introspection_data, expires_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (token_hash) DO UPDATE
                 SET introspection_data = EXCLUDED.introspection_data,
                     expires_at = EXCLUDED.expires_at,
                     created_at = NOW()`,
                [tokenHash, JSON.stringify(introspectionData), expiresAt]
            );

            this.logger.debug(
                `Cached introspection result (expires: ${expiresAt.toISOString()})`
            );
        } catch (error) {
            this.logger.error(
                `Failed to cache introspection: ${(error as Error).message}`
            );
        }
    }

    /**
     * Invalidate cached entry for a token
     * 
     * Use cases:
     * - User logout
     * - Token revocation
     * - Forced re-authentication
     * 
     * @param token - Access token to invalidate
     */
    async invalidate(token: string): Promise<void> {
        if (!this.db.isOnline()) {
            this.logger.debug('Database offline, skipping cache invalidation');
            return;
        }

        const tokenHash = this.hashToken(token);

        try {
            await this.db.query(
                `DELETE FROM kb.auth_introspection_cache WHERE token_hash = $1`,
                [tokenHash]
            );

            this.logger.debug('Invalidated cached introspection');
        } catch (error) {
            this.logger.error(
                `Failed to invalidate cache: ${(error as Error).message}`
            );
        }
    }

    /**
     * Remove all expired cache entries
     * 
     * Called periodically by CacheCleanupService (default: every 15 minutes)
     * 
     * @returns Number of entries deleted
     */
    async cleanupExpired(): Promise<number> {
        if (!this.db.isOnline()) {
            this.logger.debug('Database offline, skipping cleanup');
            return 0;
        }

        try {
            const result = await this.db.query(
                `DELETE FROM kb.auth_introspection_cache
                 WHERE expires_at <= NOW()
                 RETURNING token_hash`
            );

            const deletedCount = result.rows.length;
            if (deletedCount > 0) {
                this.logger.log(`Cleaned up ${deletedCount} expired cache entries`);
            }

            return deletedCount;
        } catch (error) {
            this.logger.error(
                `Failed to cleanup expired cache entries: ${(error as Error).message}`
            );
            return 0;
        }
    }

    /**
     * Hash token with SHA-512
     * 
     * Security benefits:
     * - Tokens never stored in plaintext
     * - Even with database access, original tokens can't be recovered
     * - Hash collision resistance ensures cache integrity
     * 
     * @param token - Access token to hash
     * @returns SHA-512 hash (128 hex characters)
     */
    private hashToken(token: string): string {
        return createHash('sha512').update(token).digest('hex');
    }
}
