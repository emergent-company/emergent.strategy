import { describe, it, expect, beforeEach } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../src/common/database/database.service';

/**
 * Tests merge base (LCA) detection recording a 'base' provenance role during fast-forward merges.
 * Scenario: main (obj_v1) -> feature (obj_v2 adds b) -> target diverges with its own patch (obj_v3 adds c) then merge feature into target.
 * LCA between feature head (obj_v2) and target head (obj_v3) is obj_v1; after merge we expect provenance edges:
 *  child <- target (role=target), child <- source (role=source), child <- base (role=base)
 */
class MockDb implements Partial<DatabaseService> {
    objects: any[] = [];
    provenance: any[] = [];
    branches = new Set<string>(['b_main', 'b_feature', 'b_target']);
    // parent edges: child -> parent (merge_provenance semantics)
    parentEdges: Record<string, string[]> = {};

    constructor() {
        // Seed main object v1
        this.objects.push({ id: 'obj_v1', type: 'TypeA', key: 'alpha', properties: { a: 1 }, labels: [], organization_id: 'o', project_id: 'p', branch_id: 'b_main', canonical_id: 'canon_alpha', version: 1, content_hash: Buffer.from('h1'), change_summary: { paths: ['a'] } });
        // Feature branch tip v2 derived from v1 (adds b)
        this.objects.push({ id: 'obj_v2', type: 'TypeA', key: 'alpha', properties: { a: 1, b: 2 }, labels: [], organization_id: 'o', project_id: 'p', branch_id: 'b_feature', canonical_id: 'canon_alpha', version: 2, content_hash: Buffer.from('h2'), change_summary: { paths: ['b'] } });
        this.parentEdges['obj_v2'] = ['obj_v1'];
        // Target branch diverged independently from v1 adding c (v3)
        this.objects.push({ id: 'obj_v3', type: 'TypeA', key: 'alpha', properties: { a: 1, c: 3 }, labels: [], organization_id: 'o', project_id: 'p', branch_id: 'b_target', canonical_id: 'canon_alpha', version: 2, content_hash: Buffer.from('h3'), change_summary: { paths: ['c'] } });
        this.parentEdges['obj_v3'] = ['obj_v1'];
    }

    async query(sql: string, params: any[] = []): Promise<any> {
        const norm = sql.trim().toLowerCase();
        if (norm === 'begin' || norm === 'commit' || norm === 'rollback') {
            return { rows: [], rowCount: 0 };
        }
        if (norm.startsWith('select id from kb.branches where id = any')) {
            const ids: string[] = params[0];
            const rows = ids.filter(id => this.branches.has(id)).map(id => ({ id }));
            return { rows, rowCount: rows.length };
        }
        if (norm.startsWith('select ancestor_branch_id from kb.branch_lineage')) {
            // lineage not needed for test (returns self only)
            return { rows: [], rowCount: 0 };
        }
        if (norm.includes('from kb.graph_objects') && norm.includes('full outer join')) {
            const tgt = params[0];
            const src = params[1];
            const tgtHeads = this.objects.filter(o => o.branch_id === tgt);
            const srcHeads = this.objects.filter(o => o.branch_id === src);
            const map = new Map<string, any>();
            for (const t of tgtHeads) map.set(t.canonical_id, { canonical_id: t.canonical_id, target_id: t.id, target_hash: t.content_hash, target_change: t.change_summary, target_props: t.properties, target_type: t.type, target_key: t.key });
            for (const s of srcHeads) {
                const existing = map.get(s.canonical_id) || { canonical_id: s.canonical_id };
                existing.source_id = s.id; existing.source_hash = s.content_hash; existing.source_change = s.change_summary; existing.source_props = s.properties; existing.source_type = s.type; existing.source_key = s.key;
                map.set(s.canonical_id, existing);
            }
            return { rows: Array.from(map.values()), rowCount: map.size };
        }
        if (norm.startsWith('select id, type, key, properties from kb.graph_objects where id = any')) {
            const ids: string[] = params[0];
            const rows = this.objects.filter(o => ids.includes(o.id)).map(o => ({ id: o.id, type: o.type, key: o.key, properties: o.properties }));
            return { rows, rowCount: rows.length };
        }
        if (norm.startsWith('select * from kb.graph_objects where id=')) {
            const obj = this.objects.find(o => o.id === params[0]);
            return { rows: obj ? [obj] : [], rowCount: obj ? 1 : 0 };
        }
        if (norm.startsWith('update kb.graph_objects set properties')) {
            // simulate patch producing new version obj_v4 with parents obj_v3 & obj_v2 (and base later)
            const id = params[2];
            const existing = this.objects.find(o => o.id === id)!;
            const merged = { ...existing.properties, ...params[0] };
            const newId = 'obj_v4';
            const newRow = { ...existing, id: newId, properties: merged, content_hash: Buffer.from('h4'), version: existing.version + 1, change_summary: { paths: Object.keys(params[0]) } };
            this.objects.push(newRow);
            this.parentEdges[newId] = [existing.id, 'obj_v2'];
            return { rows: [newRow], rowCount: 1 };
        }
        if (norm.startsWith('insert into kb.graph_objects(') && norm.includes('supersedes_id')) {
            // Object patch INSERT creating new head version (mirror patchObject behavior)
            const [type, key, properties, labels, version, canonicalId, supersedesId, orgId, projectId, branchId] = params;
            const newId = 'obj_v4';
            const row = { id: newId, type, key, properties, labels, version, canonical_id: canonicalId, supersedes_id: supersedesId, organization_id: orgId, project_id: projectId, branch_id: branchId, change_summary: { paths: Object.keys((properties || {})) }, content_hash: Buffer.from('h4') } as any;
            this.objects.push(row);
            // establish parent edge for ancestry graph (supersedes link + feature head)
            this.parentEdges[newId] = [supersedesId, 'obj_v2'];
            return { rows: [row], rowCount: 1 };
        }
        if (norm.startsWith('select pg_advisory_xact_lock')) {
            return { rows: [], rowCount: 0 };
        }
        if (norm.startsWith('select id from kb.graph_objects where canonical_id')) {
            // newer head check returns empty (current is head)
            return { rows: [], rowCount: 0 };
        }
        if (norm.startsWith('insert into kb.merge_provenance')) {
            this.provenance.push({ child_version_id: params[0], parent_version_id: params[1], role: sql.includes("'source'") ? 'source' : sql.includes("'target'") ? 'target' : sql.includes("'base'") ? 'base' : 'other' });
            return { rows: [], rowCount: 1 };
        }
        if (norm.startsWith('select type, key, properties, labels, organization_id, project_id from kb.graph_objects where id=')) {
            const obj = this.objects.find(o => o.id === params[0]);
            return { rows: obj ? [{ type: obj.type, key: obj.key, properties: obj.properties, labels: obj.labels, organization_id: obj.organization_id, project_id: obj.project_id }] : [], rowCount: obj ? 1 : 0 };
        }
        if (norm.startsWith('insert into kb.graph_objects')) {
            // not used in this scenario
            return { rows: [], rowCount: 0 };
        }
        if (norm.includes('with recursive src_anc')) {
            // LCA query: build ancestry sets using parentEdges
            const sourceId = params[0];
            const targetId = params[1];
            const maxDepth = params[2];
            function ancestors(start: string, depth: number, acc: Map<string, number>): void {
                if (depth > maxDepth) return;
                if (!acc.has(start) || (acc.get(start)! > depth)) acc.set(start, depth);
                const parents = (parentEdges as any)[start] || [];
                for (const p of parents) ancestors(p, depth + 1, acc);
            }
            const parentEdges = this.parentEdges;
            const srcMap = new Map<string, number>();
            const tgtMap = new Map<string, number>();
            ancestors(sourceId, 0, srcMap);
            ancestors(targetId, 0, tgtMap);
            let best: { id: string; total: number; s: number; t: number } | null = null;
            for (const [id, sDepth] of srcMap.entries()) {
                const tDepth = tgtMap.get(id);
                if (tDepth !== undefined) {
                    const total = sDepth + tDepth;
                    if (!best || total < best.total || (total === best.total && (sDepth < best.s || (sDepth === best.s && tDepth < best.t)))) {
                        best = { id, total, s: sDepth, t: tDepth };
                    }
                }
            }
            return { rows: best ? [{ id: best!.id }] : [], rowCount: best ? 1 : 0 };
        }
        return { rows: [], rowCount: 0 };
    }
    async getClient(): Promise<any> { return { query: (s: string, p?: any[]) => this.query(s, p), release: () => { } }; }
}

// Minimal stubs
const schemaRegistryStub: any = { getObjectValidator: async () => null, getRelationshipValidator: async () => null };
const embeddingJobsStub: any = { enqueueObjectEmbedding: async () => { } };
const appConfigStub: any = { get: () => undefined };

function makeService(): { service: GraphService; db: MockDb } {
    const db = new MockDb();
    const service = new GraphService(db as any, schemaRegistryStub, embeddingJobsStub, appConfigStub);
    return { service, db };
}

describe('merge base provenance (LCA)', () => {
    let svc: GraphService; let db: MockDb;
    beforeEach(() => { ({ service: svc, db } = makeService()); });

    it('records base provenance role along with source and target on fast-forward patch', async () => {
        const summary = await svc.mergeBranchDryRun('b_target', { sourceBranchId: 'b_feature', execute: true });
        expect(summary.fast_forward_count).toBe(1);
        expect(summary.applied).toBe(true);
        const rolesByChild: Record<string, Set<string>> = {};
        for (const p of db.provenance) {
            rolesByChild[p.child_version_id] = rolesByChild[p.child_version_id] || new Set<string>();
            rolesByChild[p.child_version_id].add(p.role);
        }
        // At least one child should have base + source + target
        const match = Object.values(rolesByChild).some(set => set.has('base') && set.has('source') && set.has('target'));
        if (!match) {
            // eslint-disable-next-line no-console
            console.error('Provenance debug entries', db.provenance);
        }
        expect(match).toBe(true);
    });
});
