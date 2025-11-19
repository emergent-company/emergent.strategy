import { describe, it, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { makeSchemaRegistryStub } from '../helpers/schema-registry.stub';

// Minimal mock DB focusing only on relationship creation path used in tests
class MockDb {
  rels: any[] = [];
  objects: any[] = [];
  orgId: string | null = null;
  projectId: string | null = null;
  async getClient() {
    return {
      query: async (sql: string, params?: any[]) => {
        if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
          return { rows: [], rowCount: 0 } as any;
        }
        if (/SELECT id, project_id, deleted_at, branch_id FROM kb\.graph_objects WHERE id = ANY/.test(sql)) {
          const ids = (params?.[0] || []) as string[];
          const rows = ids.map(id => {
            let obj = this.objects.find(o => o.id === id);
            if (!obj) { obj = { id, project_id: 'proj', deleted_at: null, branch_id: null }; this.objects.push(obj); }
            return { id: obj.id, project_id: obj.project_id, deleted_at: obj.deleted_at, branch_id: obj.branch_id };
          });
          return { rows, rowCount: rows.length } as any;
        }
        if (/SELECT pg_advisory_xact_lock/.test(sql)) return { rows: [], rowCount: 0 } as any;
        if (/SELECT \* FROM kb\.graph_relationships/.test(sql) && /ORDER BY version DESC LIMIT 1/.test(sql)) {
          // supports optional branch predicate; ignore branch for mock
          let projectId: any, type: any, src: any, dst: any;
          if (/branch_id IS NOT DISTINCT FROM \$2/.test(sql)) {
            projectId = params?.[0]; type = params?.[2]; src = params?.[3]; dst = params?.[4];
          } else {
            projectId = params?.[0]; type = params?.[1]; src = params?.[2]; dst = params?.[3];
          }
          const existing = this.rels
            .filter(r => r.project_id === projectId && r.type === type && r.src_id === src && r.dst_id === dst)
            .sort((a, b) => b.version - a.version);
          return { rows: existing.slice(0, 1), rowCount: existing.length ? 1 : 0 } as any;
        }
        if (/INSERT INTO kb\.graph_relationships\(project_id, branch_id, type, src_id, dst_id, properties, version, canonical_id, change_summary, content_hash\)/.test(sql)) {
          const row = {
            id: 'rel-' + (this.rels.length + 1),
            project_id: params?.[0],
            branch_id: params?.[1] ?? null,
            type: params?.[2],
            src_id: params?.[3],
            dst_id: params?.[4],
            properties: params?.[5],
            version: 1,
            supersedes_id: null,
            canonical_id: 'can-' + (this.rels.length + 1),
            change_summary: params?.[6] ?? null,
            content_hash: params?.[7] ?? null,
            weight: null,
            valid_from: null,
            valid_to: null,
            created_at: new Date().toISOString(),
            deleted_at: null
          };
          this.rels.push(row);
          return { rows: [row], rowCount: 1 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      },
      release() { }
    };
  }

  async setTenantContext(orgId?: string | null, projectId?: string | null) {
    this.orgId = orgId ?? null;
    this.projectId = projectId ?? null;
  }

  async runWithTenantContext<T>(projectId: string | null, fn: () => Promise<T>): Promise<T> {
    const prevProject = this.projectId;
    // Mock: projectId parameter accepted but not used for actual tenant isolation
    // Real implementation derives orgId from projectId automatically
    this.projectId = projectId ?? null;
    try {
      return await fn();
    } finally {
      this.projectId = prevProject;
    }
  }
}

// Simple validator factory producing AJV-like interface
function makeValidator(required: string[]) {
  const fn: any = (data: any) => {
    const missing = required.filter(k => data[k] === undefined);
    if (missing.length) {
      fn.errors = missing.map(m => ({ instancePath: '/' + m, message: 'is required' }));
      return false;
    }
    fn.errors = undefined; return true;
  };
  return fn;
}

describe('Graph relationship schema validation', () => {
  it('rejects relationship missing required property', async () => {
    const db: any = new MockDb();
    const schemaRegistry: any = makeSchemaRegistryStub({ relationshipValidator: makeValidator(['weight']) });
    const graph = new GraphService(db, schemaRegistry);
    // create endpoint objects first (project_id consistent)
    db.objects.push({ id: 'a', project_id: 'proj', deleted_at: null, branch_id: null });
    db.objects.push({ id: 'b', project_id: 'proj', deleted_at: null, branch_id: null });
    await expect(graph.createRelationship({ type: 'rel', src_id: 'a', dst_id: 'b', properties: {} } as any, 'org', 'proj'))
      .rejects.toMatchObject({ response: { code: 'relationship_schema_validation_failed' } });
  });

  it('accepts relationship with required property', async () => {
    const db: any = new MockDb();
    const schemaRegistry: any = makeSchemaRegistryStub({ relationshipValidator: makeValidator(['weight']) });
    const graph = new GraphService(db, schemaRegistry);
    db.objects.push({ id: 'a', project_id: 'proj', deleted_at: null, branch_id: null });
    db.objects.push({ id: 'b', project_id: 'proj', deleted_at: null, branch_id: null });
    const rel = await graph.createRelationship({ type: 'rel', src_id: 'a', dst_id: 'b', properties: { weight: 1 } } as any, 'org', 'proj');
    expect(rel.properties.weight).toBe(1);
    expect(rel.version).toBe(1);
  });
});
