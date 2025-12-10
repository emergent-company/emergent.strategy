import request from 'supertest';
import getTestApp, { getSeededOrgProject } from '../../setup';
import { INestApplication } from '@nestjs/common';
// Ensure Vitest extended describe helpers (e.g., describe.sequential) are typed
// even when globals are enabled.
import '@vitest/runner';
import { describeWithDb } from '../../utils/db-describe';

// Harness now explicitly bootstraps the full AppModule via tests/setup.ts
let app: INestApplication | null = null;

async function createBranchOrThrow(
  name: string,
  organization_id: string,
  project_id: string
): Promise<string> {
  const currentApp = app;
  if (!currentApp?.getHttpServer)
    throw new Error('HTTP server not initialized');
  try {
    const res = await request(currentApp.getHttpServer())
      .post('/graph/branches')
      .send({ name, org_id, project_id });
    if (res.status !== 201)
      throw new Error(
        `Failed to create branch ${name}: ${res.status} ${res.text}`
      );
    return res.body.id;
  } catch (e) {
    throw e instanceof Error ? e : new Error('Unknown branch create error');
  }
}

async function createObject(
  branchId: string,
  type: string,
  key: string,
  properties: Record<string, any>
) {
  const currentApp = app;
  if (!currentApp?.getHttpServer) throw new Error('app not initialized');
  const { orgId, projectId } = await getSeededOrgProject();
  const res = await request(currentApp.getHttpServer())
    .post('/graph/objects')
    .send({
      type,
      key,
      properties,
      branch_id: branchId,
      organization_id: orgId ?? null,
      project_id: projectId ?? null,
    });
  if (res.status !== 201)
    throw new Error('Failed to create object: ' + res.text);
  return res.body;
}

// NOTE: Potential deadlocks were observed when this suite ran concurrently with other
// graph mutation heavy specs. If reintroduced, consider serializing via a custom
// test pool or splitting high-contention scenarios into isolated files.
describeWithDb('Graph Merge Dry-Run (MVP)', () => {
  let targetBranch: string;
  let sourceBranch: string;

  beforeAll(async () => {
    app = await getTestApp();
    const { orgId, projectId } = await getSeededOrgProject();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    targetBranch = await createBranchOrThrow(
      `target-merge-test-${suffix}`,
      orgId,
      projectId
    );
    sourceBranch = await createBranchOrThrow(
      `source-merge-test-${suffix}`,
      orgId,
      projectId
    );
    expect(targetBranch).toBeTruthy();
    expect(sourceBranch).toBeTruthy();
  });

  afterAll(async () => {
    if (!app) return;
    await app.close();
    app = null;
  });

  test('AT-MERGE-1: empty divergence returns counts zero', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    const resp = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${targetBranch}/merge`)
      .send({ sourceBranchId: sourceBranch });
    expect(resp.status).toBe(200);
    expect(resp.body.total_objects).toBe(0);
    expect(resp.body.conflict_count).toBe(0);
  });

  test('AT-MERGE-2: added object classified correctly', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    await createObject(sourceBranch, 'Doc', 'doc-1', { title: 'Hello' });
    const resp = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${targetBranch}/merge`)
      .send({ sourceBranchId: sourceBranch });
    expect(resp.status).toBe(200);
    const added = resp.body.objects.find((o: any) => o.status === 'added');
    expect(added).toBeTruthy();
    expect(resp.body.added_count).toBe(1);
  });

  test('AT-MERGE-3: conflicting object detected (same path)', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    const tgtObj = await createObject(targetBranch, 'Doc', 'doc-2', {
      title: 'Base',
    });
    await createObject(sourceBranch, 'Doc', 'doc-2', {
      title: 'Source Change',
    });
    const patchRes = await request(currentApp.getHttpServer())
      .patch(`/graph/objects/${tgtObj.id}`)
      .send({ properties: { title: 'Target Change' } });
    expect(patchRes.status).toBe(200);
    const resp = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${targetBranch}/merge`)
      .send({ sourceBranchId: sourceBranch });
    expect(resp.status).toBe(200);
    const conflict = resp.body.objects.find(
      (o: any) => o.status === 'conflict'
    );
    expect(conflict).toBeTruthy();
    expect(resp.body.conflict_count).toBeGreaterThanOrEqual(1);
  });

  test('AT-MERGE-4: truncation when limit lower than enumeration size', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    // Use fresh branches to avoid prior test objects influencing ordering/limit window
    const { orgId, projectId } = await getSeededOrgProject();
    const isolatedTarget = await createBranchOrThrow(
      `trunc-target-${Date.now()}`,
      orgId,
      projectId
    );
    const isolatedSource = await createBranchOrThrow(
      `trunc-source-${Date.now()}`,
      orgId,
      projectId
    );
    // Create 5 independent objects only on isolated source branch
    for (let i = 0; i < 5; i++) {
      await createObject(isolatedSource, 'TruncDoc', `td-${i}`, { idx: i });
    }
    const resp = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${isolatedTarget}/merge`)
      .send({ sourceBranchId: isolatedSource, limit: 3 });
    expect(resp.status).toBe(200);
    expect(resp.body.truncated).toBe(true);
    expect(resp.body.objects.length).toBe(3);
    // All enumerated should be added (since they exist only on source branch)
    expect(resp.body.added_count).toBe(3);
    // No conflicts/unchanged expected in truncated window
    expect(resp.body.conflict_count).toBe(0);
    expect(resp.body.unchanged_count).toBe(0);
    // Hard limit is surfaced
    expect(typeof resp.body.hard_limit).toBe('number');
    expect(resp.body.hard_limit).toBeGreaterThanOrEqual(3);
  });

  test('AT-MERGE-5: deterministic ordering (conflict > fast_forward > added > unchanged if present)', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    // Fresh branches to isolate ordering
    const { orgId, projectId } = await getSeededOrgProject();
    const orderTarget = await createBranchOrThrow(
      `order-target-${Date.now()}`,
      orgId,
      projectId
    );
    const orderSource = await createBranchOrThrow(
      `order-source-${Date.now()}`,
      orgId,
      projectId
    );

    // Scenario construction:
    // 1. Conflict: object with same (type,key) modified differently on each branch
    // 2. Fast-forward: object exists on both but only source changed (disjoint path sets)
    // 3. Added: object only on source
    // 4. Unchanged: identical object on both

    // Unchanged (identical on both) FIRST – guarantee same content hash
    await createObject(orderTarget, 'Doc', 'ord-same', { title: 'Same' });
    await createObject(orderSource, 'Doc', 'ord-same', { title: 'Same' });

    // Conflict
    const baseConflict = await createObject(orderTarget, 'Doc', 'ord-cf', {
      title: 'Base',
    });
    await request(currentApp.getHttpServer())
      .patch(`/graph/objects/${baseConflict.id}`)
      .send({ properties: { title: 'Target Change' } });
    await createObject(orderSource, 'Doc', 'ord-cf', {
      title: 'Source Change',
    });

    // Fast-forward (target has base, source changes non-overlapping key)
    await createObject(orderTarget, 'Doc', 'ord-ff', {
      title: 'OnlyTargetProp',
    });
    await createObject(orderSource, 'Doc', 'ord-ff', {
      body: 'OnlySourceProp',
    });

    // Added (only source)
    await createObject(orderSource, 'Doc', 'ord-add', { title: 'Only Source' });

    const resp = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${orderTarget}/merge`)
      .send({ sourceBranchId: orderSource, limit: 25 });
    expect(resp.status).toBe(200);
    const objs = resp.body.objects;
    const statuses = objs.map((o: any) => o.status);
    // Debug: surface raw order and any debug_priority the service attached (test env only)
    // eslint-disable-next-line no-console
    console.log(
      'AT-MERGE-5 raw statuses',
      statuses,
      'debug_priorities',
      objs.map((o: any) => o.debug_priority)
    );

    // Priority enforced by service sort (ascending by numeric priority): conflict(0) < fast_forward(1) < added(2) < unchanged(3)
    const priority: Record<string, number> = {
      conflict: 0,
      fast_forward: 1,
      added: 2,
      unchanged: 3,
    };
    const numeric = statuses.map((s: string) => priority[s]);

    // Assert sequence is sorted ascending (non-decreasing)
    for (let i = 1; i < numeric.length; i++) {
      expect(numeric[i]).toBeGreaterThanOrEqual(numeric[i - 1]);
    }

    // Assert grouping boundaries: once we move to a higher priority number we never go back
    const firstIdx: Record<string, number> = {} as any;
    const lastIdx: Record<string, number> = {} as any;
    statuses.forEach((s: string, idx: number) => {
      if (firstIdx[s] === undefined) firstIdx[s] = idx;
      lastIdx[s] = idx;
    });
    // If both conflict and fast_forward present ensure all conflicts come before any fast_forward
    if (
      firstIdx.conflict !== undefined &&
      firstIdx.fast_forward !== undefined
    ) {
      expect(lastIdx.conflict).toBeLessThan(firstIdx.fast_forward);
    }
    if (firstIdx.fast_forward !== undefined && firstIdx.added !== undefined) {
      expect(lastIdx.fast_forward).toBeLessThan(firstIdx.added);
    }
    if (firstIdx.added !== undefined && firstIdx.unchanged !== undefined) {
      expect(lastIdx.added).toBeLessThan(firstIdx.unchanged);
    }

    // Presence checks (we purposely created each status)
    expect(
      statuses.filter((s: string) => s === 'conflict').length
    ).toBeGreaterThanOrEqual(1);
    expect(statuses.includes('fast_forward')).toBe(true);
    expect(statuses.includes('added')).toBe(true);
    expect(statuses.includes('unchanged')).toBe(true);
  }, 15000);
});
