import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import request from 'supertest';

describe('API Tokens E2E', () => {
  let ctx: E2EContext;
  let createdTokenId: string;

  beforeAll(async () => {
    ctx = await createE2EContext();
  });

  afterAll(async () => {
    if (ctx?.app) {
      await ctx.app.close();
    }
  });

  describe('POST /projects/:projectId/tokens', () => {
    describe('Authentication', () => {
      it('returns 401 when no token provided', async () => {
        const response = await request(ctx.app.getHttpServer())
          .post(`/projects/${ctx.projectId}/tokens`)
          .send({ name: 'Test Token', scopes: ['schema:read'] })
          .expect(401);

        expect(response.body.error.code).toBe('unauthorized');
      });
    });

    describe('Validation', () => {
      it('returns 400 when name is missing', async () => {
        const response = await request(ctx.app.getHttpServer())
          .post(`/projects/${ctx.projectId}/tokens`)
          .set('Authorization', 'Bearer e2e-all')
          .set('x-project-id', ctx.projectId)
          .set('x-org-id', ctx.orgId)
          .send({ scopes: ['schema:read'] })
          .expect(400);

        expect(response.body.message).toContain('name');
      });

      it('returns 400 when scopes is empty', async () => {
        const response = await request(ctx.app.getHttpServer())
          .post(`/projects/${ctx.projectId}/tokens`)
          .set('Authorization', 'Bearer e2e-all')
          .set('x-project-id', ctx.projectId)
          .set('x-org-id', ctx.orgId)
          .send({ name: 'Test Token', scopes: [] })
          .expect(400);

        expect(response.body.message).toContain('scopes');
      });

      it('returns 400 when scopes contains invalid value', async () => {
        const response = await request(ctx.app.getHttpServer())
          .post(`/projects/${ctx.projectId}/tokens`)
          .set('Authorization', 'Bearer e2e-all')
          .set('x-project-id', ctx.projectId)
          .set('x-org-id', ctx.orgId)
          .send({ name: 'Test Token', scopes: ['invalid:scope'] })
          .expect(400);

        expect(response.body.message).toContain('scopes');
      });
    });

    describe('Success', () => {
      it('creates a token and returns the raw token only once', async () => {
        const tokenName = `E2E Test Token ${Date.now()}`;
        const response = await request(ctx.app.getHttpServer())
          .post(`/projects/${ctx.projectId}/tokens`)
          .set('Authorization', 'Bearer e2e-all')
          .set('x-project-id', ctx.projectId)
          .set('x-org-id', ctx.orgId)
          .send({
            name: tokenName,
            scopes: ['schema:read', 'data:read'],
          })
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('token');
        expect(response.body.name).toBe(tokenName);
        expect(response.body.scopes).toEqual(['schema:read', 'data:read']);
        expect(response.body.tokenPrefix).toMatch(/^emt_[a-f0-9]{8}$/);
        expect(response.body.token).toMatch(/^emt_[a-f0-9]{64}$/);
        expect(response.body.isRevoked).toBe(false);

        // Save for later tests
        createdTokenId = response.body.id;
      });

      it('returns 409 when token name already exists', async () => {
        // First, create a token
        const tokenName = `Duplicate Test ${Date.now()}`;
        await request(ctx.app.getHttpServer())
          .post(`/projects/${ctx.projectId}/tokens`)
          .set('Authorization', 'Bearer e2e-all')
          .set('x-project-id', ctx.projectId)
          .set('x-org-id', ctx.orgId)
          .send({
            name: tokenName,
            scopes: ['schema:read'],
          })
          .expect(201);

        // Try to create another with the same name
        const response = await request(ctx.app.getHttpServer())
          .post(`/projects/${ctx.projectId}/tokens`)
          .set('Authorization', 'Bearer e2e-all')
          .set('x-project-id', ctx.projectId)
          .set('x-org-id', ctx.orgId)
          .send({
            name: tokenName,
            scopes: ['schema:read'],
          })
          .expect(409);

        expect(response.body.error.code).toBe('token-name-exists');
      });
    });
  });

  describe('GET /projects/:projectId/tokens', () => {
    it('returns 401 when no token provided', async () => {
      const response = await request(ctx.app.getHttpServer())
        .get(`/projects/${ctx.projectId}/tokens`)
        .expect(401);

      expect(response.body.error.code).toBe('unauthorized');
    });

    it('returns list of tokens for project', async () => {
      const response = await request(ctx.app.getHttpServer())
        .get(`/projects/${ctx.projectId}/tokens`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', ctx.projectId)
        .set('x-org-id', ctx.orgId)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Should include the token we created earlier
      expect(response.body.length).toBeGreaterThan(0);

      // Each token should NOT include the raw token value
      const firstToken = response.body[0];
      expect(firstToken).toHaveProperty('id');
      expect(firstToken).toHaveProperty('name');
      expect(firstToken).toHaveProperty('tokenPrefix');
      expect(firstToken).toHaveProperty('scopes');
      expect(firstToken).toHaveProperty('createdAt');
      expect(firstToken).toHaveProperty('isRevoked');
      expect(firstToken).not.toHaveProperty('token'); // Raw token not exposed
      expect(firstToken).not.toHaveProperty('tokenHash'); // Hash not exposed
    });
  });

  describe('DELETE /projects/:projectId/tokens/:tokenId', () => {
    it('returns 401 when no token provided', async () => {
      const response = await request(ctx.app.getHttpServer())
        .delete(`/projects/${ctx.projectId}/tokens/some-id`)
        .expect(401);

      expect(response.body.error.code).toBe('unauthorized');
    });

    it('returns 404 when token does not exist', async () => {
      const response = await request(ctx.app.getHttpServer())
        .delete(
          `/projects/${ctx.projectId}/tokens/00000000-0000-0000-0000-000000000000`
        )
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', ctx.projectId)
        .set('x-org-id', ctx.orgId)
        .expect(404);

      expect(response.body.error.code).toBe('token-not-found');
    });

    it('revokes an existing token', async () => {
      // First create a token to revoke
      const createResponse = await request(ctx.app.getHttpServer())
        .post(`/projects/${ctx.projectId}/tokens`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', ctx.projectId)
        .set('x-org-id', ctx.orgId)
        .send({
          name: `Token to revoke ${Date.now()}`,
          scopes: ['schema:read'],
        })
        .expect(201);

      const tokenId = createResponse.body.id;

      // Revoke it
      await request(ctx.app.getHttpServer())
        .delete(`/projects/${ctx.projectId}/tokens/${tokenId}`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', ctx.projectId)
        .set('x-org-id', ctx.orgId)
        .expect(204);

      // Verify it shows as revoked in the list
      const listResponse = await request(ctx.app.getHttpServer())
        .get(`/projects/${ctx.projectId}/tokens`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', ctx.projectId)
        .set('x-org-id', ctx.orgId)
        .expect(200);

      const revokedToken = listResponse.body.find((t: any) => t.id === tokenId);
      expect(revokedToken).toBeDefined();
      expect(revokedToken.isRevoked).toBe(true);
    });

    it('returns 409 when trying to revoke already revoked token', async () => {
      // Create and revoke a token
      const createResponse = await request(ctx.app.getHttpServer())
        .post(`/projects/${ctx.projectId}/tokens`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', ctx.projectId)
        .set('x-org-id', ctx.orgId)
        .send({
          name: `Double revoke test ${Date.now()}`,
          scopes: ['schema:read'],
        })
        .expect(201);

      const tokenId = createResponse.body.id;

      // First revocation
      await request(ctx.app.getHttpServer())
        .delete(`/projects/${ctx.projectId}/tokens/${tokenId}`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', ctx.projectId)
        .set('x-org-id', ctx.orgId)
        .expect(204);

      // Second revocation should fail
      const response = await request(ctx.app.getHttpServer())
        .delete(`/projects/${ctx.projectId}/tokens/${tokenId}`)
        .set('Authorization', 'Bearer e2e-all')
        .set('x-project-id', ctx.projectId)
        .set('x-org-id', ctx.orgId)
        .expect(409);

      expect(response.body.error.code).toBe('token-already-revoked');
    });
  });
});
