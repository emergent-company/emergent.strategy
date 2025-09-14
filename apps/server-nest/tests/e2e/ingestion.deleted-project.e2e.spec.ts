import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { OrgTracker } from './utils/org-tracker';

// E2E spec: ingestion attempts after project deletion should yield 400 (project-not-found)

describe('Ingestion after project deletion', () => {
    let ctx: E2EContext;
    let orgId: string;
    let projectId: string;
    let tracker: OrgTracker;

    beforeAll(async () => {
        ctx = await createE2EContext('ingest-del');
        tracker = new OrgTracker(ctx.baseUrl, 'ingest-del');
        // Create org via tracker
        orgId = await tracker.create(`Ingest Org ${Date.now()}`);
        // Create project
        const projRes = await fetch(`${ctx.baseUrl}/projects`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': 'Bearer e2e-all' },
            body: JSON.stringify({ name: `Ingest Project ${Date.now()}`, orgId })
        });
        expect(projRes.status).toBe(201);
        const proj = await projRes.json();
        projectId = proj.id;
        // Delete org to cascade project removal
        const delOrg = await tracker.delete(orgId);
        expect(delOrg).toBe(200);
    });

    afterAll(async () => {
        // Best-effort cleanup (org already deleted here, but handles future pattern consistency)
        if (tracker) await tracker.cleanup();
        await ctx.close();
    });

    it('returns 400 when ingesting URL for deleted project', async () => {
        const ingestRes = await fetch(`${ctx.baseUrl}/ingest/url`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': 'Bearer e2e-all' },
            body: JSON.stringify({ url: 'https://example.com/does-not-matter.txt', projectId, orgId })
        });
        expect(ingestRes.status).toBe(400);
        const body = await ingestRes.json();
        expect(body?.error?.code).toBeDefined();
    });
});
