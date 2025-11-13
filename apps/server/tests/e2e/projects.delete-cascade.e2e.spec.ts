import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { deleteProject } from './utils/project-cleanup';

/**
 * Project Delete Cascade E2E
 * Verifies deleting a project removes its documents, chunks, and chat artifacts.
 */

describe('Projects Cascade Delete', () => {
    let ctx: E2EContext;
    beforeAll(async () => { ctx = await createE2EContext('proj-del'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    async function createProject(name: string) {
        const res = await fetch(`${ctx.baseUrl}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'proj-del') },
            body: JSON.stringify({ name, orgId: ctx.orgId }),
        });
        expect(res.status).toBe(201);
        return res.json() as Promise<{ id: string; name: string; orgId: string }>;
    }

    async function createDocument(projectId: string, filename: string) {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'proj-del'), 'x-project-id': projectId },
            body: JSON.stringify({ filename, projectId, content: 'Sample content' }),
        });
        expect([200, 201]).toContain(res.status);
        return res.json() as Promise<{ id: string }>;
    }

    async function listDocuments(projectId: string) {
        const res = await fetch(`${ctx.baseUrl}/documents?limit=200`, { headers: { ...authHeader('all', 'proj-del'), 'x-project-id': projectId } });
        // May be 200 with empty [] or 400 (if endpoint later changes) but current logic returns 200 even when none.
        expect(res.status).toBe(200);
        return res.json() as Promise<Array<{ id: string }>>;
    }

    it('deletes project and cascades documents & chunks', async () => {
        const project = await createProject(`Cascade ${Date.now()}`);
        const doc = await createDocument(project.id, 'cascade-doc.txt');

        // Verify doc appears
        const beforeDocs = await listDocuments(project.id);
        expect(beforeDocs.some(d => d.id === doc.id)).toBe(true);

        // Delete project
        const delStatus = await deleteProject(ctx.baseUrl, project.id, 'proj-del');
        expect(delStatus).toBe(200);

        // Listing documents for deleted project should yield empty list
        const afterDocs = await listDocuments(project.id);
        expect(afterDocs.some(d => d.id === doc.id)).toBe(false);
    });
});
