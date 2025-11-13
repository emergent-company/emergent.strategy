import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PostgresCacheService } from './postgres-cache.service';

/**
 * Automated cleanup service for expired introspection cache entries
 *
 * Purpose:
 * - Prevent cache table from growing indefinitely
 * - Remove stale entries that have expired
 * - Keep database size manageable
 *
 * Configuration:
 * - CACHE_CLEANUP_INTERVAL: How often to run cleanup (default: 900 seconds = 15 minutes)
 * - Runs immediately on application startup
 * - Stops gracefully on application shutdown
 *
 * Performance Impact:
 * - Minimal: DELETE query with indexed WHERE clause
 * - Runs in background, doesn't block requests
 * - Logs statistics for monitoring
 */
@Injectable()
export class CacheCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheCleanupService.name);
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private readonly cacheService: PostgresCacheService) {}

  /**
   * Start cleanup service when module initializes
   *
   * Lifecycle:
   * 1. Parse interval from environment (default: 900s = 15 minutes)
   * 2. Set up periodic cleanup timer
   * 3. Run cleanup immediately on startup
   */
  onModuleInit(): void {
    const intervalSeconds = parseInt(
      process.env.CACHE_CLEANUP_INTERVAL || '900',
      10
    );
    const intervalMs = intervalSeconds * 1000;

    this.logger.log(
      `Starting cache cleanup service (interval: ${intervalSeconds}s = ${Math.round(
        intervalSeconds / 60
      )} minutes)`
    );

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(async () => {
      await this.runCleanup();
    }, intervalMs);

    // Run immediately on startup to clean any entries expired during downtime
    this.runCleanup();
  }

  /**
   * Stop cleanup service when module destroys
   *
   * Called during:
   * - Application shutdown
   * - Hot reload (development)
   * - Module unload
   */
  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.logger.log('Cache cleanup service stopped');
    }
  }

  /**
   * Execute cleanup operation
   *
   * Error handling:
   * - Logs errors but doesn't throw (prevents crash)
   * - Continues running on next interval even if one cleanup fails
   * - PostgresCacheService handles database connection issues
   */
  private async runCleanup(): Promise<void> {
    try {
      const startTime = Date.now();
      const deletedCount = await this.cacheService.cleanupExpired();
      const elapsed = Date.now() - startTime;

      if (deletedCount > 0) {
        this.logger.log(
          `Cache cleanup completed: ${deletedCount} entries removed in ${elapsed}ms`
        );
      } else {
        this.logger.debug(
          `Cache cleanup completed: 0 entries removed (${elapsed}ms)`
        );
      }
    } catch (error) {
      this.logger.error(`Cache cleanup failed: ${(error as Error).message}`);
    }
  }

  /**
   * Manually trigger cleanup (for testing or admin commands)
   *
   * @returns Number of entries deleted
   */
  async triggerCleanup(): Promise<number> {
    this.logger.log('Manual cleanup triggered');
    return await this.cacheService.cleanupExpired();
  }
}
