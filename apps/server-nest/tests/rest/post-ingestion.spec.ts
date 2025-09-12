import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';

let ctx: BootstrappedApp;

describe('Ingestion POST endpoints', () => {
    beforeAll(async () => { ctx = await bootstrapTestApp(); });
    afterAll(async () => { await ctx.close(); });

    it('POST /ingest/upload rejects missing file with 400 when projectId provided', async () => {
        // Need a project to reference
        const projectsRes = await fetch(`${ctx.baseUrl}/projects`);
        const projects = await projectsRes.json();
        const projectId = projects[0].id;
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: 'demo.md', projectId }),
        });
        expect(res.status).toBe(400);
    });
    // NOTE: multipart positive path would require FormData construction; can be added later.
    it('POST /ingest/url validation', async () => {
        const res = await fetch(`${ctx.baseUrl}/ingest/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'notaurl' }),
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
    });
});
