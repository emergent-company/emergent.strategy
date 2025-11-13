import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// This spec exercises core user profile CRUD + alternative email behaviors.
// Scope requirement chosen: endpoints currently guarded by org:read (provided by default test token variant with scopes).

describe('User Profile - Basic CRUD & Alternative Emails', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    let request: supertest.SuperTest<supertest.Test>;

    beforeAll(async () => {
        ctx = await createE2EContext('profile');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => {
        await ctx.close();
    });

    const headers = () => authHeader('default', 'profile');

    test('GET /user/profile (initial auto-create)', async () => {
        const res = await request.get('/user/profile').set(headers()).expect(200);
        // Behavior change: profile may now be enriched automatically (e.g., from identity claims) instead of all nulls.
        // We only assert invariant presence of subjectId and that fields (if present) are strings.
        expect(res.body.subjectId).toEqual(expect.any(String));
        for (const k of ['firstName', 'lastName', 'displayName', 'phoneE164'] as const) {
            if (res.body[k] !== null && res.body[k] !== undefined) {
                expect(typeof res.body[k]).toBe('string');
            }
        }
    });

    test('PUT /user/profile set fields + follow-up GET reflects changes', async () => {
        const update = {
            firstName: 'Ada',
            lastName: 'Lovelace',
            displayName: 'Countess Ada',
            phoneE164: '+15551234567',
        };
        const put = await request
            .put('/user/profile')
            .set(headers())
            .send(update)
            .expect(200);
        expect(put.body).toMatchObject(update);
        const get = await request.get('/user/profile').set(headers()).expect(200);
        expect(get.body).toMatchObject(update);
    });

    test('PUT /user/profile partial update keeps previous values', async () => {
        const patch = { displayName: 'Ada L.' };
        const put = await request.put('/user/profile').set(headers()).send(patch).expect(200);
        expect(put.body.displayName).toBe('Ada L.');
        // Still retains previously set first/last name.
        expect(put.body.firstName).toBe('Ada');
        expect(put.body.lastName).toBe('Lovelace');
    });

    test('Validation: invalid phone rejected', async () => {
        const bad = { phoneE164: '12345' }; // missing + and too short
        const res = await request.put('/user/profile').set(headers()).send(bad).expect(400);
        // Standardized error envelope shape: { error: { code, message, details? } }
        expect(res.body?.error?.code).toBe('validation-failed');
        expect(res.body?.error?.message).toBeTruthy();
    });

    test('Alternative emails: add first email', async () => {
        const before = await request.get('/user/profile/emails').set(headers()).expect(200);
        const baseCount = Array.isArray(before.body) ? before.body.length : 0;
        const add = await request
            .post('/user/profile/emails')
            .set(headers())
            .send({ email: 'AltEmail+One@Example.com' })
            .expect(200);
        expect(add.body).toMatchObject({ email: 'altemail+one@example.com', verified: false });
        const list = await request.get('/user/profile/emails').set(headers()).expect(200);
        expect(list.body.length).toBe(baseCount + 1);
    });

    test('Alternative emails: idempotent add duplicate', async () => {
        const before = await request.get('/user/profile/emails').set(headers()).expect(200);
        const baseCount = before.body.length;
        const dup = await request
            .post('/user/profile/emails')
            .set(headers())
            .send({ email: 'AltEmail+One@Example.com' })
            .expect(200);
        expect(dup.body.email).toBe('altemail+one@example.com');
        const list = await request.get('/user/profile/emails').set(headers()).expect(200);
        expect(list.body.length).toBe(baseCount); // no new row
    });

    test('Alternative emails: add second + delete first', async () => {
        await request
            .post('/user/profile/emails')
            .set(headers())
            .send({ email: 'another+two@example.com' })
            .expect(200);
        let list = await request.get('/user/profile/emails').set(headers()).expect(200);
        expect(list.body).toHaveLength(2);
        // Delete first
        await request.delete('/user/profile/emails/' + encodeURIComponent('altemail+one@example.com')).set(headers()).expect(200);
        list = await request.get('/user/profile/emails').set(headers()).expect(200);
        expect(list.body.map((r: any) => r.email)).not.toContain('altemail+one@example.com');
        expect(list.body).toHaveLength(1);
    });

    test('Delete non-existent email is idempotent', async () => {
        await request.delete('/user/profile/emails/' + encodeURIComponent('missing@example.com')).set(headers()).expect(200);
    });

    test('Unauthorized access denied', async () => {
        await request.get('/user/profile').expect(401);
    });

    // org:read scope no longer required for self profile access; user token without scopes should still succeed
    test('Access without org:read scope still allowed', async () => {
        await request.get('/user/profile').set(authHeader('none')).expect(200);
    });
});
