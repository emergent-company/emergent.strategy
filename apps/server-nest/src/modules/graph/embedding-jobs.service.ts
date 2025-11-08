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
}
