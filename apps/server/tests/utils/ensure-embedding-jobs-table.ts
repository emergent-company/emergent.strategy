import { DatabaseService } from '../../../server-nest/src/common/database/database.service';

// Ensures the embedding jobs table and indexes exist. Safe / idempotent for repeated calls in tests.
export async function ensureEmbeddingJobsTable(db: Pick<DatabaseService, 'query'>) {
    await db.query(`CREATE TABLE IF NOT EXISTS kb.graph_embedding_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending','processing','failed','completed')),
    attempt_count INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    priority INT NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_status_sched ON kb.graph_embedding_jobs(status, scheduled_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object ON kb.graph_embedding_jobs(object_id)`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object_pending ON kb.graph_embedding_jobs(object_id) WHERE status IN ('pending','processing')`);
}
