import { describe, test, expect } from 'vitest';
import { GraphService } from '../src/modules/graph/graph.service';
import { makeSchemaRegistryStub } from './helpers/schema-registry.stub';
import { makeFakeGraphDb } from './helpers/fake-graph-db';

describe('GraphService search', () => {
    test('object search filters by type and label with cursor pagination', async () => {
        const db = makeFakeGraphDb({ enableSearch: true, enableRelationships: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        const obj1 = await svc.createObject({ type: 'Asset', key: 'key_1', properties: { a: 1 }, labels: ['L1'] });
        const obj2 = await svc.createObject({ type: 'Asset', key: 'key_2', properties: { a: 2 }, labels: ['L1'] });
        const obj3 = await svc.createObject({ type: 'Service', key: 'key_3', properties: { a: 3 }, labels: ['L1'] });
        const first = await svc.searchObjects({ type: 'Asset', label: 'L1', limit: 1 });
        expect(first.items.length).toBe(1);
        expect(first.next_cursor).toBeTruthy();
        const next = await svc.searchObjects({ type: 'Asset', label: 'L1', limit: 1, cursor: first.next_cursor });
        expect(next.items.length).toBe(1);
    });

    test('relationship search filters by type/src/dst', async () => {
        const db = makeFakeGraphDb({ enableSearch: true, enableRelationships: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        // create objects just for id namespace (not strictly needed for relationships in fake)
        await svc.createObject({ type: 'O', key: 'k1', project_id: 'proj' } as any);
        await svc.createObject({ type: 'O', key: 'k2', project_id: 'proj' } as any);
        await svc.createRelationship({ type: 'Rel', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
        await svc.createRelationship({ type: 'Rel', src_id: 'o_2', dst_id: 'o_1' }, 'org', 'proj');
        const result = await svc.searchRelationships({ type: 'Rel', src_id: 'o_1' });
        expect(result.items.length).toBe(1);
        expect(result.items[0].src_id).toBe('o_1');
    });

    test('relationship search supports descending order newest-first pagination', async () => {
        const db = makeFakeGraphDb({ enableSearch: true, enableRelationships: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        await svc.createObject({ type: 'O', key: 'ka', project_id: 'proj' } as any);
        await svc.createObject({ type: 'O', key: 'kb', project_id: 'proj' } as any);
        // Insert three relationships in temporal order
        const r1 = await svc.createRelationship({ type: 'Link', src_id: 'o_1', dst_id: 'o_2', properties: { idx: 1 } }, 'org', 'proj');
        const r2 = await svc.createRelationship({ type: 'Link', src_id: 'o_2', dst_id: 'o_1', properties: { idx: 2 } }, 'org', 'proj');
        const r3 = await svc.createRelationship({ type: 'Link', src_id: 'o_1', dst_id: 'o_2', properties: { idx: 3 } }, 'org', 'proj');
        const firstPage = await svc.searchRelationships({ type: 'Link', limit: 2, order: 'desc' });
        expect(firstPage.items.length).toBe(2);
        // Newest first: expect idx 3 then idx 2
        expect(firstPage.items[0].properties.idx).toBe(3);
        expect(firstPage.items[1].properties.idx).toBe(2);
        expect(firstPage.next_cursor).toBeTruthy();
        const secondPage = await svc.searchRelationships({ type: 'Link', limit: 2, order: 'desc', cursor: firstPage.next_cursor });
        // Remaining oldest item idx 1
        expect(secondPage.items.length).toBeGreaterThanOrEqual(1);
        expect(secondPage.items[0].properties.idx).toBe(1);
    });

    test('relationship search supports ascending order oldest-first pagination', async () => {
        const db = makeFakeGraphDb({ enableSearch: true, enableRelationships: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        await svc.createObject({ type: 'O', key: 'ka', project_id: 'proj' } as any);
        await svc.createObject({ type: 'O', key: 'kb', project_id: 'proj' } as any);
        // Insert relationships in temporal order
        await svc.createRelationship({ type: 'Link', src_id: 'o_1', dst_id: 'o_2', properties: { idx: 1 } }, 'org', 'proj');
        await svc.createRelationship({ type: 'Link', src_id: 'o_2', dst_id: 'o_1', properties: { idx: 2 } }, 'org', 'proj');
        await svc.createRelationship({ type: 'Link', src_id: 'o_1', dst_id: 'o_2', properties: { idx: 3 } }, 'org', 'proj');
        const firstPage = await svc.searchRelationships({ type: 'Link', limit: 2 }); // default asc
        expect(firstPage.items.length).toBe(2);
        // Oldest first: idx values should be increasing
        expect(firstPage.items[0].properties.idx).toBeLessThan(firstPage.items[1].properties.idx);
        expect(firstPage.next_cursor).toBeTruthy();
        if (firstPage.next_cursor) {
            const secondPage = await svc.searchRelationships({ type: 'Link', limit: 2, cursor: firstPage.next_cursor });
            // Remaining newest item(s) should have idx greater than last idx from page 1
            if (secondPage.items.length) {
                expect(secondPage.items[0].properties.idx).toBeGreaterThan(firstPage.items[1].properties.idx);
            }
        }
    });
});
