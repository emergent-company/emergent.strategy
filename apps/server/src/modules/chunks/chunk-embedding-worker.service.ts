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
  ChunkEmbeddingJobsService,
  ChunkEmbeddingJobRow,
} from './chunk-embedding-jobs.service';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { Chunk } from '../../entities/chunk.entity';
import { LangfuseService } from '../langfuse/langfuse.service';

/**
 * ChunkEmbeddingWorkerService
 *
 * Periodically dequeues chunk embedding jobs, generates embeddings for chunks
 * that are missing them, and updates the chunks with their embeddings.
 *
 * Similar to EmbeddingWorkerService for graph objects, but handles chunks.
 */
@Injectable()
export class ChunkEmbeddingWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ChunkEmbeddingWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentBatch: Promise<void> | null = null;

  // Metrics (reset on process restart)
  private processedCount = 0;
  private successCount = 0;
  private failureCount = 0;

  constructor(
    @Inject(ChunkEmbeddingJobsService)
    private readonly jobs: ChunkEmbeddingJobsService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @InjectRepository(Chunk)
    private readonly chunkRepo: Repository<Chunk>,
    @Optional()
    @Inject(AppConfigService)
    private readonly config?: AppConfigService,
    @Optional()
    @Inject(EmbeddingsService)
    private readonly embeddings?: EmbeddingsService,
    @Optional()
    private readonly langfuseService?: LangfuseService
  ) {}

  onModuleInit() {
    // Auto-start only if DB online
    if (!this.db.isOnline()) {
      this.logger.warn(
        'Database offline at worker init; chunk embedding worker idle.'
      );
      return;
    }

    // Disable during tests unless explicitly enabled
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_WORKERS_IN_TESTS !== 'true'
    ) {
      this.logger.debug(
        'Chunk embedding worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)'
      );
      return;
    }

    // Only start if embeddings are enabled
    if (!this.config?.embeddingsEnabled) {
      this.logger.warn(
        'Chunk embedding worker not started (EMBEDDING_PROVIDER not set to "vertex" or "google"). Pending embedding jobs will NOT be processed.'
      );
      return;
    }

    this.start();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  start(
    intervalMs: number = parseInt(
      process.env.CHUNK_EMBEDDING_WORKER_INTERVAL_MS || '2000',
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
    this.logger.log(
      `Chunk embedding worker started (interval=${intervalMs}ms)`
    );
  }

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

    this.logger.log('Chunk embedding worker stopped');
  }

  /**
   * Process a batch of chunk embedding jobs.
   * Exposed for testing.
   */
  async processBatch() {
    if (!this.embeddings) {
      this.logger.warn('Embeddings service not available');
      return;
    }

    const batchSize = parseInt(
      process.env.CHUNK_EMBEDDING_WORKER_BATCH || '10',
      10
    );
    const batch: ChunkEmbeddingJobRow[] = await this.jobs.dequeue(batchSize);

    if (!batch.length) return;

    this.logger.debug(`Processing ${batch.length} chunk embedding jobs`);

    for (const job of batch) {
      const startTime = Date.now();

      // Create a trace for this chunk embedding job
      const traceId = this.langfuseService?.createJobTrace(job.id, {
        name: `Chunk Embedding ${job.id}`,
        chunk_id: job.chunk_id,
        job_type: 'chunk_embedding',
      });

      try {
        // Create span for fetching chunk
        const fetchSpan = traceId
          ? this.langfuseService?.createSpan(traceId, 'fetch_chunk', {
              chunk_id: job.chunk_id,
            })
          : null;

        // Fetch chunk text
        const chunk = await this.chunkRepo.findOne({
          where: { id: job.chunk_id },
          select: ['id', 'text'],
        });

        if (!chunk) {
          if (fetchSpan) {
            this.langfuseService?.endSpan(
              fetchSpan,
              { error: 'chunk_missing' },
              'error'
            );
          }
          await this.jobs.markFailed(job.id, new Error('chunk_missing'), 5);
          if (traceId) {
            await this.langfuseService?.finalizeTrace(traceId, 'error', {
              error: 'chunk_missing',
            });
          }
          this.processedCount++;
          this.failureCount++;
          continue;
        }

        if (!chunk.text?.trim()) {
          if (fetchSpan) {
            this.langfuseService?.endSpan(
              fetchSpan,
              { error: 'chunk_empty' },
              'error'
            );
          }
          await this.jobs.markFailed(job.id, new Error('chunk_empty'), 5);
          if (traceId) {
            await this.langfuseService?.finalizeTrace(traceId, 'error', {
              error: 'chunk_empty',
            });
          }
          this.processedCount++;
          this.failureCount++;
          continue;
        }

        const textLength = chunk.text.length;

        if (fetchSpan) {
          this.langfuseService?.endSpan(
            fetchSpan,
            {
              text_length: textLength,
              text_preview: chunk.text.slice(0, 200),
            },
            'success'
          );
        }

        // Create span for embedding generation
        const embedSpan = traceId
          ? this.langfuseService?.createSpan(
              traceId,
              'generate_embedding',
              {
                text_length: textLength,
                provider: 'vertex',
              },
              {
                model: 'text-embedding-004',
                operation: 'chunk_embedding',
              }
            )
          : null;

        const embeddingStartTime = Date.now();

        // Generate embedding
        const embeddings = await this.embeddings.embedDocuments([chunk.text]);
        const embeddingDurationMs = Date.now() - embeddingStartTime;

        if (!embeddings.length || !embeddings[0]?.length) {
          if (embedSpan) {
            this.langfuseService?.endSpan(
              embedSpan,
              {
                error: 'embedding_generation_failed',
                duration_ms: embeddingDurationMs,
              },
              'error'
            );
          }
          await this.jobs.markFailed(
            job.id,
            new Error('embedding_generation_failed'),
            60
          );
          if (traceId) {
            await this.langfuseService?.finalizeTrace(traceId, 'error', {
              error: 'embedding_generation_failed',
            });
          }
          this.processedCount++;
          this.failureCount++;
          continue;
        }

        const embedding = embeddings[0];

        if (embedSpan) {
          this.langfuseService?.endSpan(
            embedSpan,
            {
              dimensions: embedding.length,
              duration_ms: embeddingDurationMs,
            },
            'success'
          );
        }

        // Create span for database update
        const updateSpan = traceId
          ? this.langfuseService?.createSpan(traceId, 'update_embedding', {
              chunk_id: chunk.id,
              dimensions: embedding.length,
            })
          : null;

        // Update chunk with embedding using raw SQL (vector type)
        const vecLiteral =
          '[' +
          embedding
            .map((n) => (Number.isFinite(n) ? String(n) : '0'))
            .join(',') +
          ']';

        await this.db.query(
          `UPDATE kb.chunks SET embedding = $2::vector, updated_at = now() WHERE id = $1`,
          [chunk.id, vecLiteral]
        );

        if (updateSpan) {
          this.langfuseService?.endSpan(
            updateSpan,
            { success: true },
            'success'
          );
        }

        await this.jobs.markCompleted(job.id);

        const totalDurationMs = Date.now() - startTime;

        // Finalize trace with success
        if (traceId) {
          await this.langfuseService?.finalizeTrace(traceId, 'success', {
            chunk_id: chunk.id,
            text_length: textLength,
            embedding_dimensions: embedding.length,
            duration_ms: totalDurationMs,
          });
        }

        this.processedCount++;
        this.successCount++;

        this.logger.debug(
          `Generated embedding for chunk ${chunk.id}: ` +
            `${embedding.length} dims, ${textLength} chars, ${totalDurationMs}ms`
        );
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

        this.logger.warn(
          `Failed to process chunk embedding job ${job.id}: ${errorMessage}`
        );
        await this.jobs.markFailed(job.id, err as Error);
        this.processedCount++;
        this.failureCount++;
      }
    }
  }

  /**
   * Expose metrics snapshot.
   */
  stats() {
    return {
      processed: this.processedCount,
      succeeded: this.successCount,
      failed: this.failureCount,
    };
  }
}
