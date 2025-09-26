import { describe, expect, test } from 'vitest';
import { GraphService } from '../src/modules/graph/graph.service';

class FakeDb {
    private seq = 0;
    public rows: any[] = [];
    public queries: { sql: string; params?: any[] }[] = [];
    async getClient() { return { query: (s: string, p?: any[]) => this.query(s, p), release() { } }; }
    async query(sql: string, params?: any[]) {
        this.queries.push({ sql, params });
        // Match create insert (now includes org_id, project_id) – allow legacy form too for forward compatibility
        if (/INSERT INTO kb\.graph_objects\(type, key, properties, labels, version, canonical_id(?:, org_id, project_id)?\)/i.test(sql)) {
            const row = {
                id: `obj_${++this.seq}`,
                canonical_id: `canon_${this.seq}`,
                supersedes_id: null,
                version: 1,
                type: params?.[0],
                key: params?.[1],
                properties: params?.[2],
                labels: params?.[3],
                created_at: new Date().toISOString(),
            }; this.rows.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        if (/SELECT \* FROM kb\.graph_objects WHERE id=\$1/i.test(sql)) {
            const found = this.rows.find(r => r.id === params?.[0]);
            return { rows: found ? [found] : [], rowCount: found ? 1 : 0 } as any;
        }
        // Match patch insert (now: type, key, properties, labels, version, canonical_id, supersedes_id, org_id, project_id, deleted_at)
        if (/INSERT INTO kb\.graph_objects\(type, key, properties, labels, version, canonical_id, supersedes_id(?:, org_id, project_id, deleted_at)?\)/i.test(sql)) {
            const prev = this.rows.find(r => r.id === params?.[6]);
            const row = {
                id: `obj_${++this.seq}`,
                canonical_id: prev?.canonical_id || `canon_${this.seq}`,
                supersedes_id: params?.[6],
                version: params?.[4],
                type: params?.[0],
                key: params?.[1],
                properties: params?.[2],
                labels: params?.[3],
                created_at: new Date().toISOString(),
            }; this.rows.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        if (/SELECT canonical_id FROM kb\.graph_objects WHERE id=\$1/i.test(sql)) {
            const found = this.rows.find(r => r.id === params?.[0]);
            return { rows: found ? [{ canonical_id: found.canonical_id }] : [], rowCount: found ? 1 : 0 } as any;
        }
        if (/SELECT id, canonical_id, supersedes_id, version, type, key, properties, labels, created_at/i.test(sql)) {
            // history query - return all with canonical_id
            const subset = this.rows.filter(r => r.canonical_id === params?.[0]).sort((a, b) => b.version - a.version);
            return { rows: subset, rowCount: subset.length } as any;
        }
        return { rows: [], rowCount: 0 } as any;
    }
}

describe('GraphService object versioning', () => {
    test('create + patch increments version and returns diff', async () => {
        const db = new FakeDb();
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub);
        const created = await svc.createObject({ type: 'Asset', properties: { name: 'A' }, labels: ['root'] });
        expect(created.version).toBe(1);
        const patched = await svc.patchObject(created.id, { properties: { desc: 'x' } });
        expect(patched.version).toBe(2);
        expect(patched.diff).toBeTruthy();
        expect(patched.diff?.added || patched.diff?.updated).toBeTruthy();
    });

    test('idempotent patch (no change) rejected', async () => {
        const db = new FakeDb();
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub);
        const created = await svc.createObject({ type: 'Asset', properties: { name: 'A' } });
        let err: any; try { await svc.patchObject(created.id, {}); } catch (e) { err = e; }
        expect(err).toBeTruthy();
    });
});
