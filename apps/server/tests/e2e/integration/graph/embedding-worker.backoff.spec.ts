import { describe, it, expect, beforeAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../../../../src/common/config/config.module';
import { DatabaseModule } from '../../../../src/common/database/database.module';
import { GraphModule } from '../../../../src/modules/graph/graph.module';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { EmbeddingJobsService } from '../../../../src/modules/graph/embedding-jobs.service';
import { EmbeddingWorkerService } from '../../../../src/modules/graph/embedding-worker.service';
import { ensureEmbeddingJobsTable } from '../../../../src/test-utils/ensure-embedding-jobs-table';

// Test that a failure during embedding processing triggers backoff (attempt_count increments and job rescheduled)

describe('EmbeddingWorkerService Backoff', () => {
  let service: GraphService;
  let jobs: EmbeddingJobsService;
  let worker: EmbeddingWorkerService;
  let objectId: string;
  let jobId: string;

  beforeAll(async () => {
    process.env.DB_AUTOINIT = '1';
    process.env.SKIP_MIGRATIONS = '1'; // Skip real migrations in unit tests
    process.env.NODE_ENV = 'test';
    delete process.env.GOOGLE_API_KEY; // disable embeddings; we'll force failure via extractText
    const mod = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule, GraphModule],
    }).compile();
    service = mod.get(GraphService);
    jobs = mod.get(EmbeddingJobsService);
    worker = mod.get(EmbeddingWorkerService);
    await (service as any).db.query('SELECT 1');
    await ensureEmbeddingJobsTable((service as any).db);
    // Stop any background interval
    worker.stop();
    const uniqueOrg =
      'embed_backoff_org_' + Math.random().toString(36).slice(2, 8);
    const resOrg = await (service as any).db.query(
      `INSERT INTO kb.orgs(name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [uniqueOrg]
    );
    const orgId = resOrg.rows[0].id;
    const resProj = await (service as any).db.query(
      `INSERT INTO kb.projects(organization_id, name) VALUES ($1,'embed_backoff_proj') RETURNING id`,
      [orgId]
    );
    const projectId = resProj.rows[0].id;
    // Clear any existing jobs from other test files to ensure deterministic dequeue ordering
    await (service as any).db.query('DELETE FROM kb.graph_embedding_jobs');
    const created = await service.createObject({
      organization_id: orgId,
      project_id: projectId,
      type: 'article',
      key: 'backoff-obj-' + Date.now(),
      properties: { body: 'trigger backoff' },
      labels: [],
    } as any);
    objectId = created.id;
    // No auto-enqueue because embeddings disabled; enqueue manually
    await jobs.enqueue(objectId, { priority: 999 });
    // Force failure inside processing loop by throwing from extractText
    (worker as any).extractText = () => {
      throw new Error('forced_extract_failure');
    };
    const j = await (service as any).db.query(
      `SELECT id FROM kb.graph_embedding_jobs WHERE object_id=$1 AND status='pending' LIMIT 1`,
      [objectId]
    );
    jobId = j.rows[0].id;
    await (service as any).db.query(
      `UPDATE kb.graph_embedding_jobs SET status='pending', attempt_count=0, scheduled_at=now(), last_error=NULL WHERE id=$1`,
      [jobId]
    );
  });

  it('requeues job with incremented attempt_count and future scheduled_at', async () => {
    const before = await (service as any).db.query(
      `SELECT attempt_count, status FROM kb.graph_embedding_jobs WHERE id=$1`,
      [jobId]
    );
    expect(before.rows[0].attempt_count).toBe(0);
    expect(before.rows[0].status).toBe('pending');
    // Retry loop in case another job sneaks in (shouldn't after delete, but defensive)
    let incremented = false;
    for (let i = 0; i < 5; i++) {
      await worker.processBatch();
      const probe = await (service as any).db.query(
        `SELECT attempt_count, status, scheduled_at, last_error FROM kb.graph_embedding_jobs WHERE id=$1`,
        [jobId]
      );
      if (probe.rows[0].attempt_count > 0) {
        incremented = true;
        break;
      }
    }
    if (!incremented) {
      const dump = await (service as any).db.query(
        `SELECT id, attempt_count, status, scheduled_at, last_error FROM kb.graph_embedding_jobs WHERE id=$1`,
        [jobId]
      );
      throw new Error(
        'attempt_count_never_incremented: ' + JSON.stringify(dump.rows[0])
      );
    }
    const after = await (service as any).db.query(
      `SELECT attempt_count, status, scheduled_at FROM kb.graph_embedding_jobs WHERE id=$1`,
      [jobId]
    );
    expect(['pending', 'processing']).toContain(after.rows[0].status);
    expect(after.rows[0].attempt_count).toBeGreaterThanOrEqual(1);
    // scheduled_at should be in the future (at least a few seconds). Allow small clock skew.
    const sched = new Date(after.rows[0].scheduled_at).getTime();
    expect(sched).toBeGreaterThan(Date.now());
  });
});

export const config = { mode: 'serial' };
