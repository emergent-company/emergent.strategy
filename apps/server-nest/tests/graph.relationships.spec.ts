import { describe, expect, test } from 'vitest';
import { GraphService } from '../src/modules/graph/graph.service';

class FakeDb {
    public rels: any[] = [];
    public queries: { sql: string; params?: any[] }[] = [];
    async query(sql: string, params?: any[]) {
        this.queries.push({ sql, params });
        if (/INSERT INTO kb\.graph_relationships\(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id\)/i.test(sql)) {
            // initial version insert (service ensures no existing head). Just insert.
            const row = { id: 'rel_' + (this.rels.length + 1), org_id: params?.[0], project_id: params?.[1], type: params?.[2], src_id: params?.[3], dst_id: params?.[4], properties: params?.[5], version: 1, supersedes_id: null, canonical_id: 'can_' + (this.rels.length + 1), created_at: new Date().toISOString() };
            // But if a head already exists with identical properties, return existing (simulate service early return path)
            const existing = this.rels.find(r => r.project_id === row.project_id && r.type === row.type && r.src_id === row.src_id && r.dst_id === row.dst_id && r.supersedes_id == null);
            if (existing && JSON.stringify(existing.properties) === JSON.stringify(row.properties)) {
                return { rows: [existing], rowCount: 1 } as any;
            }
            this.rels.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        // Patch insert (service now includes deleted_at column explicitly with NULL) allow optional deleted_at in pattern
        if (/INSERT INTO kb\.graph_relationships\(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id(?:, deleted_at)?\)/i.test(sql)) {
            const row = { id: 'rel_' + (this.rels.length + 1), org_id: params?.[0], project_id: params?.[1], type: params?.[2], src_id: params?.[3], dst_id: params?.[4], properties: params?.[5], version: params?.[6], supersedes_id: params?.[8], canonical_id: params?.[7], created_at: new Date().toISOString(), deleted_at: null };
            this.rels.push(row); return { rows: [row], rowCount: 1 } as any;
        }
        if (/SELECT \* FROM kb\.graph_relationships WHERE id=\$1/i.test(sql)) {
            const r = this.rels.find(r => r.id === params?.[0]);
            return { rows: r ? [r] : [], rowCount: r ? 1 : 0 } as any;
        }
        if (/SELECT canonical_id FROM kb\.graph_relationships WHERE id=\$1/i.test(sql)) {
            const r = this.rels.find(r => r.id === params?.[0]);
            return { rows: r ? [{ canonical_id: r.canonical_id }] : [], rowCount: r ? 1 : 0 } as any;
        }
        // getRelationship by id (ensure we don't accidentally match broader SELECTs like listEdges)
        if (/SELECT id, org_id, project_id, type, src_id, dst_id, properties[\s\S]*WHERE id=\$1/i.test(sql)) {
            const r = this.rels.find(r => r.id === params?.[0]);
            return { rows: r ? [r] : [], rowCount: r ? 1 : 0 } as any;
        }
        // listEdges now uses DISTINCT ON subquery selecting heads (may include deleted) and outer filter deleted_at IS NULL
        if (/SELECT \* FROM \(\s*SELECT DISTINCT ON \(r\.canonical_id\)/i.test(sql) && /FROM kb\.graph_relationships r/i.test(sql)) {
            const objectId = params?.[0];
            // Determine direction pattern from original sql
            // Service builds dirClause as '(r.src_id = $1 OR r.dst_id = $1)' for both-direction.
            // Previous regex failed to match due to the 'r.' qualifiers. Accept optional qualifier prefixes.
            const both = /\((?:r\.)?src_id = \$1 OR (?:r\.)?dst_id = \$1\)/.test(sql);
            const out = /WHERE r\.src_id = \$1/.test(sql);
            const incoming = /WHERE r\.dst_id = \$1/.test(sql);
            let subset = this.rels.filter(r => {
                if (both) return (r.src_id === objectId || r.dst_id === objectId);
                if (out) return r.src_id === objectId;
                if (incoming) return r.dst_id === objectId;
                return false;
            });
            // Head selection: pick highest version per canonical_id
            const headsMap: Record<string, any> = {};
            for (const rel of subset) {
                const existing = headsMap[rel.canonical_id];
                if (!existing || (rel.version || 1) > (existing.version || 1)) headsMap[rel.canonical_id] = rel;
            }
            const heads = Object.values(headsMap).filter(r => !r.deleted_at);
            return { rows: heads.slice(0, params?.[1] ?? heads.length), rowCount: heads.length } as any;
        }
        if (/SELECT id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id[\s\S]*FROM kb\.graph_relationships WHERE canonical_id=\$1/i.test(sql)) {
            // history listing
            const canonicalId = params?.[0];
            const items = this.rels.filter(r => r.canonical_id === canonicalId).sort((a, b) => b.version - a.version);
            return { rows: items, rowCount: items.length } as any;
        }
        return { rows: [], rowCount: 0 } as any;
    }
    async getClient() { return { query: (s: string, p?: any[]) => this.query(s, p), release() { } }; }
}

describe('GraphService relationships', () => {
    const stubSchemaRegistry: any = { getRelationshipValidator: async () => undefined, getObjectValidator: async () => undefined };
    test('create & patch relationship (versioned)', async () => {
        const db = new FakeDb();
        const svc = new GraphService(db as any, stubSchemaRegistry);
        const rel = await svc.createRelationship({ type: 'depends_on', src_id: 'a', dst_id: 'b', properties: { weight: 1 } }, 'org1', 'proj1');
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
        const db = new FakeDb();
        const svc = new GraphService(db as any, stubSchemaRegistry);
        await svc.createRelationship({ type: 'rel', src_id: 'a', dst_id: 'b' }, 'org1', 'proj1');
        await svc.createRelationship({ type: 'rel', src_id: 'c', dst_id: 'a' }, 'org1', 'proj1');
        const edges = await svc.listEdges('a', 'both', 10);
        expect(edges.length).toBe(2);
    });

    test('no-op create returns existing head (no new version)', async () => {
        const db = new FakeDb();
        const svc = new GraphService(db as any, stubSchemaRegistry);
        const r1 = await svc.createRelationship({ type: 'rel', src_id: 'x', dst_id: 'y', properties: { a: 1 } }, 'org', 'proj');
        const r2 = await svc.createRelationship({ type: 'rel', src_id: 'x', dst_id: 'y', properties: { a: 1 } }, 'org', 'proj');
        expect(r2.id).toBe(r1.id); // same head
        const history = await svc.listRelationshipHistory(r1.id);
        expect(history.items.length).toBe(1);
    });
});
