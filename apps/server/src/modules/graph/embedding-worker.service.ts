import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EmbeddingJobsService,
  EmbeddingJobRow,
} from './embedding-jobs.service';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import {
  EmbeddingProvider,
  DummySha256EmbeddingProvider,
} from './embedding.provider';
import { GraphObject } from '../../entities/graph-object.entity';
import { LangfuseService } from '../langfuse/langfuse.service';
import { EventsService } from '../events/events.service';
import { trace, SpanStatusCode, Tracer } from '@opentelemetry/api';

/**
 * EmbeddingWorkerService
 * Periodically dequeues embedding jobs, computes embeddings for graph object rows lacking them,
 * writes embedding + timestamp back, and marks jobs completed. Failures are requeued with backoff
 * via EmbeddingJobsService.markFailed.
 *
 * Current implementation uses a deterministic faux embedding (sha256->bytes) when a real provider key
 * is not present. If GOOGLE_API_KEY (embeddingsEnabled) is set, this is where integration with a
 * real embedding provider would be wired (placeholder method generateEmbeddingFromText).
 *
 * Migrated to TypeORM - uses Repository for SELECT and UPDATE
 */
@Injectable()
export class EmbeddingWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingWorkerService.name);
  private readonly tracer: Tracer = trace.getTracer('embedding-worker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentBatch: Promise<void> | null = null;
  // Lightweight in-memory metrics (reset on process restart). Suitable for tests & basic diagnostics.
  private processedCount = 0;
  private successCount = 0;
  private failureCount = 0;

  constructor(
    @Inject(EmbeddingJobsService) private readonly jobs: EmbeddingJobsService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @InjectRepository(GraphObject)
    private readonly graphObjectRepo: Repository<GraphObject>,
    @Optional()
    @Inject(AppConfigService)
    private readonly config?: AppConfigService,
    @Optional()
    @Inject('EMBEDDING_PROVIDER')
    private readonly provider?: EmbeddingProvider,
    @Optional()
    private readonly langfuseService?: LangfuseService,
    @Optional()
    @Inject(EventsService)
    private readonly eventsService?: EventsService
  ) {}

  onModuleInit() {
    // Auto-start only if DB online; otherwise job processing is meaningless.
    if (!this.db.isOnline()) {
      this.logger.warn(
        'Database offline at worker init; embedding worker idle.'
      );
      return;
    }

    // Disable during tests unless explicitly enabled
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_WORKERS_IN_TESTS !== 'true'
    ) {
      this.logger.debug(
        'Embedding worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)'
      );
      return;
    }

    // Recover any jobs that got stuck in 'processing' from a previous server restart
    this.recoverStaleJobsOnStartup();

    this.start();
  }

  /**
   * Recover stale jobs on startup.
   * Runs async in background so it doesn't block module init.
   */
  private async recoverStaleJobsOnStartup() {
    try {
      const recovered = await this.jobs.recoverStaleJobs();
      if (recovered > 0) {
        this.logger.log(
          `Recovered ${recovered} stale graph embedding job(s) on startup`
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to recover stale jobs on startup: ${(err as Error).message}`
      );
    }
  }

  async onModuleDestroy() {
    await this.stop();
  }

  start(
    intervalMs: number = parseInt(
      process.env.EMBEDDING_WORKER_INTERVAL_MS || '2000',
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
    this.timer = setTimeout(tick, intervalMs);
    this.logger.log(`Embedding worker started (interval=${intervalMs}ms)`);
  }

  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;

    // Wait for current batch to finish to avoid orphaned promises
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

    this.logger.log('Embedding worker stopped');
  }

  // Exposed for tests (invoke directly to avoid timer delay) - Migrated to TypeORM
  async processBatch() {
    return this.tracer.startActiveSpan(
      'embedding-worker.processBatch',
      async (batchSpan) => {
        try {
          if (!this.config?.embeddingsEnabled) {
            // Still allow dummy embedding so queued jobs drain; if we want strict gating, return early instead.
          }
          const batch: EmbeddingJobRow[] = await this.jobs.dequeue(
            parseInt(process.env.EMBEDDING_WORKER_BATCH || '5', 10)
          );

          batchSpan.setAttribute('batch.size', batch.length);

          if (!batch.length) {
            batchSpan.setStatus({ code: SpanStatusCode.OK });
            return;
          }

          for (const job of batch) {
            await this.processJob(job);
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
   * Process a single embedding job with OTEL tracing
   */
  private async processJob(job: EmbeddingJobRow) {
    return this.tracer.startActiveSpan(
      'embedding-worker.processJob',
      { attributes: { 'job.id': job.id, 'job.object_id': job.object_id } },
      async (jobSpan) => {
        const startTime = Date.now();

        // Create a trace for this embedding job
        // Use short object_id (last 12 chars) for readability, full ID in metadata
        const shortObjectId = job.object_id.split('-').pop() || job.object_id;
        const traceId = this.langfuseService?.createJobTrace(
          job.id,
          {
            name: `Graph Object Embedding ${shortObjectId}`,
            object_id: job.object_id,
            job_type: 'graph_object_embedding',
          },
          undefined, // environment (use default)
          'embedding' // traceType for filtering
        );

        // Track projectId for error event emission
        let projectId: string | null = null;

        try {
          // Use TypeORM to fetch graph object
          const obj = await this.graphObjectRepo.findOne({
            where: { id: job.object_id },
            select: ['id', 'properties', 'type', 'key', 'projectId'],
          });

          if (!obj) {
            await this.jobs.markFailed(job.id, new Error('object_missing'), 5);
            if (traceId) {
              await this.langfuseService?.finalizeTrace(traceId, 'error', {
                error: 'object_missing',
              });
            }
            jobSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'object_missing',
            });
            jobSpan.end();
            return;
          }

          jobSpan.setAttribute('object.type', obj.type);
          jobSpan.setAttribute('object.key', obj.key || '');

          // Store projectId for error event emission
          projectId = obj.projectId;

          // Emit real-time event: embedding job started processing
          if (this.eventsService && obj.projectId) {
            this.eventsService.emitUpdated(
              'graph_object',
              obj.id,
              obj.projectId,
              {
                embeddingStatus: 'processing',
                embeddingJobId: job.id,
              }
            );
          }

          // Create span for text extraction
          const extractSpan = traceId
            ? this.langfuseService?.createSpan(traceId, 'extract_text', {
                object_id: obj.id,
                object_type: obj.type,
                object_key: obj.key,
              })
            : null;

          const text = this.extractText(obj);
          const textLength = text.length;
          jobSpan.setAttribute('text.length', textLength);

          if (extractSpan) {
            this.langfuseService?.endSpan(
              extractSpan,
              { text_length: textLength, text_preview: text.slice(0, 200) },
              'success'
            );
          }

          // Create embedding generation observation (supports token/cost tracking)
          const embedGeneration = traceId
            ? this.langfuseService?.createEmbeddingGeneration(
                traceId,
                'generate_embedding',
                {
                  text_length: textLength,
                  text_preview: text.slice(0, 500),
                  provider: this.provider ? 'vertex' : 'dummy_sha256',
                },
                this.provider ? 'text-embedding-004' : 'dummy-sha256',
                {
                  operation: 'graph_object_embedding',
                  object_id: obj.id,
                  object_type: obj.type,
                }
              )
            : null;

          const embeddingStartTime = Date.now();
          const embeddingProvider =
            this.provider || new DummySha256EmbeddingProvider();
          const embeddingResult = await embeddingProvider.generate(text);
          const embeddingDurationMs = Date.now() - embeddingStartTime;

          jobSpan.setAttribute(
            'embedding.dimensions',
            embeddingResult.embedding.length
          );
          jobSpan.setAttribute('embedding.duration_ms', embeddingDurationMs);

          // Update embedding generation with output and usage
          if (embedGeneration) {
            this.langfuseService?.updateEmbeddingGeneration(
              embedGeneration,
              {
                dimensions: embeddingResult.embedding.length,
                duration_ms: embeddingDurationMs,
                model: embeddingResult.model,
              },
              embeddingResult.usage
                ? {
                    input: embeddingResult.usage.promptTokens,
                    total: embeddingResult.usage.totalTokens,
                  }
                : undefined,
              embeddingResult.model,
              'success'
            );
          }

          // Create span for database update
          const updateSpan = traceId
            ? this.langfuseService?.createSpan(traceId, 'update_embedding', {
                object_id: obj.id,
                dimensions: embeddingResult.embedding.length,
              })
            : null;

          // Use TypeORM to update embedding_v2 (768 dimensions)
          // Fixed: Previously wrote to 'embedding' (bytea) but search reads from vector column
          // See: docs/bugs/004-embedding-column-mismatch.md
          await this.graphObjectRepo.update(
            { id: obj.id },
            {
              embeddingV2: embeddingResult.embedding,
              embeddingUpdatedAt: new Date(),
            }
          );

          if (updateSpan) {
            this.langfuseService?.endSpan(
              updateSpan,
              { success: true },
              'success'
            );
          }

          await this.jobs.markCompleted(job.id);

          // Emit real-time event: embedding completed successfully
          if (this.eventsService && obj.projectId) {
            this.eventsService.emitUpdated(
              'graph_object',
              obj.id,
              obj.projectId,
              {
                embeddingStatus: 'completed',
                hasEmbedding: true,
                embeddingDimensions: embeddingResult.embedding.length,
              }
            );
          }

          const totalDurationMs = Date.now() - startTime;

          // Finalize trace with success
          if (traceId) {
            await this.langfuseService?.finalizeTrace(traceId, 'success', {
              object_id: obj.id,
              object_type: obj.type,
              text_length: textLength,
              embedding_dimensions: embeddingResult.embedding.length,
              model: embeddingResult.model,
              usage: embeddingResult.usage,
              duration_ms: totalDurationMs,
            });
          }

          this.logger.debug(
            `Generated embedding for graph object ${obj.id} (${obj.type}): ` +
              `${embeddingResult.embedding.length} dims, ${textLength} chars, ${totalDurationMs}ms`
          );

          this.processedCount++;
          this.successCount++;
          jobSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          const totalDurationMs = Date.now() - startTime;
          const errorMessage = err instanceof Error ? err.message : String(err);

          // Finalize trace with error
          if (traceId) {
            await this.langfuseService?.finalizeTrace(traceId, 'error', {
              error: errorMessage,
              duration_ms: totalDurationMs,
            });
          }

          // Emit real-time event: embedding failed
          // Only emit if we have projectId (i.e., object was found)
          if (this.eventsService && projectId) {
            this.eventsService.emitUpdated(
              'graph_object',
              job.object_id,
              projectId,
              {
                embeddingStatus: 'failed',
                embeddingError: errorMessage,
              }
            );
          }

          await this.jobs.markFailed(job.id, err as Error);
          this.processedCount++;
          this.failureCount++;

          const error = err instanceof Error ? err : new Error(String(err));
          jobSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          });
          jobSpan.recordException(error);
        } finally {
          jobSpan.end();
        }
      }
    );
  }

  private extractText(row: {
    properties: any;
    type: string;
    key: string | null;
  }): string {
    const props = row.properties || {};
    // Simple heuristic: join primitive leaf values (string / number / boolean) depth-first.
    const tokens: string[] = [row.type];
    if (row.key) tokens.push(row.key);
    const walk = (v: any) => {
      if (v == null) return;
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        tokens.push(String(v));
        return;
      }
      if (Array.isArray(v)) {
        for (const x of v) walk(x);
        return;
      }
      if (typeof v === 'object') {
        for (const val of Object.values(v)) walk(val);
      }
    };
    walk(props);
    return tokens.join(' ');
  }

  // Expose metrics snapshot (immutable copy)
  stats() {
    return {
      processed: this.processedCount,
      succeeded: this.successCount,
      failed: this.failureCount,
    };
  }
}
