import { Injectable } from '@nestjs/common';
import { SearchMode } from './dto/search-query.dto';
import { DatabaseService } from '../../common/database/database.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { AppConfigService } from '../../common/config/config.service';

interface SearchResultItem { id: string; document_id: string; chunk_index: number; text: string; }

@Injectable()
export class SearchService {
    constructor(
        private readonly db: DatabaseService,
        private readonly embeddings: EmbeddingsService,
        private readonly config: AppConfigService,
    ) { }

    async search(query: string, limit: number, mode: SearchMode): Promise<{ mode: SearchMode; results: SearchResultItem[]; warning?: string; }> {
        const q = query.trim();
        if (!q) return { mode, results: [] };
        const clampedLimit = Math.min(Math.max(limit, 1), 50);

        // Lexical only path
        const lexicalSql = `SELECT id, document_id, chunk_index, text
                 FROM kb.chunks
                 WHERE tsv @@ websearch_to_tsquery('simple', $1)
                 ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', $1)) DESC
                 LIMIT $2`;

        if (mode === SearchMode.LEXICAL || !this.config.embeddingsEnabled) {
            const { rows } = await this.db.query<SearchResultItem>(lexicalSql, [q, clampedLimit]);
            return {
                mode: mode === SearchMode.LEXICAL ? SearchMode.LEXICAL : SearchMode.LEXICAL,
                results: rows,
                warning: !this.config.embeddingsEnabled && mode !== SearchMode.LEXICAL ? 'Embeddings unavailable; fell back to lexical.' : undefined,
            };
        }

        // Need embeddings
        let qvec: number[] = [];
        try { qvec = await this.embeddings.embedQuery(q); } catch (e) {
            // Fallback lexical if embedding fails
            const { rows } = await this.db.query<SearchResultItem>(lexicalSql, [q, clampedLimit]);
            return { mode: SearchMode.LEXICAL, results: rows, warning: `Embedding failed; lexical fallback: ${(e as Error).message}` };
        }
        const vecLiteral = '[' + qvec.join(',') + ']';

        if (mode === SearchMode.VECTOR) {
            const { rows } = await this.db.query<SearchResultItem>(
                `SELECT id, document_id, chunk_index, text
                 FROM kb.chunks
                 ORDER BY embedding <=> $1::vector
                 LIMIT $2`,
                [vecLiteral, clampedLimit],
            );
            return { mode: SearchMode.VECTOR, results: rows };
        }

        // Hybrid (RRF fusion)
        const { rows } = await this.db.query<SearchResultItem>(
            `WITH params AS (
                 SELECT $1::vector AS qvec, websearch_to_tsquery('simple', $2) AS qts, $3::int AS topk
             ), vec AS (
                 SELECT c.id, c.document_id, c.chunk_index, c.text,
                        1.0 / (ROW_NUMBER() OVER (ORDER BY c.embedding <=> (SELECT qvec FROM params)) + 60) AS rrf
                 FROM kb.chunks c
                 ORDER BY c.embedding <=> (SELECT qvec FROM params)
                 LIMIT (SELECT topk FROM params)
             ), lex AS (
                 SELECT c.id, c.document_id, c.chunk_index, c.text,
                        1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC) + 60) AS rrf
                 FROM kb.chunks c
                 WHERE c.tsv @@ (SELECT qts FROM params)
                 ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC
                 LIMIT (SELECT topk FROM params)
             ), fused AS (
                 SELECT id, document_id, chunk_index, text, SUM(rrf) AS score
                 FROM (
                     SELECT * FROM vec
                     UNION ALL
                     SELECT * FROM lex
                 ) u
                 GROUP BY id, document_id, chunk_index, text
             )
             SELECT id, document_id, chunk_index, text
             FROM fused
             ORDER BY score DESC
             LIMIT (SELECT topk FROM params)`,
            [vecLiteral, q, clampedLimit],
        );
        return { mode: SearchMode.HYBRID, results: rows };
    }
}
