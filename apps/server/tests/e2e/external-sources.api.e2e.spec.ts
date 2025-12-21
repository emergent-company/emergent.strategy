import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

let ctx: E2EContext;

describe('External Sources API E2E', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('ext-src');
  });
  beforeEach(async () => {
    await ctx.cleanup();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('POST /external-sources/import', () => {
    it('should require x-project-id header', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
        },
        body: JSON.stringify({ url: 'https://example.com/test.txt' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.message).toContain('x-project-id');
    });

    it('should require url in request body', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid URL format', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ url: 'not-a-valid-url' }),
      });

      // Should be 400 or 422 for validation error
      expectStatusOneOf(res.status, [400, 422], 'invalid URL');
    });

    it('should reject FTP and other unsupported protocols', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ url: 'ftp://example.com/file.txt' }),
      });

      // Should be 400 or 422 for unsupported protocol
      expectStatusOneOf(res.status, [400, 422], 'unsupported protocol');
    });

    it('should handle network errors gracefully', async () => {
      // Use a non-routable IP to trigger network timeout/error
      const res = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({
          url: 'https://192.0.2.1/unreachable.txt', // TEST-NET-1, guaranteed unreachable
        }),
      });

      // Should return an error response, not crash
      expectStatusOneOf(
        res.status,
        [400, 422, 500, 502, 503, 504],
        'network error'
      );
    });

    it('should import a public Google Drive document', async () => {
      // Public Google Doc created for testing
      const googleDocUrl =
        'https://docs.google.com/document/d/1LnFOodCG2WRZZJ_HxZn9uvEt736xJ2KyQd_E1Ccuuaw/edit?usp=sharing';

      const res = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ url: googleDocUrl }),
      });

      const result = await res.json();

      // Log the response for debugging if failed
      if (res.status !== 201) {
        console.error('Import failed:', JSON.stringify(result, null, 2));
      }

      expect(res.status).toBe(201);
      expect(result.success).toBe(true);
      expect(result.externalSourceId).toBeDefined();
      expect(result.documentId).toBeDefined();
      expect(result.status).toBe('created');
    });

    it('should deduplicate when importing same URL twice', async () => {
      // Public Google Doc created for testing
      const googleDocUrl =
        'https://docs.google.com/document/d/1LnFOodCG2WRZZJ_HxZn9uvEt736xJ2KyQd_E1Ccuuaw/edit?usp=sharing';

      // First import
      const res1 = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ url: googleDocUrl }),
      });

      expect(res1.status).toBe(201);
      const result1 = await res1.json();
      expect(result1.success).toBe(true);
      const firstSourceId = result1.externalSourceId;

      // Second import of same URL
      const res2 = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ url: googleDocUrl }),
      });

      expect(res2.status).toBe(201);
      const result2 = await res2.json();

      expect(result2.success).toBe(true);
      expect(result2.externalSourceId).toBe(firstSourceId); // Same source ID
      // Status can be 'duplicate' (no changes) or 'updated' (sync happened and found no changes)
      expect(['duplicate', 'updated']).toContain(result2.status);
    });
  });

  describe('GET /external-sources', () => {
    it('should require x-project-id header', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources`, {
        headers: {
          ...authHeader('all', 'ext-src'),
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.message).toContain('x-project-id');
    });

    it('should return empty list for new project', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources`, {
        headers: {
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toBeDefined();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources?limit=10`, {
        headers: {
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toBeDefined();
    });

    it('should filter by status', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources?status=active`, {
        headers: {
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toBeDefined();
    });
  });

  describe('GET /external-sources/:id', () => {
    it('should require x-project-id header', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const res = await fetch(`${ctx.baseUrl}/external-sources/${fakeId}`, {
        headers: {
          ...authHeader('all', 'ext-src'),
        },
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent source', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const res = await fetch(`${ctx.baseUrl}/external-sources/${fakeId}`, {
        headers: {
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
      });

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID format', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources/not-a-uuid`, {
        headers: {
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
      });

      expectStatusOneOf(res.status, [400, 422], 'invalid UUID');
    });
  });

  describe('POST /external-sources/:id/sync', () => {
    it('should require x-project-id header', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const res = await fetch(
        `${ctx.baseUrl}/external-sources/${fakeId}/sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader('all', 'ext-src'),
          },
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent source', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const res = await fetch(
        `${ctx.baseUrl}/external-sources/${fakeId}/sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader('all', 'ext-src'),
            'x-project-id': ctx.projectId,
          },
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /external-sources/:id', () => {
    it('should require x-project-id header', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const res = await fetch(`${ctx.baseUrl}/external-sources/${fakeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
        },
        body: JSON.stringify({ displayName: 'Test' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent source', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const res = await fetch(`${ctx.baseUrl}/external-sources/${fakeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ displayName: 'Test' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /external-sources/:id', () => {
    it('should require x-project-id header', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const res = await fetch(`${ctx.baseUrl}/external-sources/${fakeId}`, {
        method: 'DELETE',
        headers: {
          ...authHeader('all', 'ext-src'),
        },
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent source', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      const res = await fetch(`${ctx.baseUrl}/external-sources/${fakeId}`, {
        method: 'DELETE',
        headers: {
          ...authHeader('all', 'ext-src'),
          'x-project-id': ctx.projectId,
        },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('Authorization', () => {
    it('should require authentication for import', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ url: 'https://example.com/test.txt' }),
      });

      expect(res.status).toBe(401);
    });

    it('should require authentication for list', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources`, {
        headers: {
          'x-project-id': ctx.projectId,
        },
      });

      expect(res.status).toBe(401);
    });

    it('should require documents:write scope for import', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader('none'), // Token with no scopes
          'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ url: 'https://example.com/test.txt' }),
      });

      // Should be 403 (forbidden) due to missing scope
      expect(res.status).toBe(403);
    });

    it('should require documents:read scope for list', async () => {
      const res = await fetch(`${ctx.baseUrl}/external-sources`, {
        headers: {
          ...authHeader('none'), // Token with no scopes
          'x-project-id': ctx.projectId,
        },
      });

      // Should be 403 (forbidden) due to missing scope
      expect(res.status).toBe(403);
    });
  });
});
