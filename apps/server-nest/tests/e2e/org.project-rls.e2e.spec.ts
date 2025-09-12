import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Multi-Tenancy / Org & Project scenarios (Spec Matrix section D):
 * 1. Context headers required for project-scoped endpoints (documents)
 * 2. RLS: document in project A not visible in project B
 */

describe('Multi-Tenancy / Org & Project', () => {
    let ctxA: E2EContext; // user + base org/project A
    let ctxB: E2EContext; // second project (same org) or second org scenario

    beforeAll(async () => {
        ctxA = await createE2EContext('mt-a');
        ctxB = await createE2EContext('mt-b');
    });

    beforeEach(async () => {
        await ctxA.cleanup();
        await ctxB.cleanup();
    });

    afterAll(async () => {
        await ctxA.close();
        await ctxB.close();
    });

    async function createProject(baseUrl: string, name: string, orgId: string, userSuffix: string) {
        const res = await fetch(`${baseUrl}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', userSuffix) },
            body: JSON.stringify({ name, orgId }),
        });
        if (res.status !== 201) {
            const bodyText = await res.text();
            // Provide diagnostic context for transient 400s until multi-tenancy enforcement implemented
            // eslint-disable-next-line no-console
            console.error('createProject failed', { status: res.status, bodyText });
        }
        expect(res.status).toBe(201);
        return res.json() as Promise<{ id: string; name: string; orgId: string }>;
    }

    async function createDocument(baseUrl: string, projectId: string, filename: string, userSuffix: string) {
        const res = await fetch(`${baseUrl}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', userSuffix), 'x-project-id': projectId },
            body: JSON.stringify({ filename, projectId, content: 'Hello' }),
        });
        if (res.status !== 201) {
            const bodyText = await res.text();
            // eslint-disable-next-line no-console
            console.error('createDocument failed', { status: res.status, bodyText });
        }
        expect(res.status).toBe(201);
        return res.json() as Promise<{ id: string; projectId: string }>;
    }

    it('rejects listing without x-project-id header', async () => {
        const res = await fetch(`${ctxA.baseUrl}/documents`, { headers: authHeader('all', 'mt-a') });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error?.code).toBe('bad-request');
    });

    it('documents listing scoped by x-project-id returns only that project\'s documents', async () => {
        // second project
        const projB = await createProject(ctxA.baseUrl, `Proj B ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, ctxA.orgId, 'mt-a');
        const docA = await createDocument(ctxA.baseUrl, ctxA.projectId, 'only-in-A.txt', 'mt-a');
        const docB = await createDocument(ctxA.baseUrl, projB.id, 'only-in-B.txt', 'mt-a');

        // List for project A
        const listA = await fetch(`${ctxA.baseUrl}/documents`, { headers: { ...authHeader('all', 'mt-a'), 'x-project-id': ctxA.projectId } });
        expect(listA.status).toBe(200);
        const docsA = await listA.json() as Array<{ id: string; projectId?: string }>;
        expect(docsA.some(d => d.id === docA.id)).toBe(true);
        expect(docsA.some(d => d.id === docB.id)).toBe(false);

        // List for project B
        const listB = await fetch(`${ctxA.baseUrl}/documents`, { headers: { ...authHeader('all', 'mt-a'), 'x-project-id': projB.id } });
        expect(listB.status).toBe(200);
        const docsB = await listB.json() as Array<{ id: string; projectId?: string }>;
        expect(docsB.some(d => d.id === docB.id)).toBe(true);
        expect(docsB.some(d => d.id === docA.id)).toBe(false);
    });
});
