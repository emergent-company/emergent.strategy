import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf, expectDisjointIds } from './utils';

/**
 * Documents Cursor Pagination Stress E2E
 * Inserts a larger batch (default 55 docs) then walks pages with a small limit (5) verifying:
 *  - No duplicate ids across any page
 *  - Every returned page (except final) has the full limit size
 *  - Pagination terminates (no infinite loop) and total count matches inserts
 *  - Ordering remains strictly monotonic by created_at DESC,id DESC (approx by ensuring earlier page ids never reappear)
 *
 * Env overrides:
 *  E2E_CURSOR_STRESS_DOCS=80   -> change document count
 *  E2E_CURSOR_STRESS_LIMIT=7   -> change page size
 */

let ctx: E2EContext;

function envInt(name: string, def: number): number {
    const raw = process.env[name];
    if (!raw) return def;
    const n = Number(raw); return Number.isFinite(n) && n > 0 ? n : def;
}

async function createDoc(ctx: E2EContext, i: number) {
    const res = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader('all', 'docs-cursor-stress'), 'x-project-id': ctx.projectId },
        body: JSON.stringify({ filename: `stress-${i}.txt`, content: `Stress doc ${i}`, projectId: ctx.projectId })
    });
    expectStatusOneOf(res.status, [200, 201], 'create doc stress');
}

describe('Documents Cursor Pagination Stress E2E', () => {
    const TOTAL = envInt('E2E_CURSOR_STRESS_DOCS', 55);
    const LIMIT = envInt('E2E_CURSOR_STRESS_LIMIT', 5);

    beforeAll(async () => { ctx = await createE2EContext('docs-cursor-stress'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('walks all pages without overlap and full coverage', async () => {
        for (let i = 0; i < TOTAL; i++) await createDoc(ctx, i);
        const seen = new Set<string>();
        let cursor: string | null = null;
        let pages = 0;
        let totalFetched = 0;
        do {
            const url = `${ctx.baseUrl}/documents?limit=${LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
            const res = await fetch(url, { headers: { ...authHeader('all', 'docs-cursor-stress'), 'x-project-id': ctx.projectId } });
            expect(res.status).toBe(200);
            const next = res.headers.get('x-next-cursor');
            const docs = await res.json();
            expect(Array.isArray(docs)).toBe(true);
            if (next) {
                // Intermediate pages should be fully populated.
                expect(docs.length).toBe(LIMIT);
            } else {
                // Final page must be non-empty and <= LIMIT.
                expect(docs.length).toBeGreaterThan(0);
                expect(docs.length).toBeLessThanOrEqual(LIMIT);
            }
            for (const d of docs) {
                expect(seen.has(d.id)).toBe(false);
                seen.add(d.id);
            }
            totalFetched += docs.length;
            cursor = next;
            pages++;
            // Safety guard against infinite loop
            expect(pages).toBeLessThanOrEqual(Math.ceil(TOTAL / LIMIT) + 2);
        } while (cursor);
        // Strong assertion: all docs fetched. If mismatch, provide diagnostics.
        if (totalFetched !== TOTAL || seen.size !== TOTAL) {
            // eslint-disable-next-line no-console
            console.error(`[cursor-stress] mismatch totalFetched=${totalFetched} seen=${seen.size} expected=${TOTAL}`);
        }
        expect(totalFetched).toBe(TOTAL);
        expect(seen.size).toBe(TOTAL);
    });
});
