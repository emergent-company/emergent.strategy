import { describe, test, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { makeSchemaRegistryStub } from '../helpers/schema-registry.stub';
import { makeFakeGraphDb } from '../helpers/fake-graph-db';

describe('GraphService traverse', () => {
    test('basic BFS traversal with depth limit', async () => {
        const db = makeFakeGraphDb({ enableTraversal: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        // Create three objects in a chain o1 -> o2 -> o3
        await svc.createObject({ type: 'Asset', key: 'k1', labels: ['L'], project_id: 'proj' } as any); // o_1
        await svc.createObject({ type: 'Asset', key: 'k2', labels: ['L'], project_id: 'proj' } as any); // o_2
        await svc.createObject({ type: 'Asset', key: 'k3', labels: ['L'], project_id: 'proj' } as any); // o_3
        await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
        await svc.createRelationship({ type: 'LINKS', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');

        const result = await svc.traverse({ root_ids: ['o_1'], max_depth: 1 });
        const nodeIds = result.nodes.map(n => n.id);
        expect(nodeIds).toContain('o_1');
        expect(nodeIds).toContain('o_2');
        expect(nodeIds).not.toContain('o_3'); // depth limited
        expect(result.edges.length).toBe(1);
        expect(result.truncated).toBe(false);
    });

    test('applies relationship type filter and node caps', async () => {
        const db = makeFakeGraphDb({ enableTraversal: true });
        const schemaRegistryStub = makeSchemaRegistryStub();
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        await svc.createObject({ type: 'Asset', key: 'k1', labels: ['L'], project_id: 'proj' } as any);
        await svc.createObject({ type: 'Asset', key: 'k2', labels: ['L'], project_id: 'proj' } as any);
        await svc.createObject({ type: 'Asset', key: 'k3', labels: ['L'], project_id: 'proj' } as any);
        await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
        await svc.createRelationship({ type: 'OTHER', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');
        const result = await svc.traverse({ root_ids: ['o_1'], relationship_types: ['LINKS'], max_depth: 5 });
        const nodeIds = result.nodes.map(n => n.id);
        expect(nodeIds).toContain('o_2');
        expect(nodeIds).not.toContain('o_3'); // filtered out by relationship type constraint (edge not traversed)
    });
});
