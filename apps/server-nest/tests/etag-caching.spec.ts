import 'reflect-metadata';
import { beforeAll, afterAll, it, expect } from 'vitest';
import type { BootstrappedApp } from './utils/test-app';
import { bootstrapTestApp } from './utils/test-app';
import { httpGet } from './utils/http';
import { describeWithDb } from './utils/db-describe';

let ctx: BootstrappedApp | null = null;

describeWithDb('Caching / ETag', () => {
    beforeAll(async () => {
        ctx = await bootstrapTestApp();
    });

    afterAll(async () => {
        if (!ctx) return;
        await ctx.close();
    });

    it('returns 304 when If-None-Match matches ETag', async () => {
        const current = ctx;
        if (!current) throw new Error('Test app was not bootstrapped');
        const first = await httpGet<any>(current.baseUrl, '/orgs');
        if (first.status !== 200) {
            console.error('DEBUG /orgs first status', first.status, first.json);
        }
        expect(first.status).toBe(200);
        const etag = first.headers.get('etag');
        expect(etag).toBeTruthy();

        const secondRaw = await fetch(`${current.baseUrl}/orgs`, { headers: { 'If-None-Match': etag || '' } });
        expect(secondRaw.status).toBe(304);
        const text = await secondRaw.text();
        expect(text).toBe('');
    });

    it('returns 200 if If-None-Match does not match current ETag', async () => {
        const current = ctx;
        if (!current) throw new Error('Test app was not bootstrapped');
        const first = await httpGet<any>(current.baseUrl, '/orgs');
        expect(first.status).toBe(200);
        const bad = await fetch(`${current.baseUrl}/orgs`, { headers: { 'If-None-Match': '"not-the-etag"' } });
        if (bad.status !== 200) {
            console.error('DEBUG /orgs bad etag status', bad.status, await bad.text());
        }
        expect(bad.status).toBe(200);
    });
});
