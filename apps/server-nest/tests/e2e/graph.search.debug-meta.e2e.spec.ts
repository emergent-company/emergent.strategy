import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// E2E spec validating debug meta fields for graph search endpoint.
// Ensures timing & channel_stats only present when debug flag is requested and scope is granted.

// NOTE: The controller currently uses a placeholder empty scopes list; until scopes are wired from token
// we exercise only the non-debug path (debug attempt should 403). Once scopes plumbed, extend to assert debug.

describe('Graph Search - Debug Meta', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    let request: supertest.SuperTest<supertest.Test>;

    beforeAll(async () => {
        ctx = await createE2EContext('graph-search-debug');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => { await ctx.close(); });

    // Use full-scope token for both calls so read scope satisfied; absence of debug flag should still suppress timing.
    const headers = () => ({
        ...authHeader('all', 'graph-search-debug'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
    });
    const debugHeaders = () => ({
        ...authHeader('all', 'graph-search-debug'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
    });

    test('baseline search returns meta without debug timing fields', async () => {
        const res = await request
            .post('/graph/search')
            .set(headers())
            .send({ query: 'alpha beta', limit: 5 })
            .expect(200);
        expect(res.body?.meta?.fusion).toBe('weighted_sum:v1');
        expect(res.body?.meta?.normalization_version).toBe('zscore_v1');
        expect(res.body?.meta?.timing).toBeUndefined();
        expect(res.body?.meta?.channel_stats).toBeUndefined();
        expect(Array.isArray(res.body.items)).toBe(true);
    });

    test('debug=true query param returns timing & channel stats when debug scope present', async () => {
        const res = await request
            .post('/graph/search?debug=true')
            .set(debugHeaders())
            .send({ query: 'gamma delta', limit: 3 })
            .expect(200);
        const meta = res.body?.meta;
        expect(meta?.timing).toBeDefined();
        expect(meta?.channel_stats).toBeDefined();
        expect(typeof meta.timing.embedding_ms).toBe('number');
        expect(typeof meta.timing.lexical_ms).toBe('number');
        expect(typeof meta.timing.vector_ms).toBe('number');
        expect(typeof meta.timing.fusion_ms).toBe('number');
        expect(typeof meta.timing.total_ms).toBe('number');
        expect(meta.timing.total_ms).toBeGreaterThanOrEqual(0);
        expect(meta.channel_stats.lexical).toHaveProperty('mean');
        expect(meta.channel_stats.lexical).toHaveProperty('std');
        expect(meta.channel_stats.lexical).toHaveProperty('count');
        expect(meta.channel_stats.vector).toHaveProperty('mean');
        expect(meta.channel_stats.vector).toHaveProperty('std');
        expect(meta.channel_stats.vector).toHaveProperty('count');
    });

    test('debug=true forbidden with graph-read token lacking debug scope', async () => {
        const res = await request
            .post('/graph/search?debug=true')
            .set({
                ...authHeader('graph-read', 'graph-search-debug'),
                'x-org-id': ctx.orgId,
                'x-project-id': ctx.projectId,
            })
            .send({ query: 'epsilon zeta', limit: 2 })
            .expect(403);
        expect(res.body?.error?.code).toBe('insufficient_scope');
    });
});
