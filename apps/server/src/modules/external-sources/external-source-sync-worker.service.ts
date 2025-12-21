import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  Optional,
} from '@nestjs/common';
import { trace, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { ExternalSourcesService } from './external-sources.service';
import { DatabaseService } from '../../common/database/database.service';
import { LangfuseService } from '../langfuse/langfuse.service';

/**
 * ExternalSourceSyncWorkerService
 *
 * Background worker that periodically syncs external sources with their
 * remote counterparts (Google Drive, URLs, etc.).
 *
 * Features:
 * - Polls for sources with periodic sync policy that are due for sync
 * - Retries failed sources with exponential backoff
 * - Respects source sync intervals
 * - Graceful shutdown with current batch completion
 *
 * Configuration via environment variables:
 * - EXTERNAL_SOURCE_SYNC_WORKER_ENABLED: Enable/disable worker (default: true)
 * - EXTERNAL_SOURCE_SYNC_WORKER_INTERVAL_MS: Poll interval (default: 60000 = 1 minute)
 * - EXTERNAL_SOURCE_SYNC_WORKER_BATCH: Batch size per tick (default: 10)
 */
@Injectable()
export class ExternalSourceSyncWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExternalSourceSyncWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentBatch: Promise<void> | null = null;

  // Metrics (reset on process restart)
  private processedCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private skippedCount = 0;

  // OpenTelemetry tracer for creating parent spans
  private readonly tracer: Tracer = trace.getTracer(
    'external-source-sync-worker'
  );

  constructor(
    @Inject(ExternalSourcesService)
    private readonly externalSources: ExternalSourcesService,
    @Inject(DatabaseService)
    private readonly db: DatabaseService,
    @Optional()
    private readonly langfuseService?: LangfuseService
  ) {}

  onModuleInit() {
    // Check if worker is explicitly disabled
    if (process.env.EXTERNAL_SOURCE_SYNC_WORKER_ENABLED === 'false') {
      this.logger.log('External source sync worker disabled via environment');
      return;
    }

    // Auto-start only if DB online
    if (!this.db.isOnline()) {
      this.logger.warn(
        'Database offline at worker init; external source sync worker idle.'
      );
      return;
    }

    // Disable during tests unless explicitly enabled
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_WORKERS_IN_TESTS !== 'true'
    ) {
      this.logger.debug(
        'External source sync worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)'
      );
      return;
    }

    this.start();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  /**
   * Start the polling loop
   */
  start(
    intervalMs: number = parseInt(
      process.env.EXTERNAL_SOURCE_SYNC_WORKER_INTERVAL_MS || '60000',
      10
    )
  ) {
    if (this.timer) return; // already started
    this.running = true;

    const tick = async () => {
      if (!this.running) return;
      try {
        this.currentBatch = this.processBatch();
        await this.currentBatch;
      } catch (e) {
        this.logger.warn('processBatch failed: ' + (e as Error).message);
      } finally {
        this.currentBatch = null;
      }
      this.timer = setTimeout(tick, intervalMs);
    };

    // Start after a short delay to allow other services to initialize
    this.timer = setTimeout(tick, 5000);
    this.logger.log(
      `External source sync worker started (interval=${intervalMs}ms)`
    );
  }

  /**
   * Stop the worker gracefully
   */
  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;

    // Wait for current batch to finish
    if (this.currentBatch) {
      this.logger.debug(
        'Waiting for current batch to complete before stopping...'
      );
      try {
        await this.currentBatch;
      } catch (error) {
        this.logger.warn('Current batch failed during shutdown', error);
      }
    }

    this.logger.log('External source sync worker stopped');
  }

  /**
   * Process a batch of sources due for sync
   */
  async processBatch() {
    return this.tracer.startActiveSpan(
      'external-source-sync-worker.processBatch',
      async (batchSpan) => {
        try {
          const batchSize = parseInt(
            process.env.EXTERNAL_SOURCE_SYNC_WORKER_BATCH || '10',
            10
          );

          // Get sources that are due for periodic sync
          const sources = await this.externalSources.getSourcesDueForSync(
            batchSize
          );

          batchSpan.setAttribute('batch.config_size', batchSize);
          batchSpan.setAttribute('batch.actual_size', sources.length);

          if (!sources.length) {
            batchSpan.setAttribute('batch.empty', true);
            batchSpan.setStatus({ code: SpanStatusCode.OK });
            return;
          }

          this.logger.debug(
            `Processing ${sources.length} external source sync(s)`
          );

          for (const source of sources) {
            await this.processSingleSource(source, batchSpan);
          }

          batchSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          batchSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
          batchSpan.recordException(err);
          throw error;
        } finally {
          batchSpan.end();
        }
      }
    );
  }

  /**
   * Process a single source sync with tracing
   */
  private async processSingleSource(
    source: Awaited<
      ReturnType<ExternalSourcesService['getSourcesDueForSync']>
    >[0],
    _parentSpan: any
  ) {
    const startTime = Date.now();

    // Create trace for this sync operation
    const traceId = this.langfuseService?.createJobTrace(
      source.id,
      {
        name: `External Source Sync: ${
          source.displayName || source.normalizedUrl
        }`,
        source_id: source.id,
        provider_type: source.providerType,
        normalized_url: source.normalizedUrl,
        job_type: 'external_source_sync',
      },
      undefined,
      'external-source-sync'
    );

    try {
      // Create span for sync operation
      const syncSpan = traceId
        ? this.langfuseService?.createSpan(traceId, 'sync_source', {
            source_id: source.id,
            provider_type: source.providerType,
            last_synced_at: source.lastSyncedAt?.toISOString(),
          })
        : null;

      const result = await this.externalSources.syncSource(source.id, {
        force: false,
      });

      const durationMs = Date.now() - startTime;

      if (syncSpan) {
        this.langfuseService?.endSpan(
          syncSpan,
          {
            success: result.success,
            updated: result.updated,
            document_id: result.documentId,
            duration_ms: durationMs,
          },
          result.success ? 'success' : 'error'
        );
      }

      if (result.success) {
        this.processedCount++;
        this.successCount++;

        if (result.updated) {
          this.logger.log(
            `Synced external source ${source.id} (${
              source.displayName || source.normalizedUrl
            }): ` + `new document ${result.documentId}, ${durationMs}ms`
          );
        } else {
          this.skippedCount++;
          this.logger.debug(
            `External source ${source.id} up-to-date, no changes`
          );
        }

        if (traceId) {
          await this.langfuseService?.finalizeTrace(traceId, 'success', {
            updated: result.updated,
            document_id: result.documentId,
            duration_ms: durationMs,
          });
        }
      } else {
        this.processedCount++;
        this.failureCount++;

        this.logger.warn(
          `Failed to sync external source ${source.id}: ${result.error}`
        );

        if (traceId) {
          await this.langfuseService?.finalizeTrace(traceId, 'error', {
            error: result.error,
            duration_ms: durationMs,
          });
        }
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.processedCount++;
      this.failureCount++;

      this.logger.error(
        `Error syncing external source ${source.id}: ${errorMessage}`
      );

      if (traceId) {
        await this.langfuseService?.finalizeTrace(traceId, 'error', {
          error: errorMessage,
          duration_ms: durationMs,
        });
      }
    }
  }

  /**
   * Process sources that failed and need retry
   */
  private async processRetries(batchSize: number) {
    const retryInterval = parseInt(
      process.env.EXTERNAL_SOURCE_RETRY_INTERVAL_MS || '300000', // 5 minutes default
      10
    );

    // Only process retries occasionally (every 5th batch by default)
    if (this.processedCount % 5 !== 0) {
      return;
    }

    const sources = await this.externalSources.getSourcesForRetry(
      Math.floor(batchSize / 2)
    );

    if (!sources.length) {
      return;
    }

    this.logger.debug(`Processing ${sources.length} external source retry(s)`);

    for (const source of sources) {
      // Skip if not enough time has passed since last error (exponential backoff)
      if (source.lastErrorAt) {
        const timeSinceError = Date.now() - source.lastErrorAt.getTime();
        const backoffMs = Math.min(
          retryInterval * Math.pow(2, source.errorCount - 1),
          3600000 // Max 1 hour
        );

        if (timeSinceError < backoffMs) {
          continue;
        }
      }

      const startTime = Date.now();

      try {
        const result = await this.externalSources.syncSource(source.id, {
          force: true, // Force retry even if not updated
        });

        if (result.success) {
          this.logger.log(
            `Retry succeeded for external source ${source.id} after ${source.errorCount} errors`
          );
        } else {
          this.logger.warn(
            `Retry failed for external source ${source.id}: ${result.error}`
          );
        }
      } catch (err) {
        this.logger.error(
          `Retry error for external source ${source.id}: ${err}`
        );
      }
    }
  }

  /**
   * Get worker statistics
   */
  stats() {
    return {
      running: this.running,
      processed: this.processedCount,
      succeeded: this.successCount,
      failed: this.failureCount,
      skipped: this.skippedCount,
    };
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Manually trigger a sync batch (for testing/admin)
   */
  async triggerBatch(): Promise<void> {
    if (this.currentBatch) {
      throw new Error('A batch is already being processed');
    }
    await this.processBatch();
  }
}
