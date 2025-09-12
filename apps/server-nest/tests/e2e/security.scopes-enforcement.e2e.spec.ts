import { beforeAll, afterAll, describe, it, expect, beforeEach } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Validates scope-based authorization now enforced by ScopesGuard.
// Tokens:
//  - with-scope => only read:me (no documents/chat scopes) -> expect 403 on protected endpoints.
//  - e2e-all => full scopes set.
//  - no-scope => empty scopes -> 403 on any scope-protected endpoint.

describe('Security Scopes Enforcement E2E', () => {
  let ctx: E2EContext;
  beforeAll(async () => { ctx = await createE2EContext('scopes'); });
  beforeEach(async () => { await ctx.cleanup(); });
  afterAll(async () => { await ctx.close(); });

  it('denies documents list to no-scope token', async () => {
    const res = await fetch(`${ctx.baseUrl}/documents?limit=1`, { headers: { ...authHeader('none'), 'x-project-id': ctx.projectId } });
    expect(res.status).toBe(403);
  });

  it('denies chat list to token lacking chat:read scope', async () => {
    // with-scope has only read:me
    const res = await fetch(`${ctx.baseUrl}/chat/conversations`, { headers: { ...authHeader('default'), 'x-project-id': ctx.projectId } });
    expect(res.status).toBe(403);
  });

  it('allows full-scope token to list documents', async () => {
    const res = await fetch(`${ctx.baseUrl}/documents?limit=1`, { headers: { ...authHeader('all', 'scopes'), 'x-project-id': ctx.projectId } });
    expect(res.status).toBe(200);
  });

  it('allows full-scope token to create document', async () => {
    const res = await fetch(`${ctx.baseUrl}/documents`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader('all', 'scopes'), 'x-project-id': ctx.projectId }, body: JSON.stringify({ filename: 'scoped.txt', content: 'ok' }) });
    expect([200,201]).toContain(res.status);
  });

  it('denies create document to token missing documents:write', async () => {
    const res = await fetch(`${ctx.baseUrl}/documents`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader('default'), 'x-project-id': ctx.projectId }, body: JSON.stringify({ filename: 'scoped-deny.txt', content: 'no' }) });
    expect(res.status).toBe(403);
  });
});
