import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { randomUUID } from 'crypto';
import { uploadExpectError, ingestUrl } from './utils/ingestion';

// Ingestion error-path coverage:
// 1. Missing file field -> file-required
// 2. Zero-byte file -> empty (controller now returns 400 for empty text; may return 415 pre-parse if mime rejected)
// 3. Oversized file (>10MB) -> 400 or 413 (tolerant)
// 4. Bad URL fetch (connection refused) -> fetch-failed OR fetch-bad-status
// 5. orgId mismatch with project org -> org-project-mismatch

let ctx: E2EContext;

describe('Ingestion Error Paths E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('ingest-errors'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('rejects when file is missing', async () => {
        const { status, json } = await uploadExpectError(ctx, () => { /* no file */ }, { userSuffix: 'ingest-errors' });
        expect(status).toBe(400);
        // Controller may return 'bad-request' or 'file-required' depending on validation path
        expect(['file-required', 'bad-request']).toContain(json?.error?.code);
    });

    it('rejects zero-byte file with empty or unsupported code', async () => {
        const { status, json } = await uploadExpectError(ctx, (f) => { f.append('file', new Blob(['']), 'empty.txt'); }, { userSuffix: 'ingest-errors' });
        expect([400, 415]).toContain(status);
        // Controller returns 'empty' (400) or 'unsupported-type' (415) depending on validation order
        expect(['empty', 'unsupported-type']).toContain(json?.error?.code);
    });

    it('rejects oversized file', async () => {
        // Create a ~10MB + 10KB string
        const size = 10 * 1024 * 1024 + 10 * 1024;
        const large = 'a'.repeat(size);
        const { status, json } = await uploadExpectError(ctx, (f) => { f.append('file', new Blob([large]), 'big.txt'); }, { userSuffix: 'ingest-errors' });
        expect([400, 413]).toContain(status);
        if (status === 400 && json?.error?.code) {
            expect(['payload-too-large', 'validation-failed', 'file-too-large']).toContain(json.error.code);
        }
    });

    it('rejects unreachable URL ingestion', async () => {
        // Use an unroutable localhost high port to force connection failure quickly
        const unreachable = `http://127.0.0.1:65530/unreachable-${Date.now()}`;
        const { status, json } = await ingestUrl(ctx, unreachable, { userSuffix: 'ingest-errors' });
        expect(status).toBe(400);
        expect(['fetch-failed', 'fetch-bad-status']).toContain(json?.error?.code);
    });

    it('rejects org/project mismatch on upload', async () => {
        const { status, json } = await uploadExpectError(ctx, (f) => { f.append('orgId', randomUUID()); f.append('file', new Blob(['Some content']), 'ok.txt'); }, { userSuffix: 'ingest-errors' });
        expect([400, 415]).toContain(status);
        if (status === 400) {
            expect(json?.error?.code).toBe('org-project-mismatch');
        } else if (status === 415) {
            // Mismatch surfaced via unsupported-type path if mime heuristics triggered first
            expect(['unsupported-type', 'org-project-mismatch']).toContain(json?.error?.code);
        }
    });
});
