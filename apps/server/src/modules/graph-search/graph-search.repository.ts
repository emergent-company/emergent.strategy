import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

/**
 * Row structure returned by graph search queries
 */
export interface CandidateRow {
  id: string;
  lexical_score?: number;
  vector_score?: number;
}

/**
 * Repository for graph search using real database queries
 *
 * Performs hybrid search over kb.graph_objects using:
 * - Lexical search: PostgreSQL full-text search (ts_rank) over fts column
 * - Vector search: pgvector similarity search over embedding_v2 column (768-dim, Gemini text-embedding-004)
 */
@Injectable()
export class GraphSearchRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Lexical search using PostgreSQL full-text search
   *
   * Uses ts_rank to score documents by relevance to the query.
   * Searches the fts (tsvector) column which should contain indexed text.
   */
  async lexicalCandidates(
    query: string,
    limit: number
  ): Promise<CandidateRow[]> {
    // Convert query to tsquery (handles multi-word queries)
    // plainto_tsquery is more forgiving than to_tsquery
    const sql = `
      SELECT 
        id,
        ts_rank(fts, plainto_tsquery('english', $1)) as lexical_score
      FROM kb.graph_objects
      WHERE 
        deleted_at IS NULL
        AND fts @@ plainto_tsquery('english', $1)
      ORDER BY lexical_score DESC
      LIMIT $2
    `;

    try {
      const result = await this.db.query<{
        id: string;
        lexical_score: number;
      }>(sql, [query, limit]);

      return result.rows.map((row) => ({
        id: row.id,
        lexical_score: row.lexical_score,
      }));
    } catch (error) {
      console.error('[GraphSearchRepository] Lexical search failed:', error);
      // Return empty results on error rather than crashing
      return [];
    }
  }

  /**
   * Vector search using pgvector similarity
   *
   * Uses cosine similarity (<->) operator to find nearest neighbors.
   * Searches the embedding_v2 (vector(768)) column which matches Gemini text-embedding-004 output.
   *
   * Note: Returns empty if no objects have embeddings populated.
   */
  async vectorCandidates(
    embedding: number[],
    limit: number
  ): Promise<CandidateRow[]> {
    // Convert embedding array to pgvector format: '[0.1, 0.2, ...]'
    const vectorStr = `[${embedding.join(',')}]`;

    // Using <-> for cosine distance (lower is better, so we convert to similarity score)
    // 1 - distance gives us a similarity score where higher is better
    const sql = `
      SELECT 
        id,
        (1 - (embedding_v2 <-> $1::vector)) as vector_score
      FROM kb.graph_objects
      WHERE 
        deleted_at IS NULL
        AND embedding_v2 IS NOT NULL
      ORDER BY embedding_v2 <-> $1::vector
      LIMIT $2
    `;

    try {
      const result = await this.db.query<{
        id: string;
        vector_score: number;
      }>(sql, [vectorStr, limit]);

      return result.rows.map((row) => ({
        id: row.id,
        vector_score: row.vector_score,
      }));
    } catch (error) {
      console.error('[GraphSearchRepository] Vector search failed:', error);
      // Return empty results on error rather than crashing
      return [];
    }
  }

  /**
   * Hydrate graph objects by fetching their full data
   *
   * @param objectIds Array of object IDs to fetch
   * @returns Map of object_id -> object data (type, key, properties)
   */
  async hydrateObjects(objectIds: string[]): Promise<
    Map<
      string,
      {
        id: string;
        canonical_id: string;
        type: string;
        key: string;
        properties: Record<string, any>;
      }
    >
  > {
    if (objectIds.length === 0) {
      return new Map();
    }

    const sql = `
      SELECT 
        id,
        canonical_id,
        type,
        key,
        properties
      FROM kb.graph_objects
      WHERE 
        id = ANY($1::uuid[])
        AND deleted_at IS NULL
    `;

    try {
      const result = await this.db.query<{
        id: string;
        canonical_id: string;
        type: string;
        key: string;
        properties: Record<string, any>;
      }>(sql, [objectIds]);

      const map = new Map();
      for (const row of result.rows) {
        map.set(row.id, row);
      }
      return map;
    } catch (error) {
      console.error('[GraphSearchRepository] Object hydration failed:', error);
      return new Map();
    }
  }
}
