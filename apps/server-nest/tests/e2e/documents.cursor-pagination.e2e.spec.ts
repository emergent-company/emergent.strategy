import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf, expectDisjointIds } from './utils';

// Validates cursor-based pagination contract:
//  - Request 1: /documents?limit=3 returns 3 items + x-next-cursor
//  - Request 2: /documents?limit=3&cursor=<cursor> returns next distinct 3 (no overlap)
//  - Continues until cursor header absent
//  - Ensures stable ordering (created_at DESC, id DESC) by asserting no duplicates across pages
//  - All requests require x-project-id header (enforced by controller)

let ctx: E2EContext;

async function createDoc(ctx: E2EContext, i: number) {
    const res = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader('all', 'docs-cursor'), 'x-project-id': ctx.projectId },
        body: JSON.stringify({ filename: `cursor-${i}.txt`, content: `Cursor doc ${i}`, projectId: ctx.projectId })
    });
    expectStatusOneOf(res.status, [200, 201], 'create doc cursor');
}

describe('Documents Cursor Pagination E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('docs-cursor'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('paginates via x-next-cursor header without overlap', async () => {
        // Create 8 documents so we get 3 + 3 + 2 pages
        for (let i = 0; i < 8; i++) await createDoc(ctx, i);

        const allIds: string[] = [];
        let cursor: string | null = null;
        let page = 0;
        do {
            const url = `${ctx.baseUrl}/documents?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
            const res = await fetch(url, { headers: { ...authHeader('all', 'docs-cursor'), 'x-project-id': ctx.projectId } });
            expect(res.status).toBe(200);
            const next = res.headers.get('x-next-cursor');
            const docs = await res.json();
            expect(Array.isArray(docs)).toBe(true);
            // Page size expectations: first two pages exactly 3, last page <= 3
            if (page < 2) expect(docs.length).toBe(3); else expect(docs.length).toBeGreaterThan(0);
            // Ensure no overlap
            if (allIds.length) {
                // Validate disjointness from previous aggregate set; if violation occurs fail explicitly.
                expectDisjointIds(allIds.map(id => ({ id })), docs);
            }
            for (const d of docs) allIds.push(d.id);
            cursor = next;
            page++;
        } while (cursor);
        expect(allIds.length).toBe(8);
    });
});
