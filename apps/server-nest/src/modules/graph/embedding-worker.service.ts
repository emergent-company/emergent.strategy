import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { EmbeddingJobsService, EmbeddingJobRow } from './embedding-jobs.service';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { EmbeddingProvider, DummySha256EmbeddingProvider } from './embedding.provider';

/**
 * EmbeddingWorkerService
 * Periodically dequeues embedding jobs, computes embeddings for graph object rows lacking them,
 * writes embedding + timestamp back, and marks jobs completed. Failures are requeued with backoff
 * via EmbeddingJobsService.markFailed.
 *
 * Current implementation uses a deterministic faux embedding (sha256->bytes) when a real provider key
 * is not present. If GOOGLE_API_KEY (embeddingsEnabled) is set, this is where integration with a
 * real embedding provider would be wired (placeholder method generateEmbeddingFromText).
 */
@Injectable()
export class EmbeddingWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(EmbeddingWorkerService.name);
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
        @Optional() @Inject(AppConfigService) private readonly config?: AppConfigService,
        @Optional() @Inject('EMBEDDING_PROVIDER') private readonly provider?: EmbeddingProvider,
    ) { }

    onModuleInit() {
        // Auto-start only if DB online; otherwise job processing is meaningless.
        if (!this.db.isOnline()) {
            this.logger.warn('Database offline at worker init; embedding worker idle.');
            return;
        }

        // Disable during tests unless explicitly enabled
        if (process.env.NODE_ENV === 'test' && process.env.ENABLE_WORKERS_IN_TESTS !== 'true') {
            this.logger.debug('Embedding worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)');
            return;
        }

        this.start();
    }

    async onModuleDestroy() { await this.stop(); }

    start(intervalMs: number = parseInt(process.env.EMBEDDING_WORKER_INTERVAL_MS || '2000', 10)) {
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
            this.logger.debug('Waiting for current batch to complete before stopping...');
            try {
                await this.currentBatch;
            } catch (error) {
                this.logger.warn('Current batch failed during shutdown', error);
            }
        }

        this.logger.log('Embedding worker stopped');
    }

    // Exposed for tests (invoke directly to avoid timer delay)
    async processBatch() {
        if (!this.config?.embeddingsEnabled) {
            // Still allow dummy embedding so queued jobs drain; if we want strict gating, return early instead.
        }
        const batch: EmbeddingJobRow[] = await this.jobs.dequeue(parseInt(process.env.EMBEDDING_WORKER_BATCH || '5', 10));
        if (!batch.length) return;
        for (const job of batch) {
            try {
                const objRes = await this.db.query<{ id: string; properties: any; type: string; key: string | null }>(`SELECT id, properties, type, key FROM kb.graph_objects WHERE id=$1`, [job.object_id]);
                if (!objRes.rowCount) {
                    await this.jobs.markFailed(job.id, new Error('object_missing'), 5); continue;
                }
                const row = objRes.rows[0];
                const text = this.extractText(row);
                const embeddingProvider = this.provider || new DummySha256EmbeddingProvider();
                const embedding = await embeddingProvider.generate(text);
                await this.db.query(`UPDATE kb.graph_objects SET embedding=$2, embedding_updated_at=now() WHERE id=$1`, [row.id, embedding]);
                await this.jobs.markCompleted(job.id);
                this.processedCount++; this.successCount++;
            } catch (err) {
                await this.jobs.markFailed(job.id, err as Error);
                this.processedCount++; this.failureCount++;
            }
        }
    }

    private extractText(row: { properties: any; type: string; key: string | null }): string {
        const props = row.properties || {};
        // Simple heuristic: join primitive leaf values (string / number / boolean) depth-first.
        const tokens: string[] = [row.type];
        if (row.key) tokens.push(row.key);
        const walk = (v: any) => {
            if (v == null) return;
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') { tokens.push(String(v)); return; }
            if (Array.isArray(v)) { for (const x of v) walk(x); return; }
            if (typeof v === 'object') { for (const val of Object.values(v)) walk(val); }
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
