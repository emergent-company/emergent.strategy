import { describe, it, expect, beforeEach } from 'vitest';
import { GraphService } from '../src/modules/graph/graph.service';

// Minimal in-memory structures to simulate rows
interface ObjRow { id: string; canonical_id: string; version: number; type: string; key: string | null; properties: any; labels: string[]; deleted_at: Date | null; organization_id: string | null; project_id: string | null; supersedes_id: string | null; created_at: Date; }
interface RelRow { id: string; canonical_id: string; version: number; type: string; src_id: string; dst_id: string; properties: any; deleted_at: Date | null; organization_id: string | null; project_id: string | null; supersedes_id: string | null; weight: number | null; valid_from: Date | null; valid_to: Date | null; created_at: Date; }

// Deterministic ID generator sequence
let idCounter = 0;
function newId(prefix = 'id'): string { return `${prefix}-${++idCounter}`; }

class MockDB {
    objects: ObjRow[] = [];
    rels: RelRow[] = [];
    async getClient() { return this as any; }
    release() { /* noop */ }
    async query(sql: string, params: any[]): Promise<any> {
        sql = sql.trim();
        // Transaction commands
        if (/^BEGIN/i.test(sql) || /^COMMIT/i.test(sql) || /^ROLLBACK/i.test(sql) || /^SELECT pg_advisory_xact_lock/.test(sql) || /^DROP INDEX/i.test(sql)) {
            return { rowCount: 0, rows: [] };
        }
        // Object select by id
        if (/FROM kb\.graph_objects WHERE id=\$1$/i.test(sql)) {
            const row = this.objects.find(o => o.id === params[0]);
            return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
        }
        // Object select head by canonical
        if (/FROM kb\.graph_objects WHERE canonical_id=\$1 ORDER BY version DESC LIMIT 1$/i.test(sql)) {
            const rows = this.objects.filter(o => o.canonical_id === params[0]).sort((a, b) => b.version - a.version);
            const head = rows[0];
            return { rowCount: head ? 1 : 0, rows: head ? [head] : [] };
        }
        // Insert tombstone or restore object. Real service now appends fts, embedding, embedding_updated_at columns.
        if (/^INSERT INTO kb\.graph_objects\(type, key, properties, labels, version, canonical_id, supersedes_id, organization_id, project_id, deleted_at(?:, fts, embedding, embedding_updated_at)?\)/i.test(sql)) {
            const [type, key, properties, labels, version, canonical, supersedes, org, project, maybeDeleted] = params;
            // If the SQL text includes 'now()' treat as tombstone regardless of param (some branches pass NULL param then set now())
            const isTombstone = /now\(\)/i.test(sql) || !!maybeDeleted;
            const row: ObjRow = { id: newId('obj'), organization_id: org, project_id: project, canonical_id: canonical, supersedes_id: supersedes, version, type, key, properties, labels, deleted_at: isTombstone ? new Date() : null, created_at: new Date() } as any;
            this.objects.push(row);
            return { rowCount: 1, rows: [row] };
        }
        // Relationship select by id
        if (/FROM kb\.graph_relationships WHERE id=\$1$/i.test(sql)) {
            const row = this.rels.find(r => r.id === params[0]);
            return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
        }
        // Relationship head by canonical
        if (/FROM kb\.graph_relationships WHERE canonical_id=\$1 ORDER BY version DESC LIMIT 1$/i.test(sql)) {
            const rows = this.rels.filter(r => r.canonical_id === params[0]).sort((a, b) => b.version - a.version);
            const head = rows[0];
            return { rowCount: head ? 1 : 0, rows: head ? [head] : [] };
        }
        // Insert relationship tombstone or restore (tombstone uses now()). Updated signature includes branch_id at position 3.
        if (/^INSERT INTO kb\.graph_relationships\((org_id|organization_id), project_id, branch_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id, deleted_at\)/i.test(sql)) {
            const [org, project, branch_id, type, src_id, dst_id, properties, version, canonical, supersedes, maybeDeleted] = params;
            const isTombstone = /now\(\)/i.test(sql) || !!maybeDeleted;
            const row: RelRow = { id: newId('rel'), organization_id: org, project_id: project, type, src_id, dst_id, properties, version, canonical_id: canonical, supersedes_id: supersedes, deleted_at: isTombstone ? new Date() : null, weight: null, valid_from: null, valid_to: null, created_at: new Date() };
            this.rels.push(row);
            return { rowCount: 1, rows: [row] };
        }
        // Relationship select head by project/type/src/dst (for delete path current)
        if (/FROM kb\.graph_relationships WHERE project_id=\$1 AND type=\$2 AND src_id=\$3 AND dst_id=\$4\s+ORDER BY version DESC LIMIT 1$/i.test(sql)) {
            const [project, type, src, dst] = params;
            const rows = this.rels.filter(r => r.project_id === project && r.type === type && r.src_id === src && r.dst_id === dst).sort((a, b) => b.version - a.version);
            const head = rows[0];
            return { rowCount: head ? 1 : 0, rows: head ? [head] : [] };
        }
        throw new Error('Unexpected query: ' + sql);
    }
}

class MockSchemaRegistry { async getObjectValidator() { return null; } async getRelationshipMultiplicity() { return { src: 'many', dst: 'many' }; } async getRelationshipValidator() { return null; } }

describe('GraphService delete/restore edge paths', () => {
    let db: MockDB; let service: GraphService; let schema: MockSchemaRegistry;
    let baseObjId: string; let relId: string; let relCanonical: string; let objCanonical: string;

    beforeEach(async () => {
        idCounter = 0;
        db = new MockDB();
        schema = new MockSchemaRegistry();
        service = new GraphService(db as any, schema as any);
        // Seed a live object head (version 1)
        const canonical = newId('canon');
        const row: ObjRow = { id: newId('obj'), canonical_id: canonical, supersedes_id: null, version: 1, type: 'Thing', key: 'k1', properties: {}, labels: [], deleted_at: null, organization_id: null, project_id: null, created_at: new Date() } as any;
        (db.objects as ObjRow[]).push(row);
        baseObjId = row.id; objCanonical = canonical;
        // Seed a live relationship head
        const relCanon = newId('rcanon');
        const relRow: RelRow = { id: newId('rel'), canonical_id: relCanon, supersedes_id: null, version: 1, type: 'LINKS', src_id: baseObjId, dst_id: baseObjId + 'x', properties: {}, deleted_at: null, organization_id: null, project_id: 'p1', weight: null, valid_from: null, valid_to: null, created_at: new Date() };
        (db.rels as RelRow[]).push(relRow);
        relId = relRow.id; relCanonical = relCanon;
    });

    it('object: second delete throws already_deleted', async () => {
        const first = await service.deleteObject(baseObjId);
        expect(first.deleted_at).toBeTruthy();
        await expect(service.deleteObject(baseObjId)).rejects.toMatchObject({ response: { message: 'already_deleted' } });
    });

    it('object: restore when not deleted throws not_deleted', async () => {
        await expect(service.restoreObject(baseObjId)).rejects.toMatchObject({ response: { message: 'not_deleted' } });
    });

    it('relationship: second delete throws already_deleted', async () => {
        const first = await service.deleteRelationship(relId);
        expect(first.deleted_at).toBeTruthy();
        await expect(service.deleteRelationship(relId)).rejects.toMatchObject({ response: { message: 'already_deleted' } });
    });

    it('relationship: restore when not deleted throws not_deleted', async () => {
        await expect(service.restoreRelationship(relId)).rejects.toMatchObject({ response: { message: 'not_deleted' } });
    });
});
