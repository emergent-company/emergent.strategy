import { describe, test, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { makeSchemaRegistryStub } from '../helpers/schema-registry.stub';
import { makeFakeGraphDb } from '../helpers/fake-graph-db';

describe('GraphService history endpoints', () => {
    test('object history returns descending versions with pagination cursor', async () => {
        const db = makeFakeGraphDb({ enableHistory: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        const base = await svc.createObject({ type: 'Thing', properties: { a: 1 }, labels: ['x'] });
        const v2 = await svc.patchObject(base.id, { properties: { b: 2 } });
        const v3 = await svc.patchObject(v2.id, { properties: { c: 3 } });
        const history = await svc.listHistory(v3.id, 2); // page size 2
        expect(history.items.map(i => i.version)).toEqual([3, 2]);
        expect(history.next_cursor).toBeTruthy();
        const next = await svc.listHistory(v3.id, 2, history.next_cursor);
        expect(next.items.map(i => i.version)).toEqual([1]);
    });

    test('relationship history returns descending versions', async () => {
        const db = makeFakeGraphDb({ enableHistory: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        const r1 = await svc.createRelationship({ type: 'links', src_id: 'a', dst_id: 'b', properties: { w: 1 } }, 'org', 'proj');
        const r2 = await svc.patchRelationship(r1.id, { properties: { w: 2 } });
        const r3 = await svc.patchRelationship(r2.id, { properties: { w: 3 } });
        const hist = await svc.listRelationshipHistory(r3.id, 10);
        expect(hist.items.map(r => r.version)).toEqual([3, 2, 1]);
    });
});
