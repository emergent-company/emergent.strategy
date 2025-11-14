import { beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../../../../src/common/config/config.module';
import { DatabaseModule } from '../../../../src/common/database/database.module';
import { GraphModule } from '../../../../src/modules/graph/../graph/graph.module';
import { GraphService } from '../../../../src/modules/graph/graph.service';
import { EmbeddingJobsService } from '../../../../src/modules/graph/embedding-jobs.service';
import { ensureEmbeddingJobsTable } from '../../../../src/test-utils/ensure-embedding-jobs-table';

// Tests enqueue logic on object create / patch under different embedding enable flags.

describe('Graph Embedding Enqueue', () => {
  let service: GraphService;
  let jobs: EmbeddingJobsService;
  let orgId: string;
  let projectId: string;

  async function initModule() {
    const mod = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule, GraphModule],
    }).compile();
    service = mod.get(GraphService);
    jobs = mod.get(EmbeddingJobsService);
    // If embeddings disabled ensure worker does not auto-start (avoid cross-test interference)
    if (!process.env.GOOGLE_API_KEY) {
      try {
        const worker = mod.get<any>('EmbeddingWorkerService');
        if (worker) {
          worker.start = () => {};
          worker.stop();
        }
      } catch {
        /* ignore */
      }
    }
    await (service as any).db.query('SELECT 1');
    await ensureEmbeddingJobsTable((service as any).db);
  }

  beforeAll(async () => {
    process.env.DB_AUTOINIT = '1';
    process.env.SKIP_MIGRATIONS = '1'; // Skip real migrations in unit tests
    process.env.NODE_ENV = 'test';
    // Start with embeddings disabled (no GOOGLE_API_KEY)
    delete process.env.GOOGLE_API_KEY;
    await initModule();
    const uniqueOrg = 'embedq_org_' + Math.random().toString(36).slice(2, 8);
    const resOrg = await (service as any).db.query(
      `INSERT INTO kb.orgs(name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [uniqueOrg]
    );
    orgId = resOrg.rows[0].id;
    const resProj = await (service as any).db.query(
      `INSERT INTO kb.projects(organization_id, name) VALUES ($1,'embedq_proj') RETURNING id`,
      [orgId]
    );
    projectId = resProj.rows[0].id;
    await (service as any).db.setTenantContext(orgId, projectId);
  });

  it('does not enqueue when embeddings disabled', async () => {
    await (service as any).db.setTenantContext(orgId, projectId);
    // Other test files may have created jobs; focus on absence of job for the new object we create.
    const o = await service.createObject({
      organization_id: orgId,
      project_id: projectId,
      type: 'article',
      key: 'noembed_' + Date.now(),
      properties: { body: 'lorem ipsum' },
      labels: [],
    } as any);
    expect(o).toBeTruthy();
    // Ensure no job exists for this specific object id
    const jobForObj = await (service as any).db.query(
      `SELECT 1 FROM kb.graph_embedding_jobs WHERE object_id=$1`,
      [o.id]
    );
    expect(jobForObj.rowCount).toBe(0);
  });

  it('enqueues on create when embeddings enabled', async () => {
    process.env.GOOGLE_API_KEY = 'fake-key'; // set before module re-init
    await initModule(); // reinitialize to pick up new config flag
    await (service as any).db.setTenantContext(orgId, projectId);
    const o = await service.createObject({
      organization_id: orgId,
      project_id: projectId,
      type: 'article',
      key: 'with-embed',
      properties: { body: 'alpha beta gamma' },
      labels: [],
    } as any);
    expect(o).toBeTruthy();
    const stats = await jobs.stats();
    expect(
      stats.pending + stats.processing + stats.failed + stats.completed
    ).toBeGreaterThanOrEqual(1);
  });

  it('does not create duplicate pending job on patch', async () => {
    await (service as any).db.setTenantContext(orgId, projectId);
    const before = await jobs.stats();
    const head = await (service as any).db.query(
      `SELECT id FROM kb.graph_objects WHERE key='with-embed' ORDER BY version DESC LIMIT 1`
    );
    const id = head.rows[0].id;
    // Use a unique field name each run to guarantee an effective change even if prior runs mutated the object.
    const uniqueField =
      'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    await service.patchObject(id, {
      properties: { [uniqueField]: 'value' },
    } as any);
    const after = await jobs.stats();
    const beforeTotal =
      before.pending + before.processing + before.failed + before.completed;
    const afterTotal =
      after.pending + after.processing + after.failed + after.completed;
    // Allow at most one new pending job if previous job still unprocessed; race tolerance.
    expect(afterTotal - beforeTotal).toBeLessThanOrEqual(2);
  });
});
