import { describe, test, expect } from 'vitest';
import { GraphService } from '../src/modules/graph/graph.service';

class FakeDb {
    public objects: any[] = [];
    public rels: any[] = [];
    async getClient() { return { query: (s: string, p?: any[]) => this.query(s, p), release() { } }; }
    async query(sql: string, params?: any[]) {
        // Simplified object insert
        if (/INSERT INTO kb\.graph_objects/iu.test(sql)) {
            const row = { id: 'o_' + (this.objects.length + 1), canonical_id: 'c_' + (this.objects.length + 1), supersedes_id: null, version: 1, type: params?.[0], key: params?.[1], properties: params?.[2] || {}, labels: params?.[3] || [], created_at: new Date().toISOString() };
            this.objects.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Relationship insert
        if (/INSERT INTO kb\.graph_relationships/iu.test(sql)) {
            const row = { id: 'r_' + (this.rels.length + 1), org_id: 'org', project_id: 'proj', type: params?.[2], src_id: params?.[3], dst_id: params?.[4], properties: params?.[5] || {}, weight: 0, valid_from: null, valid_to: null, created_at: new Date().toISOString(), deleted_at: null };
            this.rels.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Fetch object by id (service selects deleted_at column too)
        if (/SELECT id, type, key, labels, deleted_at FROM kb\.graph_objects WHERE id=\$1/i.test(sql)) {
            const row = this.objects.find(o => o.id === params?.[0]);
            if (row) return { rows: [row], rowCount: 1 } as any; return { rows: [], rowCount: 0 } as any;
        }
        // Traversal edge expansion now uses head-first DISTINCT ON subquery followed by outer deleted_at filter.
        if (/SELECT \* FROM \(\s*SELECT DISTINCT ON \(canonical_id\) id, type, src_id, dst_id, deleted_at, version\s+FROM kb\.graph_relationships/i.test(sql)) {
            const objectId = params?.[0];
            // Determine direction from WHERE clause pieces inside DISTINCT subquery
            const both = /\(src_id = \$1 OR dst_id = \$1\)/.test(sql);
            const out = /WHERE src_id = \$1/.test(sql);
            const incoming = /WHERE dst_id = \$1/.test(sql);
            // Relationship type filter present if 'type = ANY(ARRAY[' appears
            const typeFilterPresent = /type = ANY\(ARRAY\[/i.test(sql);
            let subset = this.rels.filter(r => {
                if (both) return r.src_id === objectId || r.dst_id === objectId;
                if (out) return r.src_id === objectId;
                if (incoming) return r.dst_id === objectId;
                return false;
            });
            if (typeFilterPresent && params && params.length > 1) {
                const allowed = new Set(params.slice(1));
                subset = subset.filter(r => allowed.has(r.type));
            }
            // Head selection per canonical id (simulate versions: later inserts could add version field if needed)
            const headsMap: Record<string, any> = {};
            for (const rel of subset) {
                const existing = headsMap[rel.canonical_id || rel.id];
                const version = rel.version || 1;
                if (!existing || version > (existing.version || 1)) headsMap[rel.canonical_id || rel.id] = rel;
            }
            const heads = Object.values(headsMap).filter(r => !r.deleted_at).slice(0, 500);
            return { rows: heads, rowCount: heads.length } as any;
        }
        return { rows: [], rowCount: 0 } as any;
    }
}

describe('GraphService traverse', () => {
    test('basic BFS traversal with depth limit', async () => {
        const db = new FakeDb();
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub);
        // Create three objects in a chain o1 -> o2 -> o3
        await svc.createObject({ type: 'Asset', key: 'k1', labels: ['L'] }); // o_1
        await svc.createObject({ type: 'Asset', key: 'k2', labels: ['L'] }); // o_2
        await svc.createObject({ type: 'Asset', key: 'k3', labels: ['L'] }); // o_3
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
        const db = new FakeDb();
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub);
        await svc.createObject({ type: 'Asset', key: 'k1', labels: ['L'] });
        await svc.createObject({ type: 'Asset', key: 'k2', labels: ['L'] });
        await svc.createObject({ type: 'Asset', key: 'k3', labels: ['L'] });
        await svc.createRelationship({ type: 'LINKS', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
        await svc.createRelationship({ type: 'OTHER', src_id: 'o_2', dst_id: 'o_3' }, 'org', 'proj');
        const result = await svc.traverse({ root_ids: ['o_1'], relationship_types: ['LINKS'], max_depth: 5 });
        const nodeIds = result.nodes.map(n => n.id);
        expect(nodeIds).toContain('o_2');
        expect(nodeIds).not.toContain('o_3'); // filtered out by relationship type constraint (edge not traversed)
    });
});
