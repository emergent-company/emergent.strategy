import { describe, it, expect, beforeEach } from 'vitest';
import { ScopesGuard } from '../../../src/modules/auth/scopes.guard';
import { Reflector } from '@nestjs/core';

// Minimal PermissionService mock
class MockPermissionService {
  public calls = 0;
  constructor(private scopes: string[]) {}
  async compute() {
    this.calls += 1;
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

function makeContext(required: string[]) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'u1', scopes: [] } }),
      getResponse: () => ({ setHeader: () => {} }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('ScopesGuard', () => {
  let reflector: Reflector;
  beforeEach(() => {
    reflector = new Reflector();
  });

  it('allows when all required present in dynamic scopes', async () => {
    const perms = new MockPermissionService(['documents:read', 'org:read']);
    const guard = new ScopesGuard(
      reflector as any,
      perms as any,
      new StubAuditService() as any
    );
    // Patch reflector.getAllAndOverride to return required scopes
    (reflector as any).getAllAndOverride = () => ['documents:read'];
    const ctx = makeContext(['documents:read']);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(perms.calls).toBe(1);
  });

  it('denies when missing scope and feature flag off', async () => {
    delete process.env.SCOPES_DISABLED;
    const perms = new MockPermissionService(['org:read']);
    const guard = new ScopesGuard(
      reflector as any,
      perms as any,
      new StubAuditService() as any
    );
    (reflector as any).getAllAndOverride = () => ['documents:write'];
    const ctx = makeContext(['documents:write']);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403 });
    expect(perms.calls).toBe(1);
  });

  it('bypasses enforcement when SCOPES_DISABLED=1', async () => {
    process.env.SCOPES_DISABLED = '1';
    const perms = new MockPermissionService([]);
    const guard = new ScopesGuard(
      reflector as any,
      perms as any,
      new StubAuditService() as any
    );
    (reflector as any).getAllAndOverride = () => ['documents:delete'];
    const ctx = makeContext(['documents:delete']);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(perms.calls).toBe(1);
    delete process.env.SCOPES_DISABLED;
  });

  it('computes permissions even when no scopes required', async () => {
    (reflector as any).getAllAndOverride = () => [];
    const perms = new MockPermissionService(['documents:read']);
    const guard = new ScopesGuard(
      reflector as any,
      perms as any,
      new StubAuditService() as any
    );
    const ctx = makeContext([]);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(perms.calls).toBe(1);
  });
});
