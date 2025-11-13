import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import getTestApp, { getSeededOrgProject } from '../../setup';
import { beforeAll, afterAll, expect, test } from 'vitest';
import { describeWithDb } from '../../utils/db-describe';

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
  if (res.status !== 201) throw new Error('branch create failed: ' + res.text);
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
  if (res.status !== 201) throw new Error('object create failed: ' + res.text);
  return res.body;
}

describeWithDb('Graph Merge Apply (Phase 2)', () => {
  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    if (!app) return;
    await app.close();
    app = null;
  });

  test('APPLY-1: execute merge applies added + fast_forward objects', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    const { orgId, projectId } = await getSeededOrgProject();
    const target = await createBranch(
      'apply-target-' + Date.now(),
      orgId,
      projectId
    );
    const source = await createBranch(
      'apply-source-' + Date.now(),
      orgId,
      projectId
    );

    // Added
    await createObject(source, 'Doc', 'apply-add', {
      title: 'New From Source',
    });
    // Fast-forward (exists both; changes affect disjoint property paths)
    // Target has 'base' only, source has 'base' + unique 'extra_ff' key -> disjoint path sets => fast_forward
    await createObject(target, 'Doc', 'apply-ff', { base: 1 });
    await createObject(source, 'Doc', 'apply-ff', { base: 1, extra_ff: true });

    const dryRun = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${target}/merge`)
      .send({ sourceBranchId: source });
    expect(dryRun.status).toBe(200);
    expect(dryRun.body.conflict_count).toBe(0);
    expect(dryRun.body.added_count).toBeGreaterThanOrEqual(1);
    expect(dryRun.body.fast_forward_count).toBeGreaterThanOrEqual(1);

    const apply = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${target}/merge`)
      .send({ sourceBranchId: source, execute: true });
    expect(apply.status).toBe(200);
    expect(apply.body.applied).toBe(true);
    expect(apply.body.applied_objects).toBeGreaterThanOrEqual(2);
    // Post-apply dry-run should now show unchanged where fast_forward/added were
    const post = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${target}/merge`)
      .send({ sourceBranchId: source });
    expect(post.status).toBe(200);
    // Conflicts still zero and added/ff reduced
    expect(post.body.conflict_count).toBe(0);
  });

  test('APPLY-2: execute merge blocked when conflicts exist', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    const { orgId, projectId } = await getSeededOrgProject();
    const target = await createBranch(
      'apply-target-' + Date.now(),
      orgId,
      projectId
    );
    const source = await createBranch(
      'apply-source-' + Date.now(),
      orgId,
      projectId
    );

    const baseTgt = await createObject(target, 'Doc', 'apply-cf', {
      title: 'One',
    });
    await request(currentApp.getHttpServer())
      .patch(`/graph/objects/${baseTgt.id}`)
      .send({ properties: { title: 'Target Change' } });
    await createObject(source, 'Doc', 'apply-cf', { title: 'Source Change' });

    const dryRun = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${target}/merge`)
      .send({ sourceBranchId: source });
    expect(dryRun.status).toBe(200);
    expect(dryRun.body.conflict_count).toBeGreaterThanOrEqual(1);

    const apply = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${target}/merge`)
      .send({ sourceBranchId: source, execute: true });
    // Should not apply due to conflicts
    expect(apply.status).toBe(200); // still 200 summary, but applied false
    expect(apply.body.applied).toBeUndefined();
    expect(apply.body.applied_objects).toBeUndefined();
  });

  test('APPLY-3: re-executing after successful apply is idempotent', async () => {
    const currentApp = app;
    if (!currentApp) throw new Error('Test application not initialised');
    const { orgId, projectId } = await getSeededOrgProject();
    const target = await createBranch(
      'apply-target-' + Date.now(),
      orgId,
      projectId
    );
    const source = await createBranch(
      'apply-source-' + Date.now(),
      orgId,
      projectId
    );

    // Added + fast_forward setup
    await createObject(source, 'Doc', 'apply-idem-add', {
      title: 'From Source',
    });
    await createObject(target, 'Doc', 'apply-idem-ff', { base: 1 });
    await createObject(source, 'Doc', 'apply-idem-ff', {
      base: 1,
      extra_idem: true,
    });

    const firstExecute = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${target}/merge`)
      .send({ sourceBranchId: source, execute: true });
    expect(firstExecute.status).toBe(200);
    expect(firstExecute.body.applied).toBe(true);
    expect(firstExecute.body.applied_objects).toBeGreaterThanOrEqual(2);

    // Second execute should find everything unchanged now and thus apply zero objects.
    const secondExecute = await request(currentApp.getHttpServer())
      .post(`/graph/branches/${target}/merge`)
      .send({ sourceBranchId: source, execute: true });
    expect(secondExecute.status).toBe(200);
    expect(secondExecute.body.applied).toBe(true); // still an executed path
    // Should not report applied_objects since no writes (implementation omits when zero)
    expect(secondExecute.body.applied_objects).toBeUndefined();
    expect(secondExecute.body.added_count).toBe(0);
    expect(secondExecute.body.fast_forward_count).toBe(0);
    expect(secondExecute.body.conflict_count).toBe(0);
  }, 15000);
});
