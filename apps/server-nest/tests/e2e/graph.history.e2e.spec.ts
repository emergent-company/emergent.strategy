import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * E2E coverage for object & relationship version history endpoints including pagination & edge cases.
 */

describe('Graph History Endpoints (E2E)', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    let request: supertest.SuperTest<supertest.Test>;
    const contextHeaders = () => ({
        ...authHeader('default'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
    });

    beforeAll(async () => {
        ctx = await createE2EContext('graph-history');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => {
        await ctx.close();
    });

    test('object history pagination descending', async () => {
        // Create base object + 2 patches (3 versions total). Provide org/project for NOT NULL columns if enforced.
        const base = await request.post('/graph/objects').set(contextHeaders()).send({ type: 'Asset', key: 'asset-base', properties: { a: 1 }, organization_id: ctx.orgId, project_id: ctx.projectId }).expect(201);
        const v2 = await request.patch(`/graph/objects/${base.body.id}`).set(contextHeaders()).send({ properties: { b: 2 } }).expect(200);
        const v3 = await request.patch(`/graph/objects/${v2.body.id}`).set(contextHeaders()).send({ properties: { c: 3 } }).expect(200);

        // Page 1 (limit=2) => versions 3,2 (slicing may still return all if legacy index path; assert head ordering contains 3 & 2 first)
        const page1 = await request.get(`/graph/objects/${v3.body.id}/history?limit=2`).set(contextHeaders()).expect(200);
        expect(page1.body.items[0].version).toBe(3);
        expect(page1.body.items[1].version).toBe(2);
        expect(page1.body.next_cursor).toBeDefined();

        // Page 2 -> version 1
        const page2 = await request.get(`/graph/objects/${v3.body.id}/history?limit=2&cursor=${encodeURIComponent(page1.body.next_cursor)}`).set(contextHeaders()).expect(200);
        expect(page2.body.items.map((v: any) => v.version)).toEqual([1]);
        expect(page2.body.next_cursor).toBeUndefined();
    });

    test('relationship history descending & bad cursor empty', async () => {
        // Create two endpoint objects to reference in relationship (ensuring valid UUIDs in DB).
        const src = await request.post('/graph/objects').set(contextHeaders()).send({ type: 'Node', key: 'node-A', properties: { name: 'A' }, organization_id: ctx.orgId, project_id: ctx.projectId }).expect(201);
        const dst = await request.post('/graph/objects').set(contextHeaders()).send({ type: 'Node', key: 'node-B', properties: { name: 'B' }, organization_id: ctx.orgId, project_id: ctx.projectId }).expect(201);
        // Create relationship and patch twice.
        const r1 = await request.post('/graph/relationships').set(contextHeaders()).send({ type: 'links', src_id: src.body.id, dst_id: dst.body.id, properties: { w: 1 }, organization_id: ctx.orgId, project_id: ctx.projectId }).expect(201);
        const r2 = await request.patch(`/graph/relationships/${r1.body.id}`).set(contextHeaders()).send({ properties: { w: 2 } }).expect(200);
        const r3 = await request.patch(`/graph/relationships/${r2.body.id}`).set(contextHeaders()).send({ properties: { w: 3 } }).expect(200);

        const hist = await request.get(`/graph/relationships/${r3.body.id}/history`).set(contextHeaders()).expect(200);
        expect(hist.body.items.map((v: any) => v.version)).toEqual([3, 2, 1]);

        // Bad cursor (higher than head) -> empty set
        const empty = await request.get(`/graph/relationships/${r3.body.id}/history?cursor=999`).set(contextHeaders()).expect(200);
        expect(empty.body.items).toHaveLength(0);
        expect(empty.body.next_cursor).toBeUndefined();
    });

    test('404 for unknown object id', async () => {
        await request.get('/graph/objects/00000000-0000-0000-0000-000000000000/history').set(contextHeaders()).expect(404);
    });
});
