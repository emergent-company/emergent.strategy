import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { OrgTracker } from './utils/org-tracker';

// New E2E spec verifying that deleting an org cascades to projects, documents, chunks, chat artifacts
// Relies on org->projects ON DELETE CASCADE plus existing cascades from projects downward

describe('Organization Cascade Delete', () => {
    let ctx: E2EContext;
    let orgId: string;
    let projectId: string;
    let tracker: OrgTracker;

    beforeAll(async () => {
        ctx = await createE2EContext('org-del');
        tracker = new OrgTracker(ctx.baseUrl, 'org-del');
        orgId = await tracker.create(`Cascade Org ${Date.now()}`);
        // Create project under new org
        const projRes = await fetch(`${ctx.baseUrl}/projects`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': 'Bearer e2e-all' },
            body: JSON.stringify({ name: `Cascade Project ${Date.now()}`, orgId })
        });
        expect(projRes.status).toBe(201);
        const proj = await projRes.json();
        projectId = proj.id;
        // Seed one document to assert downstream cascade
        const docRes = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-project-id': projectId,
                'authorization': 'Bearer e2e-all'
            },
            body: JSON.stringify({ filename: 'org-cascade.txt', content: 'Hello Cascade' })
        });
        expect(docRes.status).toBe(201);
        const doc = await docRes.json();
    });

    afterAll(async () => { if (tracker) await tracker.cleanup(); await ctx.close(); });

    it('deletes organization and cascades all dependent rows', async () => {
        // Delete the org
        const delRes = await fetch(`${ctx.baseUrl}/orgs/${orgId}`, {
            method: 'DELETE',
            headers: { 'authorization': 'Bearer e2e-all' }
        });
        expect(delRes.status).toBe(200);

        // Projects should be gone
        const projList = await fetch(`${ctx.baseUrl}/projects?orgId=${orgId}`, {
            headers: { 'authorization': 'Bearer e2e-all' }
        });
        expect(projList.status).toBe(200);
        const projects = await projList.json();
        expect(Array.isArray(projects)).toBe(true);
        expect(projects.length).toBe(0);

        // Documents listing for deleted project's id should yield empty (404 not expected; list filters by project header)
        const docsRes = await fetch(`${ctx.baseUrl}/documents`, {
            headers: { 'x-project-id': projectId, 'authorization': 'Bearer e2e-all' }
        });
        expect(docsRes.status).toBe(200); // service returns list [] when project id not found join-wise
        const docs = await docsRes.json();
        expect(Array.isArray(docs)).toBe(true);
        expect(docs.length).toBe(0);

        // Attempt to create a document under deleted project should deterministically 400 (bad-request unknown projectId)
        const createDoc = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-project-id': projectId, 'authorization': 'Bearer e2e-all' },
            body: JSON.stringify({ filename: 'should-fail.txt', content: 'x' })
        });
        const status = createDoc.status;
        expect(status).toBe(400);
    });
});
