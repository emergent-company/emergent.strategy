import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

let ctx: E2EContext;

describe('Documents Create/Get E2E', () => {
    // Isolate this spec's user to avoid cross-test cleanup interference
    beforeAll(async () => { ctx = await createE2EContext('docs-get'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('creates a document and retrieves it', async () => {
        const createRes = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'docs-get'), 'x-project-id': ctx.projectId },
            body: JSON.stringify({ filename: 'e2e-file.txt', content: 'hello world', projectId: ctx.projectId }),
        });
        expectStatusOneOf(createRes.status, [200, 201], 'create document');
        const created = await createRes.json();
        expect(created.filename || created.name).toBeDefined();
        const id = created.id;
        expect(id).toBeTruthy();

        const getRes = await fetch(`${ctx.baseUrl}/documents/${id}`, { headers: { ...authHeader('all', 'docs-get'), 'x-project-id': ctx.projectId } });
        expect(getRes.status).toBe(200);
        const fetched = await getRes.json();
        expect(fetched.id).toBe(id);
    });
});
