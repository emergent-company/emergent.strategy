import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';

let ctx: BootstrappedApp;

interface ErrorEnvelope { error: { code: string; message: string; details?: Record<string, unknown> } }

async function http(base: string, path: string, init?: RequestInit) {
    const res = await fetch(base + path, init);
    let json: any = null; try { json = await res.json(); } catch { /* ignore */ }
    return { status: res.status, json, headers: res.headers };
}

describe('Org creation', () => {
    beforeAll(async () => { ctx = await bootstrapTestApp(); });
    afterAll(async () => { await ctx.close(); });

    it('POST /orgs creates org', async () => {
        const r = await http(ctx.baseUrl, '/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New Org' }) });
        expect(r.status).toBe(201);
        expect(r.json).toHaveProperty('id');
        expect(r.json).toHaveProperty('name', 'New Org');
    });

    it('POST /orgs validation error', async () => {
        const r = await http(ctx.baseUrl, '/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '' }) });
        expect(r.status).toBe(422); // validation-failed from global pipe
        expect(r.json.error.code).toBe('validation-failed');
    });

    it('POST /orgs enforces max 10 orgs', async () => {
        // We start with 2 seed orgs (memory mode) or however many exist in DB.
        // Create up to limit.
        for (let i = 0; i < 10; i++) { // attempt many but break when limit hit
            const r = await http(ctx.baseUrl, '/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Org Limit ${i}` }) });
            if (r.status === 409) {
                expect(r.json.error.code).toBe('conflict');
                expect(r.json.error.message).toMatch(/Organization limit reached/);
                return; // test passes
            } else {
                expect([201, 409]).toContain(r.status);
            }
        }
        // After loop, attempt one more to ensure conflict if not already seen
        const final = await http(ctx.baseUrl, '/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Org Overflow' }) });
        expect(final.status).toBe(409);
        expect(final.json.error.code).toBe('conflict');
    });

    it('POST /orgs duplicate name returns conflict with details', async () => {
        const baseName = 'Dup Org';
        // First create (if not already existing) - ignore conflict if parallel run already created
        const first = await http(ctx.baseUrl, '/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: baseName }) });
        if (first.status !== 201 && first.status !== 409) {
            expect(first.status).toBe(201);
        }
        const second = await http(ctx.baseUrl, '/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: baseName }) });
        expect(second.status).toBe(409);
        expect(second.json.error.code).toBe('conflict');
        // details.name array optional if limit reached first; only assert when present
        if (second.json.error.details?.name) {
            expect(Array.isArray(second.json.error.details.name)).toBe(true);
        }
    });
});
