import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import request from 'supertest';

describe('MCP Authentication E2E', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EContext();
  });

  afterAll(async () => {
    if (ctx?.app) {
      await ctx.app.close();
    }
  });

  describe('GET /mcp/schema/version', () => {
    describe('Authentication', () => {
      it('returns 401 when no token provided', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .expect(401);

        expect(response.body.error.code).toBe('unauthorized');
        expect(response.body.error.message).toBe(
          'Missing Authorization bearer token'
        );
      });

      it('returns 401 when invalid token provided', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'Bearer invalid-token-12345')
          .expect(401);

        expect(response.body.error.code).toBe('unauthorized');
      });

      it('returns 401 when malformed authorization header (missing Bearer prefix)', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'schema-read-token')
          .expect(401);

        expect(response.body.error.code).toBe('unauthorized');
      });
    });

    describe('Authorization', () => {
      it('returns 403 when token missing schema:read scope', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'Bearer no-scope')
          .expect(403);

        expect(response.body.error.code).toBe('forbidden');
        expect(response.body.error.details.missing).toContain('schema:read');
      });

      it('returns 200 with valid token and schema:read scope', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('updated_at');
        expect(response.body).toHaveProperty('cache_hint_ttl');
        expect(typeof response.body.version).toBe('string');
        expect(typeof response.body.updated_at).toBe('string');
        expect(typeof response.body.cache_hint_ttl).toBe('number');
        expect(response.body.cache_hint_ttl).toBe(300); // 5 min default
      });

      // Note: mcp:admin scope hierarchy not implemented yet
      // TODO: Implement scope hierarchy where mcp:admin grants schema:read

      it('returns 200 when token has e2e-all scope (all scopes)', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'Bearer e2e-all')
          .expect(200);

        expect(response.body).toHaveProperty('version');
      });
    });

    describe('Response Structure', () => {
      it('includes version hash in response', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        // Schema version hash format (actual implementation uses 16-char hex)
        expect(response.body.version).toMatch(/^[a-f0-9]{16}$/);
        expect(typeof response.body.version).toBe('string');
      });

      it('includes ISO 8601 timestamp in updated_at', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        const timestamp = response.body.updated_at;
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO 8601 format
        expect(() => new Date(timestamp)).not.toThrow();
      });

      it('includes cache hint TTL for client caching', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        expect(response.body.cache_hint_ttl).toBeGreaterThan(0);
        expect(response.body.cache_hint_ttl).toBeLessThanOrEqual(3600); // Max 1 hour
      });
    });
  });

  describe('GET /mcp/schema/changelog', () => {
    describe('Authentication', () => {
      it('returns 401 when no token provided', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog')
          .expect(401);

        expect(response.body.error.code).toBe('unauthorized');
      });

      it('returns 401 when invalid token provided', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog')
          .set('Authorization', 'Bearer invalid-token-12345')
          .expect(401);

        expect(response.body.error.code).toBe('unauthorized');
      });
    });

    describe('Authorization', () => {
      it('returns 403 when token missing schema:read scope', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog')
          .set('Authorization', 'Bearer no-scope')
          .expect(403);

        expect(response.body.error.code).toBe('forbidden');
        expect(response.body.error.details.missing).toContain('schema:read');
      });

      it('returns 200 with valid token and schema:read scope', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('Query Parameters', () => {
      it('accepts since parameter', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog?since=2025-01-01T00:00:00Z')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });

      it('accepts limit parameter', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog?limit=5')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });

      it('accepts both since and limit parameters', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog?since=2025-01-01T00:00:00Z&limit=5')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('Response Structure', () => {
      it('returns empty array (until implemented)', async () => {
        const response = await request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog')
          .set('Authorization', 'Bearer schema-read-token')
          .expect(200);

        expect(response.body).toEqual([]);
      });
    });
  });

  describe('Cross-Endpoint Security', () => {
    it('single token works across both endpoints', async () => {
      const token = 'Bearer schema-read-token';

      const versionResponse = await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', token)
        .expect(200);

      const changelogResponse = await request(ctx.app.getHttpServer())
        .get('/mcp/schema/changelog')
        .set('Authorization', token)
        .expect(200);

      expect(versionResponse.body).toHaveProperty('version');
      expect(Array.isArray(changelogResponse.body)).toBe(true);
    });

    it('scope check happens on every request (no caching)', async () => {
      // First request with valid scope
      await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer schema-read-token')
        .expect(200);

      // Second request with no scope should still fail
      await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer no-scope')
        .expect(403);

      // Third request with valid scope should succeed again
      await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer schema-read-token')
        .expect(200);
    });

    it('authorization failure returns consistent error structure', async () => {
      const responses = await Promise.all([
        request(ctx.app.getHttpServer())
          .get('/mcp/schema/version')
          .set('Authorization', 'Bearer no-scope')
          .expect(403),
        request(ctx.app.getHttpServer())
          .get('/mcp/schema/changelog')
          .set('Authorization', 'Bearer no-scope')
          .expect(403),
      ]);

      for (const response of responses) {
        expect(response.body.error.code).toBe('forbidden');
        expect(response.body.error.message).toBe('Forbidden');
        expect(response.body.error.details).toHaveProperty('missing');
        expect(Array.isArray(response.body.error.details.missing)).toBe(true);
      }
    });
  });

  describe('Token Validation', () => {
    it('rejects token with special characters (malformed)', async () => {
      const response = await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer token@with!special#chars')
        .expect(401);

      expect(response.body.error.code).toBe('unauthorized');
    });

    it('accepts data-read-token (superset of schema:read)', async () => {
      const response = await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer data-read-token')
        .expect(200);

      expect(response.body).toHaveProperty('version');
    });

    it('accepts data-write-token (superset of schema:read and data:read)', async () => {
      const response = await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer data-write-token')
        .expect(200);

      expect(response.body).toHaveProperty('version');
    });
  });

  describe('Debug Mode', () => {
    const originalDebugScopes = process.env.DEBUG_AUTH_SCOPES;

    afterEach(() => {
      // Restore original value
      if (originalDebugScopes) {
        process.env.DEBUG_AUTH_SCOPES = originalDebugScopes;
      } else {
        delete process.env.DEBUG_AUTH_SCOPES;
      }
    });

    it('includes debug headers when DEBUG_AUTH_SCOPES=1', async () => {
      process.env.DEBUG_AUTH_SCOPES = '1';

      const response = await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer schema-read-token')
        .expect(200);

      expect(response.headers).toHaveProperty('x-debug-scopes');
      expect(response.headers['x-debug-scopes']).toContain('schema:read');
    });

    it('includes missing scopes in debug header when forbidden', async () => {
      process.env.DEBUG_AUTH_SCOPES = '1';

      const response = await request(ctx.app.getHttpServer())
        .get('/mcp/schema/version')
        .set('Authorization', 'Bearer no-scope')
        .expect(403);

      expect(response.headers).toHaveProperty('x-missing-scopes');
      expect(response.headers['x-missing-scopes']).toContain('schema:read');
    });
  });
});
