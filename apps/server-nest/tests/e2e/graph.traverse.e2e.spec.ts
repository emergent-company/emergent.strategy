import { beforeAll, afterAll, describe, test, expect } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Graph traversal E2E tests: validates bounded BFS semantics, filtering, and truncation flags.
 */

describe('Graph Traversal (E2E)', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    let request: supertest.SuperTest<supertest.Test>;
    const contextHeaders = () => ({
        ...authHeader('default'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
    });

    beforeAll(async () => {
        ctx = await createE2EContext('graph-traverse');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => {
        await ctx.close();
    });

    async function createObj(type: string, key: string, labels: string[] = []): Promise<any> {
        const res = await request
            .post('/graph/objects')
            .set(contextHeaders())
            .send({ type, key, properties: {}, labels, organization_id: ctx.orgId, project_id: ctx.projectId })
            .expect(201);
        return res.body;
    }

    async function relate(type: string, src: string, dst: string): Promise<any> {
        const res = await request
            .post('/graph/relationships')
            .set(contextHeaders())
            .send({ type, src_id: src, dst_id: dst, properties: {}, organization_id: ctx.orgId, project_id: ctx.projectId })
            .expect(201);
        return res.body;
    }

    test('bounded depth traversal collects nodes & edges respecting max_depth', async () => {
        // Shape: A -r1-> B -r1-> C -r1-> D ; A -r2-> E (branch) ; ensure depth limiting at 2 stops D
        const A = await createObj('Node', 'A');
        const B = await createObj('Node', 'B');
        const C = await createObj('Node', 'C');
        const D = await createObj('Node', 'D');
        const E = await createObj('Node', 'E');
        await relate('r1', A.id, B.id);
        await relate('r1', B.id, C.id);
        await relate('r1', C.id, D.id);
        await relate('r2', A.id, E.id);

        const res = await request
            .post('/graph/traverse')
            .set(contextHeaders())
            .send({ root_ids: [A.id], max_depth: 2 })
            .expect(200);

        const body = res.body;
        const nodeIds = body.nodes.map((n: any) => n.id);
        expect(nodeIds).toContain(A.id);
        expect(nodeIds).toContain(B.id);
        expect(nodeIds).toContain(C.id); // depth 2 from A includes C
        expect(nodeIds).not.toContain(D.id); // depth capped
        expect(nodeIds).toContain(E.id);
        expect(body.max_depth_reached).toBeGreaterThanOrEqual(2);
        expect(body.truncated).toBe(false);
    });

    test('type and relationship filters narrow expansion', async () => {
        const R1 = await createObj('Device', 'R1', ['alpha']);
        const R2 = await createObj('Device', 'R2', ['beta']);
        const SW = await createObj('Software', 'SW1', ['alpha']);
        await relate('runs', R1.id, SW.id);
        await relate('runs', R2.id, SW.id);

        const res = await request
            .post('/graph/traverse')
            .set(contextHeaders())
            .send({ root_ids: [R1.id], relationship_types: ['runs'], object_types: ['Device', 'Software'], labels: ['alpha'] })
            .expect(200);

        const body = res.body;
        const nodeTypes = Object.fromEntries(body.nodes.map((n: any) => [n.id, n.type]));
        // R1 (root) + SW (shares alpha label) ; R2 excluded (label beta)
        expect(Object.values(nodeTypes)).toContain('Device');
        expect(Object.values(nodeTypes)).toContain('Software');
        const ids = body.nodes.map((n: any) => n.id);
        expect(ids).toContain(R1.id);
        expect(ids).toContain(SW.id);
        expect(ids).not.toContain(R2.id);
    });

    test('truncation flags when exceeding max_nodes', async () => {
        // Create a star graph: center X connected to many leaves
        const center = await createObj('Hub', 'Center');
        const leaves: string[] = [];
        for (let i = 0; i < 15; i++) {
            const leaf = await createObj('Leaf', `L${i}`);
            leaves.push(leaf.id);
            await relate('edge', center.id, leaf.id);
        }
        const res = await request
            .post('/graph/traverse')
            .set(contextHeaders())
            .send({ root_ids: [center.id], max_nodes: 5 })
            .expect(200);
        expect(res.body.truncated).toBe(true);
        expect(res.body.nodes.length).toBeLessThanOrEqual(5);
    });

    test('outbound vs inbound direction controls expansion', async () => {
        // Shape: X -rel-> Y ; Z -rel-> X
        const X = await createObj('Node', 'X1');
        const Y = await createObj('Node', 'Y1');
        const Z = await createObj('Node', 'Z1');
        await relate('rel', X.id, Y.id); // outbound from X to Y
        await relate('rel', Z.id, X.id); // inbound into X from Z

        // Outbound from X only sees Y
        const outRes = await request
            .post('/graph/traverse')
            .set(contextHeaders())
            .send({ root_ids: [X.id], direction: 'out', max_depth: 1 })
            .expect(200);
        const outIds = outRes.body.nodes.map((n: any) => n.id);
        expect(outIds).toContain(X.id);
        expect(outIds).toContain(Y.id);
        expect(outIds).not.toContain(Z.id);

        // Inbound from X only sees Z
        const inRes = await request
            .post('/graph/traverse')
            .set(contextHeaders())
            .send({ root_ids: [X.id], direction: 'in', max_depth: 1 })
            .expect(200);
        const inIds = inRes.body.nodes.map((n: any) => n.id);
        expect(inIds).toContain(X.id);
        expect(inIds).toContain(Z.id);
        expect(inIds).not.toContain(Y.id);

        // Both sees Z and Y
        const bothRes = await request
            .post('/graph/traverse')
            .set(contextHeaders())
            .send({ root_ids: [X.id], direction: 'both', max_depth: 1 })
            .expect(200);
        const bothIds = bothRes.body.nodes.map((n: any) => n.id);
        expect(bothIds).toContain(X.id);
        expect(bothIds).toContain(Y.id);
        expect(bothIds).toContain(Z.id);
    });

    test('multiple roots union frontier without duplication', async () => {
        // Shape: Root A -> C, Root B -> C (shared downstream). Expect C only once.
        const A = await createObj('Node', 'MR_A');
        const B = await createObj('Node', 'MR_B');
        const C = await createObj('Node', 'MR_C');
        await relate('link', A.id, C.id);
        await relate('link', B.id, C.id);

        const res = await request
            .post('/graph/traverse')
            .set(contextHeaders())
            .send({ root_ids: [A.id, B.id], direction: 'out', max_depth: 1 })
            .expect(200);
        const ids: string[] = res.body.nodes.map((n: any) => n.id);
        // Ensure roots and shared child present, and child not duplicated
        expect(ids).toContain(A.id);
        expect(ids).toContain(B.id);
        const occurrencesC = ids.filter(i => i === C.id).length;
        expect(occurrencesC).toBe(1);
    });
});
