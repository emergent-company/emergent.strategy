import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { Pool } from 'pg';

// Verifies cascading deletions: deleting a document removes its chunks.
// (Extend later for project/org cascades if implemented.)

let ctx: E2EContext;
let pool: Pool;

describe('Cleanup Cascades E2E', () => {
    beforeAll(async () => {
        ctx = await createE2EContext('cleanup-cascade');
        pool = new Pool({
            host: process.env.PGHOST || 'localhost',
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER || 'spec',
            password: process.env.PGPASSWORD || 'spec',
            database: process.env.PGDATABASE || 'spec'
        });
    });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await pool.end(); await ctx.close(); });

    async function ingestLarge() {
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        form.append('filename', 'cascade.txt');
        form.append('file', new Blob(['Cascade check text repeated '.repeat(200)], { type: 'text/plain' }), 'cascade.txt');
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: authHeader('all', 'cleanup-cascade'), body: form as any });
        expect([200, 201]).toContain(res.status);
        return res.json();
    }

    it('removes chunks after document deletion', async () => {
        const ing = await ingestLarge();
        const docId = ing.documentId || ing.id;
        // Count chunks pre-delete
        const pre = await pool.query<{ c: string }>('select count(*)::text as c from kb.chunks where document_id=$1', [docId]);
        const preCount = Number(pre.rows[0].c);
        expect(preCount).toBeGreaterThanOrEqual(1);

        const del = await fetch(`${ctx.baseUrl}/documents/${docId}`, { method: 'DELETE', headers: authHeader('all', 'cleanup-cascade') });
        expect([200, 204]).toContain(del.status);

        const post = await pool.query<{ c: string }>('select count(*)::text as c from kb.chunks where document_id=$1', [docId]);
        const postCount = Number(post.rows[0].c);
        expect(postCount).toBe(0);
    });
});
