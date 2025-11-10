import 'reflect-metadata';
import { beforeAll, afterAll, it, expect } from 'vitest';
import type { BootstrappedApp } from '../../utils/test-app';
import { bootstrapTestApp } from '../../utils/test-app';
import { describeWithDb } from '../../utils/db-describe';

let ctx: BootstrappedApp | null = null;

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

describeWithDb('Validation - Ingestion endpoints', () => {
  beforeAll(async () => {
    ctx = await bootstrapTestApp();
  }, 30000);
  afterAll(async () => {
    if (!ctx) return;
    await ctx.close();
    ctx = null;
  }, 30000);

  it('invalid upload payload returns 422 validation-failed with field details', async () => {
    const currentCtx = ctx;
    if (!currentCtx) throw new Error('Test app not initialised');
    const res = await fetch(`${currentCtx.baseUrl}/ingest/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer e2e-all',
      },
      body: JSON.stringify({}), // missing required projectId & file
    });
    expect(res.status).toBe(422);
    const json: ErrorEnvelope = await res.json();
    expect(json.error.code).toBe('validation-failed');
    expect(json.error.details).toBeDefined();
    const details = json.error.details as Record<string, any>;
    expect(Object.keys(details)).toContain('projectId');
  });

  it('invalid url payload returns 422 validation-failed', async () => {
    const currentCtx = ctx;
    if (!currentCtx) throw new Error('Test app not initialised');
    const res = await fetch(`${currentCtx.baseUrl}/ingest/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer e2e-all',
      },
      body: JSON.stringify({ url: 'notaurl' }), // lacks protocol
    });
    expect(res.status).toBe(422);
    const json: ErrorEnvelope = await res.json();
    expect(json.error.code).toBe('validation-failed');
    expect(json.error.details).toBeDefined();
    const details = json.error.details as Record<string, any>;
    expect(Object.keys(details)).toContain('url');
  });
});
