import { describe, it, beforeEach, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { SchemaRegistryService } from '../../../src/modules/graph/schema-registry.service';

// Minimal stub DB with only queries needed for expand
class StubDb {
    objects: Record<string, any> = {};
    rels: any[] = [];
    async query(sql: string, params: any[]): Promise<any> {
        if (sql.includes('FROM kb.graph_objects')) {
            const id = params[0];
            const o = this.objects[id];
            if (!o) return { rowCount: 0, rows: [] };
            return { rowCount: 1, rows: [o] };
        }
        if (sql.includes('FROM kb.graph_relationships')) {
            // Simplistic: return all rels involving current node param[0]
            const current = params[0];
            const rels = this.rels.filter(r => r.src_id === current || r.dst_id === current).map(r => ({ ...r, deleted_at: null, version: 1, branch_id: null }));
            return { rowCount: rels.length, rows: rels };
        }
        return { rowCount: 0, rows: [] };
    }
    async getClient() { return { query: this.query.bind(this), release() { } }; }
}
class StubSchema extends SchemaRegistryService { constructor() { super({} as any); } }

function seed(db: StubDb) {
    // Create small diamond A -> B, A -> C, B -> D, C -> D
    const nodes = ['A', 'B', 'C', 'D'];
    for (const n of nodes) db.objects[n] = { id: n, type: 'Node', key: n, labels: ['L'], properties: { name: n }, deleted_at: null, branch_id: null };
    db.rels.push({ id: 'R1', type: 'LINKS', src_id: 'A', dst_id: 'B', properties: {} });
    db.rels.push({ id: 'R2', type: 'LINKS', src_id: 'A', dst_id: 'C', properties: {} });
    db.rels.push({ id: 'R3', type: 'LINKS', src_id: 'B', dst_id: 'D', properties: {} });
    db.rels.push({ id: 'R4', type: 'LINKS', src_id: 'C', dst_id: 'D', properties: {} });
}

describe('GraphService expand telemetry', () => {
    let service: GraphService; let db: StubDb;
    beforeEach(() => { db = new StubDb(); seed(db); service = new GraphService(db as any, new StubSchema() as any); });

    it('emits expand telemetry event with required meta fields', async () => {
        const res = await service.expand({ root_ids: ['A'], max_depth: 2, include_relationship_properties: true });
        expect(res.nodes.length).toBeGreaterThan(0);
        // @ts-ignore
        const bag = service.telemetry;
        expect(bag).toBeTruthy();
        expect(bag.lastExpand).toBeTruthy();
        const evt = bag.lastExpand;
        expect(evt.type).toBe('graph.expand');
        expect(typeof evt.roots_count).toBe('number');
        expect(evt.node_count).toBe(res.nodes.length);
        expect(typeof evt.edge_count).toBe('number');
        expect(evt.max_depth_reached).toBeLessThanOrEqual(2);
        expect(typeof evt.truncated).toBe('boolean');
        expect(evt.filters.include_relationship_properties).toBe(true);
        expect(evt.filters.relationship_types).toBeUndefined();
        expect(evt.filters.object_types).toBeUndefined();
        expect(evt.filters.labels).toBeUndefined();
        expect(typeof evt.elapsed_ms).toBe('number');
    });

    it('reflects filters in telemetry', async () => {
        await service.expand({ root_ids: ['A'], max_depth: 1, relationship_types: ['LINKS'], object_types: ['Node'], labels: ['L'] });
        // @ts-ignore
        const evt = service.telemetry.lastExpand;
        expect(evt.filters.relationship_types).toEqual(['LINKS']);
        expect(evt.filters.object_types).toEqual(['Node']);
        expect(evt.filters.labels).toEqual(['L']);
    });
});
