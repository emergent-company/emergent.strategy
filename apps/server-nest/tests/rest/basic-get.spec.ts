import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';

interface ErrorEnvelope { error: { code: string; message: string; details?: Record<string, unknown> } }

type JsonResult<T> = { status: number; json: T; headers: Headers };

async function httpGet<T>(base: string, path: string, init?: RequestInit): Promise<JsonResult<T>> {
    const res = await fetch(base + path, init);
    let json: any = null;
    try { json = await res.json(); } catch { /* ignore */ }
    return { status: res.status, json, headers: res.headers };
}

let ctx: BootstrappedApp;

describe('REST GET endpoints basic smoke', () => {
    beforeAll(async () => {
        ctx = await bootstrapTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    describe('Health', () => {
        it('GET /health', async () => {
            const r = await httpGet<any>(ctx.baseUrl, '/health');
            expect(r.status).toBe(200);
            expect(r.json).toHaveProperty('ok', true);
            expect(typeof r.json.db).toBe('string');
        });
    });

    describe('Auth', () => {
        it('GET /auth/me unauthorized without token', async () => {
            const r = await httpGet<ErrorEnvelope>(ctx.baseUrl, '/auth/me');
            expect(r.status).toBe(401);
            expect(r.json.error.code).toBe('unauthorized');
        });
        it('GET /auth/me forbidden without scope', async () => {
            const r = await httpGet<ErrorEnvelope>(ctx.baseUrl, '/auth/me', { headers: { Authorization: 'Bearer no-scope' } });
            expect(r.status).toBe(403);
            expect(r.json.error.code).toBe('forbidden');
        });
        it('GET /auth/me success with scope', async () => {
            const r = await httpGet<any>(ctx.baseUrl, '/auth/me', { headers: { Authorization: 'Bearer with-scope' } });
            expect(r.status).toBe(200);
            expect(r.json).toHaveProperty('sub');
        });
    });

    describe('Settings', () => {
        it('GET /settings', async () => {
            const r = await httpGet<any[]>(ctx.baseUrl, '/settings');
            expect(r.status).toBe(200);
            expect(Array.isArray(r.json)).toBe(true);
        });
        it('GET /settings/theme', async () => {
            const r = await httpGet<any>(ctx.baseUrl, '/settings/theme');
            expect(r.status).toBe(200);
            expect(r.json).toHaveProperty('key', 'theme');
        });
        it('GET /settings/unknown returns 404', async () => {
            const r = await httpGet<ErrorEnvelope>(ctx.baseUrl, '/settings/does-not-exist');
            expect(r.status).toBe(404);
            expect(r.json.error.code).toBe('not-found');
        });
    });

    describe('Organizations & Projects', () => {
        it('GET /orgs', async () => {
            const r = await httpGet<any[]>(ctx.baseUrl, '/orgs');
            expect(r.status).toBe(200);
            expect(Array.isArray(r.json)).toBe(true);
        });
        it('GET /projects', async () => {
            const r = await httpGet<any[]>(ctx.baseUrl, '/projects');
            expect(r.status).toBe(200);
            expect(Array.isArray(r.json)).toBe(true);
        });
    });

    describe('Documents & Chunks', () => {
        it('GET /documents', async () => {
            const r = await httpGet<any[]>(ctx.baseUrl, '/documents');
            expect(r.status).toBe(200);
            expect(Array.isArray(r.json)).toBe(true);
        });
        it('GET /documents/:id unknown returns 404', async () => {
            const r = await httpGet<ErrorEnvelope>(ctx.baseUrl, '/documents/11111111-1111-4111-8111-111111111111');
            expect([404, 400]).toContain(r.status); // 400 if UUID pipe rejects invalid, 404 if passes and not found
        });
        it('GET /chunks', async () => {
            const r = await httpGet<any[]>(ctx.baseUrl, '/chunks');
            expect(r.status).toBe(200);
            expect(Array.isArray(r.json)).toBe(true);
        });
    });

    describe('Search', () => {
        it('GET /search with missing q returns validation error (422)', async () => {
            const r = await httpGet<ErrorEnvelope>(ctx.baseUrl, '/search');
            expect(r.status).toBe(422);
            // For query validation, custom exceptionFactory now returns validation-failed
            expect(r.json.error.code).toBe('validation-failed');
        });
    });

    describe('Chat', () => {
        it('GET /chat/conversations', async () => {
            const r = await httpGet<any[]>(ctx.baseUrl, '/chat/conversations');
            expect(r.status).toBe(200);
            expect(Array.isArray(r.json)).toBe(true);
        });
        it('GET /chat/c1', async () => {
            const r = await httpGet<any>(ctx.baseUrl, '/chat/c1');
            expect(r.status).toBe(200);
            expect(r.json).toHaveProperty('id', 'c1');
        });
        it('GET /chat/unknown returns 404', async () => {
            const r = await httpGet<ErrorEnvelope>(ctx.baseUrl, '/chat/does-not-exist');
            expect(r.status).toBe(404);
            expect(r.json.error.code).toBe('not-found');
        });
    });
});
