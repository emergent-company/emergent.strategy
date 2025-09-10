import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';

let ctx: BootstrappedApp;

describe('Ingestion POST endpoints', () => {
    beforeAll(async () => { ctx = await bootstrapTestApp(); });
    afterAll(async () => { await ctx.close(); });

    it('POST /ingest/upload succeeds with filename', async () => {
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: 'demo.md' }),
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json).toHaveProperty('id');
        expect(json).toHaveProperty('filename', 'demo.md');
    });

    it('POST /ingest/url succeeds with valid url', async () => {
        const res = await fetch(`${ctx.baseUrl}/ingest/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com/spec.md' }),
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json).toHaveProperty('id');
        expect(json).toHaveProperty('url', 'https://example.com/spec.md');
    });
});
