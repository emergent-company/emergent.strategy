import { beforeAll, afterAll, describe, test, expect } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Utilities aligned with existing graph history tests (include project/org context & auth header)
async function createObject(request: supertest.SuperTest<supertest.Test>, headers: Record<string, string>, ctx: { projectId: string; orgId: string }, data: Partial<{ type: string; key: string; properties: any; labels: string[] }> = {}) {
    const res = await request
        .post('/graph/objects')
        .set(headers)
        .send({ type: 'Doc', key: `k_${Date.now()}_${Math.random().toString(36).slice(2)}`, properties: {}, labels: [], organization_id: ctx.orgId, project_id: ctx.projectId, ...data })
        .expect(201);
    return res.body as any;
}

async function createRelationship(request: supertest.SuperTest<supertest.Test>, headers: Record<string, string>, ctx: { projectId: string; orgId: string }, srcId: string, dstId: string) {
    const res = await request
        .post('/graph/relationships')
        .set(headers)
        .send({ type: 'relates_to', src_id: srcId, dst_id: dstId, properties: { w: 1 }, organization_id: ctx.orgId, project_id: ctx.projectId })
        .expect(201);
    return res.body as any;
}

describe('Graph Soft Delete (E2E)', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    let request: supertest.SuperTest<supertest.Test>;
    // Use standard 'default' scope variant; differentiate user via suffix passed to createE2EContext
    const contextHeaders = () => ({
        ...authHeader('default'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
    });

    beforeAll(async () => {
        ctx = await createE2EContext('graph-soft-delete');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => {
        await ctx.cleanup();
        await ctx.close();
    });

    test('object delete -> excluded from search & restore reappears', async () => {
        const obj = await createObject(request, contextHeaders(), ctx, { labels: ['alpha'] });

        const search1 = await request.get('/graph/objects/search?label=alpha').set(contextHeaders()).expect(200);
        expect(search1.body.items.find((o: any) => o.id === obj.id)).toBeTruthy();

        const del = await request.delete(`/graph/objects/${obj.id}`).set(contextHeaders()).expect(200);
        expect(del.body.deleted_at).toBeTruthy();

        const search2 = await request.get('/graph/objects/search?label=alpha').set(contextHeaders()).expect(200);
        expect(search2.body.items.find((o: any) => o.id === obj.id)).toBeFalsy();

        const hist1 = await request.get(`/graph/objects/${obj.id}/history`).set(contextHeaders()).expect(200);
        expect(hist1.body.items[0].deleted_at).toBeTruthy();

        const restored = await request.post(`/graph/objects/${del.body.id}/restore`).set(contextHeaders()).expect(201); // restore returns new head
        expect(restored.body.deleted_at).toBeFalsy();
        expect(restored.body.version).toBe(hist1.body.items[0].version + 1);

        const search3 = await request.get('/graph/objects/search?label=alpha').set(contextHeaders()).expect(200);
        expect(search3.body.items.find((o: any) => o.key === obj.key)).toBeTruthy();

        const hist2 = await request.get(`/graph/objects/${obj.id}/history`).set(contextHeaders()).expect(200);
        expect(hist2.body.items[0].deleted_at).toBeFalsy();
    });

    test('relationship delete -> excluded from edges & restore reappears', async () => {
        const a = await createObject(request, contextHeaders(), ctx);
        const b = await createObject(request, contextHeaders(), ctx);
        const rel = await createRelationship(request, contextHeaders(), ctx, a.id, b.id);

        const edges1 = await request.get(`/graph/objects/${a.id}/edges`).set(contextHeaders()).expect(200);
        expect(edges1.body.find((r: any) => r.id === rel.id)).toBeTruthy();

        const delRel = await request.delete(`/graph/relationships/${rel.id}`).set(contextHeaders()).expect(200);
        expect(delRel.body.deleted_at).toBeTruthy();

        const edges2 = await request.get(`/graph/objects/${a.id}/edges`).set(contextHeaders()).expect(200);
        expect(edges2.body.find((r: any) => r.id === rel.id)).toBeFalsy();

        const restoredRel = await request.post(`/graph/relationships/${delRel.body.id}/restore`).set(contextHeaders()).expect(201);
        expect(restoredRel.body.deleted_at).toBeFalsy();
        expect(restoredRel.body.version).toBe(delRel.body.version + 1);

        const edges3 = await request.get(`/graph/objects/${a.id}/edges`).set(contextHeaders()).expect(200);
        // New head relationship should match src/dst/type
        expect(edges3.body.find((r: any) => r.src_id === a.id && r.dst_id === b.id && r.type === rel.type)).toBeTruthy();
    });

    test('double delete & invalid restore errors', async () => {
        const obj = await createObject(request, contextHeaders(), ctx);
        await request.delete(`/graph/objects/${obj.id}`).set(contextHeaders()).expect(200);
        await request.delete(`/graph/objects/${obj.id}`).set(contextHeaders()).expect(400); // second delete rejected

        const hist = await request.get(`/graph/objects/${obj.id}/history`).set(contextHeaders()).expect(200);
        const tombstoneId = hist.body.items[0].id; // current head (deleted)
        const restored = await request.post(`/graph/objects/${tombstoneId}/restore`).set(contextHeaders()).expect(201);
        expect(restored.body.deleted_at).toBeFalsy();
        await request.post(`/graph/objects/${tombstoneId}/restore`).set(contextHeaders()).expect(400); // cannot restore non-deleted head
    });
});
