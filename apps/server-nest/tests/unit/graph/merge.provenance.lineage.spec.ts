import { describe, it, expect, beforeEach } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../src/common/database/database.service';

/**
 * Focused tests for lineage-aware fast-forward classification and provenance insertion.
 * Lightweight in-memory mock captures minimal queries used by mergeBranchDryRun execute path.
 */
class MockDb implements Partial<DatabaseService> {
  branches = new Set<string>();
  lineage: Record<string, Set<string>> = {}; // branch -> ancestor set (including self)
  objects: any[] = [];
  provenance: any[] = [];
  constructor() {
    // seed two branches: parent (main) and child (feature)
    this.branches.add('b_main');
    this.branches.add('b_feature');
    this.lineage['b_main'] = new Set(['b_main']);
    this.lineage['b_feature'] = new Set(['b_feature', 'b_main']);
  }
  async query(sql: string, params: any[] = []): Promise<any> {
    const norm = sql.trim().toLowerCase();
    if (norm === 'begin' || norm === 'commit' || norm === 'rollback') {
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith('select id from kb.branches where id = any')) {
      const ids: string[] = params[0];
      const rows = ids
        .filter((id) => this.branches.has(id))
        .map((id) => ({ id }));
      return { rows, rowCount: rows.length };
    }
    if (
      norm.startsWith(
        'select ancestor_branch_id from kb.branch_lineage where branch_id'
      )
    ) {
      const bid = params[0];
      const rows = Array.from(this.lineage[bid] || []).map((a) => ({
        ancestor_branch_id: a,
      }));
      return { rows, rowCount: rows.length };
    }
    if (norm.startsWith('with tgt as')) {
      // CTE variant performing target/source head selection then FULL OUTER JOIN
      const targetBranch = params[0];
      const sourceBranch = params[1];
      const limit = params[2] ?? 1000;
      const tgtHeads = this.objects.filter((o) => o.branch_id === targetBranch);
      const srcHeads = this.objects.filter((o) => o.branch_id === sourceBranch);
      const map = new Map<string, any>();
      for (const t of tgtHeads) {
        map.set(t.canonical_id, {
          canonical_id: t.canonical_id,
          target_id: t.id,
          target_hash: t.content_hash,
          target_change: t.change_summary,
          target_props: t.properties,
          target_type: t.type,
          target_key: t.key,
        });
      }
      for (const s of srcHeads) {
        const existing = map.get(s.canonical_id) || {
          canonical_id: s.canonical_id,
        };
        existing.source_id = s.id;
        existing.source_hash = s.content_hash;
        existing.source_change = s.change_summary;
        existing.source_props = s.properties;
        existing.source_type = s.type;
        existing.source_key = s.key;
        map.set(s.canonical_id, existing);
      }
      const rows = Array.from(map.values()).slice(0, limit);
      return { rows, rowCount: rows.length };
    }
    if (
      norm.startsWith(
        'select distinct on (canonical_id) canonical_id, id, type, key, content_hash'
      )
    ) {
      const branchId = params[0];
      const rows = this.objects
        .filter((o) => o.branch_id === branchId)
        .map((o) => ({
          canonical_id: o.canonical_id,
          id: o.id,
          type: o.type,
          key: o.key,
          content_hash: o.content_hash,
          change_summary: o.change_summary,
          properties: o.properties,
        }));
      return { rows, rowCount: rows.length };
    }
    if (
      norm.includes('from kb.graph_objects where branch_id = $1') &&
      norm.includes('full outer join')
    ) {
      const tgt = params[0];
      const src = params[1];
      const tgtHeads = this.objects.filter((o) => o.branch_id === tgt);
      const srcHeads = this.objects.filter((o) => o.branch_id === src);
      const map = new Map<string, any>();
      for (const t of tgtHeads)
        map.set(t.canonical_id, {
          canonical_id: t.canonical_id,
          target_id: t.id,
          target_hash: t.content_hash,
          target_change: t.change_summary,
          target_props: t.properties,
          target_type: t.type,
          target_key: t.key,
        });
      for (const s of srcHeads) {
        const existing = map.get(s.canonical_id) || {
          canonical_id: s.canonical_id,
        };
        existing.source_id = s.id;
        existing.source_hash = s.content_hash;
        existing.source_change = s.change_summary;
        existing.source_props = s.properties;
        existing.source_type = s.type;
        existing.source_key = s.key;
        map.set(s.canonical_id, existing);
      }
      const rows = Array.from(map.values());
      return { rows, rowCount: rows.length };
    }
    if (
      norm.startsWith(
        'select type, key, properties, labels, organization_id, project_id from kb.graph_objects where id='
      )
    ) {
      const obj = this.objects.find((o) => o.id === params[0]);
      return {
        rows: obj
          ? [
              {
                type: obj.type,
                key: obj.key,
                properties: obj.properties,
                labels: obj.labels,
                organization_id: obj.organization_id,
                project_id: obj.project_id,
              },
            ]
          : [],
        rowCount: obj ? 1 : 0,
      };
    }
    if (norm.startsWith('select * from kb.graph_objects where id=')) {
      const obj = this.objects.find((o) => o.id === params[0]);
      return { rows: obj ? [obj] : [], rowCount: obj ? 1 : 0 };
    }
    if (norm.startsWith('insert into kb.graph_objects')) {
      const row = {
        id: 'obj_' + (this.objects.length + 1),
        type: params[0],
        key: params[1],
        properties: params[2],
        labels: params[3],
        organization_id: params[4],
        project_id: params[5],
        branch_id: params[6],
        canonical_id: 'canon_' + params[1],
        content_hash: Buffer.from(params[1]),
        change_summary: { paths: Object.keys(params[2] || {}) },
      };
      this.objects.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (norm.startsWith('insert into kb.merge_provenance')) {
      this.provenance.push({
        child_version_id: params[0],
        parent_version_id: params[1],
        role: sql.includes("'source'")
          ? 'source'
          : sql.includes("'target'")
          ? 'target'
          : sql.includes("'base'")
          ? 'base'
          : 'unknown',
      });
      return { rows: [], rowCount: 1 };
    }
    if (
      norm.startsWith(
        'select id, type, key, properties from kb.graph_objects where id = any'
      )
    ) {
      const ids: string[] = params[0];
      const rows = this.objects
        .filter((o) => ids.includes(o.id))
        .map((o) => ({
          id: o.id,
          type: o.type,
          key: o.key,
          properties: o.properties,
        }));
      return { rows, rowCount: rows.length };
    }
    if (norm.startsWith('update kb.graph_objects set properties')) {
      const id = params[2];
      const existing = this.objects.find((o) => o.id === id);
      if (existing) {
        const merged = { ...existing.properties, ...params[0] };
        const newRow = {
          ...existing,
          id: 'obj_' + (this.objects.length + 1),
          properties: merged,
          content_hash: Buffer.from(existing.key + '_patched'),
          change_summary: { paths: Object.keys(params[0]) },
        };
        this.objects.push(newRow);
        return { rows: [newRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (norm.includes('from kb.graph_relationships')) {
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith('select pg_advisory_xact_lock')) {
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith('select id from kb.graph_objects where canonical_id')) {
      // In this mock we never create a newer version before this check; return empty.
      return { rows: [], rowCount: 0 };
    }
    if (norm.startsWith('update kb.graph_objects set deleted_at')) {
      // Handle soft delete query during merge operations
      const id = params[0];
      const existing = this.objects.find((o) => o.id === id);
      if (existing) {
        existing.deleted_at = new Date();
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    throw new Error('Unhandled SQL in mock: ' + sql);
  }
  async getClient(): Promise<any> {
    return {
      query: (s: string, p?: any[]) => this.query(s, p),
      release: () => {},
    };
  }
}

// Minimal stubs for injected services
const schemaRegistryStub: any = {
  getObjectValidator: async () => null,
  getRelationshipValidator: async () => null,
};
const embeddingJobsStub: any = { enqueueObjectEmbedding: async () => {} };
const appConfigStub: any = { get: () => undefined };

function serviceWithTwoObjects(): {
  service: GraphService;
  db: MockDb;
  targetObjId: string;
  sourceObjId: string;
} {
  const db = new MockDb();
  db.objects.push({
    id: 'obj_1',
    type: 'TypeA',
    key: 'alpha',
    properties: { a: 1 },
    labels: [],
    organization_id: 'o',
    project_id: 'p',
    branch_id: 'b_main',
    canonical_id: 'canon_alpha',
    content_hash: Buffer.from('alpha_t'),
    change_summary: { paths: ['a'] },
  });
  db.objects.push({
    id: 'obj_2',
    type: 'TypeA',
    key: 'alpha',
    properties: { a: 1, b: 2 },
    labels: [],
    organization_id: 'o',
    project_id: 'p',
    branch_id: 'b_feature',
    canonical_id: 'canon_alpha',
    content_hash: Buffer.from('alpha_s'),
    change_summary: { paths: ['b'] },
  });
  return {
    service: new GraphService(
      db as any,
      schemaRegistryStub,
      embeddingJobsStub,
      appConfigStub
    ),
    db,
    targetObjId: 'obj_1',
    sourceObjId: 'obj_2',
  };
}

describe('merge lineage + provenance', () => {
  let svc: GraphService;
  let db: MockDb;
  let targetObjId: string;
  let sourceObjId: string;
  beforeEach(() => {
    ({ service: svc, db, targetObjId, sourceObjId } = serviceWithTwoObjects());
  });

  it('classifies fast-forward via lineage ancestor and applies provenance on execute', async () => {
    const summary = await svc.mergeBranchDryRun('b_main', {
      sourceBranchId: 'b_feature',
      execute: true,
    });
    expect(summary.fast_forward_count).toBe(1);
    expect(summary.applied).toBe(true);
    const childIds = db.provenance.map((p) => p.child_version_id);
    expect(childIds.length).toBeGreaterThan(0);
    const roles = new Set(db.provenance.map((p) => p.role));
    expect(roles.has('source')).toBe(true);
    expect(roles.has('target')).toBe(true);
  });
});
