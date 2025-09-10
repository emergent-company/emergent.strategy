import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { ensureSchema, query } from './db.js';
import { makeEmbeddings } from './embeddings.js';
import { ingestText, ingestUrl } from './ingest.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

// --- OIDC / JWT verification (Zitadel) ---
type AuthConfig = {
    issuer: string;
    audience?: string;
};

const authCfg: AuthConfig = {
    // Prefer new unified var ZITADEL_ISSUER; fallback to legacy ZITADEL_ISSUER_URL; default dev value.
    issuer: process.env.ZITADEL_ISSUER || process.env.ZITADEL_ISSUER_URL || 'http://localhost:8080',
    audience: process.env.ZITADEL_AUDIENCE || undefined,
};

let jwksFunc: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksInitPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null;
async function getJWKS(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (jwksFunc) return jwksFunc;
    if (!jwksInitPromise) {
        jwksInitPromise = (async () => {
            // Discover provider metadata to resolve the correct JWKS URI
            const discoveryUrl = new URL('/.well-known/openid-configuration', authCfg.issuer);
            try {
                const res = await fetch(discoveryUrl);
                if (res.ok) {
                    const json = (await res.json()) as { jwks_uri?: string };
                    const jwksUrl = new URL(json.jwks_uri || '/oauth/v2/keys', authCfg.issuer);
                    jwksFunc = createRemoteJWKSet(jwksUrl);
                    return jwksFunc;
                }
            } catch {
                // fallthrough to static fallback
            }
            // Fallbacks: Zitadel exposes keys at /oauth/v2/keys; try that, else common /.well-known/jwks.json
            try {
                jwksFunc = createRemoteJWKSet(new URL('/oauth/v2/keys', authCfg.issuer));
                return jwksFunc;
            } catch {
                jwksFunc = createRemoteJWKSet(new URL('/.well-known/jwks.json', authCfg.issuer));
                return jwksFunc;
            }
        })();
    }
    return jwksInitPromise;
}

export type UserClaims = JWTPayload & { sub: string; email?: string; name?: string; azp?: string };

const AUTH_LOG = (process.env.AUTH_DEBUG || '').toLowerCase() === 'true';

const ALLOW_DEV_TOKENS = (process.env.ALLOW_DEV_TOKENS || '').toLowerCase() === 'true' || (process.env.NODE_ENV !== 'production');

function decodeSegment(seg: string): any | null {
    try {
        const padded = seg.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(seg.length / 4) * 4, '=');
        const json = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(json);
    } catch {
        return null;
    }
}

async function verifyBearerToken(authz: string | undefined): Promise<UserClaims | null> {
    if (!authz) return null;
    const m = /^Bearer\s+(.+)$/i.exec(authz.trim());
    if (!m) return null;
    const token = m[1];

    // Fast path for dev unsigned tokens (alg: none) when explicitly allowed.
    if (ALLOW_DEV_TOKENS) {
        const parts = token.split('.');
        if (parts.length === 3) {
            const header = decodeSegment(parts[0]);
            if (header && header.alg === 'none') {
                const payload = decodeSegment(parts[1]) as (UserClaims & { exp?: number }) | null;
                if (payload) {
                    if (payload.exp && Date.now() / 1000 > payload.exp) {
                        if (AUTH_LOG) console.warn('dev token expired');
                        return null;
                    }
                    if (!payload.sub) payload.sub = 'dev-user';
                    return payload as UserClaims;
                }
            }
        }
    }

    try {
        const key = await getJWKS();
        const { payload } = await jwtVerify(token, key, {
            issuer: authCfg.issuer,
            audience: authCfg.audience,
        });
        if (!payload.sub) return null;
        return payload as UserClaims;
    } catch (e: any) {
        if (AUTH_LOG) console.error('verifyBearerToken failed', e?.message || e);
        return null;
    }
}

function requireAuth() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const claims = await verifyBearerToken(req.headers.authorization);
        if (!claims) return res.status(401).json({ error: 'unauthorized' });
        (res.locals as any).user = claims;
        return next();
    };
}

// --- Identity mapping helpers ---
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function uuidV5FromString(name: string): string {
    // Deterministically generate a UUID v5-like value using SHA-1 of the name
    const hash = crypto.createHash('sha1').update(name).digest(); // 20 bytes
    const bytes = Buffer.from(hash.subarray(0, 16));
    // Set version to 5 (0101)
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    // Set variant to RFC 4122 (10xx)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

function getCurrentUserId(claims: UserClaims | undefined): string {
    const fallback = '00000000-0000-0000-0000-000000000001';
    if (!claims || !claims.sub) return process.env.MOCK_USER_ID || fallback;
    // If sub already looks like a UUID, use it as-is; otherwise map to a stable UUID
    if (UUID_RE.test(claims.sub)) return claims.sub;
    const issuer = (claims as any).iss || authCfg.issuer || 'local';
    return uuidV5FromString(`${issuer}|${claims.sub}`);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function main() {
    await ensureSchema();

    const app = express();
    // CORS: allow credentials and reflect requesting origin, include custom headers
    const corsOptions: cors.CorsOptions = {
        origin: true,
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Org-ID', 'X-Project-ID'],
    };
    app.use(cors(corsOptions));
    // Handle preflight for all routes
    app.options('*', cors(corsOptions));
    app.use(express.json({ limit: '2mb' }));

    // Passkey/WebAuthn endpoints removed; relying solely on hosted OIDC login via Zitadel.

    app.get('/health', (_req: Request, res: Response) => {
        res.json({ ok: true, model: 'text-embedding-004', db: 'postgres' });
    });


    // --- OpenAPI (Unified) Documentation Routes ---
    app.get('/openapi/openapi.yaml', (_req: Request, res: Response) => {
        try {
            const here = path.dirname(new URL(import.meta.url).pathname);
            const specPath = path.join(here, '../openapi/openapi.yaml');
            const data = fs.readFileSync(specPath, 'utf8');
            res.type('application/yaml').send(data);
        } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            res.status(500).json({ error: e?.message || 'failed to load unified openapi spec' });
        }
    });
    app.get('/docs', (_req: Request, res: Response) => {
        res.type('text/html').send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>API Docs</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css" />
</head><body style="margin:0;padding:0;font-family:system-ui,sans-serif;">
<elements-api id="api-docs" apiDescriptionUrl="/openapi/openapi.yaml" layout="sidebar" router="hash" hideTryIt="false" />
<script src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
</body></html>`);
    });

    // --- Zitadel Password (ROPC) Grant Login ---
    // Enable with ZITADEL_PASSWORD_GRANT=true plus ZITADEL_CLIENT_ID (+ optional ZITADEL_CLIENT_SECRET for confidential client)
    const ENABLE_PASSWORD_GRANT = (process.env.ZITADEL_PASSWORD_GRANT || '').toLowerCase() === 'true';
    const ZITADEL_CLIENT_ID = process.env.ZITADEL_CLIENT_ID || '';
    const ZITADEL_CLIENT_SECRET = process.env.ZITADEL_CLIENT_SECRET || '';
    const ZITADEL_SCOPES = process.env.ZITADEL_SCOPES || 'openid profile email';

    // Small capability probe & clearer status code when disabled
    app.get('/api/auth/password', (_req: Request, res: Response) => {
        return res.json({ enabled: ENABLE_PASSWORD_GRANT, clientIdPresent: !!ZITADEL_CLIENT_ID });
    });

    app.post('/api/auth/password/login', async (req: Request, res: Response) => {
        if (!ENABLE_PASSWORD_GRANT) return res.status(403).json({ error: 'password grant disabled' });
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'email & password required' });
        if (!ZITADEL_CLIENT_ID) return res.status(500).json({ error: 'server misconfigured (client id missing)' });
        try {
            const tokenEndpoint = new URL('/oauth/v2/token', authCfg.issuer).toString();
            const form = new URLSearchParams();
            form.set('grant_type', 'password');
            form.set('username', email);
            form.set('password', password);
            form.set('scope', ZITADEL_SCOPES);
            form.set('client_id', ZITADEL_CLIENT_ID);
            if (ZITADEL_CLIENT_SECRET) form.set('client_secret', ZITADEL_CLIENT_SECRET);

            const resp = await fetch(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const errMsg = json?.error_description || json?.error || 'authentication failed';
                console.warn('[password-grant] failed', {
                    status: resp.status,
                    err: errMsg,
                    issuer: authCfg.issuer,
                    clientId: ZITADEL_CLIENT_ID,
                    scopes: ZITADEL_SCOPES,
                    hasSecret: !!ZITADEL_CLIENT_SECRET,
                });
                return res.status(resp.status === 400 || resp.status === 401 ? 401 : 500).json({ error: errMsg });
            }
            if (!json.access_token) return res.status(500).json({ error: 'invalid token response' });
            return res.json(json);
        } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.error('[password-grant] exception', e?.message || e);
            return res.status(500).json({ error: e.message || 'password login failed' });
        }
    });

    // --- Organizations ---
    app.get('/orgs', requireAuth(), async (_req: Request, res: Response) => {
        try {
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);
            const { rows } = await query<{ id: string; name: string; slug: string | null }>(
                `SELECT id, name, slug FROM kb.organizations WHERE owner_user_id = $1 ORDER BY created_at DESC`,
                [currentUserId]
            );
            res.json({ orgs: rows });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to list orgs' });
        }
    });

    app.post('/orgs', requireAuth(), async (req: Request, res: Response) => {
        try {
            const name = String((req.body as any)?.name || '').trim();
            if (!name) return res.status(400).json({ error: 'name is required' });
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
            const ins = await query<{ id: string; name: string; slug: string | null }>(
                `INSERT INTO kb.organizations (name, slug, owner_user_id) VALUES ($1, $2, $3)
                 ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
                 RETURNING id, name, slug`,
                [name, slug || null, currentUserId]
            );
            res.status(201).json(ins.rows[0]);
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to create org' });
        }
    });

    // --- Projects ---
    app.get('/orgs/:orgId/projects', requireAuth(), async (req: Request, res: Response) => {
        try {
            const orgId = String(req.params.orgId);
            const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
            if (!uuidRe.test(orgId)) return res.status(400).json({ error: 'invalid org id' });
            // Basic ownership check
            const orgQ = await query<{ id: string; owner_user_id: string }>(`SELECT id, owner_user_id FROM kb.organizations WHERE id = $1`, [orgId]);
            if (orgQ.rowCount === 0) return res.status(404).json({ error: 'org not found' });
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);
            if (orgQ.rows[0].owner_user_id !== currentUserId) return res.status(403).json({ error: 'forbidden' });
            const { rows } = await query<{ id: string; name: string; status: string; created_at: string }>(
                `SELECT id, name, status, created_at FROM kb.projects WHERE org_id = $1 ORDER BY created_at DESC`,
                [orgId]
            );
            res.json(rows.map((r) => ({ id: r.id, name: r.name, status: r.status, createdAt: r.created_at })));
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to list projects' });
        }
    });

    app.post('/projects', requireAuth(), async (req: Request, res: Response) => {
        try {
            const body = req.body as { name?: string; orgId?: string };
            const name = String(body.name || '').trim();
            const orgId = String(body.orgId || '');
            const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
            if (!name) return res.status(400).json({ error: 'name is required' });
            if (!uuidRe.test(orgId)) return res.status(400).json({ error: 'invalid org id' });
            const orgQ = await query<{ id: string; owner_user_id: string }>(`SELECT id, owner_user_id FROM kb.organizations WHERE id = $1`, [orgId]);
            if (orgQ.rowCount === 0) return res.status(404).json({ error: 'org not found' });
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);
            if (orgQ.rows[0].owner_user_id !== currentUserId) return res.status(403).json({ error: 'forbidden' });
            const ins = await query<{ id: string; name: string; status: string; created_at: string }>(
                `INSERT INTO kb.projects (org_id, name) VALUES ($1, $2) RETURNING id, name, status, created_at`,
                [orgId, name]
            );
            const r = ins.rows[0];
            res.status(201).json({ id: r.id, name: r.name, status: r.status, createdAt: r.created_at });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to create project' });
        }
    });
    // Simple settings API (global scope)
    app.get('/settings', requireAuth(), async (_req: Request, res: Response) => {
        try {
            const { rows } = await query<{ key: string; value: any }>(`SELECT key, value FROM kb.settings ORDER BY key ASC`);
            res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to load settings' });
        }
    });

    app.get('/settings/:key', requireAuth(), async (req: Request, res: Response) => {
        try {
            const key = String(req.params.key);
            const { rows } = await query<{ value: any }>(`SELECT value FROM kb.settings WHERE key = $1`, [key]);
            // If not found, return 200 with null to avoid noisy 404s for unset keys
            if (rows.length === 0) return res.json({ key, value: null });
            res.json({ key, value: rows[0].value });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to load setting' });
        }
    });

    app.put('/settings/:key', requireAuth(), async (req: Request, res: Response) => {
        try {
            const key = String(req.params.key);
            const value = req.body?.value ?? {};
            await query(
                `INSERT INTO kb.settings (key, value)
                 VALUES ($1, $2::jsonb)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
                [key, JSON.stringify(value)]
            );
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to save setting' });
        }
    });

    app.post('/ingest/url', requireAuth(), async (req: Request, res: Response) => {
        try {
            const { url } = req.body as { url?: string };
            if (!url) return res.status(400).json({ error: 'url is required' });
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            const result = await ingestUrl(url, { orgId, projectId });
            res.json({ status: 'ok', ...result });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'ingest failed' });
        }
    });

    app.post('/ingest/upload', requireAuth(), upload.single('file'), async (req: Request, res: Response) => {
        try {
            const file = req.file;
            if (!file) return res.status(400).json({ error: 'file is required' });
            const text = file.buffer.toString('utf-8');
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            const result = await ingestText({ text, filename: file.originalname, mime_type: file.mimetype }, { orgId, projectId });
            res.json({ status: 'ok', ...result });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'upload failed' });
        }
    });

    app.get('/search', requireAuth(), async (req: Request, res: Response) => {
        try {
            const q = String((req.query.q as string) || '').trim();
            const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
            const mode = String((req.query.mode as string) || 'hybrid').toLowerCase();
            if (!q) return res.status(400).json({ error: 'q is required' });
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            // Lexical-only mode
            if (mode === 'lexical') {
                const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
                    `SELECT c.id, c.document_id, c.chunk_index, c.text
                                         FROM kb.chunks c
                                         JOIN kb.documents d ON d.id = c.document_id
                                         WHERE c.tsv @@ websearch_to_tsquery('simple', $1)
                                             AND (d.org_id IS NOT DISTINCT FROM $2)
                                             AND (d.project_id IS NOT DISTINCT FROM $3)
                                         ORDER BY ts_rank(c.tsv, websearch_to_tsquery('simple', $1)) DESC
                                         LIMIT $4`,
                    [q, orgId, projectId, limit]
                );
                return res.json({ mode: 'lexical', results: rows });
            }

            // Vector/hybrid requires embedding; fallback if unavailable
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey && mode !== 'lexical') {
                const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
                    `SELECT c.id, c.document_id, c.chunk_index, c.text
                                         FROM kb.chunks c
                                         JOIN kb.documents d ON d.id = c.document_id
                                         WHERE c.tsv @@ websearch_to_tsquery('simple', $1)
                                             AND (d.org_id IS NOT DISTINCT FROM $2)
                                             AND (d.project_id IS NOT DISTINCT FROM $3)
                                         ORDER BY ts_rank(c.tsv, websearch_to_tsquery('simple', $1)) DESC
                                         LIMIT $4`,
                    [q, orgId, projectId, limit]
                );
                return res.json({ mode: 'lexical', results: rows, warning: 'Embeddings unavailable; fell back to lexical.' });
            }

            const embed = makeEmbeddings();
            const qvec = await embed.embedQuery(q);
            const vecLiteral = '[' + qvec.join(',') + ']';

            if (mode === 'vector') {
                const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
                    `SELECT c.id, c.document_id, c.chunk_index, c.text
                                         FROM kb.chunks c
                                         JOIN kb.documents d ON d.id = c.document_id
                                         WHERE (d.org_id IS NOT DISTINCT FROM $2)
                                             AND (d.project_id IS NOT DISTINCT FROM $3)
                                         ORDER BY c.embedding <=> $1::vector
                                         LIMIT $4`,
                    [vecLiteral, orgId, projectId, limit]
                );
                return res.json({ mode: 'vector', results: rows });
            }

            // Hybrid fusion via RRF with org/project scoping
            const { rows } = await query<{ id: string; document_id: string; chunk_index: number; text: string }>(
                `WITH params AS (
                                     SELECT $1::vector AS qvec, websearch_to_tsquery('simple', $2) AS qts, $3::int AS topk
                                 ), vec AS (
                                     SELECT c.id, c.document_id, c.chunk_index, c.text,
                                                    1.0 / (ROW_NUMBER() OVER (ORDER BY c.embedding <=> (SELECT qvec FROM params)) + 60) AS rrf
                                     FROM kb.chunks c
                                     JOIN kb.documents d ON d.id = c.document_id
                                     WHERE (d.org_id IS NOT DISTINCT FROM $4)
                                         AND (d.project_id IS NOT DISTINCT FROM $5)
                                     ORDER BY c.embedding <=> (SELECT qvec FROM params)
                                     LIMIT (SELECT topk FROM params)
                                 ), lex AS (
                                     SELECT c.id, c.document_id, c.chunk_index, c.text,
                                                    1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC) + 60) AS rrf
                                     FROM kb.chunks c
                                     JOIN kb.documents d ON d.id = c.document_id
                                     WHERE c.tsv @@ (SELECT qts FROM params)
                                         AND (d.org_id IS NOT DISTINCT FROM $4)
                                         AND (d.project_id IS NOT DISTINCT FROM $5)
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
                [vecLiteral, q, limit, orgId, projectId]
            );
            res.json({ mode: 'hybrid', results: rows });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'search failed' });
        }
    });

    // List all uploaded/ingested documents
    app.get('/documents', requireAuth(), async (req: Request, res: Response) => {
        try {
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
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
                                 WHERE (d.org_id IS NOT DISTINCT FROM $1)
                                     AND (d.project_id IS NOT DISTINCT FROM $2)
                 ORDER BY d.created_at DESC`
                , [orgId, projectId]);
            res.json({ documents: rows });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to list documents' });
        }
    });

    // List chunks with optional filters and pagination
    app.get('/chunks', requireAuth(), async (req: Request, res: Response) => {
        try {
            const docIdRaw = (req.query.docId as string | undefined) || undefined;
            const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
            const docId = docIdRaw && uuidRe.test(docIdRaw) ? docIdRaw : null;
            const qRaw = String((req.query.q as string) || '').trim();
            const q = qRaw.length > 0 ? qRaw : null;
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            const page = Math.max(1, Number(req.query.page || 1) || 1);
            const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25) || 25));
            const offset = (page - 1) * pageSize;

            const sortParam = String((req.query.sort as string) || 'created_at:desc');
            const [sortField, sortDirRaw] = sortParam.split(':');
            const direction = sortDirRaw?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
            // Allow only whitelisted columns for sorting
            // Order by the column names available in the final SELECT (from CTE),
            // not using the base table alias to avoid missing FROM-clause errors.
            let orderBy = `created_at ${direction}, chunk_index ASC`;
            if (sortField === 'chunk_index') orderBy = `chunk_index ${direction}, created_at DESC`;

            const params: any[] = [docId, q, offset, pageSize];

            const sql = `
                WITH filtered AS (
            SELECT c.id, c.document_id, c.chunk_index, c.text, c.created_at,
               d.filename, d.source_url
                    FROM kb.chunks c
                    JOIN kb.documents d ON d.id = c.document_id
                    WHERE ($1::uuid IS NULL OR c.document_id = $1::uuid)
              AND ($2::text IS NULL OR c.tsv @@ websearch_to_tsquery('simple', $2))
              AND (d.org_id IS NOT DISTINCT FROM $5)
              AND (d.project_id IS NOT DISTINCT FROM $6)
                ), counted AS (
                    SELECT *, COUNT(*) OVER() AS total FROM filtered
                )
                SELECT * FROM counted
                ORDER BY ${orderBy}
                OFFSET $3 LIMIT $4
            `;

            const rowsQ = await query<{
                id: string;
                document_id: string;
                chunk_index: number;
                text: string;
                created_at: string;
                filename: string | null;
                source_url: string | null;
                total: string;
            }>(sql, params.concat([orgId, projectId]));

            const total = rowsQ.rows.length > 0 ? Number(rowsQ.rows[0].total) : 0;
            const items = rowsQ.rows.map((r) => ({
                id: r.id,
                document_id: r.document_id,
                document_title: r.filename || r.source_url || r.document_id,
                source_url: r.source_url,
                chunk_index: r.chunk_index,
                created_at: r.created_at,
                text: r.text,
            }));
            res.json({ items, page, pageSize, total });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to list chunks' });
        }
    });

    // Get a single chunk by id
    app.get('/chunks/:id', requireAuth(), async (req: Request, res: Response) => {
        try {
            const id = String(req.params.id);
            const { rows } = await query<{
                id: string;
                document_id: string;
                chunk_index: number;
                text: string;
                created_at: string;
                filename: string | null;
                source_url: string | null;
            }>(
                `SELECT c.id, c.document_id, c.chunk_index, c.text, c.created_at, d.filename, d.source_url
                 FROM kb.chunks c
                 JOIN kb.documents d ON d.id = c.document_id
                 WHERE c.id = $1`,
                [id]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'not found' });
            const r = rows[0];
            res.json({
                id: r.id,
                document_id: r.document_id,
                document_title: r.filename || r.source_url || r.document_id,
                source_url: r.source_url,
                chunk_index: r.chunk_index,
                created_at: r.created_at,
                text: r.text,
            });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to get chunk' });
        }
    });

    // SSE chat streaming endpoint
    app.post('/chat/stream', requireAuth(), async (req: Request, res: Response) => {
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
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);

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
                const orgId = (req.headers['x-org-id'] as string | undefined) || null;
                const projectId = (req.headers['x-project-id'] as string | undefined) || null;
                const ins = await query<{ id: string }>(
                    `INSERT INTO kb.chat_conversations (title, owner_user_id, is_private, org_id, project_id)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id`,
                    [title, currentUserId, !!body.isPrivate, orgId, projectId]
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

            // Retrieve topK chunks using hybrid fusion (vector + FTS) scoped by org/project and optional doc filters
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            const { rows } = await query<{
                chunk_id: string;
                document_id: string;
                chunk_index: number;
                text: string;
                distance: number | null;
                filename: string | null;
                source_url: string | null;
            }>(
                `WITH params AS (
                                     SELECT $1::vector AS qvec,
                                                    websearch_to_tsquery('simple', $6) AS qts,
                                                    $5::int AS topk
                                 ), vec AS (
                                     SELECT c.id,
                                                    1.0 / (ROW_NUMBER() OVER (ORDER BY c.embedding <=> (SELECT qvec FROM params)) + 60) AS rrf,
                                                    (c.embedding <=> (SELECT qvec FROM params)) AS distance
                                     FROM kb.chunks c
                                     JOIN kb.documents d ON d.id = c.document_id
                                     WHERE ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
                                         AND (d.org_id IS NOT DISTINCT FROM $3)
                                         AND (d.project_id IS NOT DISTINCT FROM $4)
                                     ORDER BY c.embedding <=> (SELECT qvec FROM params)
                                     LIMIT (SELECT topk FROM params)
                                 ), lex AS (
                                     SELECT c.id,
                                                    1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC) + 60) AS rrf,
                                                    NULL::float AS distance
                                     FROM kb.chunks c
                                     JOIN kb.documents d ON d.id = c.document_id
                                     WHERE c.tsv @@ (SELECT qts FROM params)
                                         AND ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
                                         AND (d.org_id IS NOT DISTINCT FROM $3)
                                         AND (d.project_id IS NOT DISTINCT FROM $4)
                                     ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC
                                     LIMIT (SELECT topk FROM params)
                                 ), fused AS (
                                     SELECT id, SUM(rrf) AS score, MIN(distance) AS distance
                                     FROM (
                                         SELECT * FROM vec
                                         UNION ALL
                                         SELECT * FROM lex
                                     ) u
                                     GROUP BY id
                                 )
                                 SELECT c.id AS chunk_id, c.document_id, c.chunk_index, c.text,
                                                d.filename, d.source_url,
                                                f.distance
                                 FROM fused f
                                 JOIN kb.chunks c ON c.id = f.id
                                 JOIN kb.documents d ON d.id = c.document_id
                                 ORDER BY f.score DESC
                                 LIMIT (SELECT topk FROM params)`,
                [vecLiteral, filterIds, orgId, projectId, topK, message]
            );

            const citations = rows.map((r) => ({
                documentId: r.document_id,
                chunkId: r.chunk_id,
                chunkIndex: r.chunk_index,
                text: r.text,
                sourceUrl: r.source_url,
                filename: r.filename,
                similarity: r.distance ?? undefined,
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

            // Load prompt templates from settings with safe defaults
            const defaults = {
                systemPrompt:
                    'You are a helpful assistant. Answer the user question using only the provided CONTEXT. Cite sources inline using bracketed numbers like [1], [2], matching the provided context order. If the answer can\'t be derived from the CONTEXT, say you don\'t know rather than hallucinating.',
                userTemplate:
                    'Question:\n{question}\n\nCONTEXT (citations in order):\n{context}\n\nProvide a concise, well-structured answer.',
            } as const;

            async function getPromptSetting(key: string): Promise<string> {
                try {
                    const { rows } = await query<{ value: any }>(`SELECT value FROM kb.settings WHERE key = $1`, [key]);
                    const v = rows[0]?.value;
                    const str = typeof v === 'string' ? v : v?.text || v?.template || '';
                    return String(str || (defaults as any)[key] || '');
                } catch {
                    return (defaults as any)[key] || '';
                }
            }

            const [systemPrompt, userTemplate] = await Promise.all([
                getPromptSetting('chat.systemPrompt'),
                getPromptSetting('chat.userTemplate'),
            ]);

            // Basic placeholder validation; fall back to defaults if missing
            const safeUserTemplate = /\{question\}/.test(userTemplate) && /\{context\}/.test(userTemplate)
                ? userTemplate
                : defaults.userTemplate;

            const prompt = ChatPromptTemplate.fromMessages([
                ['system', systemPrompt],
                ['human', safeUserTemplate],
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
    app.get('/chat/conversations', requireAuth(), async (req: Request, res: Response) => {
        try {
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            const sharedQ = await query<{ id: string; title: string; created_at: string; updated_at: string; owner_user_id: string; is_private: boolean }>(
                `SELECT id, title, created_at, updated_at, owner_user_id, is_private
                 FROM kb.chat_conversations
                 WHERE is_private = false AND (org_id IS NOT DISTINCT FROM $1) AND (project_id IS NOT DISTINCT FROM $2)
                 ORDER BY updated_at DESC`
                , [orgId, projectId]);
            const privateQ = await query<{ id: string; title: string; created_at: string; updated_at: string; owner_user_id: string; is_private: boolean }>(
                `SELECT id, title, created_at, updated_at, owner_user_id, is_private
                 FROM kb.chat_conversations
                 WHERE is_private = true AND owner_user_id = $1 AND (org_id IS NOT DISTINCT FROM $2) AND (project_id IS NOT DISTINCT FROM $3)
                 ORDER BY updated_at DESC`,
                [currentUserId, orgId, projectId]
            );
            res.json({ shared: sharedQ.rows, private: privateQ.rows });
        } catch (e: any) {
            res.status(500).json({ error: e.message || 'failed to list conversations' });
        }
    });

    // Get a single conversation metadata + messages (access-controlled)
    app.get('/chat/:id', requireAuth(), async (req: Request, res: Response) => {
        try {
            const id = String(req.params.id);
            const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
            if (!uuidRe.test(id)) return res.status(400).json({ error: 'invalid id' });
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            const convQ = await query<{ id: string; title: string; created_at: string; updated_at: string; owner_user_id: string; is_private: boolean }>(
                `SELECT id, title, created_at, updated_at, owner_user_id, is_private
                 FROM kb.chat_conversations WHERE id = $1 AND (org_id IS NOT DISTINCT FROM $2) AND (project_id IS NOT DISTINCT FROM $3)`,
                [id, orgId, projectId]
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
    app.patch('/chat/:id', requireAuth(), async (req: Request, res: Response) => {
        try {
            const id = String(req.params.id);
            const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
            if (!uuidRe.test(id)) return res.status(400).json({ error: 'invalid id' });
            const { title } = req.body as { title?: string };
            if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            const convQ = await query<{ id: string; owner_user_id: string }>(
                `SELECT id, owner_user_id FROM kb.chat_conversations WHERE id = $1 AND (org_id IS NOT DISTINCT FROM $2) AND (project_id IS NOT DISTINCT FROM $3)`,
                [id, orgId, projectId]
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
    app.delete('/chat/:id', requireAuth(), async (req: Request, res: Response) => {
        try {
            const id = String(req.params.id);
            const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
            if (!uuidRe.test(id)) return res.status(400).json({ error: 'invalid id' });
            const currentUserId = getCurrentUserId((res.locals as any).user as UserClaims | undefined);
            const orgId = (req.headers['x-org-id'] as string | undefined) || null;
            const projectId = (req.headers['x-project-id'] as string | undefined) || null;
            const convQ = await query<{ id: string; owner_user_id: string }>(
                `SELECT id, owner_user_id FROM kb.chat_conversations WHERE id = $1 AND (org_id IS NOT DISTINCT FROM $2) AND (project_id IS NOT DISTINCT FROM $3)`,
                [id, orgId, projectId]
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

    // Canonical backend port: SERVER_PORT (fallback 3001)
    const port = Number(process.env.SERVER_PORT || 3001);
    app.listen(port, () => console.log(`server listening on :${port}`));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
