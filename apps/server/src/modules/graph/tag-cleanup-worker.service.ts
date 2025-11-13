import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tag } from '../../entities/tag.entity';

/**
 * Tag Cleanup Worker Service
 *
 * Background worker that periodically removes unused tags from kb.tags table.
 *
 * A tag is considered "unused" if:
 * - It exists in kb.tags
 * - But no graph_objects reference it in their properties->'tags' array
 *
 * Runs every 5 minutes by default (configurable via TAG_CLEANUP_INTERVAL_MS env var).
 *
 * Migrated to TypeORM - uses DataSource.query for complex JSONB operators (? operator)
 */
@Injectable()
export class TagCleanupWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TagCleanupWorkerService.name);
  private intervalHandle?: NodeJS.Timeout;
  private readonly intervalMs: number;
  private isProcessing = false;
  private currentCleanup: Promise<void> | null = null;

  constructor(
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    private readonly dataSource: DataSource
  ) {
    // Default to 5 minutes, configurable via environment
    this.intervalMs = parseInt(
      process.env.TAG_CLEANUP_INTERVAL_MS || '300000',
      10
    );
  }

  onModuleInit() {
    // Disable during tests unless explicitly enabled
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_WORKERS_IN_TESTS !== 'true'
    ) {
      this.logger.debug(
        'Tag cleanup worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)'
      );
      return;
    }

    this.logger.log(
      `Tag cleanup worker starting (interval=${this.intervalMs}ms)`
    );
    this.startWorker();
  }

  async onModuleDestroy() {
    // Stop the worker
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    // Wait for current cleanup to finish to avoid orphaned promises
    if (this.currentCleanup) {
      this.logger.debug(
        'Waiting for current cleanup to complete before stopping...'
      );
      try {
        await this.currentCleanup;
      } catch (error) {
        this.logger.warn('Current cleanup failed during shutdown', error);
      } finally {
        this.currentCleanup = null;
      }
    }

    this.logger.log('Tag cleanup worker stopped');
  }

  private startWorker() {
    // Run cleanup immediately on startup
    this.currentCleanup = this.cleanupUnusedTags();

    // Schedule periodic cleanup
    this.intervalHandle = setInterval(() => {
      this.currentCleanup = this.cleanupUnusedTags();
    }, this.intervalMs);
  }

  /**
   * Find and delete unused tags.
   *
   * A tag is unused if it exists in kb.tags but no graph_objects reference it.
   * Keep as DataSource.query - uses JSONB ? operator which TypeORM doesn't support
   */
  async cleanupUnusedTags(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Cleanup already in progress, skipping');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Find unused tags (tags in kb.tags that aren't referenced in any graph_objects)
      // Use DataSource.query because of JSONB ? operator
      const unusedQuery = `
                SELECT t.id, t.name, t.project_id
                FROM kb.tags t
                WHERE NOT EXISTS (
                    SELECT 1 
                    FROM kb.graph_objects o
                    WHERE o.deleted_at IS NULL
                      AND o.properties ? 'tags'
                      AND o.properties->'tags' ? t.name
                      AND o.project_id = t.project_id
                )
            `;

      const unusedResult = (await this.dataSource.query(unusedQuery)) as Array<{
        id: string;
        name: string;
        project_id: string;
      }>;
      const unusedCount = unusedResult.length || 0;

      if (unusedCount === 0) {
        this.logger.debug('No unused tags found');
        return;
      }

      // Delete unused tags using TypeORM Repository with IN clause
      const unusedIds = unusedResult.map((row: any) => row.id);
      const deleteResult = await this.tagRepo
        .createQueryBuilder()
        .delete()
        .from(Tag)
        .whereInIds(unusedIds)
        .execute();

      const deletedCount = deleteResult.affected || 0;
      const duration = Date.now() - startTime;

      this.logger.log(
        `Tag cleanup complete: ${deletedCount} unused tags deleted in ${duration}ms`,
        {
          deleted_count: deletedCount,
          duration_ms: duration,
          deleted_tags: unusedResult.map((r: any) => ({
            id: r.id,
            name: r.name,
          })),
        }
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Tag cleanup failed after ${duration}ms`, {
        error: error instanceof Error ? error.message : String(error),
        duration_ms: duration,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manual trigger for cleanup (useful for testing or admin endpoints)
   */
  async triggerCleanup(): Promise<{
    deleted_count: number;
    duration_ms: number;
  }> {
    const startTime = Date.now();
    await this.cleanupUnusedTags();
    return {
      deleted_count: 0, // Would need to return from cleanupUnusedTags
      duration_ms: Date.now() - startTime,
    };
  }
}
