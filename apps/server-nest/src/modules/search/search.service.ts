import { Injectable } from '@nestjs/common';
import { SearchMode } from './dto/search-query.dto';
import { DatabaseService } from '../../common/database/database.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { AppConfigService } from '../../common/config/config.service';
import { PathSummaryService } from './path-summary.service';
import {
  calculateStatistics,
  normalizeScore,
  fuseScores,
} from './score-normalization.util';

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

    // Hybrid search with z-score normalization
    // Step 1: Get lexical results with scores
    const lexicalResults = await this.db.query<ScoredResultItem>(
      `SELECT c.id, c.document_id, c.chunk_index, c.text,
                    ts_rank(c.tsv, websearch_to_tsquery('simple', $1)) AS score
             FROM kb.chunks c
             WHERE c.tsv @@ websearch_to_tsquery('simple', $1)
             ORDER BY score DESC
             LIMIT $2`,
      [q, clampedLimit * 2] // Fetch 2x to ensure enough candidates
    );

    // Step 2: Get vector results with scores (cosine distance)
    const vectorResults = await this.db.query<ScoredResultItem>(
      `SELECT c.id, c.document_id, c.chunk_index, c.text,
                    (1 - (c.embedding <=> $1::vector)) AS score
             FROM kb.chunks c
             ORDER BY c.embedding <=> $1::vector
             LIMIT $2`,
      [vecLiteral, clampedLimit * 2]
    );

    // Step 3: Calculate statistics for each channel
    const lexicalScores = lexicalResults.rows.map((r: any) => r.score || 0);
    const vectorScores = vectorResults.rows.map((r: any) => r.score || 0);

    const lexicalStats = calculateStatistics(lexicalScores);
    const vectorStats = calculateStatistics(vectorScores);

    // Step 4: Normalize and fuse scores
    const candidateMap = new Map<
      string,
      { item: SearchResultItem; fusedScore: number }
    >();

    // Process lexical results
    for (const row of lexicalResults.rows) {
      const normalized = normalizeScore(row.score || 0, lexicalStats);
      const fusedScore = fuseScores(
        normalized.normalized,
        0,
        lexicalWeight,
        vectorWeight
      );
      candidateMap.set(row.id, {
        item: {
          id: row.id,
          document_id: row.document_id,
          chunk_index: row.chunk_index,
          text: row.text,
        },
        fusedScore,
      });
    }

    // Process vector results and merge/update scores
    for (const row of vectorResults.rows) {
      const normalized = normalizeScore(row.score || 0, vectorStats);
      const existing = candidateMap.get(row.id);

      if (existing) {
        // Item appears in both channels - recalculate fused score
        const lexScore =
          lexicalResults.rows.find((r) => r.id === row.id)?.score || 0;
        const lexNorm = normalizeScore(lexScore, lexicalStats);
        const fusedScore = fuseScores(
          lexNorm.normalized,
          normalized.normalized,
          lexicalWeight,
          vectorWeight
        );
        existing.fusedScore = fusedScore;
      } else {
        // Item only in vector channel
        const fusedScore = fuseScores(
          0,
          normalized.normalized,
          lexicalWeight,
          vectorWeight
        );
        candidateMap.set(row.id, {
          item: {
            id: row.id,
            document_id: row.document_id,
            chunk_index: row.chunk_index,
            text: row.text,
          },
          fusedScore,
        });
      }
    }

    // Step 5: Sort by fused score and return top results
    const sortedResults = Array.from(candidateMap.values())
      .sort((a, b) => b.fusedScore - a.fusedScore)
      .slice(0, clampedLimit)
      .map((entry) => entry.item);

    // Step 6: Generate path summaries if requested
    let pathSummaries: Map<string, any> | undefined;
    if (includePaths && sortedResults.length > 0) {
      const documentIds = Array.from(
        new Set(sortedResults.map((r: any) => r.document_id))
      );
      pathSummaries = await this.pathSummary.generatePathSummaries(documentIds);
    }

    return {
      mode: SearchMode.HYBRID,
      results: sortedResults,
      pathSummaries,
      totalCandidates: candidateMap.size,
    };
  }
}
