import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface EmbeddingJobRow {
    id: string; object_id: string; status: string; attempt_count: number; last_error: string | null;
    priority: number; scheduled_at: string; started_at: string | null; completed_at: string | null; created_at: string; updated_at: string;
}

export type EmbeddingJobStatus = 'pending' | 'processing' | 'failed' | 'completed';

export interface EnqueueEmbeddingJobOptions { priority?: number; scheduleAt?: Date; }

@Injectable()
export class EmbeddingJobsService {
    private readonly logger = new Logger(EmbeddingJobsService.name);
    constructor(@Inject(DatabaseService) private readonly db: DatabaseService) { }

    async enqueue(objectId: string, opts: EnqueueEmbeddingJobOptions = {}): Promise<EmbeddingJobRow | null> {
        // Idempotent enqueue: if an active (pending|processing) job exists, do not create another; return existing.
        const existing = await this.db.query<EmbeddingJobRow>(
            `SELECT id, object_id, status, attempt_count, last_error, priority, scheduled_at, started_at, completed_at, created_at, updated_at
       FROM kb.graph_embedding_jobs WHERE object_id=$1 AND status IN ('pending','processing') LIMIT 1`, [objectId]);
        if (existing.rowCount) return existing.rows[0];
        const priority = opts.priority ?? 0;
        const scheduleAt = opts.scheduleAt ? opts.scheduleAt.toISOString() : null;
        const res = await this.db.query<EmbeddingJobRow>(
            `INSERT INTO kb.graph_embedding_jobs(object_id, status, attempt_count, priority, scheduled_at)
       VALUES ($1,'pending',0,$2,COALESCE($3, now()))
       RETURNING id, object_id, status, attempt_count, last_error, priority, scheduled_at, started_at, completed_at, created_at, updated_at`,
            [objectId, priority, scheduleAt]);
        return res.rows[0];
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
            [batchSize]);
        return res.rows;
    }

    async markFailed(id: string, error: Error, retryDelaySec = 60): Promise<void> {
        // Increment attempt_count, set status failed OR requeue as pending with backoff. For now: simple backoff (attempt^2 * baseDelay)
        const base = retryDelaySec;
        const row = await this.db.query<EmbeddingJobRow>('SELECT attempt_count FROM kb.graph_embedding_jobs WHERE id=$1', [id]);
        if (!row.rowCount) return;
        const attempt = (row.rows[0].attempt_count || 0) + 1;
        const delay = Math.min(3600, base * attempt * attempt); // cap at 1h
        await this.db.query(
            `UPDATE kb.graph_embedding_jobs SET status='pending', attempt_count=$2, last_error=$3, scheduled_at=now() + ($4 || ' seconds')::interval, updated_at=now() WHERE id=$1`,
            [id, attempt, error.message.slice(0, 500), delay.toString()]
        );
    }

    async markCompleted(id: string): Promise<void> {
        await this.db.query(
            `UPDATE kb.graph_embedding_jobs SET status='completed', completed_at=now(), updated_at=now() WHERE id=$1`, [id]
        );
    }

    async stats(): Promise<{ pending: number; processing: number; failed: number; completed: number; }> {
        const res = await this.db.query<{ status: string; c: number }>(`SELECT status, count(*)::int as c FROM kb.graph_embedding_jobs GROUP BY status`);
        const base = { pending: 0, processing: 0, failed: 0, completed: 0 };
        for (const r of res.rows) { (base as any)[r.status] = r.c; }
        return base;
    }
}
