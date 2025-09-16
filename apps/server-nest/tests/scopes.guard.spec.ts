import { describe, it, expect, beforeEach } from 'vitest';
import { ScopesGuard } from '../src/modules/auth/scopes.guard';
import { Reflector } from '@nestjs/core';

// Minimal PermissionService mock
class MockPermissionService {
    constructor(private scopes: string[]) { }
    async compute() { return { scopes: this.scopes } as any; }
}

function makeContext(required: string[]) {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ user: { sub: 'u1', scopes: [] } }),
            getResponse: () => ({ setHeader: () => { } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('ScopesGuard', () => {
    let reflector: Reflector;
    beforeEach(() => { reflector = new Reflector(); });

    it('allows when all required present in dynamic scopes', async () => {
        const guard = new ScopesGuard(reflector as any, new MockPermissionService(['documents:read', 'org:read']) as any);
        // Patch reflector.getAllAndOverride to return required scopes
        (reflector as any).getAllAndOverride = () => ['documents:read'];
        const ctx = makeContext(['documents:read']);
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('denies when missing scope and feature flag off', async () => {
        delete process.env.SCOPES_DISABLED;
        const guard = new ScopesGuard(reflector as any, new MockPermissionService(['org:read']) as any);
        (reflector as any).getAllAndOverride = () => ['documents:write'];
        const ctx = makeContext(['documents:write']);
        await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403 });
    });

    it('bypasses enforcement when SCOPES_DISABLED=1', async () => {
        process.env.SCOPES_DISABLED = '1';
        const guard = new ScopesGuard(reflector as any, new MockPermissionService([]) as any);
        (reflector as any).getAllAndOverride = () => ['documents:delete'];
        const ctx = makeContext(['documents:delete']);
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
        delete process.env.SCOPES_DISABLED;
    });
});
