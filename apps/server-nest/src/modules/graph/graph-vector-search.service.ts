import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface VectorSearchResultRow {
    id: string;
    distance: number;
    org_id?: string | null;
    project_id?: string | null;
    branch_id?: string | null;
}

export interface VectorSearchOptions {
    limit?: number;            // number of neighbors to return (default 10)
    minScore?: number;         // optional max distance / min cosine distance threshold (distance filter)
    maxDistance?: number;      // preferred alias for minScore (if provided overrides minScore)
    type?: string;
    orgId?: string;
    projectId?: string;
    branchId?: string;
    keyPrefix?: string;
    labelsAll?: string[];      // require all labels
    labelsAny?: string[];      // require any label overlap
}

/**
 * GraphVectorSearchService
 * Lightweight service exposing similarity search over kb.graph_objects.embedding_vec.
 * Assumptions:
 *  - embedding_vec is a pgvector column (vector(32)) populated asynchronously by worker (future backfill).
 *  - We use cosine distance (<-> operator) by default. (ivfflat index created during schema ensure.)
 *  - If pgvector / column not present, methods degrade to empty results instead of throwing to keep
 *    higher-layer logic resilient in partial test environments.
 */
@Injectable()
export class GraphVectorSearchService {
    private readonly logger = new Logger(GraphVectorSearchService.name);
    constructor(@Inject(DatabaseService) private readonly db: DatabaseService) { }

    /** Build dynamic filter SQL fragments shared between vector search methods. */
    private buildDynamicFilters(opts: VectorSearchOptions, startParamIndex: number, excludeId?: { placeholder: string }): { clause: string; params: any[]; nextIndex: number } {
        const filters: string[] = ['embedding_vec IS NOT NULL'];
        const params: any[] = [];
        let paramIndex = startParamIndex;
        if (excludeId) {
            filters.push(`id <> ${excludeId.placeholder}`);
        }
        if (opts.type) { filters.push(`type = $${paramIndex++}`); params.push(opts.type); }
        if (opts.orgId) { filters.push(`org_id = $${paramIndex++}`); params.push(opts.orgId); }
        if (opts.projectId) { filters.push(`project_id = $${paramIndex++}`); params.push(opts.projectId); }
        if (opts.branchId) { filters.push(`branch_id = $${paramIndex++}`); params.push(opts.branchId); }
        if (opts.keyPrefix) { filters.push(`key ILIKE $${paramIndex++}`); params.push(opts.keyPrefix + '%'); }
        if (opts.labelsAll && opts.labelsAll.length) { filters.push(`labels @> $${paramIndex++}::text[]`); params.push(opts.labelsAll); }
        if (opts.labelsAny && opts.labelsAny.length) { filters.push(`labels && $${paramIndex++}::text[]`); params.push(opts.labelsAny); }
        return { clause: 'WHERE ' + filters.join(' AND '), params, nextIndex: paramIndex };
    }

    /** Raw similarity search by query vector. Returns object id + distance ordered ascending. */
    async searchByVector(query: number[], opts: VectorSearchOptions = {}): Promise<VectorSearchResultRow[]> {
        if (!this.db.isOnline()) return [];
        const limit = Math.max(1, Math.min(100, opts.limit ?? 10));
        // Build parameterized vector literal; pgvector supports ARRAY style casting.
        const dim = query.length;
        if (!dim) return [];
        const vectorArray = query.map(v => (Number.isFinite(v) ? v : 0)).join(',');
        // Use parameterized literal and cast to vector to avoid operator resolution errors (operator does not exist: vector <=> unknown).
        const baseParams: any[] = [`[${vectorArray}]`];
        const { clause, params: dynamicParams, nextIndex } = this.buildDynamicFilters(opts, 2);
        const sql = `SELECT id, org_id, project_id, branch_id, (embedding_vec <=> $1::vector) AS distance
                     FROM kb.graph_objects
                     ${clause}
                     ORDER BY embedding_vec <=> $1::vector
                     LIMIT $${nextIndex}`;
        try {
            const res = await this.db.query<{ id: string; distance: number; org_id: string | null; project_id: string | null; branch_id: string | null }>(sql, [...baseParams, ...dynamicParams, limit]);
            let rows = res.rows || [];
            const threshold = opts.maxDistance != null ? opts.maxDistance : opts.minScore;
            if (threshold != null) {
                rows = rows.filter(r => r.distance <= threshold);
            }
            return rows.map(r => ({ id: r.id, distance: r.distance, org_id: r.org_id, project_id: r.project_id, branch_id: r.branch_id }));
        } catch (e) {
            const msg = (e as Error).message || '';
            if (/column "embedding_vec"/.test(msg) || /does not exist/.test(msg)) {
                this.logger.warn('Vector search skipped (column or extension missing): ' + msg);
                return [];
            }
            this.logger.error('Vector search query failed: ' + msg);
            throw e;
        }
    }

    /** Convenience: search for neighbors of an existing object by reusing its stored embedding. */
    async searchSimilar(objectId: string, opts: VectorSearchOptions = {}): Promise<VectorSearchResultRow[]> {
        if (!this.db.isOnline()) return [];
        const vecRes = await this.db.query<{ embedding_vec: any }>('SELECT embedding_vec FROM kb.graph_objects WHERE id=$1', [objectId]);
        if (!vecRes.rowCount || !vecRes.rows[0].embedding_vec) return [];
        // pgvector returns as string like '[1,2,...]' or an array depending on driver; re-emit literal for operator usage.
        const literal = typeof vecRes.rows[0].embedding_vec === 'string'
            ? vecRes.rows[0].embedding_vec
            : `[${(vecRes.rows[0].embedding_vec as number[]).join(',')}]`;
        const limit = Math.max(1, Math.min(100, opts.limit ?? 10));
        const { clause, params: dynamicParams, nextIndex } = this.buildDynamicFilters(opts, 3, { placeholder: '$1' });
        const sql = `SELECT id, org_id, project_id, branch_id, (embedding_vec <=> $2::vector) AS distance
                     FROM kb.graph_objects
                     ${clause}
                     ORDER BY embedding_vec <=> $2::vector
                     LIMIT $${nextIndex}`;
        try {
            const res = await this.db.query<{ id: string; distance: number; org_id: string | null; project_id: string | null; branch_id: string | null }>(sql, [objectId, literal, ...dynamicParams, limit]);
            let rows = res.rows || [];
            const threshold = opts.maxDistance != null ? opts.maxDistance : opts.minScore;
            if (threshold != null) {
                rows = rows.filter(r => r.distance <= threshold);
            }
            return rows.map(r => ({ id: r.id, distance: r.distance, org_id: r.org_id, project_id: r.project_id, branch_id: r.branch_id }));
        } catch (e) {
            const msg = (e as Error).message || '';
            if (/column "embedding_vec"/.test(msg) || /does not exist/.test(msg)) {
                this.logger.warn('Vector similarity skipped (column or extension missing): ' + msg);
                return [];
            }
            this.logger.error('Vector similarity query failed: ' + msg);
            throw e;
        }
    }
}
