import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScopesGuard } from '../../../src/modules/auth/scopes.guard';
import { Reflector } from '@nestjs/core';

class MockPermissionService {
  constructor(private scopes: string[]) {}
  async compute() {
    return { scopes: this.scopes } as any;
  }
}

class StubAuditService {
  logAuthzAllowed() {
    return Promise.resolve();
  }
  logAuthzDenied() {
    return Promise.resolve();
  }
}

function makeContext() {
  const resHeaders: Record<string, string> = {};
  const response = {
    setHeader: (k: string, v: string) => {
      resHeaders[k] = v;
    },
  };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'uuid-u1', sub: 'u1', scopes: [] } }),
      getResponse: () => response,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { ctx, resHeaders };
}

describe('ScopesGuard debug headers', () => {
  let reflector: Reflector;
  beforeEach(() => {
    reflector = new Reflector();
    process.env.DEBUG_AUTH_SCOPES = '1';
    process.env.SCOPES_DISABLED = '0'; // Ensure scopes are enforced for this test
  });
  afterEach(() => {
    delete process.env.DEBUG_AUTH_SCOPES;
    delete process.env.SCOPES_DISABLED;
  });

  it('sets debug headers when scopes missing', async () => {
    (reflector as any).getAllAndOverride = () => ['docs:write'];
    const guard = new ScopesGuard(
      reflector as any,
      new MockPermissionService(['docs:read']) as any,
      new StubAuditService() as any
    );
    const { ctx, resHeaders } = makeContext();
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403 });
    expect(resHeaders['X-Missing-Scopes']).toBe('docs:write');
    expect(resHeaders['X-Effective-Scopes']).toContain('docs:read');
  });
});
