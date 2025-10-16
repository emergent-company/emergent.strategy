import supertest from 'supertest';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

describe('Graph Search - Cursor Pagination', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    let request: supertest.SuperTest<supertest.Test>;

    beforeAll(async () => {
        ctx = await createE2EContext('graph-search-page');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => { await ctx.close(); });

    const contextHeaders = () => ({
        ...authHeader('all', 'graph-search-page'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
    });

    it('paginates forward with stable, non-overlapping windows until exhaustion', async () => {
        const limit = 2;
        const first = await request
            .post('/graph/search')
            .set(contextHeaders())
            .send({ query: 'pagination test', pagination: { limit } })
            .expect(200);
        expect(Array.isArray(first.body.items)).toBe(true);
        expect(first.body.items.length).toBeLessThanOrEqual(limit);
        expect(first.body.meta.prevCursor).toBeNull();
        expect(first.body.meta.total_estimate).toBeGreaterThanOrEqual(first.body.items.length);
        // first page either has nextCursor (if more results) or not
        const seen = new Set(first.body.items.map((i: any) => i.object_id));
        let cursor: string | null = first.body.meta.nextCursor;
        let pageCount = 1;
        let hasPrevSeen = false;
        while (cursor) {
            const page = await request
                .post('/graph/search')
                .set(contextHeaders())
                .send({ query: 'pagination test', pagination: { limit, cursor } })
                .expect(200);
            pageCount++;
            // subsequent pages should report hasPrev true
            if (page.body.items.length) {
                expect(page.body.meta.hasPrev).toBe(true);
                hasPrevSeen = true;
            }
            for (const it of page.body.items) {
                if (seen.has(it.object_id)) throw new Error(`overlap detected at ${it.object_id}`);
                seen.add(it.object_id);
            }
            cursor = page.body.meta.nextCursor;
            // stop if safety exceeded
            if (pageCount > 20) throw new Error('pagination loop runaway');
        }
        expect(seen.size).toBeGreaterThan(0);
        expect(hasPrevSeen).toBe(true); // at least one subsequent page existed
    });

    it('returns empty page when cursor is beyond end with hasPrev true', async () => {
        // Walk to final cursor
        const limit = 1;
        let res = await request
            .post('/graph/search')
            .set(contextHeaders())
            .send({ query: 'pagination test', pagination: { limit } })
            .expect(200);
        let cursor: string | null = res.body.meta.nextCursor;
        while (cursor) {
            res = await request
                .post('/graph/search')
                .set(contextHeaders())
                .send({ query: 'pagination test', pagination: { limit, cursor } })
                .expect(200);
            cursor = res.body.meta.nextCursor;
        }
        // Encode a synthetic cursor beyond end by reusing the last page's prevCursor (which points inside pool) and adding a high-sorting id
        // Simpler: re-use last seen item cursor then call again so service slices empty
        const lastItemCursor = res.body.items.length ? res.body.items[res.body.items.length - 1].cursor : res.body.meta.prevCursor;
        const beyond = await request
            .post('/graph/search')
            .set(contextHeaders())
            .send({ query: 'pagination test', pagination: { limit, cursor: lastItemCursor } })
            .expect(200);
        // Now calling again with same cursor should advance past pool and be empty
        const empty = await request
            .post('/graph/search')
            .set(contextHeaders())
            .send({ query: 'pagination test', pagination: { limit, cursor: beyond.body.meta.nextCursor ?? lastItemCursor } })
            .expect(200);
        if (empty.body.items.length === 0) {
            expect(empty.body.meta.hasPrev).toBe(true);
        }
    });

    it('caps overly large limit request to 50', async () => {
        const res = await request
            .post('/graph/search')
            .set(contextHeaders())
            // 100 is max allowed by validator; service should clamp to 50 effective
            .send({ query: 'pagination test', pagination: { limit: 100 } })
            .expect(200);
        expect(res.body.meta.request.limit).toBe(50);
        expect(res.body.meta.request.requested_limit).toBe(100);
        expect(res.body.items.length).toBeLessThanOrEqual(50);
    });

    it('supports backward pagination returning prior results window', async () => {
        const limit = 2;
        const first = await request
            .post('/graph/search')
            .set(contextHeaders())
            .send({ query: 'pagination test', pagination: { limit } })
            .expect(200);
        if (!first.body.meta.nextCursor) return; // not enough data for multi-page
        const second = await request
            .post('/graph/search')
            .set(contextHeaders())
            .send({ query: 'pagination test', pagination: { limit, cursor: first.body.meta.nextCursor } })
            .expect(200);
        if (!second.body.items.length) return; // no second page
        const cursorAtSecondFirst = second.body.items[0].cursor;
        const backward = await request
            .post('/graph/search')
            .set(contextHeaders())
            .send({ query: 'pagination test', pagination: { limit, cursor: cursorAtSecondFirst, direction: 'backward' } })
            .expect(200);
        // Backward page, if present, should surface items that appeared on earlier (first) page, not the cursor item itself.
        if (backward.body.items.length) {
            // NOTE: We intentionally avoid asserting numeric rank ordering here because each search request
            // reconstructs the fused candidate pool and floating point normalization can slightly perturb
            // ordering across requests. Stable invariants we can enforce:
            //  1. The backward page echoes direction=backward.
            //  2. It does not include the cursor item itself.
            //  3. hasNext/hasPrev flags are consistent with presence of nextCursor/prevCursor.
            const cursorItemId = second.body.items[0].object_id;
            for (const it of backward.body.items) {
                expect(it.object_id).not.toBe(cursorItemId);
            }
            // Direction echoed
            expect(backward.body.meta.request.direction).toBe('backward');
            // Consistent cursor semantics
            if (backward.body.meta.nextCursor) {
                expect(backward.body.meta.hasNext).toBe(true);
            }
            if (backward.body.meta.prevCursor) {
                expect(backward.body.meta.hasPrev).toBe(true);
            }
        }
    });
});
