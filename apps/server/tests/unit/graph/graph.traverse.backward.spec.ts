import { describe, it, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../src/modules/graph/schema-registry.service';

// Lightweight in-memory DB mock focusing only on the specific queries used by traverse()
// We simulate a simple linear chain A -> B -> C -> D -> E to exercise backward pagination logic.

interface ObjRow {
  id: string;
  type: string;
  key: string | null;
  labels: string[];
  deleted_at: Date | null;
}
interface RelRow {
  id: string;
  type: string;
  src_id: string;
  dst_id: string;
  deleted_at: Date | null;
  version: number;
  canonical_id: string;
}

const makeId = (c: string) => `00000000-0000-0000-0000-00000000000${c}`;

class MockDb extends DatabaseService {
  private objects: ObjRow[] = [];
  private rels: RelRow[] = [];
  constructor() {
    // @ts-ignore super expects config
    super({} as any);
    const letters = ['a', 'b', 'c', 'd', 'e'];
    letters.forEach((l) =>
      this.objects.push({
        id: makeId(l),
        type: 'node',
        key: l,
        labels: [],
        deleted_at: null,
      })
    );
    // linear edges a->b->c->d->e
    for (let i = 0; i < letters.length - 1; i++) {
      const src = makeId(letters[i]);
      const dst = makeId(letters[i + 1]);
      const canon = `rel-${i}`;
      this.rels.push({
        id: `rel-${i}-v1`,
        type: 'link',
        src_id: src,
        dst_id: dst,
        deleted_at: null,
        version: 1,
        canonical_id: canon,
      });
    }
  }
  async getClient() {
    // Minimal client implementing query + release used by GraphService for transactional paths (not hit here).
    return {
      query: (sql: string, params: any[]) => this.query(sql, params),
      release: () => {
        /* noop */
      },
    } as any;
  }
  async query(sql: string, params: any[]) {
    // Object fetch by id (with optional branch_id, properties, and expires_at filter)
    if (/FROM kb\.graph_objects/.test(sql) && /WHERE id=\$1/.test(sql)) {
      const row = this.objects.find((o) => o.id === params[0]);
      // Return full row with branch_id and properties if requested
      const result: any = row
        ? { ...row, branch_id: null, properties: {} }
        : null;
      return { rowCount: row ? 1 : 0, rows: result ? [result] : [] } as any;
    }
    // Relationship DISTINCT head selection used in traverse()
    if (/FROM kb\.graph_relationships/.test(sql) && /DISTINCT ON/.test(sql)) {
      const id = params[0];
      const rels = this.rels.filter((r) => r.src_id === id || r.dst_id === id);
      // emulate DISTINCT ON (canonical_id) ORDER BY canonical_id, version DESC
      const byCanon: Record<string, RelRow[]> = {};
      for (const r of rels) {
        byCanon[r.canonical_id] = byCanon[r.canonical_id] || [];
        byCanon[r.canonical_id].push(r);
      }
      const heads: RelRow[] = Object.values(byCanon).map(
        (v) => v.sort((a, b) => b.version - a.version)[0]
      );
      return { rowCount: heads.length, rows: heads } as any;
    }
    throw new Error(
      'Unexpected query: ' + sql + ' params=' + JSON.stringify(params)
    );
  }
}

class MockSchemaRegistry extends SchemaRegistryService {
  constructor() {
    // @ts-ignore
    super({} as any);
  }
}

describe('GraphService traverse backward pagination', () => {
  const db = new MockDb();
  const schema = new MockSchemaRegistry();
  const service = new GraphService(db as any, schema as any);

  it('paginates backward correctly and sets previous/next cursors appropriately', async () => {
    // First page forward to acquire a cursor somewhere in the middle (node c)
    const first = await service.traverse({
      root_ids: [makeId('a')],
      limit: 3,
      max_depth: 10,
      page_direction: 'forward',
    });
    expect(first.nodes.map((n) => n.key)).toEqual(['a', 'b', 'c']);
    expect(first.has_next_page).toBe(true);
    const cursorC = first.next_cursor; // cursor after c (points to c)
    expect(cursorC).toBeTruthy();

    // Second page forward (should give d,e) establishing tail context
    const second = await service.traverse({
      root_ids: [makeId('a')],
      limit: 3,
      max_depth: 10,
      cursor: cursorC || undefined,
      page_direction: 'forward',
    });
    expect(second.nodes.map((n) => n.key)).toEqual(['d', 'e']);
    expect(second.has_next_page).toBe(false); // tail reached
    expect(second.has_previous_page).toBe(true);
    const tailCursor = second.previous_cursor; // cursor referencing d (first item in second page)
    expect(tailCursor).toBeTruthy();

    // Now paginate backward from tailCursor with limit=2 -> should return b,c (window before d)
    const backward = await service.traverse({
      root_ids: [makeId('a')],
      limit: 2,
      max_depth: 10,
      cursor: tailCursor || undefined,
      page_direction: 'backward',
    });
    const keys = backward.nodes.map((n) => n.key);
    expect(keys).toEqual(['b', 'c']);
    // Backward window is mid-chain so both directions remain available
    expect(backward.has_next_page).toBe(true); // there are nodes after c (d,e)
    expect(backward.has_previous_page).toBe(true); // there are nodes before b (a)
    expect(backward.next_cursor).toBeTruthy();
    expect(backward.previous_cursor).toBeTruthy();

    // Backward again from previous_cursor to hit chain start (limit large)
    const backwardToStart = await service.traverse({
      root_ids: [makeId('a')],
      limit: 5,
      max_depth: 10,
      cursor: backward.previous_cursor || undefined,
      page_direction: 'backward',
    });
    expect(backwardToStart.nodes.map((n) => n.key)).toEqual(['a']);
    expect(backwardToStart.has_previous_page).toBe(false); // at start
    expect(backwardToStart.has_next_page).toBe(true); // forward pages exist
  });
});
