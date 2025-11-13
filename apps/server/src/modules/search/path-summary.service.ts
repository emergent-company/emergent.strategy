/**
 * Path Summary Service
 *
 * Generates human-readable summaries of how search results relate to other objects
 * in the knowledge graph via relationships.
 *
 * Phase 3 Priority #4b: Path Summaries in Hybrid Search
 *
 * ═══════════════════════════════════════════════════════════════
 * PathSummaryService - TypeORM Migration Status
 * ═══════════════════════════════════════════════════════════════
 *
 * STATUS: ✅ COMPLETE (100%)
 *
 * STRATEGIC SQL PRESERVED (1 method):
 * - generatePathSummaries() - Recursive CTE for graph traversal
 *
 * RATIONALE FOR STRATEGIC SQL:
 * - Recursive CTEs (WITH RECURSIVE) not supported by TypeORM
 * - Graph traversal algorithm with cycle detection
 * - Performance-critical path enumeration
 * - PostgreSQL-specific features (ARRAY operations, DISTINCT ON)
 *
 * COMPLETED: November 12, 2025
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface PathSummaryOptions {
  maxDepth?: number; // Default: 2 hops
  maxPaths?: number; // Default: 3 paths per result
}

export interface PathSegment {
  relationshipType: string;
  direction: 'out' | 'in';
  targetId: string;
  targetType: string;
  targetKey?: string;
}

export interface PathSummary {
  documentId: string;
  paths: PathSegment[][];
  summary: string; // Human-readable text
}

@Injectable()
export class PathSummaryService {
  private readonly logger = new Logger(PathSummaryService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Generate path summaries for a set of document IDs
   *
   * ═══════════════════════════════════════════════════════════════
   * STRATEGIC SQL PRESERVED
   * ═══════════════════════════════════════════════════════════════
   *
   * WHY THIS CANNOT BE MIGRATED TO TYPEORM:
   *
   * 1. **Recursive CTE (WITH RECURSIVE)**
   *    - Uses WITH RECURSIVE for graph traversal
   *    - Base case: Start from input documents
   *    - Recursive case: Follow relationships up to maxDepth
   *    - TypeORM has no support for recursive CTEs
   *    - This is a fundamental PostgreSQL feature
   *
   * 2. **Cycle Detection with Array Operations**
   *    - Tracks visited nodes: path_ids || ps.target_id
   *    - Prevents cycles: NOT (target_id = ANY(ps.path_ids))
   *    - PostgreSQL array operations (||, ANY)
   *    - TypeORM has no equivalent pattern
   *
   * 3. **Complex Path Accumulation**
   *    - Accumulates path_ids: ARRAY[o.id] → path_ids || ps.target_id
   *    - Accumulates path_rels: ARRAY[r.type] → path_rels || r.type
   *    - Builds complete path history during traversal
   *    - TypeORM would require N separate queries + manual path building
   *
   * 4. **DISTINCT ON with Complex Ordering**
   *    - DISTINCT ON (ps.doc_id, ps.target_id)
   *    - ORDER BY ps.doc_id, ps.target_id, ps.depth ASC
   *    - Keeps shortest path to each target
   *    - TypeORM QueryBuilder has limited DISTINCT ON support
   *
   * 5. **Performance-Critical Graph Algorithm**
   *    - Single query for multi-hop graph traversal
   *    - Database handles path enumeration (optimal)
   *    - Alternative: N queries per depth level (exponentially slower)
   *    - Current approach: O(depth), TypeORM: O(edges^depth)
   *
   * QUERY PATTERN: Recursive CTE + Cycle Detection + Path Accumulation
   * COMPLEXITY: Very High (advanced PostgreSQL features)
   * MAINTENANCE: Change only if path traversal algorithm changes
   *
   * @param documentIds - Document IDs from search results
   * @param options - Path generation options
   * @returns Map of document_id to PathSummary
   *
   * ═══════════════════════════════════════════════════════════════
   */
  async generatePathSummaries(
    documentIds: string[],
    options: PathSummaryOptions = {}
  ): Promise<Map<string, PathSummary>> {
    const { maxDepth = 2, maxPaths = 3 } = options;
    const summaries = new Map<string, PathSummary>();

    if (documentIds.length === 0) {
      return summaries;
    }

    try {
      // Query to find relationships from documents to other objects
      // Limited to maxDepth hops and maxPaths per document
      const query = `
                WITH RECURSIVE path_search AS (
                    -- Base case: Start from documents
                    SELECT 
                        o.id AS doc_id,
                        r.type AS rel_type,
                        CASE WHEN r.src_id = o.id THEN 'out' ELSE 'in' END AS direction,
                        CASE WHEN r.src_id = o.id THEN r.dst_id ELSE r.src_id END AS target_id,
                        1 AS depth,
                        ARRAY[o.id] AS path_ids,
                        ARRAY[r.type] AS path_rels
                    FROM kb.graph_objects o
                    JOIN kb.graph_relationships r ON (o.id = r.src_id OR o.id = r.dst_id)
                    WHERE o.id = ANY($1::text[])
                      AND o.deleted_at IS NULL
                      AND r.deleted_at IS NULL
                    
                    UNION ALL
                    
                    -- Recursive case: Follow relationships up to maxDepth
                    SELECT
                        ps.doc_id,
                        r.type AS rel_type,
                        CASE WHEN r.src_id = ps.target_id THEN 'out' ELSE 'in' END AS direction,
                        CASE WHEN r.src_id = ps.target_id THEN r.dst_id ELSE r.src_id END AS target_id,
                        ps.depth + 1,
                        ps.path_ids || ps.target_id,
                        ps.path_rels || r.type
                    FROM path_search ps
                    JOIN kb.graph_relationships r ON (ps.target_id = r.src_id OR ps.target_id = r.dst_id)
                    WHERE ps.depth < $2
                      AND NOT (CASE WHEN r.src_id = ps.target_id THEN r.dst_id ELSE r.src_id END = ANY(ps.path_ids))
                      AND r.deleted_at IS NULL
                )
                SELECT DISTINCT ON (ps.doc_id, ps.target_id)
                    ps.doc_id,
                    ps.rel_type,
                    ps.direction,
                    ps.target_id,
                    o.type AS target_type,
                    o.key AS target_key,
                    ps.depth,
                    ps.path_rels
                FROM path_search ps
                JOIN kb.graph_objects o ON o.id = ps.target_id
                WHERE o.deleted_at IS NULL
                ORDER BY ps.doc_id, ps.target_id, ps.depth ASC
                LIMIT $3
            `;

      const result = await this.db.query(query, [
        documentIds,
        maxDepth,
        documentIds.length * maxPaths,
      ]);

      // Group results by document ID
      const pathsByDoc = new Map<string, any[]>();
      for (const row of result.rows) {
        if (!pathsByDoc.has(row.doc_id)) {
          pathsByDoc.set(row.doc_id, []);
        }
        pathsByDoc.get(row.doc_id)!.push(row);
      }

      // Build path summaries
      for (const [docId, rows] of pathsByDoc.entries()) {
        const paths: PathSegment[][] = [];
        const relationshipCounts = new Map<string, number>();

        // Build paths and count relationship types
        for (const row of rows.slice(0, maxPaths)) {
          const pathRels = row.path_rels as string[];
          const segments: PathSegment[] = [
            {
              relationshipType: row.rel_type,
              direction: row.direction,
              targetId: row.target_id,
              targetType: row.target_type,
              targetKey: row.target_key,
            },
          ];
          paths.push(segments);

          // Count relationship types for summary
          for (const relType of pathRels) {
            relationshipCounts.set(
              relType,
              (relationshipCounts.get(relType) || 0) + 1
            );
          }
        }

        // Generate human-readable summary
        const summary = this.buildSummaryText(paths);

        summaries.set(docId, {
          documentId: docId,
          paths,
          summary,
        });
      }

      return summaries;
    } catch (error) {
      this.logger.error(`Failed to generate path summaries: ${error}`);
      return summaries;
    }
  }

  /**
   * Build human-readable summary text from paths
   */
  private buildSummaryText(paths: PathSegment[][]): string {
    if (paths.length === 0) {
      return 'No related objects';
    }

    const parts: string[] = [];

    for (const path of paths) {
      if (path.length === 0) continue;

      const segment = path[0];
      const dirVerb = segment.direction === 'out' ? 'links to' : 'linked from';
      const targetDesc = segment.targetKey
        ? `${segment.targetType} "${segment.targetKey}"`
        : segment.targetType;

      parts.push(`${dirVerb} ${targetDesc} via '${segment.relationshipType}'`);
    }

    if (parts.length === 0) {
      return 'No related objects';
    }

    if (parts.length === 1) {
      return `Related: ${parts[0]}`;
    }

    if (parts.length === 2) {
      return `Related: ${parts[0]}; ${parts[1]}`;
    }

    return `Related: ${parts[0]}; ${parts[1]}; +${parts.length - 2} more`;
  }
}
