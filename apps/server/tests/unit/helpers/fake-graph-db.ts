// Unified FakeDb for GraphService unit-style tests (traverse, search, history, relationships, objects)
// Provides enough SQL pattern matching to satisfy GraphService queries without a real Postgres.

type Row = Record<string, any>;

export interface FakeGraphDbOptions {
  enableTraversal?: boolean;
  enableSearch?: boolean;
  enableHistory?: boolean;
  enableRelationships?: boolean; // listEdges + relationship create/patch
  strict?: boolean; // if true, throw on unmatched query patterns to catch missing emulation
  recordQueries?: boolean; // if true, keep log of executed SQL (for assertions / benchmarks)
}

export class FakeGraphDb {
  objects: Row[] = [];
  relationships: Row[] = [];
  private objSeq = 0;
  private relSeq = 0;
  private _queries: { sql: string; params?: any[] }[] = [];
  private lastRequestedProject: string | null = null;
  private lastRequestedOrg: string | null = null;
  constructor(private opts: FakeGraphDbOptions = {}) {}

  async setTenantContext(orgId: string | null, projectId: string | null) {
    this.lastRequestedOrg = orgId ?? null;
    this.lastRequestedProject = projectId ?? null;
  }

  async runWithTenantContext<T>(
    projectId: string | null,
    callback: () => Promise<T>
  ): Promise<T> {
    const previousProject = this.lastRequestedProject;
    // No orgId needed - real implementation derives it from projectId automatically
    try {
      this.lastRequestedProject = projectId ?? null;
      return await callback();
    } finally {
      this.lastRequestedProject = previousProject;
    }
  }

  // --- Utility helpers (used by benchmarks) ---
  _insertObject(partial: {
    id?: string;
    type: string;
    key?: string | null;
    labels?: string[];
    properties?: any;
  }) {
    const row: Row = {
      id: partial.id || 'o_' + ++this.objSeq,
      canonical_id: 'co_' + this.objSeq,
      supersedes_id: null,
      version: 1,
      type: partial.type,
      key: partial.key ?? null,
      properties: partial.properties || {},
      labels: partial.labels || [],
      created_at: new Date(Date.now() + this.objSeq * 10).toISOString(),
      deleted_at: null,
    };
    this.objects.push(row);
    return row;
  }
  _resetRelationships() {
    this.relationships = [];
    this.relSeq = 0;
  }

  async getClient() {
    return { query: (s: string, p?: any[]) => this.query(s, p), release() {} };
  }

  async query(sql: string, params?: any[]): Promise<any> {
    if (this.opts.recordQueries) this._queries.push({ sql, params });
    // Object uniqueness head check (search.spec uses project null path)
    if (
      /WHERE project_id IS NOT DISTINCT FROM \$1 AND type=\$2 AND key=\$3/i.test(
        sql
      )
    ) {
      const [projectId, type, key] = params || [];
      const existing = this.objects.find(
        (o) => o.type === type && o.key === key && projectId == null
      );
      return {
        rows: existing ? [{ ...existing }] : [],
        rowCount: existing ? 1 : 0,
      };
    }
    // Object create (no organization_id in column list)
    // SQL: INSERT INTO kb.graph_objects(type, key, status, properties, labels, version, canonical_id, project_id, branch_id, change_summary, content_hash, fts, embedding, embedding_updated_at)
    // Params: [type, key, properties, labels, project_id, branch_id, changeSummary, hash, status (used for FTS)]
    // Note: status is at $10 (index 9), used in FTS expression in SQL but not in column list order
    if (
      /INSERT INTO kb\.graph_objects\(type, key, (?:status, )?properties, labels, version, canonical_id, project_id/i.test(
        sql
      )
    ) {
      const hasStatus = /type, key, status,/.test(sql);
      const row: Row = {
        id: 'o_' + ++this.objSeq,
        canonical_id: 'co_' + this.objSeq,
        supersedes_id: null,
        version: 1,
        type: params?.[0], // $1
        key: params?.[1], // $2
        properties: params?.[2] || {}, // $3
        labels: params?.[3] || [], // $4
        project_id: params?.[4] ?? null, // $5
        branch_id: params?.[5] ?? null, // $6
        change_summary: params?.[6] ?? null, // $7
        content_hash: params?.[7] ?? null, // $8
        // params[8] is JSON.stringify(properties) for FTS ($9)
        status: hasStatus ? params?.[9] ?? null : null, // $10 (last param)
        created_at: new Date(Date.now() + this.objSeq * 10).toISOString(),
        deleted_at: null,
      };
      this.objects.push(row);
      return { rows: [row], rowCount: 1 };
    }
    // Object full fetch
    if (/SELECT \* FROM kb\.graph_objects WHERE id=\$1/i.test(sql)) {
      const r = this.objects.find((o) => o.id === params?.[0]);
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    // Object id resolve by id or canonical_id (used by listEdges)
    if (
      /SELECT id FROM kb\.graph_objects WHERE id = \$1 OR canonical_id = \$1 LIMIT 1/i.test(
        sql
      )
    ) {
      const val = params?.[0];
      const r = this.objects.find(
        (o) => o.id === val || o.canonical_id === val
      );
      return { rows: r ? [{ id: r.id }] : [], rowCount: r ? 1 : 0 };
    }
    // Object lightweight fetch used in traversal (includes branch_id and optionally properties)
    if (
      /SELECT id, type, key, labels, deleted_at, branch_id(?:, properties)? FROM kb\.graph_objects/.test(
        sql
      ) &&
      /WHERE id=\$1/.test(sql)
    ) {
      const r = this.objects.find((o) => o.id === params?.[0]);
      if (!r) return { rows: [], rowCount: 0 };
      const includesProperties = /properties/.test(sql);
      const row: any = {
        id: r.id,
        type: r.type,
        key: r.key,
        labels: r.labels,
        deleted_at: r.deleted_at,
        branch_id: (r as any).branch_id ?? null,
      };
      if (includesProperties) row.properties = r.properties || {};
      return { rows: [row], rowCount: 1 };
    }
    // Batch object endpoint lookup (relationship validation)
    if (
      /SELECT id, project_id, deleted_at, branch_id FROM kb\.graph_objects WHERE id = ANY\(\$1::uuid\[\]\)/i.test(
        sql
      )
    ) {
      const ids: string[] = params?.[0] || [];
      // Auto create stub objects if they don't exist (tests skip explicit object creation)
      for (const id of ids) {
        if (!this.objects.find((o) => o.id === id)) {
          const row = this._insertObject({
            id,
            type: 'Stub',
            key: null,
            properties: {},
            labels: [],
          });
          (row as any).project_id = 'proj';
          (row as any).branch_id = null;
        }
      }
      // Synchronize endpoint project from any existing relationships referencing them. This ensures that
      // subsequent idempotent relationship creations (no-op with identical properties) see consistent project
      // metadata even if initial stub auto-creation used placeholder values that differ from the requested
      // project in the test (e.g. 'proj' vs 'proj1'). Real database rows would already carry consistent
      // metadata, so this bridges the gap in the in-memory emulator.
      for (const id of ids) {
        const rel = this.relationships.find(
          (r) => r.src_id === id || r.dst_id === id
        );
        if (rel) {
          const obj = this.objects.find((o) => o.id === id);
          if (obj) {
            (obj as any).project_id = rel.project_id;
            (obj as any).branch_id = rel.branch_id ?? null;
          }
        }
      }
      // If we have stored lastRequested project (from prior INSERT) and objects still have default placeholder
      // values, adopt the stored values. This simulates consistent endpoint metadata across repeated calls.
      if (this.lastRequestedProject) {
        for (const id of ids) {
          const obj = this.objects.find((o) => o.id === id);
          if (obj) {
            if (this.lastRequestedProject)
              (obj as any).project_id = this.lastRequestedProject;
          }
        }
      }
      // (Removed verbose temporary debug logging used during earlier harness stabilization.)
      const rows = this.objects
        .filter((o) => ids.includes(o.id))
        .map((o) => ({
          id: o.id,
          project_id: (o as any).project_id ?? null,
          deleted_at: o.deleted_at,
          branch_id: (o as any).branch_id ?? null,
        }));
      return { rows, rowCount: rows.length };
    }
    // Object head fetch minimal columns
    if (
      /SELECT id, type, key, labels, deleted_at FROM kb\.graph_objects WHERE id=\$1/i.test(
        sql
      )
    ) {
      const r = this.objects.find((o) => o.id === params?.[0]);
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    // Object patch insert (new version; status optional in column list)
    // SQL: INSERT INTO kb.graph_objects(type, key, status, properties, labels, version, canonical_id, supersedes_id, project_id, branch_id, deleted_at, change_summary, content_hash, fts, embedding_updated_at)
    // Params: [type, key, properties, labels, version, canonical_id, supersedes_id, project_id, branch_id, change_summary, content_hash, ..., status]
    // Note: fts column may be followed by embedding and/or embedding_updated_at depending on schema version
    if (
      /INSERT INTO kb\.graph_objects\(type, key, (?:status, )?properties, labels, version, canonical_id, supersedes_id, project_id, branch_id, deleted_at, change_summary, content_hash(?:, fts(?:, embedding)?(?:, embedding_updated_at)?)?\)/i.test(
        sql
      )
    ) {
      const prev = this.objects.find((o) => o.id === params?.[6]);
      // Check if status is present in the column list
      const hasStatus = /\(type, key, status,/.test(sql);
      const row: Row = {
        id: 'o_' + ++this.objSeq,
        canonical_id: prev?.canonical_id || 'co_' + this.objSeq,
        supersedes_id: params?.[6],
        version: params?.[4],
        type: params?.[0],
        key: params?.[1],
        status: hasStatus ? params?.[14] ?? null : null, // param $15 in SQL = index 14 in array
        properties: params?.[2],
        labels: params?.[3],
        project_id: params?.[7] ?? null,
        branch_id: params?.[8] ?? null,
        change_summary: params?.[9] ?? null,
        content_hash: params?.[10] ?? null,
        created_at: new Date().toISOString(),
        deleted_at: null,
      };
      this.objects.push(row);
      return { rows: [row], rowCount: 1 };
    }
    // Object delete tombstone insert variant: columns omit branch/change_summary/content_hash but include deleted_at + fts + embedding columns
    // SQL: INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id, supersedes_id, project_id, deleted_at, fts, embedding, embedding_updated_at)
    if (
      /INSERT INTO kb\.graph_objects\(type, key, properties, labels, version, canonical_id, supersedes_id, project_id, deleted_at, fts, embedding, embedding_updated_at\)/i.test(
        sql
      )
    ) {
      const prev = this.objects.find((o) => o.id === params?.[6]);
      const row: Row = {
        id: 'o_' + ++this.objSeq,
        canonical_id: prev?.canonical_id || 'co_' + this.objSeq,
        supersedes_id: params?.[6],
        version: params?.[4],
        type: params?.[0],
        key: params?.[1],
        properties: params?.[2],
        labels: params?.[3],
        project_id: params?.[7] ?? null,
        branch_id: (prev as any)?.branch_id ?? null,
        change_summary: null,
        content_hash: null,
        created_at: new Date().toISOString(),
        deleted_at: new Date().toISOString(),
      };
      this.objects.push(row);
      return { rows: [row], rowCount: 1 };
    }
    // Canonical id resolve
    if (/SELECT canonical_id FROM kb\.graph_objects WHERE id=\$1/i.test(sql)) {
      const r = this.objects.find((o) => o.id === params?.[0]);
      return {
        rows: r ? [{ canonical_id: r.canonical_id }] : [],
        rowCount: r ? 1 : 0,
      };
    }
    // Object newer-version check (with optional branch_id IS NOT DISTINCT FROM $3 clause)
    if (
      /SELECT id FROM kb\.graph_objects WHERE canonical_id=\$1 AND version > \$2(?: AND branch_id IS NOT DISTINCT FROM \$3)? LIMIT 1/i.test(
        sql
      )
    ) {
      const canon = params?.[0];
      const ver = params?.[1];
      // Ignore branch constraint for fake store (single branch); treat no newer version
      const newer = this.objects.find(
        (o) => o.canonical_id === canon && o.version > ver
      );
      return { rows: newer ? [{ id: newer.id }] : [], rowCount: newer ? 1 : 0 };
    }
    // Object history listing
    if (/FROM kb\.graph_objects WHERE canonical_id=\$1/i.test(sql)) {
      if (!this.opts.enableHistory) return { rows: [], rowCount: 0 };
      const canonicalId = params?.[0];
      const hasCursor = /version < \$2/.test(sql);
      const cursorVersion = hasCursor ? Number(params?.[1]) : undefined;
      let rows = this.objects
        .filter((o) => o.canonical_id === canonicalId)
        .sort((a, b) => b.version - a.version);
      if (cursorVersion !== undefined)
        rows = rows.filter((r) => r.version < cursorVersion);
      return { rows, rowCount: rows.length };
    }

    // Relationship create first version (with branch_id, change_summary, content_hash)
    if (
      /INSERT INTO kb\.graph_relationships\(project_id, branch_id, type, src_id, dst_id, properties, version, canonical_id, change_summary, content_hash\)/i.test(
        sql
      )
    ) {
      // Ensure endpoints carry matching project in fake objects
      const projectId = params?.[0];
      this.lastRequestedProject = projectId ?? null;
      const srcId = params?.[3];
      const dstId = params?.[4];
      // If a head already exists for this logical identity with same properties treat as no-op and return head
      // NOTE(test-harness divergence): In the production database, an identical re-create attempt would typically
      // be short-circuited by service logic before issuing another INSERT. During earlier test development some
      // flows issued a duplicate create. To keep tests stable and avoid artificial version inflation, the fake
      // DB implements an idempotent guard here that returns the existing head row when the (project_id, type,
      // src_id, dst_id) identity AND JSON-equal properties match. This mirrors the intended semantic outcome
      // (client observes no change) while remaining tolerant of slightly different call ordering in unit-style
      // tests. If future tests assert that a second create should error instead, remove this block and tighten
      // the service layer expectations.
      const existingHead = this.relationships
        .filter(
          (r) =>
            r.project_id === projectId &&
            r.type === params?.[2] &&
            r.src_id === srcId &&
            r.dst_id === dstId
        )
        .sort((a, b) => (b.version || 1) - (a.version || 1))[0];
      if (existingHead) {
        const sameProps =
          JSON.stringify(existingHead.properties || {}) ===
          JSON.stringify(params?.[5] || {});
        if (sameProps) {
          return { rows: [existingHead], rowCount: 1 };
        }
      }
      for (const eid of [srcId, dstId]) {
        const existing = this.objects.find((o) => o.id === eid);
        if (existing) {
          (existing as any).project_id = projectId;
        } else if (eid) {
          const stub = this._insertObject({
            id: eid,
            type: 'Stub',
            key: null,
            properties: {},
            labels: [],
          });
          (stub as any).project_id = projectId;
          (stub as any).branch_id = params?.[1] ?? null;
        }
      }
      const row: Row = {
        id: 'r_' + ++this.relSeq,
        project_id: params?.[0] ?? 'proj',
        branch_id: params?.[1] ?? null,
        type: params?.[2],
        src_id: params?.[3],
        dst_id: params?.[4],
        properties: params?.[5] || {},
        version: 1,
        supersedes_id: null,
        canonical_id: 'cr_' + this.relSeq,
        change_summary: params?.[7] ?? null,
        content_hash: params?.[8] ?? null,
        weight: 0,
        valid_from: null,
        valid_to: null,
        deleted_at: null,
        created_at: new Date(Date.now() + this.relSeq * 10).toISOString(),
      };
      this.relationships.push(row);
      return { rows: [row], rowCount: 1 };
    }
    // Relationship patch insert (with branch_id, change_summary, content_hash; optional deleted_at column)
    if (
      /INSERT INTO kb\.graph_relationships\(project_id, branch_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id, change_summary, content_hash\)/i.test(
        sql
      ) ||
      /INSERT INTO kb\.graph_relationships\(project_id, branch_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id, deleted_at, change_summary, content_hash\)/i.test(
        sql
      )
    ) {
      const hasDeleted = /deleted_at/.test(sql);
      const projectId = params?.[0];
      // Sync existing endpoint objects' project
      for (const eid of [params?.[3], params?.[4]]) {
        const existing = this.objects.find((o) => o.id === eid);
        if (existing) {
          (existing as any).project_id = projectId;
        }
      }
      const row: Row = {
        id: 'r_' + ++this.relSeq,
        project_id: params?.[0],
        branch_id: params?.[1] ?? null,
        type: params?.[2],
        src_id: params?.[3],
        dst_id: params?.[4],
        properties: params?.[5],
        version: params?.[6],
        canonical_id: params?.[7],
        supersedes_id: params?.[8],
        weight: 0,
        valid_from: null,
        valid_to: null,
        deleted_at: hasDeleted ? null : null,
        change_summary: params?.[hasDeleted ? 10 : 9] ?? null,
        content_hash: params?.[hasDeleted ? 11 : 10] ?? null,
        // Keep chronological monotonic ordering consistent with first-version inserts (relSeq * 10ms spacing)
        created_at: new Date(Date.now() + this.relSeq * 10).toISOString(),
      };
      this.relationships.push(row);
      return { rows: [row], rowCount: 1 };
    }
    // Relationship head fetch for multiplicity (ORDER BY version DESC LIMIT 1)
    if (
      /SELECT \* FROM kb\.graph_relationships/i.test(sql) &&
      /ORDER BY version DESC LIMIT 1/i.test(sql)
    ) {
      // Supports patterns with optional branch predicate: project_id=$1 AND (branch_id IS NOT DISTINCT FROM $2)? AND type=$3 AND src_id=$4 AND dst_id=$5
      // We key off the final four identity params (type, src, dst) while ignoring branch for fake store (single branch)
      let projectId: any, type: any, src: any, dst: any;
      if (/branch_id IS NOT DISTINCT FROM \$2/.test(sql)) {
        // param order: project_id, branch_id, type, src, dst
        projectId = params?.[0];
        type = params?.[2];
        src = params?.[3];
        dst = params?.[4];
      } else {
        // param order: project_id, type, src, dst
        projectId = params?.[0];
        type = params?.[1];
        src = params?.[2];
        dst = params?.[3];
      }
      const candidates = this.relationships.filter(
        (r) =>
          r.project_id === projectId &&
          r.type === type &&
          r.src_id === src &&
          r.dst_id === dst
      );
      const head = candidates.sort(
        (a, b) => (b.version || 1) - (a.version || 1)
      )[0];
      return { rows: head ? [head] : [], rowCount: head ? 1 : 0 };
    }
    // Relationship full row fetch for patch (SELECT * ... WHERE id=$1 AND deleted_at IS NULL)
    if (
      /SELECT \* FROM kb\.graph_relationships/i.test(sql) &&
      /WHERE id=\$1/i.test(sql) &&
      /deleted_at IS NULL/i.test(sql)
    ) {
      const r = this.relationships.find((r) => r.id === params?.[0]);
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    // Relationship canonical id resolve
    if (
      /SELECT canonical_id FROM kb\.graph_relationships WHERE id=\$1/i.test(sql)
    ) {
      const r = this.relationships.find((r) => r.id === params?.[0]);
      return {
        rows: r ? [{ canonical_id: r.canonical_id }] : [],
        rowCount: r ? 1 : 0,
      };
    }
    // Relationship head version fetch for history cursor fast path
    if (
      /SELECT version as v FROM kb\.graph_relationships WHERE canonical_id=\$1 ORDER BY version DESC LIMIT 1/i.test(
        sql
      )
    ) {
      const canon = params?.[0];
      const versions = this.relationships
        .filter((r) => r.canonical_id === canon)
        .sort((a, b) => (b.version || 1) - (a.version || 1));
      const head = versions[0];
      return {
        rows: head ? [{ v: head.version }] : [],
        rowCount: head ? 1 : 0,
      };
    }
    // Relationship newer-version check
    if (
      /SELECT id FROM kb\.graph_relationships WHERE canonical_id=\$1 AND version > \$2 LIMIT 1/i.test(
        sql
      )
    ) {
      const [canon, ver] = params || [];
      const newer = this.relationships.find(
        (r) => r.canonical_id === canon && r.version > ver
      );
      return { rows: newer ? [{ id: newer.id }] : [], rowCount: newer ? 1 : 0 };
    }
    // Relationship full fetch by id
    if (
      /SELECT id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id/i.test(
        sql
      ) &&
      /WHERE id=\$1/i.test(sql)
    ) {
      const r = this.relationships.find((r) => r.id === params?.[0]);
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    // Relationship history listing (supports optional cursor version filter)
    if (
      /FROM kb\.graph_relationships WHERE canonical_id=\$1/i.test(sql) &&
      /ORDER BY version DESC/i.test(sql)
    ) {
      const canonicalId = params?.[0];
      const hasCursor = /version < \$2/.test(sql);
      const cursorVersion = hasCursor ? Number(params?.[1]) : undefined;
      let rows = this.relationships
        .filter((r) => r.canonical_id === canonicalId)
        .sort((a, b) => (b.version || 1) - (a.version || 1));
      if (cursorVersion !== undefined)
        rows = rows.filter((r) => (r.version || 1) < cursorVersion);
      return { rows, rowCount: rows.length };
    }
    // listEdges DISTINCT ON pattern (requires directional WHERE clause referencing r.src_id/dst_id)
    if (
      /SELECT \* FROM \(\s*SELECT DISTINCT ON \(r\.canonical_id\)/i.test(sql) &&
      /(WHERE r\.src_id = \$1|WHERE r\.dst_id = \$1|\(r\.src_id = \$1 OR r\.dst_id = \$1\))/i.test(
        sql
      )
    ) {
      if (!this.opts.enableTraversal && !this.opts.enableRelationships)
        return { rows: [], rowCount: 0 };
      const objectId = params?.[0];
      const both = /\(r\.src_id = \$1 OR r\.dst_id = \$1\)/.test(sql);
      const out = /WHERE r\.src_id = \$1/.test(sql) && !both;
      const incoming = /WHERE r\.dst_id = \$1/.test(sql) && !both;
      let subset = this.relationships.filter((r) => {
        if (both) return r.src_id === objectId || r.dst_id === objectId;
        if (out) return r.src_id === objectId;
        if (incoming) return r.dst_id === objectId;
        return false;
      });
      // Heads per canonical
      const headsMap: Record<string, Row> = {};
      for (const rel of subset) {
        const existing = headsMap[rel.canonical_id];
        if (!existing || (rel.version || 1) > (existing.version || 1))
          headsMap[rel.canonical_id] = rel;
      }
      const heads = Object.values(headsMap)
        .filter((r) => !r.deleted_at)
        .slice(0, params?.[1] ?? 500);
      return { rows: heads, rowCount: heads.length };
    }
    // Traversal DISTINCT ON pattern (objects perspective) - GraphService traverse builds similar query selecting edges
    if (
      /SELECT \* FROM \(\s*SELECT DISTINCT ON \(canonical_id\) id, type, src_id, dst_id, deleted_at, version, branch_id(?:, properties)?(?:, valid_from, valid_to, created_at, updated_at)?\s+FROM kb\.graph_relationships/i.test(
        sql
      ) ||
      /SELECT \* FROM \(\s*SELECT DISTINCT ON \(canonical_id\) id, type, src_id, dst_id, deleted_at, version(?:, properties)?\s+FROM kb\.graph_relationships/i.test(
        sql
      )
    ) {
      if (!this.opts.enableTraversal) return { rows: [], rowCount: 0 };
      const objectId = params?.[0];
      const both = /\(src_id = \$1 OR dst_id = \$1\)/.test(sql);
      const out = /WHERE src_id = \$1/.test(sql) && !both;
      const incoming = /WHERE dst_id = \$1/.test(sql) && !both;
      let subset = this.relationships.filter((r) => {
        if (both) return r.src_id === objectId || r.dst_id === objectId;
        if (out) return r.src_id === objectId;
        if (incoming) return r.dst_id === objectId;
        return false;
      });
      // Type filter via ARRAY present
      const typeFilterPresent = /type = ANY\(ARRAY\[/i.test(sql);
      if (typeFilterPresent && params && params.length > 1) {
        const allowed = new Set(params.slice(1));
        subset = subset.filter((r) => allowed.has(r.type));
      }
      const headsMap: Record<string, Row> = {};
      for (const rel of subset) {
        const existing = headsMap[rel.canonical_id || rel.id];
        const version = rel.version || 1;
        if (!existing || version > (existing.version || 1))
          headsMap[rel.canonical_id || rel.id] = rel;
      }
      const heads = Object.values(headsMap)
        .filter((r) => !r.deleted_at)
        .slice(0, 500);
      return { rows: heads, rowCount: heads.length };
    }
    // Object search (DISTINCT ON heads + outer created_at ASC/DESC)
    // Supports both `DISTINCT ON (canonical_id)` and `DISTINCT ON (o.canonical_id)` patterns
    if (
      /SELECT \* FROM \(\s*SELECT DISTINCT ON \((?:o\.)?canonical_id\)/i.test(
        sql
      ) &&
      /FROM kb\.graph_objects/i.test(sql) &&
      /ORDER BY (?:t|h)\.created_at (ASC|DESC)/i.test(sql)
    ) {
      if (!this.opts.enableSearch) return { rows: [], rowCount: 0 };
      let rows = [...this.objects];
      const orderDir = /ORDER BY (?:t|h)\.created_at DESC/i.test(sql)
        ? 'DESC'
        : 'ASC';
      // Filters are positional: type ($1) optional, key, label, cursor (created_at >)
      if (/type = \$\d+/.test(sql) && params && params.length) {
        const typeMatch = sql.match(/type = \$(\d+)/);
        if (typeMatch) {
          const idx = parseInt(typeMatch[1], 10) - 1;
          const typeVal = params[idx];
          rows = rows.filter((r) => r.type === typeVal);
        }
      }
      if (sql.includes('ANY(t.labels)') && params) {
        const labelMatch = sql.match(/\$(\d+) = ANY\(t\.labels\)/);
        if (labelMatch) {
          const idx = parseInt(labelMatch[1], 10) - 1;
          const labelVal = params[idx];
          rows = rows.filter((r) => r.labels.includes(labelVal));
        }
      }
      // Simulate DISTINCT ON head selection by picking highest version per canonical
      const headMap: Record<string, Row> = {};
      for (const o of rows) {
        const existing = headMap[o.canonical_id];
        if (!existing || (o.version || 1) > (existing.version || 1))
          headMap[o.canonical_id] = o;
      }
      let heads = Object.values(headMap).filter((h) => !h.deleted_at);
      heads.sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return orderDir === 'ASC' ? da - db : db - da;
      });
      return { rows: heads, rowCount: heads.length };
    }
    // Relationship search (heads + created_at ordered) supports ASC (oldest-first) and DESC (newest-first)
    if (
      /SELECT \* FROM \(\s*SELECT DISTINCT ON \(r\.canonical_id\)/i.test(sql) &&
      /FROM kb\.graph_relationships r/i.test(sql) &&
      /ORDER BY h\.created_at (ASC|DESC)/i.test(sql)
    ) {
      if (!this.opts.enableSearch) return { rows: [], rowCount: 0 };
      let rows = [...this.relationships];
      const orderDir = /ORDER BY h\.created_at DESC/i.test(sql)
        ? 'DESC'
        : 'ASC';
      // Extract explicit $ indexes so we don't rely on presence order when some filters are omitted
      const typeMatch = sql.match(/h\.type = \$(\d+)/);
      if (typeMatch) {
        const idx = parseInt(typeMatch[1], 10) - 1;
        const val = params?.[idx];
        rows = rows.filter((r) => r.type === val);
      }
      const srcMatch = sql.match(/h\.src_id = \$(\d+)/);
      if (srcMatch) {
        const idx = parseInt(srcMatch[1], 10) - 1;
        const val = params?.[idx];
        rows = rows.filter((r) => r.src_id === val);
      }
      const dstMatch = sql.match(/h\.dst_id = \$(\d+)/);
      if (dstMatch) {
        const idx = parseInt(dstMatch[1], 10) - 1;
        const val = params?.[idx];
        rows = rows.filter((r) => r.dst_id === val);
      }
      const createdAfterMatch = sql.match(/h\.created_at > \$(\d+)/);
      if (createdAfterMatch) {
        const idx = parseInt(createdAfterMatch[1], 10) - 1;
        const val = params?.[idx];
        if (val instanceof Date)
          rows = rows.filter((r) => new Date(r.created_at) > val);
      }
      const createdBeforeMatch = sql.match(/h\.created_at < \$(\d+)/);
      if (createdBeforeMatch) {
        const idx = parseInt(createdBeforeMatch[1], 10) - 1;
        const val = params?.[idx];
        if (val instanceof Date)
          rows = rows.filter((r) => new Date(r.created_at) < val);
      }
      // Head selection per canonical
      const headMap: Record<string, Row> = {};
      for (const r of rows) {
        const existing = headMap[r.canonical_id];
        if (!existing || (r.version || 1) > (existing.version || 1))
          headMap[r.canonical_id] = r;
      }
      let heads = Object.values(headMap).filter((r) => !r.deleted_at);
      heads.sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return orderDir === 'ASC' ? da - db : db - da;
      });
      return { rows: heads, rowCount: heads.length };
    }
    if (this.opts.strict) {
      throw new Error(
        `[FakeGraphDb:strict] Unmatched SQL pattern. Add handler: ${sql.slice(
          0,
          160
        )}...`
      );
    }
    return { rows: [], rowCount: 0 };
  }

  getExecutedQueries() {
    return this._queries.slice();
  }
  clearExecutedQueries() {
    this._queries = [];
  }
}

export function makeFakeGraphDb(opts: FakeGraphDbOptions = {}) {
  // Preserve caller intent; do not auto-enable recordQueries (was previously forced during debugging).
  return new FakeGraphDb(opts);
}
