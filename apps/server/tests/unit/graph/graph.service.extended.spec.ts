import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../src/modules/graph/schema-registry.service';

// Lightweight helpers to fabricate rows
const mkObj = (o: Partial<any> = {}) => ({
  id: o.id || crypto.randomUUID(),
  org_id: o.organization_id ?? null,
  project_id: o.project_id ?? null,
  canonical_id: o.canonical_id || o.id || crypto.randomUUID(),
  supersedes_id: o.supersedes_id ?? null,
  version: o.version ?? 1,
  type: o.type || 'Doc',
  key: o.key ?? null,
  properties: o.properties || {},
  labels: o.labels || [],
  deleted_at: o.deleted_at ?? null,
  created_at: o.created_at || new Date().toISOString(),
});
const mkRel = (r: Partial<any> = {}) => ({
  id: r.id || crypto.randomUUID(),
  organization_id: r.organization_id ?? 'org1',
  project_id: r.project_id ?? 'proj1',
  type: r.type || 'LINKS',
  src_id: r.src_id || crypto.randomUUID(),
  dst_id: r.dst_id || crypto.randomUUID(),
  properties: r.properties || {},
  version: r.version ?? 1,
  supersedes_id: r.supersedes_id ?? null,
  canonical_id: r.canonical_id || r.id || crypto.randomUUID(),
  weight: r.weight ?? 1,
  valid_from: r.valid_from ?? null,
  valid_to: r.valid_to ?? null,
  deleted_at: r.deleted_at ?? null,
  created_at: r.created_at || new Date().toISOString(),
});

describe('GraphService extended coverage', () => {
  let db: DatabaseService;
  let schema: SchemaRegistryService;
  let svc: GraphService;
  let queries: { sql: string; params: any[] }[];
  const currentContext = {
    org: null as string | null,
    project: null as string | null,
  };

  beforeEach(() => {
    queries = [];
    // Minimal mock DB service with scripted responses
    const setTenantContext = vi.fn(
      async (orgId?: string | null, projectId?: string | null) => {
        currentContext.org = orgId ?? null;
        currentContext.project = projectId ?? null;
      }
    );
    const runWithTenantContext = vi.fn(
      async (
        projectId: string | null,
        fn: () => Promise<any>
      ) => {
        const prev = { ...currentContext };
        // Mock: derive orgId from projectId (simplified - just use project for context)
        await setTenantContext(null, projectId);
        try {
          return await fn();
        } finally {
          await setTenantContext(prev.org, prev.project);
        }
      }
    );
    db = {
      getClient: vi.fn(async () => ({
        query: async (sql: string, params: any[] = []) =>
          scriptedQuery(sql, params),
        release: () => {},
      })),
      query: vi.fn(async (sql: string, params: any[] = []) =>
        scriptedQuery(sql, params)
      ),
      setTenantContext,
      runWithTenantContext,
    } as any;
    schema = {
      getObjectValidator: vi.fn(async () => null),
      getRelationshipValidator: vi.fn(async () => null),
      getRelationshipMultiplicity: vi.fn(async () => ({
        src: 'many',
        dst: 'many',
      })),
    } as any;
    svc = new GraphService(db, schema);
  });

  // State bags for scripted responses
  const objects = new Map<string, any>();
  const rels = new Map<string, any>();

  function scriptedQuery(sql: string, params: any[]) {
    queries.push({ sql, params });
    sql = sql.replace(/\s+/g, ' ').trim();

    // Transaction keywords ignored
    if (
      sql === 'BEGIN' ||
      sql === 'COMMIT' ||
      sql === 'ROLLBACK' ||
      sql.startsWith('SELECT pg_advisory_xact_lock')
    ) {
      return { rowCount: 0, rows: [] };
    }

    // Object insertion
    if (sql.startsWith('INSERT INTO kb.graph_objects')) {
      const row = mkObj({
        id: crypto.randomUUID(),
        canonical_id: params[5] || crypto.randomUUID(),
        supersedes_id: params[6] || null,
        version: params[4],
        type: params[0],
        key: params[1],
        properties: params[2],
        labels: params[3],
        organization_id: params[7],
        project_id: params[8],
        deleted_at: params[9] ?? null,
      });
      objects.set(row.id, row);
      return { rowCount: 1, rows: [row] };
    }

    // Relationship insertion
    if (sql.startsWith('INSERT INTO kb.graph_relationships')) {
      const isCreate = sql.includes('canonical_id) VALUES');
      const r = mkRel({
        organization_id: params[0],
        project_id: params[1],
        type: params[2],
        src_id: params[3],
        dst_id: params[4],
        properties: params[5],
        version: params[6],
        canonical_id: isCreate ? crypto.randomUUID() : params[7],
        supersedes_id: isCreate ? null : params[8],
        deleted_at: params[9] ?? null,
      });
      rels.set(r.id, r);
      return { rowCount: 1, rows: [r] };
    }

    // Object get by id or batch endpoint existence query (id = ANY($1::uuid[])) used in relationship creation.
    // Updated to handle expiration filter: `FROM kb.graph_objects o WHERE id=$1 AND (o.expires_at IS NULL OR ...)`
    if (sql.includes('FROM kb.graph_objects') && sql.includes('WHERE id=$1')) {
      const row = objects.get(params[0]);
      return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
    }
    if (
      sql.startsWith(
        'SELECT id, project_id, deleted_at, branch_id FROM kb.graph_objects WHERE id = ANY'
      )
    ) {
      const ids: string[] = params[0];
      const rows = ids.map((id) => objects.get(id)).filter(Boolean);
      return { rowCount: rows.length, rows };
    }

    // Relationship get by id
    if (sql.includes('FROM kb.graph_relationships WHERE id=$1')) {
      const row = rels.get(params[0]);
      return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
    }

    // Head selection (objects)
    if (sql.startsWith('SELECT * FROM kb.graph_objects WHERE canonical_id=')) {
      // simplistic: return most recent version
      const matching = Array.from(objects.values())
        .filter((o) => o.canonical_id === params[0])
        .sort((a, b) => b.version - a.version);
      return { rowCount: matching.length ? 1 : 0, rows: matching.slice(0, 1) };
    }

    // Canonical lookup for history (objects)
    if (sql.startsWith('SELECT canonical_id FROM kb.graph_objects WHERE id=')) {
      const row = objects.get(params[0]);
      return {
        rowCount: row ? 1 : 0,
        rows: row ? [{ canonical_id: row.canonical_id }] : [],
      };
    }

    // History list (objects) - Updated to match actual SQL that doesn't include organization_id
    if (
      sql.startsWith('SELECT id, project_id, canonical_id') &&
      sql.includes('FROM kb.graph_objects WHERE canonical_id=')
    ) {
      const canonicalId = params[0];
      const limit = params[params.length - 1];
      const cursorIdx = sql.includes('version < $2') ? 1 : null;
      let rows = Array.from(objects.values())
        .filter((o) => o.canonical_id === canonicalId)
        .sort((a, b) => b.version - a.version);
      if (cursorIdx !== null)
        rows = rows.filter((r) => r.version < params[cursorIdx]);
      return { rowCount: rows.length, rows: rows.slice(0, limit) };
    }

    // Relationship head select (for create/upsert) now includes optional branch_id IS NOT DISTINCT FROM predicate.
    if (
      sql.startsWith('SELECT * FROM kb.graph_relationships') &&
      sql.includes('ORDER BY version DESC LIMIT 1')
    ) {
      // Pattern: project_id=$1 AND branch_id IS NOT DISTINCT FROM $2 AND type=$3 AND src_id=$4 AND dst_id=$5
      const [projectId, branchId, type, src, dst] = params;
      const matches = Array.from(rels.values())
        .filter(
          (r) =>
            r.project_id === projectId &&
            (branchId === null ? true : true) &&
            r.type === type &&
            r.src_id === src &&
            r.dst_id === dst
        )
        .sort((a, b) => b.version - a.version);
      return { rowCount: matches.length ? 1 : 0, rows: matches.slice(0, 1) };
    }

    // Relationship canonical history lookup
    if (
      sql.startsWith(
        'SELECT canonical_id FROM kb.graph_relationships WHERE id='
      )
    ) {
      const row = rels.get(params[0]);
      return {
        rowCount: row ? 1 : 0,
        rows: row ? [{ canonical_id: row.canonical_id }] : [],
      };
    }

    // Relationship head version fast path
    if (
      sql.startsWith(
        'SELECT version as v FROM kb.graph_relationships WHERE canonical_id='
      )
    ) {
      const canonical = params[0];
      const head = Array.from(rels.values())
        .filter((r) => r.canonical_id === canonical)
        .sort((a, b) => b.version - a.version)[0];
      return {
        rowCount: head ? 1 : 0,
        rows: head ? [{ v: head.version }] : [],
      };
    }

    // Relationship history list
    if (
      sql.startsWith(
        'SELECT id, organization_id, project_id, type, src_id, dst_id'
      )
    ) {
      const canonicalId = params[0];
      const limit = params[params.length - 1];
      const cursorIdx = sql.includes('version < $2') ? 1 : null;
      let rows = Array.from(rels.values())
        .filter((r) => r.canonical_id === canonicalId)
        .sort((a, b) => b.version - a.version);
      if (cursorIdx !== null)
        rows = rows.filter((r) => r.version < params[cursorIdx]);
      return { rowCount: rows.length, rows: rows.slice(0, limit) };
    }

    // Distinct head relationship list (edges traversal) – accommodate branch_id column and properties
    // Updated to match current traversal SQL which includes properties field
    if (
      sql.includes('SELECT DISTINCT ON (canonical_id)') &&
      sql.includes('FROM kb.graph_relationships') &&
      sql.includes('src_id') &&
      sql.includes('dst_id')
    ) {
      const id = params[0];
      const rows = Array.from(rels.values()).filter(
        (r) => r.src_id === id || r.dst_id === id
      );
      return { rowCount: rows.length, rows };
    }

    // Distinct head objects for traversal
    if (sql.includes('FROM kb.graph_objects WHERE id=$1')) {
      const row = objects.get(params[0]);
      return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
    }

    // Search objects / relationships simplified: return empty (covered by edge-case tests)
    if (
      sql.includes('FROM kb.graph_objects') ||
      sql.includes('FROM kb.graph_relationships r')
    ) {
      return { rowCount: 0, rows: [] };
    }

    throw new Error(
      'Unexpected query: ' + sql + ' params=' + JSON.stringify(params)
    );
  }

  it('createRelationship no-op diff returns head without insert', async () => {
    // seed initial relationship
    const src = mkObj({ project_id: 'proj1' });
    const dst = mkObj({ project_id: 'proj1' });
    objects.set(src.id, src);
    objects.set(dst.id, dst);
    const initial = mkRel({
      properties: { a: 1 },
      src_id: src.id,
      dst_id: dst.id,
    });
    rels.set(initial.id, initial);
    const res = await svc.createRelationship(
      {
        type: initial.type,
        src_id: initial.src_id,
        dst_id: initial.dst_id,
        properties: { a: 1 },
      },
      initial.organization_id,
      initial.project_id
    );
    expect(res.id).toBe(initial.id);
    // ensure no second INSERT fired (only BEGIN, advisory lock, select head, ROLLBACK recorded)
    const insertCount = queries.filter((q) =>
      q.sql.startsWith('INSERT INTO kb.graph_relationships')
    ).length;
    expect(insertCount).toBe(0);
  });

  it('listHistory paginates with limit+1 producing next_cursor', async () => {
    const base = mkObj({ version: 1 });
    objects.set(base.id, base);
    for (let v = 2; v <= 5; v++) {
      objects.set(
        crypto.randomUUID(),
        mkObj({ canonical_id: base.canonical_id, version: v })
      );
    }
    const first = await svc.listHistory(base.id, 2);
    expect(first.items.length).toBe(2);
    expect(first.next_cursor).toBeDefined();
    const second = await svc.listHistory(base.id, 2, first.next_cursor);
    expect(second.items.length).toBe(2);
  });

  it('listRelationshipHistory fast-path cursor beyond head returns empty set', async () => {
    const r = mkRel({ version: 3 });
    rels.set(r.id, r);
    const res = await svc.listRelationshipHistory(r.id, 10, '999');
    expect(res.items.length).toBe(0);
  });

  it('traverse forward & backward pagination with filters and truncation by nodes', async () => {
    // create a small chain A -> B -> C -> D
    const a = mkObj({});
    const b = mkObj({});
    const c = mkObj({});
    const d = mkObj({});
    [a, b, c, d].forEach((o) => objects.set(o.id, o));
    const r1 = mkRel({ src_id: a.id, dst_id: b.id });
    rels.set(r1.id, r1);
    const r2 = mkRel({ src_id: b.id, dst_id: c.id });
    rels.set(r2.id, r2);
    const r3 = mkRel({ src_id: c.id, dst_id: d.id });
    rels.set(r3.id, r3);

    const forward = await svc.traverse({
      root_ids: [a.id],
      limit: 2,
      page_direction: 'forward',
    });
    expect(forward.nodes.length).toBe(2);
    expect(forward.next_cursor).toBeTruthy();
    const back = await svc.traverse({
      root_ids: [a.id],
      limit: 2,
      page_direction: 'backward',
      cursor: forward.next_cursor!,
    });
    expect(back.nodes.length).toBeGreaterThan(0);
  });

  it('traverse sets telemetry and truncates by max_edges', async () => {
    const a = mkObj({});
    const b = mkObj({});
    const c = mkObj({});
    [a, b, c].forEach((o) => objects.set(o.id, o));
    // Fully connect to exceed edge cap 1
    const r1 = mkRel({ src_id: a.id, dst_id: b.id });
    rels.set(r1.id, r1);
    const r2 = mkRel({ src_id: b.id, dst_id: c.id });
    rels.set(r2.id, r2);
    const r3 = mkRel({ src_id: a.id, dst_id: c.id });
    rels.set(r3.id, r3);
    const res = await svc.traverse({
      root_ids: [a.id],
      max_edges: 1,
      limit: 10,
    });
    // @ts-ignore
    expect(svc.telemetry?.traverseEvents).toBeGreaterThan(0);
    expect(res.truncated).toBe(true);
  });

  it('expand projection include/exclude and include_relationship_properties', async () => {
    const a = mkObj({ properties: { keep: 1, drop: 2 } });
    const b = mkObj({ properties: { keep: 3, drop: 4 } });
    [a, b].forEach((o) => objects.set(o.id, o));
    const r = mkRel({ src_id: a.id, dst_id: b.id, properties: { weight: 5 } });
    rels.set(r.id, r);
    const res = await svc.expand({
      root_ids: [a.id],
      projection: { include_object_properties: ['keep'] },
      include_relationship_properties: true,
    });
    expect(res.nodes[0].properties).toEqual({ keep: 1 });
    expect(res.edges[0].properties).toEqual({ weight: 5 });
  });
});
