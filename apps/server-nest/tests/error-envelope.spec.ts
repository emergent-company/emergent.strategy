import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from './utils/test-app';
import { bootstrapTestApp } from './utils/test-app';
import { httpGetAuth } from './utils/http';

let ctx: BootstrappedApp;

describe('Error envelope structure', () => {
    beforeAll(async () => {
        ctx = await bootstrapTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('401 unauthorized envelope shape', async () => {
        const res = await fetch(`${ctx.baseUrl}/auth/me`);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json).toHaveProperty('error');
        expect(json.error).toHaveProperty('code', 'unauthorized');
        expect(json.error).toHaveProperty('message');
    });

    it('403 forbidden envelope shape', async () => {
        const res = await httpGetAuth<{ error: { code: string; message: string } }>(ctx.baseUrl, '/auth/me', 'no-scope');
        expect(res.status).toBe(403);
        expect(res.json.error.code).toBe('forbidden');
        expect(typeof res.json.error.message).toBe('string');
    });
});
