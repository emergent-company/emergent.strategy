import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Validates content-hash dedup (same file twice in same project) and cross-project independence.
// Assumptions (adjust if implementation differs):
// - Upload endpoint: POST /ingest/upload (multipart) with projectId, file (text/plain) and optional filename.
// - On duplicate within same project: server returns existing document id (status 200) or 409.
// - Across different projects: identical file creates a new document (distinct id).
// The test accepts either 200/201 for first ingestion and (200 returning same id OR 409) for duplicate.

let ctx: E2EContext;
let otherCtx: E2EContext; // second project/org for cross-project test

interface IngestResponse { documentId?: string; id?: string; chunks?: number; }

async function upload(ctx: E2EContext, content: string, label: string) {
    const form = new FormData();
    form.append('projectId', ctx.projectId);
    form.append('filename', label + '.txt');
    form.append('file', new Blob([content], { type: 'text/plain' }), label + '.txt');
    const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
        method: 'POST',
        headers: { ...authHeader('all', label) },
        body: form as any,
    });
    const json = (await res.json()) as IngestResponse;
    return { status: res.status, json };
}

describe('Documents Dedup & Cross-Project Independence E2E', () => {
    const TEXT = 'Dedup test content A\nLine two.';

    beforeAll(async () => {
        ctx = await createE2EContext('dedup-a');
        otherCtx = await createE2EContext('dedup-b');
    });
    beforeEach(async () => { await ctx.cleanup(); await otherCtx.cleanup(); });
    afterAll(async () => { await ctx.close(); await otherCtx.close(); });

    it('deduplicates identical file in same project', async () => {
        const first = await upload(ctx, TEXT, 'dedup');
        expectStatusOneOf(first.status, [200, 201], 'dedup first');
        const firstId = first.json.documentId || first.json.id;
        expect(firstId).toBeTruthy();

        const second = await upload(ctx, TEXT, 'dedup');
        // Accept either explicit conflict or same id returned.
        expect([200, 201, 409]).toContain(second.status);
        if (second.status !== 409) {
            const secondId = second.json.documentId || second.json.id;
            expect(secondId).toBe(firstId);
        }
    });

    it('creates a new document with identical content in a different project', async () => {
        const up1 = await upload(ctx, TEXT, 'cross');
        expectStatusOneOf(up1.status, [200, 201], 'dedup up1');
        const id1 = up1.json.documentId || up1.json.id;

        const up2 = await upload(otherCtx, TEXT, 'cross');
        expectStatusOneOf(up2.status, [200, 201], 'dedup up2');
        const id2 = up2.json.documentId || up2.json.id;

        expect(id1).not.toBe(id2);
    });
});
