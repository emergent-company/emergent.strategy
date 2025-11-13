import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';
import { Pool } from 'pg';

// Validates that posting a long document results in multiple chunk rows in kb.chunks.
// We don't assert exact count (depends on chunker config) but require >=2 for multi-sentence input.

let ctx: E2EContext;
// Force rebuild so minimal schema picks up latest columns (e.g., content_hash) and avoid
// stale prior minimal schema created before patches.
process.env.FORCE_E2E_SCHEMA_RESET = 'true';
let pool: Pool;

const LONG_TEXT = `Chunking ensures documents are split.\n\n` +
    Array.from({ length: 8 }, (_, i) => `Paragraph ${i + 1}: hybrid vector search test content sentence to inflate size.`).join('\n\n');

describe('Document Chunk Generation E2E', () => {
    beforeAll(async () => {
        ctx = await createE2EContext('chunks-gen');
        pool = new Pool({
            host: process.env.POSTGRES_HOST || 'localhost',
            port: Number(process.env.POSTGRES_PORT || 5432),
            user: process.env.POSTGRES_USER || 'spec',
            password: process.env.POSTGRES_PASSWORD || 'spec',
            database: process.env.POSTGRES_DB || 'spec'
        });
    });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await pool.end(); await ctx.close(); });

    it('creates multiple chunks for a long document', async () => {
        // Use ingestion upload route to exercise chunker logic
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        form.append('filename', 'long.txt');
        // Build a text blob large enough for >1 chunk (chunker maxLen=1200). Duplicate LONG_TEXT.
        const bigText = LONG_TEXT.repeat(5);
        form.append('file', new Blob([bigText], { type: 'text/plain' }), 'long.txt');
        const ingestRes = await fetch(`${ctx.baseUrl}/ingest/upload`, {
            method: 'POST',
            headers: { ...authHeader('all', 'chunks-gen') },
            body: form as any
        });
        expectStatusOneOf(ingestRes.status, [200, 201], 'chunking ingest');
        const ingestJson = await ingestRes.json();
        const docId = ingestJson.documentId;
        expect(docId).toBeTruthy();
        // Query chunks count
        const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text as count FROM kb.chunks WHERE document_id = $1', [docId]);
        const count = Number(rows[0].count);
        expect(count).toBeGreaterThanOrEqual(2);
    });
});
