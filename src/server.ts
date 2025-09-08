import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import cors from 'cors';
import multer from 'multer';
import { ensureSchema } from './db.js';
import { ingestText, ingestUrl } from './ingest.js';
import { query } from './db.js';
import { makeEmbeddings } from './embeddings.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function main() {
    await ensureSchema();

    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '2mb' }));

    // Passkey routes removed; relying solely on standard OIDC (ZITADEL hosted) authentication now.

    app.get('/health', (_req: Request, res: Response) => {
        res.json({ ok: true, model: 'text-embedding-004', db: 'postgres' });
    });

    app.post('/ingest/url', async (req: Request, res: Response) => {
        try {
            const { url } = req.body as { url?: string };
            if (!url) return res.status(400).json({ error: 'url is required' });
            const result = await ingestUrl(url);
            res.json({ status: 'ok', ...result });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'ingest failed' });
        }
    });

    app.post('/ingest/upload', upload.single('file'), async (req: Request, res: Response) => {
        try {
            const file = req.file;
            if (!file) return res.status(400).json({ error: 'file is required' });
            const text = file.buffer.toString('utf-8');
            const result = await ingestText({ text, filename: file.originalname, mime_type: file.mimetype });
            res.json({ status: 'ok', ...result });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'upload failed' });
        }
    });

    app.get('/search', async (req: Request, res: Response) => {
        try {
            const q = String((req.query.q as string) || '').trim();
            const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
            const mode = String((req.query.mode as string) || 'hybrid').toLowerCase();
            if (!q) return res.status(400).json({ error: 'q is required' });
            // Lexical only path
            if (mode === 'lexical') {
                const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
                    `SELECT id, document_id, chunk_index, text
                                         FROM kb.chunks
                                         WHERE tsv @@ websearch_to_tsquery('simple', $1)
                                         ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', $1)) DESC
                                         LIMIT $2`,
                    [q, limit]
                );
                return res.json({ mode: 'lexical', results: rows });
            }

            // For vector/hybrid modes, compute embedding if possible
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey && mode !== 'lexical') {
                // Fallback gracefully to lexical
                const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
                    `SELECT id, document_id, chunk_index, text
                                         FROM kb.chunks
                                         WHERE tsv @@ websearch_to_tsquery('simple', $1)
                                         ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', $1)) DESC
                                         LIMIT $2`,
                    [q, limit]
                );
                return res.json({ mode: 'lexical', results: rows, warning: 'Embeddings unavailable; fell back to lexical.' });
            }

            const embed = makeEmbeddings();
            const qvec = await embed.embedQuery(q);
            const vecLiteral = '[' + qvec.join(',') + ']';

            if (mode === 'vector') {
                const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
                    `SELECT id, document_id, chunk_index, text
                                         FROM kb.chunks
                                         ORDER BY embedding <=> $1::vector
                                         LIMIT $2`,
                    [vecLiteral, limit]
                );
                return res.json({ mode: 'vector', results: rows });
            }

            // Hybrid: fuse vector and lexical with RRF
            const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
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
                [vecLiteral, q, limit]
            );
            res.json({ mode: 'hybrid', results: rows });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'search failed' });
        }
    });

    // List all uploaded/ingested documents
    app.get('/documents', async (_req: Request, res: Response) => {
        try {
            const { rows } = await query<{
                id: string;
                source_url: string | null;
                filename: string | null;
                mime_type: string | null;
                created_at: string;
                updated_at: string;
                chunks: number;
            }>(
                `SELECT d.id,
                        d.source_url,
                        d.filename,
                        d.mime_type,
                        d.created_at,
                        d.updated_at,
                        COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id), 0) AS chunks
                 FROM kb.documents d
                 ORDER BY d.created_at DESC`
            );
            res.json({ documents: rows });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to list documents' });
        }
    });

    // Canonical backend port (root server): SERVER_PORT (fallback 3000 for this lightweight server)
    const port = Number(process.env.SERVER_PORT || 3000);
    app.listen(port, () => console.log(`server (root) listening on :${port}`));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
