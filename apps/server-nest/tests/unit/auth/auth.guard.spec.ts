import { AuthGuard } from '../../../src/modules/auth/auth.guard';
import type { ExecutionContext } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

class AuthServiceMock {
    public validateToken = vi.fn();
}

function makeContext(headers: Record<string, any>, res: any = {}) {
    const req = { headers } as any;
    return {
        switchToHttp: () => ({
            getRequest: () => req,
            getResponse: () => res,
        }),
    } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
    let service: AuthServiceMock;
    let guard: AuthGuard;
    beforeEach(() => {
        service = new AuthServiceMock();
        guard = new AuthGuard(service as any);
        delete process.env.DEBUG_AUTH_SCOPES;
    });

    it('throws for missing header', async () => {
        await expect(guard.canActivate(makeContext({}))).rejects.toMatchObject({
            response: { error: { code: 'missing_token' } },
        });
    });

    it('throws for non-string header', async () => {
        await expect(guard.canActivate(makeContext({ authorization: 123 as any }))).rejects.toMatchObject({
            response: { error: { code: 'malformed_authorization' } },
        });
    });

    it('throws for malformed scheme', async () => {
        await expect(guard.canActivate(makeContext({ authorization: 'Basic abc' }))).rejects.toMatchObject({
            response: { error: { code: 'malformed_authorization' } },
        });
    });

    it('throws for invalid token', async () => {
        service.validateToken.mockResolvedValue(null);
        await expect(guard.canActivate(makeContext({ authorization: 'Bearer dead' }))).rejects.toMatchObject({
            response: { error: { code: 'invalid_token' } },
        });
    });

    it('attaches user and sets scopes header when debug flag enabled', async () => {
        service.validateToken.mockResolvedValue({ id: 'u1', scopes: ['a', 'b'] });
        process.env.DEBUG_AUTH_SCOPES = '1';
        const res: any = { setHeader: vi.fn() };
        const ctx = makeContext({ authorization: 'Bearer tok' }, res);
        const ok = await guard.canActivate(ctx);
        expect(ok).toBe(true);
        expect(res.setHeader).toHaveBeenCalledWith('X-Debug-Scopes', 'a,b');
    });

    it('attaches user without setting scopes header when debug flag disabled', async () => {
        service.validateToken.mockResolvedValue({ id: 'u1', scopes: ['a'] });
        const res: any = { setHeader: vi.fn() };
        const ctx = makeContext({ authorization: 'Bearer tok' }, res);
        const ok = await guard.canActivate(ctx);
        expect(ok).toBe(true);
        expect(res.setHeader).not.toHaveBeenCalled();
    });
});
