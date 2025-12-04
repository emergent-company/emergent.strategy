import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { ChunkEmbeddingJob } from '../../entities/chunk-embedding-job.entity';

export interface ChunkEmbeddingJobRow {
  id: string;
  chunk_id: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  priority: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ChunkEmbeddingJobStatus =
  | 'pending'
  | 'processing'
  | 'failed'
  | 'completed';

export interface EnqueueChunkEmbeddingJobOptions {
  priority?: number;
  scheduleAt?: Date;
}

/**
 * ChunkEmbeddingJobsService - Job queue for chunk embedding generation
 *
 * Similar to EmbeddingJobsService for graph objects, this service manages
 * a job queue for generating chunk embeddings asynchronously.
 *
 * This enables retry logic when embedding generation fails during document upload,
 * ensuring chunks eventually get embeddings even if Vertex AI is temporarily unavailable.
 */
@Injectable()
export class ChunkEmbeddingJobsService {
  private readonly logger = new Logger(ChunkEmbeddingJobsService.name);

  constructor(
    @InjectRepository(ChunkEmbeddingJob)
    private readonly jobRepository: Repository<ChunkEmbeddingJob>,
    private readonly dataSource: DataSource,
    private readonly db: DatabaseService
  ) {}

  /**
   * Enqueue a chunk for embedding generation.
   * Idempotent: if an active job exists, returns it instead of creating a new one.
   */
  async enqueue(
    chunkId: string,
    opts: EnqueueChunkEmbeddingJobOptions = {}
  ): Promise<ChunkEmbeddingJobRow | null> {
    // Check for existing active job
    const existing = await this.jobRepository.findOne({
      where: {
        chunkId,
        status: In(['pending', 'processing']),
      },
    });

    if (existing) {
      return this.toRow(existing);
    }

    const priority = opts.priority ?? 0;
    const scheduleAt = opts.scheduleAt ?? new Date();

    const job = this.jobRepository.create({
      chunkId,
      status: 'pending',
      attemptCount: 0,
      priority,
      scheduledAt: scheduleAt,
    });

    const saved = await this.jobRepository.save(job);
    return this.toRow(saved);
  }

  /**
   * Enqueue multiple chunks for embedding generation.
   * Useful for batch operations after document upload failure.
   */
  async enqueueBatch(
    chunkIds: string[],
    opts: EnqueueChunkEmbeddingJobOptions = {}
  ): Promise<number> {
    if (!chunkIds.length) return 0;

    // Find existing active jobs to avoid duplicates
    const existingJobs = await this.jobRepository.find({
      where: {
        chunkId: In(chunkIds),
        status: In(['pending', 'processing']),
      },
      select: ['chunkId'],
    });

    const existingChunkIds = new Set(existingJobs.map((j) => j.chunkId));
    const newChunkIds = chunkIds.filter((id) => !existingChunkIds.has(id));

    if (!newChunkIds.length) return 0;

    const priority = opts.priority ?? 0;
    const scheduleAt = opts.scheduleAt ?? new Date();

    const jobs = newChunkIds.map((chunkId) =>
      this.jobRepository.create({
        chunkId,
        status: 'pending',
        attemptCount: 0,
        priority,
        scheduledAt: scheduleAt,
      })
    );

    await this.jobRepository.save(jobs);
    return jobs.length;
  }

  /**
   * Dequeue jobs for processing.
   *
   * Uses FOR UPDATE SKIP LOCKED for concurrent worker safety.
   * This is strategic SQL that cannot be expressed in TypeORM.
   */
  async dequeue(batchSize = 10): Promise<ChunkEmbeddingJobRow[]> {
    const res = await this.db.query<ChunkEmbeddingJobRow>(
      `WITH cte AS (
         SELECT id FROM kb.chunk_embedding_jobs
         WHERE status='pending' AND scheduled_at <= now()
         ORDER BY priority DESC, scheduled_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE kb.chunk_embedding_jobs j SET status='processing', started_at=now(), updated_at=now()
       FROM cte WHERE j.id = cte.id
       RETURNING j.id, j.chunk_id, j.status, j.attempt_count, j.last_error, j.priority, j.scheduled_at, j.started_at, j.completed_at, j.created_at, j.updated_at`,
      [batchSize]
    );
    return res.rows;
  }

  /**
   * Mark a job as failed and schedule for retry with exponential backoff.
   */
  async markFailed(
    id: string,
    error: Error,
    retryDelaySec = 60
  ): Promise<void> {
    const job = await this.jobRepository.findOne({
      where: { id },
      select: ['id', 'attemptCount'],
    });

    if (!job) return;

    const attempt = (job.attemptCount || 0) + 1;
    const maxAttempts = 5;

    if (attempt >= maxAttempts) {
      // Mark as permanently failed after max attempts
      await this.jobRepository.update(id, {
        status: 'failed',
        attemptCount: attempt,
        lastError: error.message.slice(0, 500),
      });
      this.logger.warn(
        `Chunk embedding job ${id} permanently failed after ${attempt} attempts: ${error.message}`
      );
      return;
    }

    // Exponential backoff: 60s, 240s, 540s, 960s (capped at 1h)
    const delay = Math.min(3600, retryDelaySec * attempt * attempt);

    await this.dataSource.query(
      `UPDATE kb.chunk_embedding_jobs 
       SET status='pending', attempt_count=$2, last_error=$3, 
           scheduled_at=now() + ($4 || ' seconds')::interval, 
           updated_at=now() 
       WHERE id=$1`,
      [id, attempt, error.message.slice(0, 500), delay.toString()]
    );
  }

  /**
   * Mark a job as completed.
   */
  async markCompleted(id: string): Promise<void> {
    await this.jobRepository.update(id, {
      status: 'completed',
      completedAt: new Date(),
    });
  }

  /**
   * Get queue statistics.
   */
  async stats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
  }> {
    const [pending, processing, failed, completed] = await Promise.all([
      this.jobRepository.count({ where: { status: 'pending' } }),
      this.jobRepository.count({ where: { status: 'processing' } }),
      this.jobRepository.count({ where: { status: 'failed' } }),
      this.jobRepository.count({ where: { status: 'completed' } }),
    ]);

    return { pending, processing, failed, completed };
  }

  /**
   * Get active job status for a specific chunk.
   */
  async getJobStatusForChunk(
    chunkId: string
  ): Promise<ChunkEmbeddingJobRow | null> {
    const job = await this.jobRepository.findOne({
      where: {
        chunkId,
        status: In(['pending', 'processing']),
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!job) return null;
    return this.toRow(job);
  }

  /**
   * Get pending job count for multiple chunks (for UI status display).
   */
  async getPendingCountForChunks(
    chunkIds: string[]
  ): Promise<Map<string, number>> {
    if (!chunkIds.length) return new Map();

    const result = await this.jobRepository
      .createQueryBuilder('job')
      .select('job.chunkId', 'chunk_id')
      .addSelect('COUNT(*)', 'count')
      .where('job.chunkId IN (:...chunkIds)', { chunkIds })
      .andWhere('job.status IN (:...statuses)', {
        statuses: ['pending', 'processing'],
      })
      .groupBy('job.chunkId')
      .getRawMany<{ chunk_id: string; count: string }>();

    const map = new Map<string, number>();
    for (const row of result) {
      map.set(row.chunk_id, parseInt(row.count, 10));
    }
    return map;
  }

  private toRow(job: ChunkEmbeddingJob): ChunkEmbeddingJobRow {
    return {
      id: job.id,
      chunk_id: job.chunkId,
      status: job.status,
      attempt_count: job.attemptCount,
      last_error: job.lastError,
      priority: job.priority,
      scheduled_at: job.scheduledAt.toISOString(),
      started_at: job.startedAt?.toISOString() ?? null,
      completed_at: job.completedAt?.toISOString() ?? null,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
    };
  }
}
