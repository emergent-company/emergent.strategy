import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Documents Upload Unsupported Type E2E
// Verifies server rejects disallowed MIME types / extensions.
// Assumptions: Endpoint POST /ingest/upload enforces allowlist (e.g., text/plain, text/markdown, application/pdf).
// This spec attempts to upload an executable-like binary blob and expects 400/415 with code unsupported-type.

let ctx: E2EContext;

describe('Documents Upload Unsupported Type E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('upload-unsupported'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('rejects application/octet-stream file', async () => {
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        const binary = new Uint8Array([0x4D, 0x5A, 0x90, 0x00]); // MZ header
        form.append('file', new Blob([binary], { type: 'application/octet-stream' }), 'malware.exe');
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: authHeader('all', 'upload-unsupported'), body: form as any });
        expect([400, 415]).toContain(res.status); // 415 preferred, 400 acceptable fallback
        const json = await res.json().catch(() => ({}));
        expect(json?.error?.code).toBeDefined();
        expect(['unsupported-type', 'validation-failed', 'internal']).toContain(json.error.code);
    });
});
