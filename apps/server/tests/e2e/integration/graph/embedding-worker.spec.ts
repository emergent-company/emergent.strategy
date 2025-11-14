import { beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../../../../src/common/config/config.module';
import { DatabaseModule } from '../../../../src/common/database/database.module';
import { GraphModule } from '../../../../src/modules/graph/graph.module';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { EmbeddingJobsService } from '../../../../src/modules/graph/embedding-jobs.service';
import { EmbeddingWorkerService } from '../../../../src/modules/graph/embedding-worker.service';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { ensureEmbeddingJobsTable } from '../../../../src/test-utils/ensure-embedding-jobs-table';

// Integration test: enqueue job -> worker processes -> embedding populated.

describe('EmbeddingWorkerService', () => {
  let graph: GraphService;
  let jobs: EmbeddingJobsService;
  let db: DatabaseService;
  let worker: EmbeddingWorkerService;
  let objectId: string;

  beforeAll(async () => {
    process.env.DB_AUTOINIT = '1';
    process.env.SKIP_MIGRATIONS = '1'; // Skip real migrations in unit tests
    process.env.NODE_ENV = 'test';
    // Do NOT set GOOGLE_API_KEY here – we want the test to be independent of embeddingsEnabled gating.
    // We manually enqueue the job below regardless of config flag. The worker implementation deliberately
    // still drains jobs when embeddings are disabled (so pipelines don't stall). This avoids flakiness
    // where auto-enqueue depends on config state or ordering with other tests mutating env.
    delete process.env.GOOGLE_API_KEY;
    process.env.EMBEDDING_PROVIDER = 'dummy'; // force dummy provider for deterministic test
    const mod = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule, GraphModule],
    }).compile();
    graph = mod.get(GraphService);
    jobs = mod.get(EmbeddingJobsService);
    db = mod.get(DatabaseService);
    worker = mod.get(EmbeddingWorkerService);
    // Prevent background interval races; we'll invoke processBatch manually.
    worker.stop();
    await db.query('DELETE FROM kb.graph_embedding_jobs');
    // Defensive: ensure embedding jobs table exists (some other tests may rely on minimal schema path ordering)
    await ensureEmbeddingJobsTable(db);
    const uniqueOrg =
      'embed_worker_org_' + Math.random().toString(36).slice(2, 8);
    const org = await db.query(
      `INSERT INTO kb.orgs(name) VALUES ($1) RETURNING id`,
      [uniqueOrg]
    );
    const orgId = org.rows[0].id;
    const proj = await db.query(
      `INSERT INTO kb.projects(organization_id, name) VALUES ($1,'embed_worker_proj') RETURNING id`,
      [orgId]
    );
    const projectId = proj.rows[0].id;
    // Randomize key to avoid potential advisory lock collisions with parallel tests
    const objKey = 'wk_' + Math.random().toString(36).slice(2, 10);
    const obj = await graph.createObject({
      organization_id: orgId,
      project_id: projectId,
      type: 'doc',
      key: objKey,
      properties: {
        title: 'Doc Title',
        body: 'The quick brown fox jumps over the lazy dog.',
      },
      labels: [],
    } as any);
    objectId = obj.id;
    // Manually enqueue embedding job (idempotent) to decouple from embeddingsEnabled flag.
    await jobs.enqueue(objectId);
    const pendingJob = await db.query(
      `SELECT id FROM kb.graph_embedding_jobs WHERE object_id=$1 AND status='pending'`,
      [objectId]
    );
    expect(pendingJob.rowCount).toBe(1); // deterministic assertion
  });

  it('processes a pending embedding job and populates embedding column', async () => {
    // Directly trigger batch processing instead of waiting on interval.
    let success = false;
    let lastProbe: any = null;
    for (let i = 0; i < 5; i++) {
      await worker.processBatch();
      const probe = await db.query<{ embedding: any }>(
        `SELECT embedding FROM kb.graph_objects WHERE id=$1`,
        [objectId]
      );
      lastProbe = probe;
      if (probe.rowCount === 1 && probe.rows[0].embedding) {
        success = true;
        break;
      }
    }
    if (!success) {
      const jobState = await db.query(
        `SELECT id, status, attempt_count, last_error FROM kb.graph_embedding_jobs WHERE object_id=$1`,
        [objectId]
      );
      throw new Error(
        'embedding_not_populated ' +
          JSON.stringify({ jobState: jobState.rows, lastProbe: lastProbe.rows })
      );
    }
    expect(lastProbe.rowCount).toBe(1);
    expect(lastProbe.rows[0].embedding).toBeTruthy();
  });
});

export const config = { mode: 'serial' };
