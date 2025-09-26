import { describe, test, expect } from 'vitest';
import { GraphService } from '../src/modules/graph/graph.service';

// Reuse a minimal fake DB that can support object + relationship version chains for history endpoints.
class FakeDb {
    objects: any[] = [];
    relationships: any[] = [];
    seqObj = 0;
    seqRel = 0;
    async getClient() { return { query: (s: string, p?: any[]) => this.query(s, p), release() { } }; }
    async query(sql: string, params?: any[]) {
        // Debug logging removed (was previously used for diagnosing relationship history issues).
        // Object create (version 1)
        if (/INSERT INTO kb\.graph_objects\(type, key, properties, labels, version, canonical_id(?:, org_id, project_id)?\)/i.test(sql)) {
            const row = { id: 'o_' + (++this.seqObj), canonical_id: 'co_' + this.seqObj, supersedes_id: null, version: 1, type: params?.[0], key: params?.[1], properties: params?.[2], labels: params?.[3] || [], created_at: new Date().toISOString() };
            this.objects.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Object get full row
        if (/SELECT \* FROM kb\.graph_objects WHERE id=\$1/i.test(sql)) {
            const r = this.objects.find(o => o.id === params?.[0]);
            return { rows: r ? [r] : [], rowCount: r ? 1 : 0 } as any;
        }
        // Object patch insert (new version)
        if (/INSERT INTO kb\.graph_objects\(type, key, properties, labels, version, canonical_id, supersedes_id(?:, org_id, project_id, deleted_at)?\)/i.test(sql)) {
            const prev = this.objects.find(o => o.id === params?.[6]);
            const row = { id: 'o_' + (++this.seqObj), canonical_id: prev?.canonical_id || 'co_' + this.seqObj, supersedes_id: params?.[6], version: params?.[4], type: params?.[0], key: params?.[1], properties: params?.[2], labels: params?.[3], created_at: new Date().toISOString() };
            this.objects.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Object newer-version head check (SELECT id FROM kb.graph_objects WHERE canonical_id=$1 AND version > $2 LIMIT 1)
        if (/SELECT id FROM kb\.graph_objects WHERE canonical_id=\$1 AND version > \$2 LIMIT 1/i.test(sql)) {
            const [canon, ver] = params || [];
            const newer = this.objects.find(o => o.canonical_id === canon && o.version > ver);
            return { rows: newer ? [{ id: newer.id }] : [], rowCount: newer ? 1 : 0 } as any;
        }
        // Object canonical id resolve
        if (/SELECT canonical_id FROM kb\.graph_objects WHERE id=\$1/i.test(sql)) {
            const r = this.objects.find(o => o.id === params?.[0]);
            return { rows: r ? [{ canonical_id: r.canonical_id }] : [], rowCount: r ? 1 : 0 } as any;
        }
        // Object history listing
        if (/FROM kb\.graph_objects WHERE canonical_id=\$1/i.test(sql)) {
            const canonicalId = params?.[0];
            const hasCursor = /version < \$2/.test(sql);
            const cursorVersion = hasCursor ? Number(params?.[1]) : undefined;
            let rows = this.objects
                .filter(o => o.canonical_id === canonicalId)
                .sort((a, b) => b.version - a.version);
            if (cursorVersion !== undefined) {
                rows = rows.filter(r => r.version < cursorVersion);
            }
            return { rows, rowCount: rows.length } as any;
        }

        // Relationship head lookup (original or new pattern ordering by version DESC)
        if (/SELECT \* FROM kb\.graph_relationships/i.test(sql) && /ORDER BY version DESC LIMIT 1/i.test(sql)) {
            // Pattern: WHERE project_id=$1 AND type=$2 AND src_id=$3 AND dst_id=$4
            const [projectId, type, src, dst] = params || [];
            const candidates = this.relationships.filter(r => r.project_id === projectId && r.type === type && r.src_id === src && r.dst_id === dst);
            const head = candidates.sort((a, b) => (b.version || 1) - (a.version || 1))[0];
            return { rows: head ? [head] : [], rowCount: head ? 1 : 0 } as any;
        }
        // Relationship create first version
        if (/INSERT INTO kb\.graph_relationships\(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id\)/i.test(sql)) {
            const row = { id: 'r_' + (++this.seqRel), org_id: params?.[0], project_id: params?.[1], type: params?.[2], src_id: params?.[3], dst_id: params?.[4], properties: params?.[5], version: 1, supersedes_id: null, canonical_id: 'cr_' + this.seqRel, weight: null, valid_from: null, valid_to: null, deleted_at: null, created_at: new Date().toISOString() };
            this.relationships.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Relationship patch insert (allow optional deleted_at column before closing paren)
        if (/INSERT INTO kb\.graph_relationships\(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id(?:, deleted_at)?\)/i.test(sql)) {
            const row = { id: 'r_' + (++this.seqRel), org_id: params?.[0], project_id: params?.[1], type: params?.[2], src_id: params?.[3], dst_id: params?.[4], properties: params?.[5], version: params?.[6], canonical_id: params?.[7], supersedes_id: params?.[8], weight: null, valid_from: null, valid_to: null, deleted_at: null, created_at: new Date().toISOString() };
            this.relationships.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Relationship newer-version check
        if (/SELECT id FROM kb\.graph_relationships WHERE canonical_id=\$1 AND version > \$2 LIMIT 1/i.test(sql)) {
            const [canon, ver] = params || [];
            const newer = this.relationships.find(r => r.canonical_id === canon && r.version > ver);
            return { rows: newer ? [{ id: newer.id }] : [], rowCount: newer ? 1 : 0 } as any;
        }
        // Relationship id fetch (SELECT ... specific columns)
        if (/SELECT id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id/.test(sql) && /WHERE id=\$1/.test(sql)) {
            const r = this.relationships.find(r => r.id === params?.[0]);
            return { rows: r ? [r] : [], rowCount: r ? 1 : 0 } as any;
        }
        // Relationship id fetch (SELECT * ... used in patch)
        if (/SELECT \* FROM kb\.graph_relationships/i.test(sql) && /WHERE id=\$1/i.test(sql) && /deleted_at IS NULL/i.test(sql)) {
            const r = this.relationships.find(r => r.id === params?.[0]);
            return { rows: r ? [r] : [], rowCount: r ? 1 : 0 } as any;
        }
        // Relationship head canonical newer version check (already handled) but ensure create inserted row into relationships array includes deleted_at null
        // Relationship canonical id resolve
        if (/SELECT canonical_id FROM kb\.graph_relationships WHERE id=\$1/i.test(sql)) {
            const r = this.relationships.find(r => r.id === params?.[0]);
            return { rows: r ? [{ canonical_id: r.canonical_id }] : [], rowCount: r ? 1 : 0 } as any;
        }
        // Relationship history listing
        if (/FROM kb\.graph_relationships WHERE canonical_id=\$1/i.test(sql)) {
            const canonicalId = params?.[0];
            const hasCursor = /version < \$2/.test(sql);
            const cursorVersion = hasCursor ? Number(params?.[1]) : undefined;
            let rows = this.relationships
                .filter(r => r.canonical_id === canonicalId)
                .sort((a, b) => b.version - a.version);
            if (cursorVersion !== undefined) {
                rows = rows.filter(r => r.version < cursorVersion);
            }
            return { rows, rowCount: rows.length } as any;
        }
        return { rows: [], rowCount: 0 } as any;
    }
}

describe('GraphService history endpoints', () => {
    test('object history returns descending versions with pagination cursor', async () => {
        const db = new FakeDb();
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub);
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
        const db = new FakeDb();
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub);
        const r1 = await svc.createRelationship({ type: 'links', src_id: 'a', dst_id: 'b', properties: { w: 1 } }, 'org', 'proj');
        const r2 = await svc.patchRelationship(r1.id, { properties: { w: 2 } });
        const r3 = await svc.patchRelationship(r2.id, { properties: { w: 3 } });
        const hist = await svc.listRelationshipHistory(r3.id, 10);
        expect(hist.items.map(r => r.version)).toEqual([3, 2, 1]);
    });
});
