/// <reference types="vitest" />
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Verifies per-test cleanup removes created documents (and associated chunks placeholder table) between tests.
// We create a document in first test, rely on afterEach cleanup, and assert second test sees zero documents.

describe('Cleanup Verification E2E', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    // Dedicated user suffix so that document creation doesn't clash with other specs
    beforeAll(async () => { ctx = await createE2EContext('cleanup'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('creates a document (will be cleaned)', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { ...authHeader('all', 'cleanup'), 'content-type': 'application/json', 'x-project-id': ctx.projectId },
            body: JSON.stringify({ filename: 'temp-clean.txt', content: 'transient', projectId: ctx.projectId })
        });
        expectStatusOneOf(res.status, [200, 201], 'cleanup create');
        const json = await res.json();
        expect(json.id).toBeTruthy();
    });

    it('sees zero documents after cleanup', async () => {
        const listRes = await fetch(`${ctx.baseUrl}/documents`, { headers: { ...authHeader('all', 'cleanup'), 'x-project-id': ctx.projectId } });
        expect(listRes.status).toBe(200);
        const json = await listRes.json();
        // Endpoint returns pagination object OR flat array depending on implementation; normalize.
        const items = Array.isArray(json) ? json : json.items;
        expect(Array.isArray(items)).toBe(true);
        const hasTemp = items.some((d: any) => d.name === 'temp-clean.txt');
        expect(hasTemp).toBe(false);
    });
});
