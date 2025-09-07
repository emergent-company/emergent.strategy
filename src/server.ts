import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import {
    beginRegistration as zitadelBeginReg,
    finishRegistration as zitadelFinishReg,
    beginLogin as zitadelBeginLogin,
    finishLogin as zitadelFinishLogin,
    exchangeAuthCode,
    zitadelPasswordlessEnabled,
} from './zitadel/passwordless.js';
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

    // Simple in-memory passkey txn store (stub implementation)
    interface PasskeyTxn { challenge: string; email?: string; purpose: 'login' | 'register'; createdAt: number; }
    const passkeyTxns = new Map<string, PasskeyTxn>();
    const PASSKEY_RP_ID = process.env.PASSKEY_RP_ID || 'localhost';

    function b64url(buf: Buffer | Uint8Array): string {
        return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    const rand = (n: number) => crypto.randomBytes(n);
    const prune = () => {
        const now = Date.now();
        for (const [k, v] of passkeyTxns.entries()) if (now - v.createdAt > 2 * 60 * 1000) passkeyTxns.delete(k);
    };

    app.post('/api/auth/passkey/begin-register', async (req: Request, res: Response) => {
        try {
            prune();
            const email = (req.body as any)?.email as string | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (zitadelPasswordlessEnabled()) {
                const zr = await zitadelBeginReg({ email });
                // Store mapping so we can verify / correlate (challenge for local consistency)
                passkeyTxns.set(zr.flowId, { challenge: (zr.publicKey as any).challenge, email, purpose: 'register', createdAt: Date.now() });
                return res.json({ publicKey: zr.publicKey, txn: zr.flowId, purpose: 'register' });
            }
            // Fallback stub
            const challenge = b64url(rand(32));
            const txn = b64url(rand(16));
            passkeyTxns.set(txn, { challenge, email, purpose: 'register', createdAt: Date.now() });
            const userId = b64url(rand(16));
            const publicKey = {
                challenge,
                rp: { name: 'SpecServer', id: PASSKEY_RP_ID },
                user: { id: userId, name: email || 'user', displayName: email || 'User' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                timeout: 60000,
                attestation: 'none',
            };
            return res.json({ publicKey, txn, purpose: 'register' });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'begin-register failed' });
        }
    });

    app.post('/api/auth/passkey/finish-register', async (req: Request, res: Response) => {
        try {
            const { txn, credential } = req.body as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            const meta = passkeyTxns.get(txn || '');
            if (!meta || meta.purpose !== 'register') return res.status(400).json({ error: 'Invalid or expired transaction' });

            if (zitadelPasswordlessEnabled()) {
                const result = await zitadelFinishReg({ flowId: txn, credential });
                passkeyTxns.delete(txn);
                // If result is tokens return directly; if it has code property, exchange.
                if ((result as any).access_token) return res.json(result);
                if ((result as any).code) {
                    const tokens = await exchangeAuthCode((result as any).code);
                    return res.json(tokens);
                }
                return res.status(500).json({ error: 'Unexpected finish-register response shape' });
            }
            // Stub fallback
            passkeyTxns.delete(txn);
            const nowSec = Math.floor(Date.now() / 1000);
            const header = b64url(Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })));
            const payload = b64url(Buffer.from(JSON.stringify({ sub: meta.email || 'passkey-user', email: meta.email, iat: nowSec, exp: nowSec + 3600 })));
            const dev = `${header}.${payload}.`;
            res.json({ access_token: dev, id_token: dev, expires_in: 3600 });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'finish-register failed' });
        }
    });

    app.post('/api/auth/passkey/begin-login', async (req: Request, res: Response) => {
        try {
            prune();
            const email = (req.body as any)?.email as string | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (zitadelPasswordlessEnabled()) {
                const zr = await zitadelBeginLogin({ email });
                passkeyTxns.set(zr.flowId, { challenge: (zr.publicKey as any).challenge, email, purpose: 'login', createdAt: Date.now() });
                return res.json({ publicKey: zr.publicKey, txn: zr.flowId, purpose: 'login' });
            }
            const challenge = b64url(rand(32));
            const txn = b64url(rand(16));
            passkeyTxns.set(txn, { challenge, email, purpose: 'login', createdAt: Date.now() });
            const publicKey = { challenge, rpId: PASSKEY_RP_ID, allowCredentials: [], userVerification: 'preferred', timeout: 60000 };
            return res.json({ publicKey, txn, purpose: 'login' });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'begin-login failed' });
        }
    });

    app.post('/api/auth/passkey/finish-login', async (req: Request, res: Response) => {
        try {
            const { txn, credential } = req.body as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            const meta = passkeyTxns.get(txn || '');
            if (!meta || meta.purpose !== 'login') return res.status(400).json({ error: 'Invalid or expired transaction' });
            if (zitadelPasswordlessEnabled()) {
                const result = await zitadelFinishLogin({ flowId: txn, credential });
                passkeyTxns.delete(txn);
                if ((result as any).access_token) return res.json(result);
                if ((result as any).code) {
                    const tokens = await exchangeAuthCode((result as any).code);
                    return res.json(tokens);
                }
                return res.status(500).json({ error: 'Unexpected finish-login response shape' });
            }
            passkeyTxns.delete(txn);
            const nowSec = Math.floor(Date.now() / 1000);
            const header = b64url(Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })));
            const payload = b64url(Buffer.from(JSON.stringify({ sub: meta.email || 'passkey-user', email: meta.email, iat: nowSec, exp: nowSec + 3600 })));
            const dev = `${header}.${payload}.`;
            res.json({ access_token: dev, id_token: dev, expires_in: 3600 });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'finish-login failed' });
        }
    });

    // Capability / discovery endpoint (GET) for convenience
    app.get('/api/auth/passkey', (_req: Request, res: Response) => {
        res.json({
            status: 'ok',
            mode: zitadelPasswordlessEnabled() ? 'zitadel' : 'stub',
            rpId: PASSKEY_RP_ID,
            register: {
                begin: 'POST /api/auth/passkey/begin-register',
                finish: 'POST /api/auth/passkey/finish-register',
            },
            login: {
                begin: 'POST /api/auth/passkey/begin-login',
                finish: 'POST /api/auth/passkey/finish-login',
            },
            timestamp: new Date().toISOString(),
        });
    });

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
