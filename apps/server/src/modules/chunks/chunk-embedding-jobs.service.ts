import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import {
  BaseJobQueueService,
  BaseJobRow,
  EnqueueJobOptions,
} from '../../common/job-queue/base-job-queue.service';
import { ChunkEmbeddingJob } from '../../entities/chunk-embedding-job.entity';

export interface ChunkEmbeddingJobRow extends BaseJobRow {
  chunk_id: string;
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
 * Extends BaseJobQueueService to provide:
 * - Idempotent enqueue (won't create duplicate active jobs)
 * - Atomic dequeue with FOR UPDATE SKIP LOCKED
 * - Exponential backoff for retries (max 5 attempts)
 * - Stale job recovery
 * - Queue statistics
 *
 * Additional features:
 * - enqueueBatch(): Batch enqueue for multiple chunks
 * - getPendingCountForChunks(): Get pending job counts for UI status display
 */
@Injectable()
export class ChunkEmbeddingJobsService extends BaseJobQueueService<
  ChunkEmbeddingJob,
  ChunkEmbeddingJobRow
> {
  constructor(
    @InjectRepository(ChunkEmbeddingJob)
    repository: Repository<ChunkEmbeddingJob>,
    dataSource: DataSource,
    db: DatabaseService
  ) {
    super(repository, dataSource, db, {
      tableName: 'kb.chunk_embedding_jobs',
      entityIdField: 'chunkId',
      entityIdColumn: 'chunk_id',
      maxAttempts: 5, // Chunk embeddings give up after 5 attempts
    });
  }

  /**
   * Convert entity to row format.
   */
  protected toRow(entity: ChunkEmbeddingJob): ChunkEmbeddingJobRow {
    return {
      ...this.toBaseRow(entity),
      chunk_id: entity.chunkId,
    };
  }

  /**
   * Enqueue multiple chunks for embedding generation.
   * Useful for batch operations after document upload failure.
   *
   * @param chunkIds - Array of chunk IDs to enqueue
   * @param opts - Optional enqueue options (priority, scheduleAt)
   * @returns Number of new jobs created
   */
  async enqueueBatch(
    chunkIds: string[],
    opts: EnqueueJobOptions = {}
  ): Promise<number> {
    if (!chunkIds.length) return 0;

    // Find existing active jobs to avoid duplicates
    const existingJobs = await this.repository.find({
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
      this.repository.create({
        chunkId,
        status: 'pending',
        attemptCount: 0,
        priority,
        scheduledAt: scheduleAt,
      })
    );

    await this.repository.save(jobs);
    return jobs.length;
  }

  /**
   * Get pending job count for multiple chunks (for UI status display).
   *
   * @param chunkIds - Array of chunk IDs to check
   * @returns Map of chunkId to pending job count
   */
  async getPendingCountForChunks(
    chunkIds: string[]
  ): Promise<Map<string, number>> {
    if (!chunkIds.length) return new Map();

    const result = await this.repository
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

  /**
   * Get active job status for a specific chunk.
   *
   * @deprecated Use getActiveJobForEntity() instead
   */
  async getJobStatusForChunk(
    chunkId: string
  ): Promise<ChunkEmbeddingJobRow | null> {
    return this.getActiveJobForEntity(chunkId);
  }
}
