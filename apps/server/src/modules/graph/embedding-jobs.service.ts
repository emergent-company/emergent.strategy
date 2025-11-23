import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, In, LessThanOrEqual } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { GraphEmbeddingJob } from '../../entities/graph-embedding-job.entity';

export interface EmbeddingJobRow {
  id: string;
  object_id: string;
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
 * EmbeddingJobsService - TypeORM Migration Status
 * ================================================
 *
 * Migration Status: ✅ Complete (Strategic SQL Documented)
 * Last Updated: 2025-11-12
 *
 * Methods:
 * ✅ enqueue() - Fully migrated to TypeORM Repository
 * 🔒 dequeue() - Strategic raw SQL (see method documentation)
 * ✅ markFailed() - Migrated to TypeORM (uses DataSource for interval calculation)
 * ✅ markCompleted() - Fully migrated to TypeORM Repository
 * ✅ stats() - Fully migrated to TypeORM Repository
 *
 * Summary:
 * This service implements a job queue for embedding generation. Most methods have been
 * migrated to TypeORM. The dequeue() method intentionally uses raw SQL because it requires
 * PostgreSQL's FOR UPDATE SKIP LOCKED feature, which is essential for concurrent workers
 * and not supported by TypeORM's QueryBuilder.
 */
@Injectable()
export class EmbeddingJobsService {
  private readonly logger = new Logger(EmbeddingJobsService.name);
  constructor(
    @InjectRepository(GraphEmbeddingJob)
    private readonly embeddingJobRepository: Repository<GraphEmbeddingJob>,
    private readonly dataSource: DataSource,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  async enqueue(
    objectId: string,
    opts: EnqueueEmbeddingJobOptions = {}
  ): Promise<EmbeddingJobRow | null> {
    // Idempotent enqueue: if an active (pending|processing) job exists, do not create another; return existing.
    const existing = await this.embeddingJobRepository.findOne({
      where: {
        objectId,
        status: In(['pending', 'processing']),
      },
    });

    if (existing) {
      return {
        id: existing.id,
        object_id: existing.objectId,
        status: existing.status,
        attempt_count: existing.attemptCount,
        last_error: existing.lastError,
        priority: existing.priority,
        scheduled_at: existing.scheduledAt.toISOString(),
        started_at: existing.startedAt?.toISOString() ?? null,
        completed_at: existing.completedAt?.toISOString() ?? null,
        created_at: existing.createdAt.toISOString(),
        updated_at: existing.updatedAt.toISOString(),
      };
    }

    const priority = opts.priority ?? 0;
    const scheduleAt = opts.scheduleAt ?? new Date();

    const job = this.embeddingJobRepository.create({
      objectId,
      status: 'pending',
      attemptCount: 0,
      priority,
      scheduledAt: scheduleAt,
    });

    const saved = await this.embeddingJobRepository.save(job);

    return {
      id: saved.id,
      object_id: saved.objectId,
      status: saved.status,
      attempt_count: saved.attemptCount,
      last_error: saved.lastError,
      priority: saved.priority,
      scheduled_at: saved.scheduledAt.toISOString(),
      started_at: saved.startedAt?.toISOString() ?? null,
      completed_at: saved.completedAt?.toISOString() ?? null,
      created_at: saved.createdAt.toISOString(),
      updated_at: saved.updatedAt.toISOString(),
    };
  }

  /**
   * 🔒 STRATEGIC RAW SQL - DO NOT MIGRATE TO TYPEORM
   *
   * dequeue - Atomically claim and lock jobs for processing
   *
   * Why Strategic SQL:
   * ------------------
   * 1. FOR UPDATE SKIP LOCKED (Queue Primitive)
   *    - PostgreSQL-specific locking mechanism for concurrent workers
   *    - SKIP LOCKED allows multiple workers to dequeue jobs in parallel without blocking
   *    - Each worker atomically claims different jobs with zero contention
   *    - TypeORM does not support FOR UPDATE SKIP LOCKED in its QueryBuilder
   *
   * 2. Atomic CTE Pattern
   *    - WITH cte AS (SELECT ... FOR UPDATE SKIP LOCKED)
   *    - UPDATE ... FROM cte
   *    - Single statement guarantees atomicity: SELECT + LOCK + UPDATE in one operation
   *    - Eliminates race conditions between claim and status update
   *    - Cannot be expressed as TypeORM method chain (multiple queries = race condition)
   *
   * 3. Priority Queue Semantics
   *    - ORDER BY priority DESC, scheduled_at ASC
   *    - Highest priority + oldest scheduled first
   *    - Combined with LIMIT for batch processing
   *    - This exact ordering with locking is critical for fair work distribution
   *
   * 4. Performance for High-Throughput Queues
   *    - Zero contention between workers (SKIP LOCKED)
   *    - Single roundtrip to database (CTE pattern)
   *    - Index-friendly query pattern (status + scheduled_at + priority)
   *    - Scales linearly with number of workers
   *
   * What It Does:
   * -------------
   * - Finds up to batchSize jobs WHERE status='pending' AND scheduled_at <= now()
   * - Orders by priority (descending) then scheduled_at (ascending)
   * - Locks selected rows with FOR UPDATE SKIP LOCKED (non-blocking)
   * - Updates status='processing', started_at=now()
   * - Returns all fields of claimed jobs
   *
   * Example Flow (3 concurrent workers):
   * ------------------------------------
   * Queue state: 100 pending jobs
   *
   * Worker A: SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10 → claims jobs 1-10
   * Worker B: SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10 → claims jobs 11-20 (skips 1-10)
   * Worker C: SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10 → claims jobs 21-30 (skips 1-20)
   *
   * All three workers proceed in parallel with zero blocking.
   *
   * TypeORM Equivalent:
   * -------------------
   * Not possible without raw SQL:
   * - TypeORM QueryBuilder doesn't support FOR UPDATE SKIP LOCKED
   * - Splitting into find() + update() creates race condition:
   *   - Worker A: find pending jobs → [1,2,3]
   *   - Worker B: find pending jobs → [1,2,3] (sees same jobs!)
   *   - Worker A: update jobs [1,2,3] to processing
   *   - Worker B: update jobs [1,2,3] to processing
   *   - Result: Both workers process same jobs (duplicate work)
   *
   * Alternative Approaches Considered:
   * ----------------------------------
   * 1. Pessimistic locking with TypeORM:
   *    - QueryBuilder supports FOR UPDATE but not SKIP LOCKED
   *    - Workers would block each other (defeats purpose of concurrent workers)
   *
   * 2. Optimistic locking (version field):
   *    - Can detect conflicts but requires retry logic
   *    - More complex code, worse performance under contention
   *    - Doesn't prevent wasted work (multiple workers competing for same jobs)
   *
   * 3. Redis-based queue:
   *    - Adds external dependency
   *    - Requires synchronization between Redis and PostgreSQL
   *    - Overkill when PostgreSQL provides perfect primitive
   *
   * Estimated Migration Effort: Impossible (feature unsupported)
   * Maintenance Risk: Low (standard queue pattern, rarely changes)
   * Performance Impact: Critical (zero-contention concurrency)
   * Decision: Keep as strategic SQL (no viable alternative)
   */
  async dequeue(batchSize = 10): Promise<EmbeddingJobRow[]> {
    // Single statement atomic claim of jobs ordered by priority then scheduled_at
    const res = await this.db.query<EmbeddingJobRow>(
      `WITH cte AS (
         SELECT id FROM kb.graph_embedding_jobs
         WHERE status='pending' AND scheduled_at <= now()
         ORDER BY priority DESC, scheduled_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE kb.graph_embedding_jobs j SET status='processing', started_at=now(), updated_at=now()
       FROM cte WHERE j.id = cte.id
       RETURNING j.id, j.object_id, j.status, j.attempt_count, j.last_error, j.priority, j.scheduled_at, j.started_at, j.completed_at, j.created_at, j.updated_at`,
      [batchSize]
    );
    return res.rows;
  }

  async markFailed(
    id: string,
    error: Error,
    retryDelaySec = 60
  ): Promise<void> {
    // Increment attempt_count, set status failed OR requeue as pending with backoff
    const job = await this.embeddingJobRepository.findOne({
      where: { id },
      select: ['id', 'attemptCount'],
    });

    if (!job) return;

    const attempt = (job.attemptCount || 0) + 1;
    const delay = Math.min(3600, retryDelaySec * attempt * attempt); // cap at 1h

    // Use DataSource for interval calculation (PostgreSQL-specific)
    await this.dataSource.query(
      `UPDATE kb.graph_embedding_jobs 
             SET status='pending', attempt_count=$2, last_error=$3, 
                 scheduled_at=now() + ($4 || ' seconds')::interval, 
                 updated_at=now() 
             WHERE id=$1`,
      [id, attempt, error.message.slice(0, 500), delay.toString()]
    );
  }

  async markCompleted(id: string): Promise<void> {
    await this.embeddingJobRepository.update(id, {
      status: 'completed',
      completedAt: new Date(),
    });
  }

  async stats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
  }> {
    const [pending, processing, failed, completed] = await Promise.all([
      this.embeddingJobRepository.count({ where: { status: 'pending' } }),
      this.embeddingJobRepository.count({ where: { status: 'processing' } }),
      this.embeddingJobRepository.count({ where: { status: 'failed' } }),
      this.embeddingJobRepository.count({ where: { status: 'completed' } }),
    ]);

    return { pending, processing, failed, completed };
  }

  /**
   * Get the active job status for a specific object
   * Returns null if no active job exists (pending or processing)
   */
  async getJobStatusForObject(
    objectId: string
  ): Promise<EmbeddingJobRow | null> {
    const job = await this.embeddingJobRepository.findOne({
      where: {
        objectId,
        status: In(['pending', 'processing']),
      },
      order: {
        createdAt: 'DESC', // Get most recent active job
      },
    });

    if (!job) return null;

    return {
      id: job.id,
      object_id: job.objectId,
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
