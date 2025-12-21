import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { trace, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { DataSource } from 'typeorm';

/**
 * Background worker that periodically refreshes the materialized view
 * containing revision counts for all graph objects.
 *
 * This ensures the revision_count field stays current as objects are
 * created, updated, or deleted.
 *
 * Configuration:
 * - REVISION_COUNT_REFRESH_INTERVAL_MS: Refresh interval in milliseconds (default: 300000 = 5 minutes)
 *
 * Migrated to TypeORM - uses DataSource.query for PostgreSQL function calls
 */
@Injectable()
export class RevisionCountRefreshWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RevisionCountRefreshWorkerService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private currentRefresh: Promise<number> | null = null;
  private readonly refreshIntervalMs: number;

  // OpenTelemetry tracer for creating parent spans
  private readonly tracer: Tracer = trace.getTracer(
    'revision-count-refresh-worker'
  );

  constructor(private readonly dataSource: DataSource) {
    this.refreshIntervalMs = parseInt(
      process.env.REVISION_COUNT_REFRESH_INTERVAL_MS || '300000',
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
        'Revision count refresh worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)'
      );
      return;
    }

    this.logger.log(
      `Revision count refresh worker starting (interval=${this.refreshIntervalMs}ms)`
    );
    this.startRefreshLoop();
  }

  async onModuleDestroy() {
    this.logger.log('Revision count refresh worker stopping');
    await this.stopRefreshLoop();
  }

  private startRefreshLoop() {
    // Run immediately on startup
    this.currentRefresh = this.refreshRevisionCounts();
    this.currentRefresh.catch((err) => {
      this.logger.error('Initial revision count refresh failed:', err);
    });

    // Then run periodically
    this.intervalHandle = setInterval(() => {
      this.currentRefresh = this.refreshRevisionCounts();
      this.currentRefresh.catch((err) => {
        this.logger.error('Scheduled revision count refresh failed:', err);
      });
    }, this.refreshIntervalMs);
  }

  private async stopRefreshLoop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    // Wait for current refresh to finish to avoid orphaned promises
    if (this.currentRefresh) {
      this.logger.debug(
        'Waiting for current refresh to complete before stopping...'
      );
      try {
        await this.currentRefresh;
      } catch (error) {
        this.logger.warn('Current refresh failed during shutdown', error);
      } finally {
        this.currentRefresh = null;
      }
    }
  }

  /**
   * Refreshes the materialized view containing revision counts.
   * Uses CONCURRENTLY to avoid blocking other queries, but falls back
   * to non-concurrent refresh if the view is not yet populated.
   * Keep as DataSource.query - calls PostgreSQL function
   *
   * @returns Promise<number> Number of objects tracked after refresh
   */
  async refreshRevisionCounts(): Promise<number> {
    return this.tracer.startActiveSpan(
      'revision-count-refresh-worker.refreshRevisionCounts',
      async (span) => {
        const startTime = Date.now();

        try {
          this.logger.debug('Starting revision count refresh...');

          // Call the helper function created in migration 0006
          const result = (await this.dataSource.query(
            'SELECT kb.refresh_revision_counts() as refresh_result'
          )) as Array<{ refresh_result: number }>;

          const objectCount = result[0]?.refresh_result || 0;
          const durationMs = Date.now() - startTime;

          span.setAttribute('objects.count', objectCount);
          span.setAttribute('duration_ms', durationMs);
          span.setStatus({ code: SpanStatusCode.OK });

          this.logger.log(
            `Revision count refresh complete: ${objectCount} objects tracked (took ${durationMs}ms)`
          );

          return objectCount;
        } catch (error) {
          const durationMs = Date.now() - startTime;

          // Handle the case where CONCURRENTLY fails because view is not populated
          if (
            error instanceof Error &&
            error.message.includes(
              'CONCURRENTLY cannot be used when the materialized view is not populated'
            )
          ) {
            this.logger.warn(
              'Materialized view not populated, performing initial non-concurrent refresh...'
            );

            span.setAttribute('fallback', true);

            try {
              // Perform initial non-concurrent refresh to populate the view
              await this.dataSource.query(
                'REFRESH MATERIALIZED VIEW kb.graph_object_revision_counts'
              );

              const result = (await this.dataSource.query(
                'SELECT COUNT(*) as count FROM kb.graph_object_revision_counts'
              )) as Array<{ count: string }>;

              const objectCount = parseInt(result[0]?.count || '0', 10);
              const totalDurationMs = Date.now() - startTime;

              span.setAttribute('objects.count', objectCount);
              span.setAttribute('duration_ms', totalDurationMs);
              span.setStatus({ code: SpanStatusCode.OK });

              this.logger.log(
                `Initial revision count refresh complete: ${objectCount} objects tracked (took ${totalDurationMs}ms)`
              );

              return objectCount;
            } catch (initError) {
              const err =
                initError instanceof Error
                  ? initError
                  : new Error(String(initError));
              span.setAttribute('duration_ms', Date.now() - startTime);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              span.recordException(err);

              this.logger.error(
                `Initial revision count refresh also failed after ${
                  Date.now() - startTime
                }ms:`,
                err.message
              );
              throw initError;
            }
          }

          const err = error instanceof Error ? error : new Error(String(error));
          span.setAttribute('duration_ms', durationMs);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          span.recordException(err);

          this.logger.error(
            `Revision count refresh failed after ${durationMs}ms:`,
            err.message
          );
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }

  /**
   * Manual trigger for testing or admin operations.
   * Can be called via API endpoint if needed.
   */
  async triggerRefresh(): Promise<number> {
    this.logger.log('Manual revision count refresh triggered');
    return this.refreshRevisionCounts();
  }

  /**
   * Get current statistics from the materialized view.
   * Useful for monitoring and debugging.
   * Keep as DataSource.query - uses COUNT FILTER which TypeORM QueryBuilder doesn't support well
   */
  async getStatistics(): Promise<{
    total_objects: number;
    avg_revisions: number;
    max_revisions: number;
    objects_with_multiple_versions: number;
  }> {
    const result = (await this.dataSource.query(`
      SELECT 
        COUNT(*) as total_objects,
        AVG(revision_count) as avg_revisions,
        MAX(revision_count) as max_revisions,
        COUNT(*) FILTER (WHERE revision_count > 1) as objects_with_multiple_versions
      FROM kb.graph_object_revision_counts
    `)) as Array<{
      total_objects: string;
      avg_revisions: string;
      max_revisions: number;
      objects_with_multiple_versions: string;
    }>;

    const row = result[0];
    return {
      total_objects: parseInt(row.total_objects, 10),
      avg_revisions: parseFloat(row.avg_revisions),
      max_revisions: row.max_revisions,
      objects_with_multiple_versions: parseInt(
        row.objects_with_multiple_versions,
        10
      ),
    };
  }
}
