import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';

let ctx: BootstrappedApp;

async function http(base: string, path: string, init?: RequestInit) {
    const res = await fetch(base + path, init);
    let json: any = null;
    try { json = await res.json(); } catch { /* ignore */ }
    return { status: res.status, json };
}

describe('Chat mutations', () => {
    beforeAll(async () => { ctx = await bootstrapTestApp(); });
    afterAll(async () => { await ctx.close(); });

    let createdId: string;
    it('create conversation for mutations', async () => {
        const c = await http(ctx.baseUrl, '/chat/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Mutation seed' }) });
        expect(c.status).toBe(200);
        createdId = c.json.id;
    });

    it('PATCH rename succeeds', async () => {
        const r = await http(ctx.baseUrl, `/chat/${createdId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Renamed' }) });
        expect(r.status).toBe(200);
        expect(r.json).toHaveProperty('ok', true);
        expect(r.json).toHaveProperty('title', 'Renamed');
    });

    it('PATCH missing title returns 400', async () => {
        const r = await http(ctx.baseUrl, `/chat/${createdId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('bad-request');
    });

    it('DELETE succeeds', async () => {
        const r = await http(ctx.baseUrl, `/chat/${createdId}`, { method: 'DELETE' });
        expect(r.status).toBe(200);
        expect(r.json).toHaveProperty('ok', true);
    });

    it('DELETE /chat/does-not-exist returns 404', async () => {
        const r = await http(ctx.baseUrl, '/chat/does-not-exist', { method: 'DELETE' });
        expect(r.status).toBe(404);
        expect(r.json.error.code).toBe('not-found');
    });
});
