import 'reflect-metadata';
import { beforeAll, afterAll, it, expect } from 'vitest';
import type { BootstrappedApp } from '../../utils/test-app';
import { bootstrapTestApp } from '../../utils/test-app';
import { httpGetAuth, httpGet } from '../../utils/http';
import { describeWithDb } from '../../utils/db-describe';

let ctx: BootstrappedApp | null = null;
const originalScopesDisabled = process.env.SCOPES_DISABLED;

describeWithDb(
  'Auth scopes',
  () => {
    beforeAll(async () => {
      process.env.SCOPES_DISABLED = '0';
      ctx = await bootstrapTestApp();
    }, 30000);

    afterAll(async () => {
      if (!ctx) return;
      await ctx.close();
      if (originalScopesDisabled === undefined) {
        delete process.env.SCOPES_DISABLED;
      } else {
        process.env.SCOPES_DISABLED = originalScopesDisabled;
      }
    }, 30000);

    it('denies access with missing scope (403)', async () => {
      const current = ctx;
      if (!current) throw new Error('Test app was not bootstrapped');
      const res = await httpGetAuth<{ error: { code: string } }>(
        current.baseUrl,
        '/auth/me',
        'no-scope'
      );
      if (res.status !== 403) {
        console.error('DEBUG /auth/me no-scope status', res.status, res.json);
      }
      expect(res.status).toBe(403);
      expect(res.json.error?.code).toBe('forbidden');
    });

    it('allows access with required scope', async () => {
      const current = ctx;
      if (!current) throw new Error('Test app was not bootstrapped');
      const res = await httpGetAuth<{ sub: string }>(
        current.baseUrl,
        '/auth/me',
        'with-scope'
      );
      if (res.status !== 200) {
        console.error('DEBUG /auth/me with-scope status', res.status, res.json);
      }
      expect(res.status).toBe(200);
      expect(res.json.sub).toBe('mock-user-id');
    });

    it('rejects missing Authorization header (401)', async () => {
      const current = ctx;
      if (!current) throw new Error('Test app was not bootstrapped');
      const res = await httpGet<{ error: { code: string } }>(
        current.baseUrl,
        '/auth/me'
      );
      if (res.status !== 401) {
        console.error(
          'DEBUG /auth/me missing header status',
          res.status,
          res.json
        );
      }
      expect(res.status).toBe(401);
      expect(res.json.error?.code).toBe('unauthorized');
    });
  },
  30000
);
