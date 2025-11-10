import request from 'supertest';
import getTestApp, { getSeededOrgProject } from '../../setup';
import { INestApplication } from '@nestjs/common';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { describeWithDb } from '../../utils/db-describe';

// This test targets the "fast_forward" classification heuristic. Given current implementation,
// two independently created objects with same (type,key) have overlapping initial change paths
// so they'd normally classify as conflict when content differs. To exercise fast_forward we create
// an object on source that adds a non-overlapping path relative to target's prior patch which only
// touched a different path, ensuring no intersecting changed paths.
// We simulate this by: create object on both branches with identical properties (so initial hashes match
// and change paths overlap but hashes equal -> unchanged), then patch only source adding a new property.
// Now source_change.paths contains the new path; target_change.paths remains initial (or absent). Because
// we only persist change_summary for each head version independently, target head (creation) has paths for
// all initial properties while source head (patched) has paths for just the newly added property plus diff logic
// (diffProperties) records only modified path(s). Result: no overlap => fast_forward.

let app: INestApplication | null = null;

async function createBranch(
  name: string,
  organization_id: string,
  project_id: string
) {
  if (!app) throw new Error('Test application not initialised');
  const res = await request(app.getHttpServer())
    .post('/graph/branches')
    .send({ name, org_id, project_id });
  if (res.status !== 201) throw new Error('Branch create failed: ' + res.text);
  return res.body.id as string;
}

async function createObject(
  branchId: string,
  type: string,
  key: string,
  properties: Record<string, any>
) {
  const { orgId, projectId } = await getSeededOrgProject();
  if (!app) throw new Error('Test application not initialised');
  const res = await request(app.getHttpServer()).post('/graph/objects').send({
    type,
    key,
    properties,
    branch_id: branchId,
    organization_id: orgId,
    project_id: projectId,
  });
  if (res.status !== 201) throw new Error('Object create failed: ' + res.text);
  return res.body;
}

async function patchObject(id: string, properties: Record<string, any>) {
  if (!app) throw new Error('Test application not initialised');
  const res = await request(app.getHttpServer())
    .patch(`/graph/objects/${id}`)
    .send({ properties });
  if (res.status !== 200) throw new Error('Patch failed: ' + res.text);
  return res.body;
}

describeWithDb('Graph Merge Dry-Run – Fast Forward', () => {
  let targetBranch: string;
  let sourceBranch: string;
  let baseKey = 'doc-ff';

  beforeAll(async () => {
    app = await getTestApp();
    const { orgId, projectId } = await getSeededOrgProject();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    targetBranch = await createBranch('ff-target-' + suffix, orgId, projectId);
    sourceBranch = await createBranch('ff-source-' + suffix, orgId, projectId);
  });

  afterAll(async () => {
    if (!app) return;
    await app.close();
    app = null;
  });

  test('AT-MERGE-4: fast_forward object detected (non-overlapping change paths)', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    // Step 1: Create identical object on both branches
    const tgt = await createObject(targetBranch, 'Doc', baseKey, {
      title: 'Shared',
    });
    const src = await createObject(sourceBranch, 'Doc', baseKey, {
      title: 'Shared',
    });
    expect(tgt).toBeTruthy();
    expect(src).toBeTruthy();

    // Step 2: Patch source adding a new field (description) - diffProperties should record only that path
    await patchObject(src.id, { description: 'More detail on source' });

    // Merge dry-run
    const resp = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${targetBranch}/merge`)
      .send({ sourceBranchId: sourceBranch });
    expect(resp.status).toBe(200);
    const ffObj = resp.body.objects.find(
      (o: any) => o.status === 'fast_forward'
    );
    expect(ffObj).toBeTruthy();
    expect(resp.body.fast_forward_count).toBeGreaterThanOrEqual(1);
  });
});
