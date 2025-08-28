import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { ensureSchema, query } from './db.js';
import { makeEmbeddings } from './embeddings.js';
import { ingestText, ingestUrl } from './ingest.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function main() {
    await ensureSchema();

    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '2mb' }));

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
            if (!q) return res.status(400).json({ error: 'q is required' });
            const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
                `SELECT id, document_id, chunk_index, text
         FROM kb.chunks
         WHERE tsv @@ websearch_to_tsquery('simple', $1)
         ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', $1)) DESC
         LIMIT $2`,
                [q, limit]
            );
            res.json({ results: rows });
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

    // SSE chat streaming endpoint
    app.post('/chat/stream', async (req: Request, res: Response) => {
        try {
            const body = req.body as {
                message?: string;
                topK?: number;
                documentIds?: string[];
                history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
                conversationId?: string;
                isPrivate?: boolean;
            };
            const message = (body.message || '').trim();
            if (!message) return res.status(400).json({ error: 'message is required' });
            const topK = Math.min(Math.max(Number(body.topK || 5), 1), 20);
            const filterIds = Array.isArray(body.documentIds) && body.documentIds.length > 0 ? body.documentIds : null;
            // NOTE: In lieu of auth, use a fixed mock user id for ownership. Replace with real auth in production.
            const currentUserId = process.env.MOCK_USER_ID || '00000000-0000-0000-0000-000000000001';

            // Create or verify conversation access BEFORE starting SSE
            let convId = body.conversationId?.trim() || '';
            const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
            if (convId && uuidRe.test(convId)) {
                const convQ = await query<{ id: string; is_private: boolean; owner_user_id: string }>(
                    `SELECT id, is_private, owner_user_id FROM kb.chat_conversations WHERE id = $1`,
                    [convId]
                );
                if (convQ.rowCount === 0) {
                    // treat as new if provided id doesn't exist
                    convId = '';
                } else {
                    const conv = convQ.rows[0];
                    if (conv.is_private && conv.owner_user_id !== currentUserId) {
                        return res.status(403).json({ error: 'forbidden' });
                    }
                }
            } else if (convId) {
                // not a valid UUID → ignore to create a new conversation
                convId = '';
            }
            if (!convId) {
                // Create new conversation
                const d = new Date();
                const yyyy = d.getFullYear();
                const mm = `${d.getMonth() + 1}`.padStart(2, '0');
                const dd = `${d.getDate()}`.padStart(2, '0');
                const snippet = message.split(/\s+/).slice(0, 8).join(' ');
                const title = `${yyyy}-${mm}-${dd} — ${snippet || 'New Conversation'}`;
                const ins = await query<{ id: string }>(
                    `INSERT INTO kb.chat_conversations (title, owner_user_id, is_private)
                     VALUES ($1, $2, $3)
                     RETURNING id`,
                    [title, currentUserId, !!body.isPrivate]
                );
                convId = ins.rows[0].id;
            }
            // Persist user message
            await query(
                `INSERT INTO kb.chat_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
                [convId, message]
            );
            await query(`UPDATE kb.chat_conversations SET updated_at = now() WHERE id = $1`, [convId]);

            // Prepare SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();

            // Compute embedding
            const embed = makeEmbeddings();
            const queryVec = await embed.embedQuery(message);
            const vecLiteral = `[` + queryVec.join(',') + `]`;

            // Retrieve topK chunks
            const { rows } = await query<{ chunk_id: string; document_id: string; chunk_index: number; text: string; distance: number; filename: string | null; source_url: string | null }>(
                `SELECT c.id as chunk_id, c.document_id, c.chunk_index, c.text, (c.embedding <=> $1::vector) as distance,
                        d.filename, d.source_url
                 FROM kb.chunks c
                 JOIN kb.documents d ON d.id = c.document_id
                 WHERE ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
                 ORDER BY c.embedding <=> $1::vector
                 LIMIT $3`,
                [vecLiteral, filterIds, topK]
            );

            const citations = rows.map((r) => ({
                documentId: r.document_id,
                chunkId: r.chunk_id,
                chunkIndex: r.chunk_index,
                text: r.text,
                sourceUrl: r.source_url,
                filename: r.filename,
                similarity: r.distance,
            }));

            // Send citations meta first, include server conversation id so clients can sync ids
            res.write(`data: ${JSON.stringify({ type: 'meta', conversationId: convId, citations })}\n\n`);
            // Compose with Gemini using LangChain and stream tokens
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey) {
                res.write(`data: ${JSON.stringify({ type: 'error', error: 'GOOGLE_API_KEY is not set' })}\n\n`);
                res.end();
                return;
            }

            const modelName = process.env.GENAI_MODEL || 'gemini-1.5-flash';
            const model = new ChatGoogleGenerativeAI({ model: modelName, apiKey });

            const prompt = ChatPromptTemplate.fromMessages([
                [
                    'system',
                    [
                        'You are a helpful assistant. Answer the user question using only the provided CONTEXT.',
                        'Cite sources inline using bracketed numbers like [1], [2], matching the provided context order.',
                        "If the answer can't be derived from the CONTEXT, say you don't know rather than hallucinating.",
                    ].join(' '),
                ],
                [
                    'human',
                    'Question:\n{question}\n\nCONTEXT (citations in order):\n{context}\n\nProvide a concise, well-structured answer.',
                ],
            ]);

            const context = citations
                .map((c, i) => {
                    const label = c.filename || c.sourceUrl || c.documentId;
                    return `[${i + 1}] (${label})\n${c.text}`;
                })
                .join('\n\n');

            const chain = prompt.pipe(model);

            const stream = await chain.stream({ question: message, context });
            let assistantText = '';
            for await (const chunk of stream as AsyncIterable<any>) {
                const content = (chunk && (chunk as any).content) as unknown;
                let token = '';
                if (Array.isArray(content)) {
                    token = content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
                } else if (typeof content === 'string') {
                    token = content;
                } else if (content != null) {
                    token = String(content);
                }
                if (token) {
                    res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
                    assistantText += token;
                }
            }

            // Persist assistant message with citations and update conversation timestamp
            try {
                await query(
                    `INSERT INTO kb.chat_messages (conversation_id, role, content, citations)
                     VALUES ($1, 'assistant', $2, $3::jsonb)`,
                    [convId, assistantText, JSON.stringify(citations)]
                );
                await query(`UPDATE kb.chat_conversations SET updated_at = now() WHERE id = $1`, [convId]);
            } catch { }

            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            res.end();
        } catch (e: any) {
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', error: e.message || 'failed' })}\n\n`);
            } finally {
                res.end();
            }
        }
    });

    // List conversations grouped by shared/private for current user
    app.get('/chat/conversations', async (req: Request, res: Response) => {
        try {
            const currentUserId = process.env.MOCK_USER_ID || '00000000-0000-0000-0000-000000000001';
            const sharedQ = await query<{ id: string; title: string; created_at: string; updated_at: string; owner_user_id: string; is_private: boolean }>(
                `SELECT id, title, created_at, updated_at, owner_user_id, is_private
                 FROM kb.chat_conversations
                 WHERE is_private = false
                 ORDER BY updated_at DESC`
            );
            const privateQ = await query<{ id: string; title: string; created_at: string; updated_at: string; owner_user_id: string; is_private: boolean }>(
                `SELECT id, title, created_at, updated_at, owner_user_id, is_private
                 FROM kb.chat_conversations
                 WHERE is_private = true AND owner_user_id = $1
                 ORDER BY updated_at DESC`,
                [currentUserId]
            );
            res.json({ shared: sharedQ.rows, private: privateQ.rows });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to list conversations' });
        }
    });

    // Get a single conversation metadata + messages (access-controlled)
    app.get('/chat/:id', async (req: Request, res: Response) => {
        try {
            const id = String(req.params.id);
            const currentUserId = process.env.MOCK_USER_ID || '00000000-0000-0000-0000-000000000001';
            const convQ = await query<{ id: string; title: string; created_at: string; updated_at: string; owner_user_id: string; is_private: boolean }>(
                `SELECT id, title, created_at, updated_at, owner_user_id, is_private
                 FROM kb.chat_conversations WHERE id = $1`,
                [id]
            );
            if (convQ.rowCount === 0) return res.status(404).json({ error: 'not found' });
            const conv = convQ.rows[0];
            if (conv.is_private && conv.owner_user_id !== currentUserId) return res.status(403).json({ error: 'forbidden' });
            const msgsQ = await query<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; citations: any; created_at: string }>(
                `SELECT id, role, content, citations, created_at
                 FROM kb.chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
                [id]
            );
            res.json({
                conversation: {
                    id: conv.id,
                    title: conv.title,
                    createdAt: conv.created_at,
                    updatedAt: conv.updated_at,
                    ownerUserId: conv.owner_user_id,
                    isPrivate: conv.is_private,
                    messages: msgsQ.rows.map((m) => ({ id: m.id, role: m.role, content: m.content, citations: m.citations || undefined, createdAt: m.created_at })),
                },
            });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to get conversation' });
        }
    });

    // Rename conversation (owner-only)
    app.patch('/chat/:id', async (req: Request, res: Response) => {
        try {
            const id = String(req.params.id);
            const { title } = req.body as { title?: string };
            if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
            const currentUserId = process.env.MOCK_USER_ID || '00000000-0000-0000-0000-000000000001';
            const convQ = await query<{ id: string; owner_user_id: string }>(
                `SELECT id, owner_user_id FROM kb.chat_conversations WHERE id = $1`,
                [id]
            );
            if (convQ.rowCount === 0) return res.status(404).json({ error: 'not found' });
            const conv = convQ.rows[0];
            if (conv.owner_user_id !== currentUserId) return res.status(403).json({ error: 'forbidden' });
            await query(`UPDATE kb.chat_conversations SET title = $1, updated_at = now() WHERE id = $2`, [title.trim(), id]);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to rename conversation' });
        }
    });

    // Delete conversation (owner-only for private; shared can be deleted only by owner too for now)
    app.delete('/chat/:id', async (req: Request, res: Response) => {
        try {
            const id = String(req.params.id);
            const currentUserId = process.env.MOCK_USER_ID || '00000000-0000-0000-0000-000000000001';
            const convQ = await query<{ id: string; owner_user_id: string }>(
                `SELECT id, owner_user_id FROM kb.chat_conversations WHERE id = $1`,
                [id]
            );
            if (convQ.rowCount === 0) return res.status(404).json({ error: 'not found' });
            const conv = convQ.rows[0];
            if (conv.owner_user_id !== currentUserId) return res.status(403).json({ error: 'forbidden' });
            await query(`DELETE FROM kb.chat_conversations WHERE id = $1`, [id]);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to delete conversation' });
        }
    });

    const port = Number(process.env.PORT || 3001);
    app.listen(port, () => console.log(`server listening on :${port}`));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
