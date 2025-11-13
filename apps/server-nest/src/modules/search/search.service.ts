import { Injectable } from '@nestjs/common';
import { SearchMode } from './dto/search-query.dto';
import { DatabaseService } from '../../common/database/database.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { AppConfigService } from '../../common/config/config.service';
import { PathSummaryService } from './path-summary.service';
import { hybridSearch } from '../../common/database/sql-patterns';

interface SearchResultItem {
  id: string;
  document_id: string;
  chunk_index: number;
  text: string;
}
interface ScoredResultItem extends SearchResultItem {
  score?: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingsService,
    private readonly config: AppConfigService,
    private readonly pathSummary: PathSummaryService
  ) {}

  async search(
    query: string,
    limit: number,
    mode: SearchMode,
    lexicalWeight: number = 0.5,
    vectorWeight: number = 0.5,
    includePaths: boolean = false
  ): Promise<{
    mode: SearchMode;
    results: SearchResultItem[];
    warning?: string;
    pathSummaries?: Map<string, any>;
    totalCandidates?: number;
  }> {
    const q = query.trim();
    if (!q) return { mode, results: [], totalCandidates: 0 };
    const clampedLimit = Math.min(Math.max(limit, 1), 50);

    // Lexical only path
    const lexicalSql = `SELECT id, document_id, chunk_index, text
                 FROM kb.chunks
                 WHERE tsv @@ websearch_to_tsquery('simple', $1)
                 ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', $1)) DESC
                 LIMIT $2`;

    if (mode === SearchMode.LEXICAL || !this.config.embeddingsEnabled) {
      const { rows } = await this.db.query<SearchResultItem>(lexicalSql, [
        q,
        clampedLimit,
      ]);

      // Generate path summaries if requested
      let pathSummaries: Map<string, any> | undefined;
      if (includePaths && rows.length > 0) {
        const documentIds = Array.from(
          new Set(rows.map((r: any) => r.document_id))
        );
        pathSummaries = await this.pathSummary.generatePathSummaries(
          documentIds
        );
      }

      return {
        mode:
          mode === SearchMode.LEXICAL ? SearchMode.LEXICAL : SearchMode.LEXICAL,
        results: rows,
        warning:
          !this.config.embeddingsEnabled && mode !== SearchMode.LEXICAL
            ? 'Embeddings unavailable; fell back to lexical.'
            : undefined,
        pathSummaries,
        totalCandidates: rows.length,
      };
    }

    // Need embeddings
    let qvec: number[] = [];
    try {
      qvec = await this.embeddings.embedQuery(q);
    } catch (e) {
      // Fallback lexical if embedding fails
      const { rows } = await this.db.query<SearchResultItem>(lexicalSql, [
        q,
        clampedLimit,
      ]);

      // Generate path summaries if requested
      let pathSummaries: Map<string, any> | undefined;
      if (includePaths && rows.length > 0) {
        const documentIds = Array.from(
          new Set(rows.map((r: any) => r.document_id))
        );
        pathSummaries = await this.pathSummary.generatePathSummaries(
          documentIds
        );
      }

      return {
        mode: SearchMode.LEXICAL,
        results: rows,
        warning: `Embedding failed; lexical fallback: ${(e as Error).message}`,
        pathSummaries,
        totalCandidates: rows.length,
      };
    }
    const vecLiteral = '[' + qvec.join(',') + ']';

    if (mode === SearchMode.VECTOR) {
      const { rows } = await this.db.query<SearchResultItem>(
        `SELECT id, document_id, chunk_index, text
                 FROM kb.chunks
                 ORDER BY embedding <=> $1::vector
                 LIMIT $2`,
        [vecLiteral, clampedLimit]
      );

      // Generate path summaries if requested
      let pathSummaries: Map<string, any> | undefined;
      if (includePaths && rows.length > 0) {
        const documentIds = Array.from(
          new Set(rows.map((r: any) => r.document_id))
        );
        pathSummaries = await this.pathSummary.generatePathSummaries(
          documentIds
        );
      }

      return {
        mode: SearchMode.VECTOR,
        results: rows,
        pathSummaries,
        totalCandidates: rows.length,
      };
    }

    // Hybrid search using centralized utility
    // Note: The utility expects T to include id/score in queries, but strips them in the result
    type ChunkData = Omit<SearchResultItem, 'id'>;
    const hybridResults = await hybridSearch<ChunkData>(this.db, {
      lexicalQuery: `
        SELECT c.id, c.document_id, c.chunk_index, c.text,
               ts_rank(c.tsv, websearch_to_tsquery('simple', $1)) AS score
        FROM kb.chunks c
        WHERE c.tsv @@ websearch_to_tsquery('simple', $1)
        ORDER BY score DESC
        LIMIT $2
      `,
      lexicalParams: [q, clampedLimit * 2],
      vectorQuery: `
        SELECT c.id, c.document_id, c.chunk_index, c.text,
               (1 - (c.embedding <=> $1::vector)) AS score
        FROM kb.chunks c
        ORDER BY c.embedding <=> $1::vector
        LIMIT $2
      `,
      vectorParams: [vecLiteral, clampedLimit * 2],
      lexicalWeight,
      vectorWeight,
    });

    // Take top results and reconstruct SearchResultItem with id
    const topResults: SearchResultItem[] = hybridResults
      .slice(0, clampedLimit)
      .map((r) => ({
        id: r.id,
        ...r.data,
      }));

    // Generate path summaries if requested
    let pathSummaries: Map<string, any> | undefined;
    if (includePaths && topResults.length > 0) {
      const documentIds = Array.from(
        new Set(topResults.map((r) => r.document_id))
      );
      pathSummaries = await this.pathSummary.generatePathSummaries(documentIds);
    }

    return {
      mode: SearchMode.HYBRID,
      results: topResults,
      pathSummaries,
      totalCandidates: hybridResults.length,
    };
  }
}
