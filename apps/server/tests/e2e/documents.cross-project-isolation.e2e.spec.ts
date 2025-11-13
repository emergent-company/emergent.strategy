import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Ensures documents are not accessible across projects (GET + DELETE should 404/403 when mismatched project headers or unauthorized project).

let ctxA: E2EContext;
let ctxB: E2EContext;

describe('Documents Cross-Project Isolation E2E', () => {
    beforeAll(async () => { ctxA = await createE2EContext('docs-x-a'); ctxB = await createE2EContext('docs-x-b'); });
    beforeEach(async () => { await ctxA.cleanup(); await ctxB.cleanup(); });
    afterAll(async () => { await ctxA.close(); await ctxB.close(); });

    async function createDoc(ctx: E2EContext, label: string) {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', label), 'x-project-id': ctx.projectId },
            body: JSON.stringify({ filename: `${label}.txt`, content: 'secret', projectId: ctx.projectId })
        });
        expectStatusOneOf(res.status, [200, 201], 'create doc cross-project');
        const json = await res.json();
        return json.id as string;
    }

    it('prevents accessing document from another project', async () => {
        const docId = await createDoc(ctxA, 'docs-x-a');

        const getOther = await fetch(`${ctxB.baseUrl}/documents/${docId}`, { headers: { ...authHeader('all', 'docs-x-b'), 'x-project-id': ctxB.projectId, 'x-org-id': ctxB.orgId } });
        expect([403, 404]).toContain(getOther.status);

        const delOther = await fetch(`${ctxB.baseUrl}/documents/${docId}`, { method: 'DELETE', headers: { ...authHeader('all', 'docs-x-b'), 'x-project-id': ctxB.projectId, 'x-org-id': ctxB.orgId } });
        expect([403, 404]).toContain(delOther.status);

        // Owner project can still get & delete
        const getOwn = await fetch(`${ctxA.baseUrl}/documents/${docId}`, { headers: { ...authHeader('all', 'docs-x-a'), 'x-project-id': ctxA.projectId, 'x-org-id': ctxA.orgId } });
        expect(getOwn.status).toBe(200);
        const delOwn = await fetch(`${ctxA.baseUrl}/documents/${docId}`, { method: 'DELETE', headers: { ...authHeader('all', 'docs-x-a'), 'x-project-id': ctxA.projectId, 'x-org-id': ctxA.orgId } });
        expect([200, 204]).toContain(delOwn.status);
    });
});
