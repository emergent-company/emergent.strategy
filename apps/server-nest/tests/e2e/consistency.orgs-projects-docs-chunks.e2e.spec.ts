import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { deleteProject } from './utils/project-cleanup';

/**
 * Documents ↔ Chunks Consistency E2E
 * Goal: For every org the user belongs to, iterate through each project and ensure:
 *  1. Documents listing (scoped by x-project-id) returns created / ingested documents
 *  2. Chunks fetched per document all reference a document present in the listing
 *  3. No chunk exists whose documentId is absent from the documents listing for that project
 *
 * Strategy:
 *  - Use a unique user suffix to isolate artifacts
 *  - Create a second project in the base org (so we have >1 project to iterate)
 *  - Ingest a small text file into each project via /ingest/upload (ensures chunk rows are created)
 *  - List documents for each project and then fetch chunks for each documentId
 *  - Assert referential integrity at the API layer
 */

describe('Consistency: Orgs → Projects → Documents ↔ Chunks', () => {
    let ctx: E2EContext;
    const USER_SUFFIX = 'docs-consistency';

    beforeAll(async () => { ctx = await createE2EContext(USER_SUFFIX); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    async function createProject(name: string) {
        const res = await fetch(`${ctx.baseUrl}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', USER_SUFFIX) },
            body: JSON.stringify({ name, orgId: ctx.orgId }),
        });
        if (res.status !== 201) {
            const txt = await res.text();
            // eslint-disable-next-line no-console
            console.error('[consistency] createProject failed', { status: res.status, body: txt });
        }
        expect(res.status).toBe(201);
        return res.json() as Promise<{ id: string; name: string; orgId: string }>;
    }

    async function ingestSimpleDoc(projectId: string, index: number) {
        const form = new FormData();
        const content = `E2E Consistency Doc ${index} for project ${projectId} at ${Date.now()}\n`;
        form.append('file', new Blob([content], { type: 'text/plain' }), `consistency-${index}.txt`);
        form.append('projectId', projectId);
        form.append('orgId', ctx.orgId);
        // Optional filename duplicate to validate override path
        form.append('filename', `consistency-${index}.txt`);

        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
            method: 'POST',
            headers: { ...authHeader('all', USER_SUFFIX) }, // do NOT set Content-Type manually (boundary handled by fetch)
            body: form as any,
        });
        if (![200, 201].includes(res.status)) {
            const txt = await res.text();
            // eslint-disable-next-line no-console
            console.error('[consistency] ingest upload failed', { status: res.status, body: txt });
        }
        expect([200, 201]).toContain(res.status);
        const body = await res.json() as { documentId: string; chunks: number; alreadyExists: boolean };
        expect(body.documentId).toMatch(/[0-9a-f-]{36}/);
        expect(body.chunks).toBeGreaterThan(0); // ingestion should create at least one chunk
        return body.documentId;
    }

    async function listProjectsForOrg(orgId: string) {
        const res = await fetch(`${ctx.baseUrl}/projects?orgId=${orgId}&limit=500`, { headers: authHeader('all', USER_SUFFIX) });
        expect(res.status).toBe(200);
        return res.json() as Promise<Array<{ id: string; name: string; orgId: string }>>;
    }

    async function listDocuments(projectId: string) {
        const res = await fetch(`${ctx.baseUrl}/documents?limit=500`, { headers: { ...authHeader('all', USER_SUFFIX), 'x-project-id': projectId } });
        expect(res.status).toBe(200);
        return res.json() as Promise<Array<{ id: string; projectId?: string; chunks?: number; name: string }>>;
    }

    async function listChunksForDocument(documentId: string) {
        const res = await fetch(`${ctx.baseUrl}/chunks?documentId=${documentId}`, { headers: authHeader('all', USER_SUFFIX) });
        expect(res.status).toBe(200);
        return res.json() as Promise<Array<{ id: string; documentId: string; index: number; text: string }>>;
    }

    it('verifies every chunk references a listed document for each project in each org', async () => {
        // Arrange: create an additional project so iteration spans multiple projects.
        const extraProject = await createProject(`Consistency Project ${Date.now()}`);

        // Determine org membership (currently context org only, but loop prepared for future multi-org membership)
        const orgsRes = await fetch(`${ctx.baseUrl}/orgs`, { headers: authHeader('all', USER_SUFFIX) });
        expect(orgsRes.status).toBe(200);
        const orgs = await orgsRes.json() as Array<{ id: string; name: string }>;
        expect(orgs.some(o => o.id === ctx.orgId)).toBe(true);

        for (const org of orgs.filter(o => o.id === ctx.orgId)) { // scope to orgs user belongs to
            const projects = await listProjectsForOrg(org.id);
            // Sanity: ensure both the base project and the new project are present
            expect(projects.some(p => p.id === ctx.projectId)).toBe(true);
            expect(projects.some(p => p.id === extraProject.id)).toBe(true);

            for (const project of projects.filter(p => [ctx.projectId, extraProject.id].includes(p.id))) {
                // Ingest two docs per project (idempotent within cleanup lifecycle)
                const docIds: string[] = [];
                for (let i = 0; i < 2; i++) {
                    docIds.push(await ingestSimpleDoc(project.id, i));
                }

                // List documents with project scope header
                const docs = await listDocuments(project.id);
                const docIdSet = new Set(docs.map(d => d.id));
                // Expect newly ingested doc ids present
                for (const id of docIds) {
                    if (!docIdSet.has(id)) {
                        // eslint-disable-next-line no-console
                        console.error('[consistency] missing ingested document in listing', { projectId: project.id, missingId: id, docs });
                    }
                    expect(docIdSet.has(id)).toBe(true);
                }

                // For each document, list chunks and verify referential integrity
                const allChunkDocIds = new Set<string>();
                for (const d of docs) {
                    const chunks = await listChunksForDocument(d.id);
                    for (const c of chunks) {
                        if (c.documentId !== d.id) {
                            // eslint-disable-next-line no-console
                            console.error('[consistency] chunk documentId mismatch', { chunk: c, expectedDoc: d.id });
                        }
                        expect(c.documentId).toBe(d.id);
                        allChunkDocIds.add(c.documentId);
                    }
                }
                // No chunk should reference a document absent from document listing
                for (const chunkDocId of allChunkDocIds) {
                    expect(docIdSet.has(chunkDocId)).toBe(true);
                }
            }
        }

        // Cleanup: delete the extra project and the context project to avoid lingering test rows
        const delExtraStatus = await deleteProject(ctx.baseUrl, extraProject.id, USER_SUFFIX);
        expect([200, 404]).toContain(delExtraStatus);
        const delCtxStatus = await deleteProject(ctx.baseUrl, ctx.projectId, USER_SUFFIX);
        expect([200, 404]).toContain(delCtxStatus);
    });
});
