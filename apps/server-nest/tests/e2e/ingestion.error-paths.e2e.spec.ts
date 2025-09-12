import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { randomUUID } from 'crypto';

// Ingestion error-path coverage:
// 1. Missing file field -> file-required
// 2. Zero-byte file -> empty
// 3. Oversized file (>10MB) -> 400 or 413 (tolerant)
// 4. Bad URL fetch (connection refused) -> fetch-failed OR fetch-bad-status
// 5. orgId mismatch with project org -> org-project-mismatch

let ctx: E2EContext;

describe('Ingestion Error Paths E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('ingest-errors'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('rejects when file is missing', async () => {
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        // Intentionally omit 'file'
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { ...authHeader('all', 'ingest-errors') }, body: form as any });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json?.error?.code).toBe('file-required');
    });

    it('rejects zero-byte file with empty code', async () => {
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        form.append('file', new Blob(['']), 'empty.txt');
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { ...authHeader('all', 'ingest-errors') }, body: form as any });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json?.error?.code).toBe('empty');
    });

    it('rejects oversized file', async () => {
        // Create a ~10MB + 10KB string
        const size = 10 * 1024 * 1024 + 10 * 1024;
        const large = 'a'.repeat(size);
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        form.append('file', new Blob([large]), 'big.txt');
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { ...authHeader('all', 'ingest-errors') }, body: form as any });
        expect([400, 413]).toContain(res.status);
        if (res.status === 400) {
            // Some environments may still parse and return JSON error
            const json = await res.json().catch(() => ({}));
            if (json?.error?.code) {
                expect(['payload-too-large', 'validation-failed', 'file-too-large']).toContain(json.error.code);
            }
        }
    });

    it('rejects unreachable URL ingestion', async () => {
        // Use an unroutable localhost high port to force connection failure quickly
        const body = { url: `http://127.0.0.1:65530/unreachable-${Date.now()}`, projectId: ctx.projectId };
        const res = await fetch(`${ctx.baseUrl}/ingest/url`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader('all', 'ingest-errors') }, body: JSON.stringify(body) });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(['fetch-failed', 'fetch-bad-status']).toContain(json?.error?.code);
    });

    it('rejects org/project mismatch on upload', async () => {
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        // Provide a different orgId to trigger mismatch
        form.append('orgId', randomUUID());
        form.append('file', new Blob(['Some content']), 'ok.txt');
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { ...authHeader('all', 'ingest-errors') }, body: form as any });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json?.error?.code).toBe('org-project-mismatch');
    });
});
