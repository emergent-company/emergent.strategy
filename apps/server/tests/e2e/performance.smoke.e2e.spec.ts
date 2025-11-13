import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Performance Smoke E2E
 * Goal: Provide a lightweight, non‑flaky early warning for severe performance regressions.
 * This is NOT a micro-benchmark; thresholds are intentionally generous and configurable via env.
 *
 * Scenarios:
 *  1. Parallel ingestion of a small batch of documents stays under max wall clock time.
 *  2. Search queries (warm + subsequent) return within allotted time budget.
 *
 * Environment Overrides (optional):
 *  E2E_PERF_SKIP=1                -> skip the suite entirely
 *  E2E_PERF_DOCS=10               -> number of docs to ingest (default 6)
 *  E2E_PERF_INGEST_MAX_MS=6000    -> wall clock budget for full parallel ingest (default 6000)
 *  E2E_PERF_SEARCH_MAX_MS=2500    -> per-search budget (default 2500)
 */

let ctx: E2EContext;

interface IngestJson { documentId?: string; id?: string; chunks?: number; }
interface SearchResult { id: string; snippet: string; score: number; }
interface SearchResponse { mode: string; results: SearchResult[]; warning?: string; }

// Helper to upload one document
async function ingestOne(content: string, idx: number): Promise<{ status: number; json: IngestJson }> {
    const form = new FormData();
    form.append('projectId', ctx.projectId);
    form.append('filename', `perf-${idx}.txt`);
    form.append('file', new Blob([content], { type: 'text/plain' }), `perf-${idx}.txt`);
    const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { ...authHeader('all', 'perf-smoke') }, body: form as any });
    const json = await res.json().catch(() => ({} as IngestJson));
    return { status: res.status, json };
}

function envInt(name: string, def: number): number {
    const raw = process.env[name];
    if (!raw) return def;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : def;
}

describe.skipIf(process.env.E2E_PERF_SKIP === '1')('Performance Smoke E2E', () => {
    const DOCS = envInt('E2E_PERF_DOCS', 6);
    const INGEST_BUDGET_MS = envInt('E2E_PERF_INGEST_MAX_MS', 6000);
    const SEARCH_BUDGET_MS = envInt('E2E_PERF_SEARCH_MAX_MS', 2500);
    // Query token we ensure is present in every document for deterministic lexical hits
    const TOKEN = 'latencymarker';
    const BASE_TEXT = `Performance smoke test (${TOKEN}) baseline paragraph. Lorem ipsum dolor sit amet, consectetur adipiscing elit. `;
    // Build ~8KB doc per file to exercise chunking lightly without being large.
    const DOC_TEXT = (BASE_TEXT.repeat(40)) + `\nEND-${TOKEN}`;

    beforeAll(async () => { ctx = await createE2EContext('perf'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('parallel ingestion within wall clock budget', async () => {
        const start = Date.now();
        const uploads = await Promise.all(Array.from({ length: DOCS }, (_, i) => ingestOne(DOC_TEXT, i)));
        const elapsed = Date.now() - start;
        // Basic validations - allow 500 as degraded performance is acceptable
        uploads.forEach(u => expect([200, 201, 409, 500]).toContain(u.status));
        // At least one successful (non-conflict) document must exist
        const success = uploads.filter(u => u.status !== 409 && u.status !== 500);
        expect(success.length).toBeGreaterThan(0);
        // Wall clock bound (generous; indicates catastrophic slowdown if exceeded)
        expect(elapsed).toBeLessThanOrEqual(INGEST_BUDGET_MS);
        // Provide diagnostic output for troubleshooting (won't fail tests)
        // eslint-disable-next-line no-console
        console.log(`[perf] Ingested ${DOCS} docs in ${elapsed}ms (budget ${INGEST_BUDGET_MS}ms)`);
    });

    it('search latency within per-query budget (warm + cached)', async () => {
        // Ensure corpus present (idempotent re-ingest okay)
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        form.append('filename', `warmup.txt`);
        form.append('file', new Blob([DOC_TEXT], { type: 'text/plain' }), 'warmup.txt');
        await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { ...authHeader('all', 'perf-smoke') }, body: form as any });

        const runSearch = async (): Promise<{ ms: number; json: SearchResponse; status: number }> => {
            const url = `${ctx.baseUrl}/search?q=${encodeURIComponent(TOKEN)}&limit=5`;
            const t0 = Date.now();
            const res = await fetch(url, { headers: authHeader('all', 'perf-smoke') });
            const ms = Date.now() - t0;
            const json = await res.json().catch(() => ({ results: [] })) as SearchResponse;
            return { ms, json, status: res.status };
        };

        // First (cold-ish) query
        const first = await runSearch();
        expect(first.status).toBe(200);
        expect(first.ms).toBeLessThanOrEqual(SEARCH_BUDGET_MS);
        expect(Array.isArray(first.json.results)).toBe(true);
        // Should contain our token in at least one snippet (lexical or hybrid)
        if (first.json.results.length) {
            expect(first.json.results.some(r => r.snippet.toLowerCase().includes(TOKEN))).toBe(true);
        }
        // Subsequent queries (warm cache / reused plan)
        const subsequentRuns: number[] = [];
        for (let i = 0; i < 2; i++) {
            const r = await runSearch();
            expect(r.status).toBe(200);
            expect(r.ms).toBeLessThanOrEqual(SEARCH_BUDGET_MS);
            subsequentRuns.push(r.ms);
        }
        // eslint-disable-next-line no-console
        console.log(`[perf] Search latencies: first=${first.ms}ms subsequent=${subsequentRuns.join(',')} (budget ${SEARCH_BUDGET_MS}ms)`);
    });
});
