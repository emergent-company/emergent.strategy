import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';

// NOTE: This test exercises the happy path for multipart ingestion, then verifies:
// 1. Document appears in /documents
// 2. Chunks returned from /chunks?documentId=... with embedding presence flag
// 3. Idempotent ingestion (same content -> alreadyExists and no new chunks)

let ctx: BootstrappedApp;

// Helper to create a multipart/form-data body manually without external deps
function buildMultipart(fields: Record<string, string>, fileField: { name: string; filename: string; content: string; contentType: string }) {
    const boundary = '----VitestBoundary' + Math.random().toString(16).slice(2);
    const parts: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
    }
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.contentType}\r\n\r\n${fileField.content}\r\n`);
    parts.push(`--${boundary}--\r\n`);
    const body = parts.join('');
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('E2E: ingestion + chunks listing', () => {
    beforeAll(async () => { ctx = await bootstrapTestApp(); });
    afterAll(async () => { await ctx.close(); });

    it('ingests a file, lists document & chunks, verifies embeddings presence and idempotency', async () => {
        // Fetch a project to attach the document to (schema seeds a default one)
        const projectsRes = await fetch(`${ctx.baseUrl}/projects`);
        expect(projectsRes.status).toBe(200);
        const projects = await projectsRes.json();
        expect(Array.isArray(projects) && projects.length > 0).toBe(true);
        const projectId = projects[0].id;

        const uniqueTag = `uid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const fileContent = `# Title\\n\\nUnique:${uniqueTag}\\n\\nThis is a short test document that will be chunked. `.repeat(10); // uniqueness avoids dedup with other tests
        const { body, contentType } = buildMultipart({ filename: 'demo.md', projectId }, { name: 'file', filename: 'demo.md', content: fileContent, contentType: 'text/markdown' });

        // First ingestion
        const res1 = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
        expect([200, 201]).toContain(res1.status);
        const json1 = await res1.json();
        expect(json1.documentId).toBeDefined();
        expect(json1.alreadyExists).toBe(false);
        expect(json1.chunks).toBeGreaterThan(0);
        const documentId: string = json1.documentId;

        // Documents list should contain the document with reported chunk count
        const docsRes = await fetch(`${ctx.baseUrl}/documents?limit=10`);
        const docsBodyText = await docsRes.text();
        if (docsRes.status !== 200) {
            // eslint-disable-next-line no-console
            console.log('DEBUG documents list status', docsRes.status, 'body', docsBodyText);
        }
        expect(docsRes.status).toBe(200);
        const docs = JSON.parse(docsBodyText || '[]');
        const found = docs.find((d: any) => d.id === documentId);
        expect(found).toBeTruthy();
        expect(found.chunks).toBe(json1.chunks);

        // Chunks list filtered by documentId
        const chunksRes = await fetch(`${ctx.baseUrl}/chunks?documentId=${documentId}`);
        expect(chunksRes.status).toBe(200);
        const chunks = await chunksRes.json();
        expect(Array.isArray(chunks)).toBe(true);
        expect(chunks.length).toBe(json1.chunks);
        // Each chunk should have consistent structure
        for (const c of chunks) {
            expect(c.documentId).toBe(documentId);
            expect(Number.isInteger(c.index)).toBe(true);
            expect(typeof c.size).toBe('number');
            expect(typeof c.hasEmbedding).toBe('boolean');
        }

        // Idempotent second ingestion (same content -> alreadyExists true, no chunks added)
        const res2 = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
        expect([200, 201]).toContain(res2.status);
        const json2 = await res2.json();
        expect(json2.documentId).toBe(documentId);
        expect(json2.alreadyExists).toBe(true);
        expect(json2.chunks).toBe(0);
    });
});
