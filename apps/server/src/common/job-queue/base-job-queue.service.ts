import { Logger } from '@nestjs/common';
import { Repository, In, DataSource } from 'typeorm';
import { DatabaseService } from '../database/database.service';

/**
 * Base interface for job queue row output.
 * All job queue services should extend this interface with their specific entity ID field.
 */
export interface BaseJobRow {
  id: string;
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

/**
 * Base interface for job entities.
 * All job entities must have these common fields.
 */
export interface BaseJobEntity {
  id: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  priority: number;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Options for enqueueing a job.
 */
export interface EnqueueJobOptions {
  /** Job priority (higher = more urgent, default: 0) */
  priority?: number;
  /** When to schedule the job (default: now) */
  scheduleAt?: Date;
}

/**
 * Job queue statistics.
 */
export interface JobQueueStats {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
}

/**
 * Configuration for a job queue service.
 */
export interface JobQueueConfig {
  /** The database table name (e.g., 'kb.graph_embedding_jobs') */
  tableName: string;
  /** The entity ID field name in the entity (e.g., 'objectId', 'chunkId') */
  entityIdField: string;
  /** The entity ID column name in the database (e.g., 'object_id', 'chunk_id') */
  entityIdColumn: string;
  /** Maximum number of retry attempts before permanent failure (default: unlimited) */
  maxAttempts?: number;
  /** Base retry delay in seconds (default: 60) */
  baseRetryDelaySec?: number;
  /** Maximum retry delay in seconds (default: 3600) */
  maxRetryDelaySec?: number;
}

/**
 * Abstract base class for job queue services.
 *
 * Provides common functionality for job queue patterns:
 * - Idempotent enqueue (won't create duplicate active jobs)
 * - Atomic dequeue with FOR UPDATE SKIP LOCKED
 * - Exponential backoff for retries
 * - Stale job recovery
 * - Queue statistics
 *
 * Subclasses need to implement:
 * - toRow(): Convert entity to row format
 * - Inject repository, dataSource, and db into constructor
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyJobsService extends BaseJobQueueService<MyJobEntity, MyJobRow> {
 *   constructor(
 *     @InjectRepository(MyJobEntity) repository: Repository<MyJobEntity>,
 *     dataSource: DataSource,
 *     db: DatabaseService,
 *   ) {
 *     super(repository, dataSource, db, {
 *       tableName: 'kb.my_jobs',
 *       entityIdField: 'targetId',
 *       entityIdColumn: 'target_id',
 *       maxAttempts: 5,
 *     });
 *   }
 *
 *   protected toRow(entity: MyJobEntity): MyJobRow {
 *     return {
 *       ...this.toBaseRow(entity),
 *       target_id: entity.targetId,
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseJobQueueService<
  TEntity extends BaseJobEntity & Record<string, any>,
  TRow extends BaseJobRow
> {
  protected readonly logger: Logger;
  protected readonly config: Required<JobQueueConfig>;

  constructor(
    protected readonly repository: Repository<TEntity>,
    protected readonly dataSource: DataSource,
    protected readonly db: DatabaseService,
    config: JobQueueConfig
  ) {
    this.logger = new Logger(this.constructor.name);
    this.config = {
      maxAttempts: config.maxAttempts ?? Infinity,
      baseRetryDelaySec: config.baseRetryDelaySec ?? 60,
      maxRetryDelaySec: config.maxRetryDelaySec ?? 3600,
      ...config,
    };
  }

  /**
   * Convert an entity to its row representation.
   * Subclasses must implement this to add their specific entity ID field.
   */
  protected abstract toRow(entity: TEntity): TRow;

  /**
   * Convert base job fields to row format.
   * Helper method for subclasses to use in toRow().
   */
  protected toBaseRow(entity: TEntity): BaseJobRow {
    return {
      id: entity.id,
      status: entity.status,
      attempt_count: entity.attemptCount,
      last_error: entity.lastError,
      priority: entity.priority,
      scheduled_at: entity.scheduledAt.toISOString(),
      started_at: entity.startedAt?.toISOString() ?? null,
      completed_at: entity.completedAt?.toISOString() ?? null,
      created_at: entity.createdAt.toISOString(),
      updated_at: entity.updatedAt.toISOString(),
    };
  }

  /**
   * Enqueue a job for processing.
   * Idempotent: if an active (pending|processing) job exists, returns it instead of creating a new one.
   *
   * @param entityId - The ID of the entity to process (e.g., objectId, chunkId)
   * @param opts - Optional enqueue options (priority, scheduleAt)
   * @returns The job row (existing or newly created)
   */
  async enqueue(
    entityId: string,
    opts: EnqueueJobOptions = {}
  ): Promise<TRow | null> {
    // Check for existing active job
    const existing = await this.repository.findOne({
      where: {
        [this.config.entityIdField]: entityId,
        status: In(['pending', 'processing']),
      } as any,
    });

    if (existing) {
      return this.toRow(existing);
    }

    const priority = opts.priority ?? 0;
    const scheduleAt = opts.scheduleAt ?? new Date();

    const jobData = {
      [this.config.entityIdField]: entityId,
      status: 'pending',
      attemptCount: 0,
      priority,
      scheduledAt: scheduleAt,
    } as unknown as TEntity;

    const job = this.repository.create(jobData);
    const saved = await this.repository.save(job);
    return this.toRow(saved as TEntity);
  }

  /**
   * Dequeue jobs for processing.
   *
   * Uses FOR UPDATE SKIP LOCKED for concurrent worker safety.
   * This is strategic SQL that cannot be expressed in TypeORM.
   *
   * @param batchSize - Maximum number of jobs to dequeue (default: 10)
   * @returns Array of job rows ready for processing
   */
  async dequeue(batchSize = 10): Promise<TRow[]> {
    const { tableName, entityIdColumn } = this.config;

    const res = await this.db.query<TRow>(
      `WITH cte AS (
         SELECT id FROM ${tableName}
         WHERE status='pending' AND scheduled_at <= now()
         ORDER BY priority DESC, scheduled_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE ${tableName} j SET status='processing', started_at=now(), updated_at=now()
       FROM cte WHERE j.id = cte.id
       RETURNING j.id, j.${entityIdColumn}, j.status, j.attempt_count, j.last_error, j.priority, j.scheduled_at, j.started_at, j.completed_at, j.created_at, j.updated_at`,
      [batchSize]
    );
    return res.rows;
  }

  /**
   * Mark a job as failed and schedule for retry with exponential backoff.
   *
   * If maxAttempts is configured and reached, the job is permanently marked as failed.
   *
   * @param id - The job ID
   * @param error - The error that caused the failure
   * @param retryDelaySec - Base retry delay (default: config.baseRetryDelaySec)
   */
  async markFailed(
    id: string,
    error: Error,
    retryDelaySec?: number
  ): Promise<void> {
    const job = await this.repository.findOne({
      where: { id } as any,
      select: ['id', 'attemptCount'] as any,
    });

    if (!job) return;

    const attempt = (job.attemptCount || 0) + 1;
    const baseDelay = retryDelaySec ?? this.config.baseRetryDelaySec;

    if (attempt >= this.config.maxAttempts) {
      // Mark as permanently failed after max attempts
      await this.repository.update(
        id as any,
        {
          status: 'failed',
          attemptCount: attempt,
          lastError: error.message.slice(0, 500),
        } as any
      );
      this.logger.warn(
        `Job ${id} permanently failed after ${attempt} attempts: ${error.message}`
      );
      return;
    }

    // Exponential backoff: baseDelay * attempt^2, capped at maxRetryDelaySec
    const delay = Math.min(
      this.config.maxRetryDelaySec,
      baseDelay * attempt * attempt
    );

    await this.dataSource.query(
      `UPDATE ${this.config.tableName} 
       SET status='pending', attempt_count=$2, last_error=$3, 
           scheduled_at=now() + ($4 || ' seconds')::interval, 
           updated_at=now() 
       WHERE id=$1`,
      [id, attempt, error.message.slice(0, 500), delay.toString()]
    );
  }

  /**
   * Mark a job as completed.
   *
   * @param id - The job ID
   */
  async markCompleted(id: string): Promise<void> {
    await this.repository.update(
      id as any,
      {
        status: 'completed',
        completedAt: new Date(),
      } as any
    );
  }

  /**
   * Recover stale jobs that got stuck in 'processing' status.
   *
   * This can happen when the server is restarted while jobs are being processed.
   * Jobs stuck in 'processing' for longer than the threshold are reset to 'pending'
   * so the worker can pick them up again.
   *
   * @param staleThresholdMinutes - Jobs stuck in processing longer than this are considered stale (default: 10)
   * @returns Number of jobs recovered
   */
  async recoverStaleJobs(staleThresholdMinutes = 10): Promise<number> {
    const result = await this.dataSource.query(
      `UPDATE ${this.config.tableName} 
       SET status = 'pending', 
           started_at = NULL, 
           scheduled_at = now(),
           updated_at = now()
       WHERE status = 'processing' 
         AND started_at < now() - ($1 || ' minutes')::interval
       RETURNING id`,
      [staleThresholdMinutes.toString()]
    );

    const count = Array.isArray(result) ? result.length : 0;

    if (count > 0) {
      this.logger.warn(
        `Recovered ${count} stale job(s) stuck in 'processing' for > ${staleThresholdMinutes} minutes`
      );
    }

    return count;
  }

  /**
   * Get queue statistics.
   *
   * @returns Object with counts for each status
   */
  async stats(): Promise<JobQueueStats> {
    const [pending, processing, failed, completed] = await Promise.all([
      this.repository.count({ where: { status: 'pending' } as any }),
      this.repository.count({ where: { status: 'processing' } as any }),
      this.repository.count({ where: { status: 'failed' } as any }),
      this.repository.count({ where: { status: 'completed' } as any }),
    ]);

    return { pending, processing, failed, completed };
  }

  /**
   * Get the active job status for a specific entity.
   * Returns null if no active job exists (pending or processing).
   *
   * @param entityId - The entity ID to check
   * @returns The active job row or null
   */
  async getActiveJobForEntity(entityId: string): Promise<TRow | null> {
    const job = await this.repository.findOne({
      where: {
        [this.config.entityIdField]: entityId,
        status: In(['pending', 'processing']),
      } as any,
      order: {
        createdAt: 'DESC',
      } as any,
    });

    if (!job) return null;
    return this.toRow(job);
  }
}
