import { describe, test, expect } from 'vitest';
import { GraphService } from '../src/modules/graph/graph.service';

class FakeDb {
    public objects: any[] = [];
    public rels: any[] = [];
    async getClient() { return { query: (s: string, p?: any[]) => this.query(s, p), release() { } }; }
    async query(sql: string, params?: any[]) {
        // Uniqueness head check for objects (project_id,type,key) used by createObject
        if (/WHERE project_id IS NOT DISTINCT FROM \$1 AND type=\$2 AND key=\$3/i.test(sql)) {
            // params: [project_id, type, key]
            const projectId = params?.[0]; // always null in these tests
            const type = params?.[1];
            const key = params?.[2];
            const existing = this.objects.find(o => o.type === type && o.key === key && (projectId == null));
            return { rows: existing ? [{ ...existing }] : [], rowCount: existing ? 1 : 0 } as any;
        }
        // Objects insert
        if (/INSERT INTO kb\.graph_objects\(type, key, properties, labels, version, canonical_id(?:, org_id, project_id)?\)/i.test(sql)) {
            const row = { id: 'o_' + (this.objects.length + 1), canonical_id: 'c_' + (this.objects.length + 1), supersedes_id: null, version: 1, type: params?.[0], key: params?.[1], properties: params?.[2], labels: params?.[3], created_at: new Date(Date.now() + this.objects.length * 1000).toISOString() };
            this.objects.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Relationships insert
        if (/INSERT INTO kb\.graph_relationships/i.test(sql)) {
            const row = { id: 'r_' + (this.rels.length + 1), org_id: 'org', project_id: 'proj', type: params?.[2], src_id: params?.[3], dst_id: params?.[4], properties: params?.[5], weight: 0, valid_from: null, valid_to: null, created_at: new Date(Date.now() + this.rels.length * 1000).toISOString() };
            this.rels.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Object search
        if (/FROM kb\.graph_objects/i.test(sql)) {
            let rows = [...this.objects];
            if (/type = \$1/.test(sql) && params) rows = rows.filter(r => r.type === params[0]);
            // key and label filters depend on dynamic positions; simplify for test by brute filtering
            if (params && sql.includes('key =')) {
                const keyParam = params.find(p => typeof p === 'string' && p.startsWith('key_'));
                if (keyParam) rows = rows.filter(r => r.key === keyParam);
            }
            if (params && sql.includes('ANY(labels)')) {
                const labelParam = params.find(p => p === 'L1');
                if (labelParam) rows = rows.filter(r => r.labels.includes(labelParam));
            }
            if (sql.includes('created_at >') && params) {
                const cursorDate = params.find(p => p instanceof Date);
                if (cursorDate) rows = rows.filter(r => new Date(r.created_at) > cursorDate);
            }
            return { rows, rowCount: rows.length } as any;
        }
        // Relationship search
        if (/FROM kb\.graph_relationships/i.test(sql)) {
            let rows = [...this.rels];
            if (params && sql.includes('type =')) {
                const t = params.find(p => p === 'Rel'); if (t) rows = rows.filter(r => r.type === t);
            }
            if (params && sql.includes('src_id =')) {
                const s = params.find(p => p === 'o_1'); if (s) rows = rows.filter(r => r.src_id === s);
            }
            if (params && sql.includes('dst_id =')) {
                const d = params.find(p => p === 'o_2'); if (d) rows = rows.filter(r => r.dst_id === d);
            }
            if (sql.includes('created_at >') && params) {
                const cursorDate = params.find(p => p instanceof Date);
                if (cursorDate) rows = rows.filter(r => new Date(r.created_at) > cursorDate);
            }
            return { rows, rowCount: rows.length } as any;
        }
        return { rows: [], rowCount: 0 } as any;
    }
}

describe('GraphService search', () => {
    test('object search filters by type and label with cursor pagination', async () => {
        const db = new FakeDb();
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub);
        await svc.createObject({ type: 'Asset', key: 'key_1', properties: { a: 1 }, labels: ['L1'] });
        await svc.createObject({ type: 'Asset', key: 'key_2', properties: { a: 2 }, labels: ['L1'] });
        await svc.createObject({ type: 'Service', key: 'key_3', properties: { a: 3 }, labels: ['L1'] });
        const first = await svc.searchObjects({ type: 'Asset', label: 'L1', limit: 1 });
        expect(first.items.length).toBe(1);
        expect(first.next_cursor).toBeTruthy();
        const next = await svc.searchObjects({ type: 'Asset', label: 'L1', limit: 1, cursor: first.next_cursor });
        expect(next.items.length).toBe(1);
    });

    test('relationship search filters by type/src/dst', async () => {
        const db = new FakeDb();
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub);
        // create objects just for id namespace (not strictly needed for relationships in fake)
        await svc.createObject({ type: 'O', key: 'k1' });
        await svc.createObject({ type: 'O', key: 'k2' });
        await svc.createRelationship({ type: 'Rel', src_id: 'o_1', dst_id: 'o_2' }, 'org', 'proj');
        await svc.createRelationship({ type: 'Rel', src_id: 'o_2', dst_id: 'o_1' }, 'org', 'proj');
        const result = await svc.searchRelationships({ type: 'Rel', src_id: 'o_1' });
        expect(result.items.length).toBe(1);
        expect(result.items[0].src_id).toBe('o_1');
    });
});
