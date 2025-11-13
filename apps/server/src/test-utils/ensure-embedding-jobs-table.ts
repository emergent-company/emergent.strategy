import { DatabaseService } from '../common/database/database.service';

// Ensures the embedding jobs table and indexes exist. Safe / idempotent for repeated calls in tests.
const OWNER_ERROR_REGEX = /must be owner of (?:table|relation|index) "?[^"\s]*graph_embedding_jobs[^"\s]*"?/i;

async function safeExec(db: Pick<DatabaseService, 'query'>, sql: string) {
  try {
    await db.query(sql);
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (error?.code === '42501' && OWNER_ERROR_REGEX.test(message)) {
      return;
    }
    throw error;
  }
}

export async function ensureEmbeddingJobsTable(db: Pick<DatabaseService, 'query'>) {
  await safeExec(db, `CREATE TABLE IF NOT EXISTS kb.graph_embedding_jobs (
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
  await safeExec(db, `CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_status_sched ON kb.graph_embedding_jobs(status, scheduled_at)`);
  await safeExec(db, `CREATE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object ON kb.graph_embedding_jobs(object_id)`);
  await safeExec(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_embedding_jobs_object_pending ON kb.graph_embedding_jobs(object_id) WHERE status IN ('pending','processing')`);
}
