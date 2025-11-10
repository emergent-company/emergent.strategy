import { describe, it, expect, beforeAll } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { InMemoryDatabaseService } from '../helpers/inmemory-db';

// Basic integration-style unit test for expand

describe('GraphService.expand', () => {
    let service: GraphService;
    let db: InMemoryDatabaseService;
    let orgId: string;
    let projectId: string;

    beforeAll(async () => {
        db = new InMemoryDatabaseService();
        await db.onModuleInit();
        // Deterministic static IDs (simulate org/project existence)
        orgId = '00000000-0000-0000-0000-000000000001';
        projectId = '00000000-0000-0000-0000-000000000002';
        // Minimal fake schema registry implementing required interface
        const fakeSchema = {
            getObjectValidator: async () => null,
            getRelationshipValidator: async () => null,
            getRelationshipMultiplicity: async () => ({ src: 'many', dst: 'many' })
        } as any;
        service = new GraphService(db as any, fakeSchema);
    });

    async function makeObject(key: string, props: any = {}): Promise<string> {
        const obj = await service.createObject({ type: 'TestType', key, properties: props, labels: ['t'], organization_id: orgId as any, project_id: projectId as any } as any);
        return obj.id;
    }

    async function makeRel(type: string, src: string, dst: string, props: any = {}) {
        await service.createRelationship({ type, src_id: src, dst_id: dst, properties: props } as any, orgId, projectId);
    }

    it('expands with projection include / exclude', async () => {
        if (!service) throw new Error('GraphService not initialized – DB setup failed');
        const a = await makeObject('A', { keep: 1, drop: 2 });
        const b = await makeObject('B', { keep: 1, drop: 2 });
        await makeRel('rel', a, b, {});
        const res = await service.expand({ root_ids: [a], max_depth: 1, projection: { include_object_properties: ['keep'], exclude_object_properties: ['irrelevant'] } });
        expect(res.nodes.length).toBeGreaterThanOrEqual(1);
        const root = res.nodes.find(n => n.id === a)!;
        expect(root.properties).toHaveProperty('keep');
        expect(root.properties).not.toHaveProperty('drop');
    });

    it('respects relationship type filter', async () => {
        if (!service) throw new Error('GraphService not initialized – DB setup failed');
        const a = await makeObject('C');
        const b = await makeObject('D');
        await makeRel('allowed', a, b, {});
        await makeRel('blocked', a, b, {});
        const res = await service.expand({ root_ids: [a], max_depth: 1, relationship_types: ['allowed'] });
        expect(res.edges.every(e => e.type === 'allowed')).toBe(true);
    });

    it('enforces max_nodes truncation', async () => {
        if (!service) throw new Error('GraphService not initialized – DB setup failed');
        const root = await makeObject('root-max');
        const childIds: string[] = [];
        for (let i = 0; i < 5; i++) {
            const c = await makeObject(`c${i}`);
            childIds.push(c);
            await makeRel('rel', root, c, {});
        }
        const res = await service.expand({ root_ids: [root], max_depth: 1, max_nodes: 3 });
        expect(res.truncated).toBe(true);
        expect(res.nodes.length).toBeLessThanOrEqual(3);
    });
});
