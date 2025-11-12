import { describe, test, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/../graph/graph.service';

// Lightweight mock DB capturing only queries needed for relationship provenance
class MockDb {
  rows: Record<string, any> = {};
  queries: any[] = [];
  async query<T = any>(
    sql: string,
    params?: any[]
  ): Promise<{ rowCount: number; rows: T[] }> {
    this.queries.push({ sql, params });
    const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    // Branch validation
    if (norm.startsWith('select id from kb.branches')) {
      return {
        rowCount: 2,
        rows: [{ id: params?.[0][0] }, { id: params?.[0][1] }],
      } as any;
    }
    // Lineage lookups (empty)
    if (norm.startsWith('select ancestor_branch_id from kb.branch_lineage')) {
      return { rowCount: 0, rows: [] } as any;
    }
    // Object enumeration (none required for this test)
    if (norm.includes('from kb.graph_objects')) {
      return { rowCount: 0, rows: [] } as any;
    }
    // Relationship head enumeration (tgt/src CTE)
    if (
      norm.includes('from kb.graph_relationships') &&
      norm.includes('full outer join')
    ) {
      // Simulate one relationship existing on both branches with different properties so it classifies fast_forward
      return {
        rowCount: 1,
        rows: [
          {
            canonical_id: 'rel_can_1',
            target_id: 'rel_t_v1',
            source_id: 'rel_s_v1',
            target_hash: Buffer.from('aa', 'hex'),
            source_hash: Buffer.from('bb', 'hex'),
            target_change: { paths: ['/'] },
            source_change: { paths: ['/'] },
            target_props: { kind: 'edge' },
            source_props: { kind: 'edge', weight: 5 },
            target_type: 'Link',
            source_type: 'Link',
            target_src_id: 'objA',
            target_dst_id: 'objB',
            source_src_id: 'objA',
            source_dst_id: 'objB',
          },
        ],
      } as any;
    }
    // Fetch two relationship heads for patch
    if (
      norm.startsWith(
        'select id, properties from kb.graph_relationships where id = any'
      )
    ) {
      return {
        rowCount: 2,
        rows: [
          { id: 'rel_s_v1', properties: { kind: 'edge', weight: 5 } },
          { id: 'rel_t_v1', properties: { kind: 'edge' } },
        ],
      } as any;
    }
    // Insert patched relationship version (Phase 5: organization_id removed)
    if (
      norm.startsWith('insert into kb.graph_relationships') &&
      norm.includes('select project_id, branch_id')
    ) {
      return { rowCount: 1, rows: [{ id: 'rel_t_v2' }] } as any;
    }
    // Provenance inserts
    if (norm.startsWith('insert into kb.merge_provenance')) {
      return { rowCount: 1, rows: [] } as any;
    }
    return { rowCount: 0, rows: [] } as any;
  }
}

// Minimal config stub
const mockConfig: any = { rlsPolicyStrict: false };

// Minimal dependencies required by GraphService constructor
class DummySchemaRegistry {
  async getObjectValidator() {
    return null;
  }
  async getRelationshipValidator() {
    return null;
  }
}
class DummyEmbeddingJobs {
  async enqueue() {
    /* noop */
  }
}
class DummyConfig {
  embeddingsEnabled = false;
  rlsPolicyStrict = false;
}

const primaryDb = new MockDb();
const service = new GraphService(
  // @ts-ignore provide mock DatabaseService shape
  {
    query: (...args: any[]) => primaryDb.query(...args),
    getClient: async () => ({
      query: (sql: string, params?: any[]) => primaryDb.query(sql, params),
      release() {},
    }),
  },
  // @ts-ignore schema registry
  new DummySchemaRegistry(),
  // @ts-ignore embedding jobs optional
  new DummyEmbeddingJobs(),
  // @ts-ignore config service
  new DummyConfig()
);
// Inject db for direct access to queries log
// @ts-ignore
service['db'] = {
  query: (...args: any[]) => primaryDb.query(...args),
  getClient: async () => ({
    query: (s: string, p?: any[]) => primaryDb.query(s, p),
    release() {},
  }),
};

// Provide patchObject fallback to avoid usage during relationship path
// (relationship logic uses direct INSERT instead of helper when diff applied)

describe('mergeBranchDryRun relationship provenance (fast_forward)', () => {
  test('records source and target provenance parents for patched relationship', async () => {
    const summary = await service.mergeBranchDryRun('branch_target', {
      sourceBranchId: 'branch_source',
      execute: true,
    });
    expect(summary.applied).toBe(true);
    expect(summary.relationships_fast_forward_count).toBe(1);
    const q = primaryDb.queries.filter((qr: any) =>
      /insert into kb.merge_provenance/i.test(qr.sql)
    );
    const roles = q
      .map(
        (qr: any) =>
          qr.sql.match(/role\) values \(\$1,\$2,'(source|target)'/i)?.[1]
      )
      .filter(Boolean);
    expect(new Set(roles)).toEqual(new Set(['source', 'target']));
  });
});
