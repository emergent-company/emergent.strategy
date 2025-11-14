import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';
import { httpGetAuth } from '../utils/http';

let ctx: BootstrappedApp | null = null;
const originalScopesDisabled = process.env.SCOPES_DISABLED;

describe('Error envelope structure', () => {
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

  it('401 unauthorized envelope shape', async () => {
    const current = ctx;
    if (!current) throw new Error('Test app was not bootstrapped');
    const res = await fetch(`${current.baseUrl}/auth/me`);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
    expect(json.error).toHaveProperty('code', 'unauthorized');
    expect(json.error).toHaveProperty('message');
  });

  it('403 forbidden envelope shape', async () => {
    const current = ctx;
    if (!current) throw new Error('Test app was not bootstrapped');
    const res = await httpGetAuth<{
      error: { code: string; message: string };
    }>(current.baseUrl, '/auth/me', 'no-scope');
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('forbidden');
    expect(typeof res.json.error.message).toBe('string');
  });
});
