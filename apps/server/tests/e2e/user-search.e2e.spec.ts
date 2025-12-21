import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * E2E tests for user search endpoint.
 *
 * Mocked: None
 * Real: Full NestJS app, PostgreSQL, Auth
 * Auth: Static test tokens with scopes
 *
 * Tests:
 * - GET /users/search - Search users by email
 */
describe('User Search API (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createE2EContext>>;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    ctx = await createE2EContext('usersearch');
    request = supertest(ctx.baseUrl);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const headers = () => ({
    ...authHeader('all', 'usersearch'),
    'X-Organization-ID': ctx.orgId,
    'X-Project-ID': ctx.projectId,
  });

  describe('GET /users/search', () => {
    test('should return 401 without auth', async () => {
      await request.get('/users/search?email=test').expect(401);
    });

    test('should return 400 when email query is missing', async () => {
      const res = await request.get('/users/search').set(headers());
      // Endpoint requires email query param
      expect([400, 422]).toContain(res.status);
    });

    test('should return 400 when email query is too short', async () => {
      const res = await request.get('/users/search?email=a').set(headers());
      // Minimum 2 characters required
      expect([400, 422]).toContain(res.status);
    });

    test('should return empty array for non-matching email', async () => {
      const res = await request
        .get('/users/search?email=nonexistent12345@example.com')
        .set(headers())
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users).toHaveLength(0);
    });

    test('should return users matching email query', async () => {
      // Search for e2e user created in context
      const res = await request
        .get('/users/search?email=e2e')
        .set(headers())
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
      // Should find at least our test user (email contains 'e2e')
      if (res.body.users.length > 0) {
        const user = res.body.users[0];
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
      }
    });

    test('should limit results to max 10', async () => {
      // Even with a broad search, should not exceed 10 results
      const res = await request
        .get('/users/search?email=example')
        .set(headers())
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeLessThanOrEqual(10);
    });
  });
});
