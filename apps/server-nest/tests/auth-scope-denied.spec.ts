import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from './utils/test-app';
import { bootstrapTestApp } from './utils/test-app';
import { httpGetAuth, httpGet } from './utils/http';

let ctx: BootstrappedApp;

describe('Auth scopes', () => {
    beforeAll(async () => {
        ctx = await bootstrapTestApp();
    });

    afterAll(async () => {
        await ctx.close();
    });

    it('denies access with missing scope (403)', async () => {
        const res = await httpGetAuth<{ error: { code: string } }>(ctx.baseUrl, '/auth/me', 'no-scope');
        if (res.status !== 403) {
            console.error('DEBUG /auth/me no-scope status', res.status, res.json);
        }
        expect(res.status).toBe(403);
        expect(res.json.error?.code).toBe('forbidden');
    });

    it('allows access with required scope', async () => {
        const res = await httpGetAuth<{ sub: string }>(ctx.baseUrl, '/auth/me', 'with-scope');
        if (res.status !== 200) {
            console.error('DEBUG /auth/me with-scope status', res.status, res.json);
        }
        expect(res.status).toBe(200);
        expect(res.json.sub).toBe('mock-user-id');
    });

    it('rejects missing Authorization header (401)', async () => {
        const res = await httpGet<{ error: { code: string } }>(ctx.baseUrl, '/auth/me');
        if (res.status !== 401) {
            console.error('DEBUG /auth/me missing header status', res.status, res.json);
        }
        expect(res.status).toBe(401);
        expect(res.json.error?.code).toBe('unauthorized');
    });
});
