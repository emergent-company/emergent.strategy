import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from '../utils/test-app';
// Must import the same compiled class used by AppModule providers (dist path) so Nest can resolve it.
// Use source path; tests run after build but Nest container has provider tokens from source module metadata.
// We avoid resolving Nest's DatabaseService directly (class identity mismatch between src & dist under Vitest).
// Instead we create a dedicated pg Pool for fixture setup & cleanup after the app bootstraps.
import { Pool } from 'pg';
import crypto from 'node:crypto';

export interface E2EContext {
    app: INestApplication;
    baseUrl: string;
    orgId: string;
    projectId: string;
    userSub: string;
    cleanup: () => Promise<void>;
    close: () => Promise<void>;
    /**
     * Cleanup chat + document artifacts for an additional project id created during a test.
     * Does NOT remove the project/org rows themselves (idempotent best‑effort).
     */
    cleanupProjectArtifacts: (projectId: string) => Promise<void>;
}

function mapUserSubToUuid(sub: string): string {
    // Mirrors ChatService.mapUserId logic for non-uuid subs (sha1 -> uuid v5 style)
    const hash = crypto.createHash('sha1').update(sub).digest();
    const bytes = Buffer.from(hash.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 style nibble
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    const hex = bytes.toString('hex');
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

// Concurrency‑safe creation of shared base org/project used by many specs.
// Multiple workers may attempt to bootstrap simultaneously; we avoid race windows by
// using INSERT .. ON CONFLICT DO NOTHING and falling back to a SELECT when the row
// already exists. This prevents duplicate key violations crashing context startup.
async function ensureBaseFixtures(pool: Pool): Promise<{ orgId: string; projectId: string }> {
    let orgId: string | undefined;
    {
        const ins = await pool.query<{ id: string }>(
            `INSERT INTO kb.orgs(name) VALUES($1)
             ON CONFLICT (name) DO NOTHING
             RETURNING id`,
            ['E2E Org']
        );
        if (ins.rowCount) {
            orgId = ins.rows[0].id;
        } else {
            const sel = await pool.query<{ id: string }>(`SELECT id FROM kb.orgs WHERE name = $1 LIMIT 1`, ['E2E Org']);
            if (!sel.rowCount) throw new Error('Failed to locate or create base E2E Org');
            orgId = sel.rows[0].id;
        }
    }

    let projectId: string | undefined;
    {
        const ins = await pool.query<{ id: string }>(
            `INSERT INTO kb.projects(org_id, name) VALUES($1,$2)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [orgId, 'E2E Project']
        );
        if (ins.rowCount) {
            projectId = ins.rows[0].id;
        } else {
            const sel = await pool.query<{ id: string }>(`SELECT id FROM kb.projects WHERE org_id = $1 AND name = $2 LIMIT 1`, [orgId, 'E2E Project']);
            if (!sel.rowCount) throw new Error('Failed to locate or create base E2E Project');
            projectId = sel.rows[0].id;
        }
    }

    return { orgId, projectId };
}

async function cleanupUserData(pool: Pool, projectId: string, userSub: string) {
    const tableCheck = async (name: string) => {
        const r = await pool.query(`SELECT to_regclass($1) as exists`, [name]);
        return !!r.rows[0].exists;
    };
    // Derive uuid form for owner_user_id (since chat schema stores UUID not raw sub)
    const mappedUserId = mapUserSubToUuid(userSub);
    if (await tableCheck('kb.chat_messages')) {
        await pool.query(`DELETE FROM kb.chat_messages WHERE conversation_id IN (SELECT id FROM kb.chat_conversations WHERE owner_user_id = $1)`, [mappedUserId]);
    }
    if (await tableCheck('kb.chat_conversations')) {
        await pool.query(`DELETE FROM kb.chat_conversations WHERE owner_user_id = $1`, [mappedUserId]);
    }
    if (await tableCheck('kb.chunks')) {
        await pool.query(`DELETE FROM kb.chunks WHERE document_id IN (SELECT id FROM kb.documents WHERE project_id = $1)`, [projectId]);
    }
    if (await tableCheck('kb.documents')) {
        await pool.query(`DELETE FROM kb.documents WHERE project_id = $1`, [projectId]);
    }
    if (await tableCheck('kb.settings')) {
        await pool.query(`DELETE FROM kb.settings WHERE key LIKE 'e2e-%'`);
    }
}

async function waitForConnectivity(pool: Pool, attempts = 20, delayMs = 200): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
        try {
            await pool.query('SELECT 1');
            return true;
        } catch {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    return false;
}

async function waitForRelation(pool: Pool, rel: string, attempts = 30, delayMs = 100): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
        const res = await pool.query<{ exists: string | null }>('SELECT to_regclass($1) as exists', [rel]);
        if (res.rows[0]?.exists) return true;
        await new Promise(r => setTimeout(r, delayMs));
    }
    return false;
}

export async function createE2EContext(userSuffix?: string): Promise<E2EContext> {
    // Ensure required env for DatabaseService before NestFactory create
    // Explicitly disable SKIP_DB for scenario/e2e contexts; tests rely on minimal schema being created.
    if (process.env.SKIP_DB) delete process.env.SKIP_DB;
    // Enable static test tokens mode explicitly (Option 3) so fixtures like e2e-* are accepted
    process.env.AUTH_TEST_STATIC_TOKENS = process.env.AUTH_TEST_STATIC_TOKENS || '1';
    process.env.PGHOST = process.env.PGHOST || 'localhost';
    process.env.PGPORT = process.env.PGPORT || '5432';
    process.env.PGUSER = process.env.PGUSER || 'spec';
    process.env.PGPASSWORD = process.env.PGPASSWORD || 'spec';
    process.env.PGDATABASE = process.env.PGDATABASE || process.env.PGDATABASE_E2E || 'spec';
    process.env.DB_AUTOINIT = process.env.DB_AUTOINIT || 'true';
    process.env.ORGS_DEMO_SEED = 'false';
    // Force minimal schema consistently across all contexts to avoid mixed-mode races.
    process.env.E2E_MINIMAL_DB = 'true';
    const boot = await bootstrapTestApp();
    // Create dedicated pool for direct SQL (schema already ensured by app bootstrap)
    const pool = new Pool({
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
    });
    const online = await waitForConnectivity(pool);
    if (!online) throw new Error('Database connectivity failed for E2E tests');
    // Wait until minimal schema bootstrap (another worker may still be holding advisory lock rebuilding schema)
    for (const rel of ['kb.orgs', 'kb.projects', 'kb.documents', 'kb.chunks', 'kb.chat_conversations', 'kb.chat_messages']) {
        const ready = await waitForRelation(pool, rel);
        if (!ready) throw new Error(`Timed out waiting for ${rel} to be created`);
    }
    // Default to isolation ON unless explicitly disabled. This reduces cross‑spec state leakage.
    const isolate = process.env.E2E_ISOLATE_ORGS !== '0';
    let createdIsolatedOrg = false;
    let createdIsolatedProject = false;
    let orgId: string; let projectId: string;
    if (isolate) {
        // Fully isolated org + project per context. Enables future migration away from shared base fixture.
        // Keeps naming deterministic for debugging while guaranteeing uniqueness.
        const orgName = `Isolated Org ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const orgIns = await pool.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES($1) RETURNING id`, [orgName]);
        orgId = orgIns.rows[0].id;
        createdIsolatedOrg = true;
        const projName = `Isolated Project ${userSuffix || 'base'} ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const projIns = await pool.query<{ id: string }>(`INSERT INTO kb.projects(org_id, name) VALUES($1,$2) RETURNING id`, [orgId, projName]);
        projectId = projIns.rows[0].id;
        createdIsolatedProject = true;
    } else {
        // Historical shared base org/project (more performant; stable cross-spec assumptions)
        ({ orgId, projectId } = await ensureBaseFixtures(pool));
        // Optionally create per-suffix isolated project inside shared org (legacy behavior)
        if (userSuffix) {
            const uniqueName = `E2E Project ${userSuffix} ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
            let attempts = 5;
            while (attempts--) {
                try {
                    const projIns = await pool.query<{ id: string }>(`INSERT INTO kb.projects(org_id, name) VALUES($1,$2) RETURNING id`, [orgId, uniqueName]);
                    projectId = projIns.rows[0].id;
                    break;
                } catch (e: any) {
                    if (e.code === '40P01' && attempts > 0) {
                        await new Promise(r => setTimeout(r, 50));
                        continue;
                    }
                    throw e;
                }
            }
        }
    }
    // Derive per-context synthetic user sub to avoid cross-test interference when specs run in parallel.
    // Default remains the historical fixed UUID-like suffix for backward compatibility.
    const userSub = userSuffix ? `e2e-user-${userSuffix}` : 'e2e-user-00000000-0000-0000-0000-000000000001';
    return {
        app: boot.app,
        baseUrl: boot.baseUrl,
        orgId,
        projectId,
        userSub,
        cleanup: async () => cleanupUserData(pool, projectId, userSub),
        cleanupProjectArtifacts: async (extraProjectId: string) => cleanupUserData(pool, extraProjectId, userSub),
        close: async () => {
            try {
                if (isolate) {
                    // Best-effort cleanup of isolated project/org (child tables cascade via FKs)
                    if (createdIsolatedProject) {
                        try { await pool.query('DELETE FROM kb.projects WHERE id = $1', [projectId]); } catch { /* ignore */ }
                    }
                    if (createdIsolatedOrg) {
                        try { await pool.query('DELETE FROM kb.orgs WHERE id = $1', [orgId]); } catch { /* ignore */ }
                    }
                }
            } finally {
                await pool.end();
                await boot.close();
            }
        },
    };
}
