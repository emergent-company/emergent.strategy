import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
// Correct relative path (file is sibling in same directory)
import { createE2EContext, E2EContext } from './e2e-context';

/**
 * E2E test verifying /health exposes RLS policy status fields.
 */

describe('Health Endpoint RLS Status (E2E)', () => {
    let ctx: E2EContext;
    let request: supertest.SuperTest<supertest.Test>;

    beforeAll(async () => {
        process.env.RLS_POLICY_STRICT = 'true'; // ensure strict path still succeeds
        ctx = await createE2EContext('health');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => {
        await ctx.close();
    });

    it('returns rls_policies_ok=true with count=8', async () => {
        const res = await request.get('/health').expect(200);
        expect(res.body).toMatchObject({
            ok: true,
            db: 'up',
            rls_policies_ok: true,
            rls_policy_count: 8,
        });
        expect(typeof res.body.rls_policy_hash).toBe('string');
        expect(res.body.rls_policy_hash).toMatch(/policies:/);
    });
});
