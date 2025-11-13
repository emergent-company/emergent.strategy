import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Stress test: concurrent identical uploads should only yield one document in the project.
// Approach: fire N parallel uploads of the same small file; then list documents and ensure count=1.
// Accepts either multiple 409 conflicts or repeated 200/201 referencing same id.

let ctx: E2EContext;

interface IngestResponse { documentId?: string; id?: string; }

async function uploadOnce(ctx: E2EContext, content: string) {
    const form = new FormData();
    form.append('projectId', ctx.projectId);
    form.append('filename', 'race.txt');
    form.append('file', new Blob([content], { type: 'text/plain' }), 'race.txt');
    const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { ...authHeader('all', 'ingest-race') }, body: form as any });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json: json as IngestResponse };
}

describe('Ingestion Concurrency Dedup E2E', () => {
    const TEXT = 'Concurrent dedup content';
    const PARALLEL = 5;

    beforeAll(async () => { ctx = await createE2EContext('ingest-race'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('only creates one document under concurrent identical uploads', async () => {
        const results = await Promise.all(Array.from({ length: PARALLEL }, () => uploadOnce(ctx, TEXT)));
        // All should be one of 200/201/409
        results.forEach(r => expect([200, 201, 409]).toContain(r.status));
        // Collect non-conflict ids
        const ids = results.filter(r => r.status !== 409).map(r => r.json.documentId || r.json.id).filter(Boolean);
        if (ids.length > 1) {
            // They should all be identical if more than one success returned.
            expect(new Set(ids).size).toBe(1);
        }
        // Now list documents
        const listRes = await fetch(`${ctx.baseUrl}/documents`, { headers: { ...authHeader('all', 'ingest-race'), 'x-project-id': ctx.projectId } });
        expect(listRes.status).toBe(200);
        const listJson = await listRes.json();
        expect(Array.isArray(listJson)).toBe(true);
        expect(listJson.length).toBe(1);
    });
});
