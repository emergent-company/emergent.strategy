import { describe, expect, test } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { makeFakeGraphDb } from '../helpers/fake-graph-db';

describe('GraphService relationships', () => {
    const stubSchemaRegistry: any = {
        getRelationshipValidator: async () => undefined,
        getObjectValidator: async () => undefined,
        // New multiplicity method required by GraphService.createRelationship
        getRelationshipMultiplicity: async () => ({ src: 'many', dst: 'many' })
    };
    test('create & patch relationship (versioned)', async () => {
        const db = makeFakeGraphDb({ enableRelationships: true, enableHistory: true });
        const svc = new GraphService(db as any, stubSchemaRegistry as any);
        const rel = await svc.createRelationship({ type: 'depends_on', src_id: 'a', dst_id: 'b', properties: { weight: 1 } }, 'org', 'proj');
        expect(rel.type).toBe('depends_on');
        expect(rel.version).toBe(1);
        const patched = await svc.patchRelationship(rel.id, { properties: { note: 'x' } });
        expect(patched.diff).toBeTruthy();
        expect(patched.version).toBe(2);
        expect(patched.properties.note).toBe('x');
        // history listing
        const history = await svc.listRelationshipHistory(patched.id);
        expect(history.items.length).toBe(2);
        expect(history.items[0].version).toBe(2);
        expect(history.items[1].version).toBe(1);
    });

    test('list edges (both directions)', async () => {
        const db = makeFakeGraphDb({ enableRelationships: true });
        const svc = new GraphService(db as any, stubSchemaRegistry as any);
        await svc.createRelationship({ type: 'rel', src_id: 'a', dst_id: 'b' }, 'org', 'proj');
        await svc.createRelationship({ type: 'rel', src_id: 'c', dst_id: 'a' }, 'org', 'proj');
        const edges = await svc.listEdges('a', 'both', 10);
        expect(edges.length).toBe(2);
    });

    test('no-op create returns existing head (no new version)', async () => {
        const db = makeFakeGraphDb({ enableRelationships: true, enableHistory: true });
        const svc = new GraphService(db as any, stubSchemaRegistry as any);
        const r1 = await svc.createRelationship({ type: 'rel', src_id: 'x', dst_id: 'y', properties: { a: 1 } }, 'org', 'proj');
        const r2 = await svc.createRelationship({ type: 'rel', src_id: 'x', dst_id: 'y', properties: { a: 1 } }, 'org', 'proj');
        expect(r2.id).toBe(r1.id); // same head
        const history = await svc.listRelationshipHistory(r1.id);
        expect(history.items.length).toBe(1);
    });
});
