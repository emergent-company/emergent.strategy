import { describe, it, expect } from 'vitest';
import { GraphService } from '../src/modules/graph/graph.service';

// Minimal mock DB focusing only on relationship creation path used in tests
class MockDb {
  rels: any[] = [];
  async getClient() {
    return {
      query: async (sql: string, params?: any[]) => {
        if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
          return { rows: [], rowCount: 0 } as any;
        }
        if (/SELECT pg_advisory_xact_lock/.test(sql)) return { rows: [], rowCount: 0 } as any;
        if (/SELECT \* FROM kb\.graph_relationships\n\s*WHERE project_id=/.test(sql)) {
          // head lookup before first insert -> empty
          const [projectId, type, src, dst] = params || [];
          const existing = this.rels
            .filter(r => r.project_id === projectId && r.type === type && r.src_id === src && r.dst_id === dst)
            .sort((a, b) => b.version - a.version);
          return { rows: existing.slice(0, 1), rowCount: existing.length ? 1 : 0 } as any;
        }
        if (/INSERT INTO kb\.graph_relationships\(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id\)/.test(sql)) {
          const row = {
            id: 'rel-' + (this.rels.length + 1),
            org_id: params?.[0],
            project_id: params?.[1],
            type: params?.[2],
            src_id: params?.[3],
            dst_id: params?.[4],
            properties: params?.[5],
            version: 1,
            supersedes_id: null,
            canonical_id: 'can-' + (this.rels.length + 1),
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
      release() {}
    };
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
    const schemaRegistry: any = {
      getObjectValidator: async () => undefined,
      getRelationshipValidator: async () => makeValidator(['weight'])
    };
    const graph = new GraphService(db, schemaRegistry);
    await expect(graph.createRelationship({ type: 'rel', src_id: 'a', dst_id: 'b', properties: {} } as any, 'org', 'proj'))
      .rejects.toMatchObject({ response: { code: 'relationship_schema_validation_failed' } });
  });

  it('accepts relationship with required property', async () => {
    const db: any = new MockDb();
    const schemaRegistry: any = {
      getObjectValidator: async () => undefined,
      getRelationshipValidator: async () => makeValidator(['weight'])
    };
    const graph = new GraphService(db, schemaRegistry);
    const rel = await graph.createRelationship({ type: 'rel', src_id: 'a', dst_id: 'b', properties: { weight: 1 } } as any, 'org', 'proj');
    expect(rel.properties.weight).toBe(1);
    expect(rel.version).toBe(1);
  });
});
