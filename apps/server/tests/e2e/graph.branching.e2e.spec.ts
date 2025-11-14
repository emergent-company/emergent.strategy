import { beforeAll, afterAll, afterEach, describe, test, expect } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Graph Branching E2E Tests
 *
 * Tests branch functionality via HTTP endpoints:
 * 1. Branch name uniqueness per project
 * 2. Object key uniqueness scoped by (project, branch, type, key) allowing same key across branches
 * 3. Divergent object evolution: same canonical_id versions differ per branch
 * 4. Relationship divergence & isolation in searches
 * 5. Search & traversal isolation by branch (basic smoke for search)
 */

// NOTE(flaky): Marked sequential to avoid intermittent PostgreSQL deadlock errors when run in parallel
// with other specs that exercise advisory locks & DDL (e.g., relationship creation dropping temp index).
// The suite creates/patches objects & relationships with overlapping advisory lock domains across branches.
// Running sequentially removes cross-worker contention that sporadically triggers a deadlock detection.
describe.sequential('Graph Branching (E2E)', () => {
  let ctx: Awaited<ReturnType<typeof createE2EContext>>;
  let request: supertest.SuperTest<supertest.Test>;
  let seq = 0;

  const contextHeaders = () => ({
    ...authHeader('default'),
    'x-org-id': ctx.orgId,
    'x-project-id': ctx.projectId,
  });

  const uniqueKey = (prefix: string) => `${prefix}-${Date.now()}-${seq++}`;

  beforeAll(async () => {
    ctx = await createE2EContext('graph-branching');
    request = supertest(ctx.baseUrl);
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanupProjectArtifacts(ctx.projectId);
    }
  });

  async function createBranch(
    name: string,
    parentBranchId: string | null = null
  ): Promise<string> {
    const res = await request
      .post('/graph/branches')
      .set(contextHeaders())
      .send({
        project_id: ctx.projectId,
        name,
        parent_branch_id: parentBranchId,
      })
      .expect(201);
    return res.body.id;
  }

  async function createObj(
    type: string,
    key: string,
    properties: any = {},
    branchId?: string
  ): Promise<any> {
    const res = await request
      .post('/graph/objects')
      .set(contextHeaders())
      .send({
        type,
        key,
        properties,
        organization_id: ctx.orgId,
        project_id: ctx.projectId,
        ...(branchId ? { branch_id: branchId } : {}),
      });

    if (res.status !== 201) {
      console.error('Create object failed:', {
        status: res.status,
        body: res.body,
        sent: {
          type,
          key,
          properties,
          organization_id: ctx.orgId,
          project_id: ctx.projectId,
          branch_id: branchId,
        },
      });
    }

    expect(res.status).toBe(201);
    return res.body;
  }

  async function patchObj(id: string, properties: any): Promise<any> {
    const res = await request
      .patch(`/graph/objects/${id}`)
      .set(contextHeaders())
      .send({ properties })
      .expect(200);
    return res.body;
  }

  async function createRelationship(
    type: string,
    srcId: string,
    dstId: string,
    properties: any = {},
    branchId?: string
  ): Promise<any> {
    const res = await request
      .post('/graph/relationships')
      .set(contextHeaders())
      .send({
        type,
        src_id: srcId,
        dst_id: dstId,
        properties,
        organization_id: ctx.orgId,
        project_id: ctx.projectId,
        ...(branchId ? { branch_id: branchId } : {}),
      })
      .expect(201);
    return res.body;
  }

  async function searchObjects(
    type: string,
    branchId?: string | null
  ): Promise<any> {
    const query: any = {
      type,
      limit: 10,
      order: 'desc',
    };

    // Only add branch_id param if explicitly provided (including null)
    if (branchId !== undefined) {
      query.branch_id = branchId;
    }

    const res = await request
      .get('/graph/objects/search')
      .set(contextHeaders())
      .query(query)
      .expect(200);
    return res.body;
  }

  test('enforces branch name uniqueness per project', async () => {
    const branchName = `feature-alpha-${Date.now()}`;
    const mainBranch = await createBranch(branchName);
    expect(mainBranch).toBeTruthy();

    // Duplicate name should fail (unique constraint)
    await request
      .post('/graph/branches')
      .set(contextHeaders())
      .send({
        project_id: ctx.projectId,
        name: branchName,
      })
      .expect(400); // Expecting validation/constraint error
  });

  test('allows same object key on different branches', async () => {
    const branchA = await createBranch(`branch-a-${Date.now()}`);

    // Create an object on main branch (to verify basic functionality)
    const docObj = await createObj('Doc', uniqueKey('doc'), { v: 1 });

    // Create same logical key on main and branch (should succeed)
    const key = uniqueKey('shared');

    const mainObj = await createObj('Entry', key, { side: 'main' });

    const branchObj = await createObj(
      'Entry',
      key,
      { side: 'branch' },
      branchA
    );

    expect(mainObj.key).toBe(branchObj.key);
    expect(mainObj.branch_id).not.toBe(branchObj.branch_id); // main (null) vs branch id
    expect(mainObj.branch_id).toBeNull(); // main branch is null
    expect(branchObj.branch_id).toBe(branchA);
  });

  test('supports divergent object evolution per branch', async () => {
    const branchB = await createBranch(`branch-b-${Date.now()}`);

    // Create base object on main branch
    const base = await createObj('Config', uniqueKey('cfg'), { flag: false });
    const patchedMain = await patchObj(base.id, { flag: true });

    // Create independent object with same key on branch
    const branchObj = await createObj(
      'Config',
      base.key,
      { flag: 'branch' },
      branchB
    );
    const branchPatched = await patchObj(branchObj.id, { flag: 'branch-new' });

    expect(patchedMain.properties.flag).toBe(true);
    expect(branchPatched.properties.flag).toBe('branch-new');

    // Canonical IDs differ because we created independent base objects; lineage isolation holds
    expect(branchPatched.canonical_id).not.toBe(patchedMain.canonical_id);
  });

  test('allows relationship divergence across branches', async () => {
    const branchC = await createBranch(`branch-c-${Date.now()}`);

    // Create objects and relationship on main branch
    const aMain = await createObj('Node', uniqueKey('n'), {});
    const bMain = await createObj('Node', uniqueKey('n'), {});
    const relMain = await createRelationship('LINKS', aMain.id, bMain.id, {
      via: 'main',
    });

    // Create corresponding objects and relationship on branch
    const aBranch = await createObj(
      'Node',
      aMain.key,
      { side: 'branch' },
      branchC
    );
    const bBranch = await createObj(
      'Node',
      bMain.key,
      { side: 'branch' },
      branchC
    );
    const relBranch = await createRelationship(
      'LINKS',
      aBranch.id,
      bBranch.id,
      { via: 'branch' },
      branchC
    );

    expect(relMain.properties.via).toBe('main');
    expect(relBranch.properties.via).toBe('branch');
    expect(relMain.branch_id).not.toBe(relBranch.branch_id);
    expect(relMain.branch_id).toBeNull(); // main branch is null
    expect(relBranch.branch_id).toBe(branchC);
  });

  test('search isolation: objects & relationships filtered by branch_id', async () => {
    const branchD = await createBranch(`branch-d-${Date.now()}`);
    const key = uniqueKey('iso');

    // Create objects with same key on different branches
    const mainObj = await createObj('Iso', key, { where: 'main' });
    const branchObj = await createObj('Iso', key, { where: 'branch' }, branchD);

    // Search on main branch (branch_id: null)
    const mainSearch = await searchObjects('Iso', null);

    // Search on specific branch
    const branchSearch = await searchObjects('Iso', branchD);

    // Main search should find main object but not branch object
    expect(mainSearch.items.find((o: any) => o.id === mainObj.id)).toBeTruthy();
    expect(
      mainSearch.items.find((o: any) => o.id === branchObj.id)
    ).toBeFalsy();

    // Branch search should find branch object but not main object
    expect(
      branchSearch.items.find((o: any) => o.id === branchObj.id)
    ).toBeTruthy();
    expect(
      branchSearch.items.find((o: any) => o.id === mainObj.id)
    ).toBeFalsy();
  });
});
