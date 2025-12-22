import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import {
  BaseJobQueueService,
  BaseJobRow,
} from '../../common/job-queue/base-job-queue.service';
import { GraphEmbeddingJob } from '../../entities/graph-embedding-job.entity';

export interface EmbeddingJobRow extends BaseJobRow {
  object_id: string;
}

export type EmbeddingJobStatus =
  | 'pending'
  | 'processing'
  | 'failed'
  | 'completed';

export interface EnqueueEmbeddingJobOptions {
  priority?: number;
  scheduleAt?: Date;
}

/**
 * EmbeddingJobsService - Job queue for graph object embedding generation
 *
 * Extends BaseJobQueueService to provide:
 * - Idempotent enqueue (won't create duplicate active jobs)
 * - Atomic dequeue with FOR UPDATE SKIP LOCKED
 * - Exponential backoff for retries
 * - Stale job recovery
 * - Queue statistics
 *
 * Note: This service does NOT have maxAttempts configured, so jobs will
 * retry indefinitely until they succeed.
 */
@Injectable()
export class EmbeddingJobsService extends BaseJobQueueService<
  GraphEmbeddingJob,
  EmbeddingJobRow
> {
  constructor(
    @InjectRepository(GraphEmbeddingJob)
    repository: Repository<GraphEmbeddingJob>,
    dataSource: DataSource,
    db: DatabaseService
  ) {
    super(repository, dataSource, db, {
      tableName: 'kb.graph_embedding_jobs',
      entityIdField: 'objectId',
      entityIdColumn: 'object_id',
      // No maxAttempts - jobs retry indefinitely
    });
  }

  /**
   * Convert entity to row format.
   */
  protected toRow(entity: GraphEmbeddingJob): EmbeddingJobRow {
    return {
      ...this.toBaseRow(entity),
      object_id: entity.objectId,
    };
  }

  /**
   * Get the active job status for a specific object.
   * Returns null if no active job exists (pending or processing).
   *
   * @deprecated Use getActiveJobForEntity() instead
   */
  async getJobStatusForObject(
    objectId: string
  ): Promise<EmbeddingJobRow | null> {
    return this.getActiveJobForEntity(objectId);
  }
}
