import { describe, test, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { makeSchemaRegistryStub } from '../helpers/schema-registry.stub';
import { makeFakeGraphDb } from '../helpers/fake-graph-db';

async function seedBreadth(svc: GraphService) {
    // root -> a,b,c then each to leaf
    const root = await svc.createObject({ type: 'Node', key: 'root', labels: [], project_id: 'proj' } as any);
    const a = await svc.createObject({ type: 'Node', key: 'a', labels: [], project_id: 'proj' } as any);
    const b = await svc.createObject({ type: 'Node', key: 'b', labels: [], project_id: 'proj' } as any);
    const c = await svc.createObject({ type: 'Node', key: 'c', labels: [], project_id: 'proj' } as any);
    const a1 = await svc.createObject({ type: 'Node', key: 'a1', labels: [], project_id: 'proj' } as any);
    const b1 = await svc.createObject({ type: 'Node', key: 'b1', labels: [], project_id: 'proj' } as any);
    const c1 = await svc.createObject({ type: 'Node', key: 'c1', labels: [], project_id: 'proj' } as any);
    await svc.createRelationship({ type: 'REL', src_id: root.id, dst_id: a.id, properties: {} }, 'org', 'proj');
    await svc.createRelationship({ type: 'REL', src_id: root.id, dst_id: b.id, properties: {} }, 'org', 'proj');
    await svc.createRelationship({ type: 'REL', src_id: root.id, dst_id: c.id, properties: {} }, 'org', 'proj');
    await svc.createRelationship({ type: 'REL', src_id: a.id, dst_id: a1.id, properties: {} }, 'org', 'proj');
    await svc.createRelationship({ type: 'REL', src_id: b.id, dst_id: b1.id, properties: {} }, 'org', 'proj');
    await svc.createRelationship({ type: 'REL', src_id: c.id, dst_id: c1.id, properties: {} }, 'org', 'proj');
    return { root: root.id };
}

function decodeCursor(c: string) { return JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as { d: number; id: string }; }

describe('Traversal pagination', () => {
    test('AT-GSP-20 forward first page invariants', async () => {
        const db = makeFakeGraphDb({ enableTraversal: true });
        const schema = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schema as any);
        const { root } = await seedBreadth(svc);
        const res = await svc.traverse({ root_ids: [root], max_depth: 2, limit: 3 });
        expect(res.nodes.length).toBe(3);
        expect(res.nodes[0].depth).toBe(0);
        expect(res.next_cursor).toBeTruthy();
    });

    test('AT-GSP-21 second page disjoint from first', async () => {
        const db = makeFakeGraphDb({ enableTraversal: true });
        const schema = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schema as any);
        const { root } = await seedBreadth(svc);
        const first = await svc.traverse({ root_ids: [root], max_depth: 2, limit: 2 });
        const second = await svc.traverse({ root_ids: [root], max_depth: 2, limit: 2, cursor: first.next_cursor || undefined });
        const overlap = second.nodes.filter(n => first.nodes.some(f => f.id === n.id));
        expect(overlap.length).toBe(0);
    });

    test('AT-GSP-22 invalid cursor falls back to first page', async () => {
        const db = makeFakeGraphDb({ enableTraversal: true });
        const schema = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schema as any);
        const { root } = await seedBreadth(svc);
        const bogus = Buffer.from(JSON.stringify({ d: 99, id: 'zzz' })).toString('base64url');
        const res = await svc.traverse({ root_ids: [root], max_depth: 2, limit: 4, cursor: bogus });
        expect(res.nodes[0].depth).toBe(0);
    });

    test('AT-GSP-23 backward page excludes cursor boundary', async () => {
        const db = makeFakeGraphDb({ enableTraversal: true });
        const schema = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schema as any);
        const { root } = await seedBreadth(svc);
        const forward = await svc.traverse({ root_ids: [root], max_depth: 2, limit: 2 });
        const cursor = forward.next_cursor!;
        const back = await svc.traverse({ root_ids: [root], max_depth: 2, limit: 1, cursor, page_direction: 'backward' });
        const decoded = decodeCursor(cursor);
        expect(back.nodes.some(n => n.id === decoded.id)).toBe(false);
    });
});
