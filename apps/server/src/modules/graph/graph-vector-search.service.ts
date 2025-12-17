import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface VectorSearchResultRow {
  id: string;
  canonical_id?: string | null;
  version?: number | null;
  distance: number;
  // organization_id removed from graph_objects schema in Phase 5
  project_id?: string | null;
  branch_id?: string | null;
}

export interface VectorSearchOptions {
  limit?: number; // number of neighbors to return (default 10)
  minScore?: number; // optional max distance / min cosine distance threshold (distance filter)
  maxDistance?: number; // preferred alias for minScore (if provided overrides minScore)
  type?: string;
  orgId?: string; // deprecated: organization filtering not supported (Phase 5)
  projectId?: string;
  branchId?: string;
  keyPrefix?: string;
  labelsAll?: string[]; // require all labels
  labelsAny?: string[]; // require any label overlap
}

/**
 * GraphVectorSearchService
 * Lightweight service exposing similarity search over kb.graph_objects.embedding_v2.
 *
 * Updated: Now uses embedding_v2 (vector(768)) which matches Gemini text-embedding-004 output.
 * Previous: embedding_vec (vector(32)) was wrong dimension and always NULL.
 *
 * Assumptions:
 *  - embedding_v2 is a pgvector column (vector(768)) populated asynchronously by worker.
 *  - We use cosine distance (<-> operator) by default. (ivfflat index created during migration.)
 *  - If pgvector / column not present, methods degrade to empty results instead of throwing to keep
 *    higher-layer logic resilient in partial test environments.
 *
 * Related: docs/bugs/004-embedding-column-mismatch.md
 */
@Injectable()
export class GraphVectorSearchService {
  private readonly logger = new Logger(GraphVectorSearchService.name);
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Build dynamic filter SQL fragments shared between vector search methods. */
  private buildDynamicFilters(
    opts: VectorSearchOptions,
    startParamIndex: number,
    excludeId?: { placeholder: string }
  ): { clause: string; params: any[]; nextIndex: number } {
    const filters: string[] = [
      'embedding_v2 IS NOT NULL',
      'deleted_at IS NULL',
    ];
    const params: any[] = [];
    let paramIndex = startParamIndex;
    if (excludeId) {
      filters.push(`id <> ${excludeId.placeholder}`);
    }
    if (opts.type) {
      filters.push(`type = $${paramIndex++}`);
      params.push(opts.type);
    }
    // organization_id removed from graph_objects schema in Phase 5 - orgId filter ignored
    if (opts.projectId) {
      filters.push(`project_id = $${paramIndex++}`);
      params.push(opts.projectId);
    }
    if (opts.branchId) {
      filters.push(`branch_id = $${paramIndex++}`);
      params.push(opts.branchId);
    }
    if (opts.keyPrefix) {
      filters.push(`key ILIKE $${paramIndex++}`);
      params.push(opts.keyPrefix + '%');
    }
    if (opts.labelsAll && opts.labelsAll.length) {
      filters.push(`labels @> $${paramIndex++}::text[]`);
      params.push(opts.labelsAll);
    }
    if (opts.labelsAny && opts.labelsAny.length) {
      filters.push(`labels && $${paramIndex++}::text[]`);
      params.push(opts.labelsAny);
    }
    return {
      clause: 'WHERE ' + filters.join(' AND '),
      params,
      nextIndex: paramIndex,
    };
  }

  /** Raw similarity search by query vector. Returns object id + distance ordered ascending. */
  async searchByVector(
    query: number[],
    opts: VectorSearchOptions = {}
  ): Promise<VectorSearchResultRow[]> {
    if (!this.db.isOnline()) return [];
    const limit = Math.max(1, Math.min(100, opts.limit ?? 10));
    // Build parameterized vector literal; pgvector supports ARRAY style casting.
    const dim = query.length;
    if (!dim) return [];
    const vectorArray = query
      .map((v) => (Number.isFinite(v) ? v : 0))
      .join(',');
    // Use parameterized literal and cast to vector to avoid operator resolution errors (operator does not exist: vector <=> unknown).
    const baseParams: any[] = [`[${vectorArray}]`];
    const {
      clause,
      params: dynamicParams,
      nextIndex,
    } = this.buildDynamicFilters(opts, 2);
    // organization_id removed from graph_objects schema in Phase 5
    const sql = `SELECT id, project_id, branch_id, (embedding_v2 <=> $1::vector) AS distance
                     FROM kb.graph_objects
                     ${clause}
                     ORDER BY embedding_v2 <=> $1::vector
                     LIMIT $${nextIndex}`;
    try {
      const res = await this.db.query<{
        id: string;
        distance: number;
        project_id: string | null;
        branch_id: string | null;
      }>(sql, [...baseParams, ...dynamicParams, limit]);
      let rows = res.rows || [];
      const threshold =
        opts.maxDistance != null ? opts.maxDistance : opts.minScore;
      if (threshold != null) {
        rows = rows.filter((r: any) => r.distance <= threshold);
      }
      return rows.map((r: any) => ({
        id: r.id,
        distance: r.distance,
        project_id: r.project_id,
        branch_id: r.branch_id,
      }));
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/column "embedding_v2"/.test(msg) || /does not exist/.test(msg)) {
        this.logger.warn(
          'Vector search skipped (column or extension missing): ' + msg
        );
        return [];
      }
      this.logger.error('Vector search query failed: ' + msg);
      throw e;
    }
  }

  /** Convenience: search for neighbors of an existing object by reusing its stored embedding. */
  async searchSimilar(
    objectId: string,
    opts: VectorSearchOptions = {}
  ): Promise<VectorSearchResultRow[]> {
    if (!this.db.isOnline()) return [];
    const vecRes = await this.db.query<{ embedding_v2: any }>(
      'SELECT embedding_v2 FROM kb.graph_objects WHERE id=$1',
      [objectId]
    );
    if (!vecRes.rowCount || !vecRes.rows[0].embedding_v2) return [];
    // pgvector returns as string like '[1,2,...]' or an array depending on driver; re-emit literal for operator usage.
    const literal =
      typeof vecRes.rows[0].embedding_v2 === 'string'
        ? vecRes.rows[0].embedding_v2
        : `[${(vecRes.rows[0].embedding_v2 as number[]).join(',')}]`;
    const limit = Math.max(1, Math.min(100, opts.limit ?? 10));
    const {
      clause,
      params: dynamicParams,
      nextIndex,
    } = this.buildDynamicFilters(opts, 3, { placeholder: '$1' });
    // organization_id removed from graph_objects schema in Phase 5
    const sql = `SELECT id, canonical_id, version, project_id, branch_id, (embedding_v2 <=> $2::vector) AS distance
                     FROM kb.graph_objects
                     ${clause}
                     ORDER BY embedding_v2 <=> $2::vector
                     LIMIT $${nextIndex}`;
    try {
      const res = await this.db.query<{
        id: string;
        canonical_id: string | null;
        version: number | null;
        distance: number;
        project_id: string | null;
        branch_id: string | null;
      }>(sql, [objectId, literal, ...dynamicParams, limit]);
      let rows = res.rows || [];
      const threshold =
        opts.maxDistance != null ? opts.maxDistance : opts.minScore;
      if (threshold != null) {
        rows = rows.filter((r: any) => r.distance <= threshold);
      }
      return rows.map((r: any) => ({
        id: r.id,
        canonical_id: r.canonical_id,
        version: r.version,
        distance: r.distance,
        project_id: r.project_id,
        branch_id: r.branch_id,
      }));
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/column "embedding_v2"/.test(msg) || /does not exist/.test(msg)) {
        this.logger.warn(
          'Vector similarity skipped (column or extension missing): ' + msg
        );
        return [];
      }
      this.logger.error('Vector similarity query failed: ' + msg);
      throw e;
    }
  }
}
