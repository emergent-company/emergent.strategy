import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { createHash } from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { AuthIntrospectionCache } from '../../entities/auth-introspection-cache.entity';

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

  constructor(
    @InjectRepository(AuthIntrospectionCache)
    private readonly cacheRepository: Repository<AuthIntrospectionCache>,
    private readonly db: DatabaseService
  ) {}

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
      const cached = await this.cacheRepository.findOne({
        where: {
          tokenHash,
          expiresAt: MoreThan(new Date()),
        },
      });

      if (!cached) {
        const totalCount = await this.cacheRepository.count();
        this.logger.debug(
          `Cache miss for token hash ${tokenHash} (first chars: ${token.substring(
            0,
            10
          )}...). Total cache entries: ${totalCount}`
        );
        return null;
      }

      this.logger.debug('Cache hit');

      return {
        data: cached.introspectionData,
        expiresAt: cached.expiresAt,
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
      const cache = this.cacheRepository.create({
        tokenHash,
        introspectionData,
        expiresAt,
      });

      await this.cacheRepository.save(cache);

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
      await this.cacheRepository.delete({ tokenHash });

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
      const result = await this.cacheRepository.delete({
        expiresAt: LessThan(new Date()),
      });

      const deletedCount = result.affected || 0;
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
