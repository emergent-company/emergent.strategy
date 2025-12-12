import { AuthGuard } from '../../../src/modules/auth/auth.guard';
import type { ExecutionContext } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

class AuthServiceMock {
  public validateToken = vi.fn();
}

function makeContext(
  headers: Record<string, any>,
  res: any = {},
  options: { query?: Record<string, any>; path?: string } = {}
) {
  const req = {
    headers,
    query: options.query || {},
    path: options.path || '/api/test',
  } as any;
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
    await expect(
      guard.canActivate(makeContext({ authorization: 123 as any }))
    ).rejects.toMatchObject({
      response: { error: { code: 'malformed_authorization' } },
    });
  });

  it('throws for malformed scheme', async () => {
    await expect(
      guard.canActivate(makeContext({ authorization: 'Basic abc' }))
    ).rejects.toMatchObject({
      response: { error: { code: 'malformed_authorization' } },
    });
  });

  it('throws for invalid token', async () => {
    service.validateToken.mockResolvedValue(null);
    await expect(
      guard.canActivate(makeContext({ authorization: 'Bearer dead' }))
    ).rejects.toMatchObject({
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

  describe('SSE query token support', () => {
    it('accepts token from query param for /events/stream endpoint', async () => {
      service.validateToken.mockResolvedValue({
        id: 'u1',
        email: 'test@test.com',
        scopes: ['read'],
      });
      const ctx = makeContext(
        {},
        {},
        {
          query: { token: 'valid-sse-token', projectId: 'proj1' },
          path: '/api/events/stream',
        }
      );
      const ok = await guard.canActivate(ctx);
      expect(ok).toBe(true);
      expect(service.validateToken).toHaveBeenCalledWith('valid-sse-token');
    });

    it('throws for invalid query token on SSE endpoint', async () => {
      service.validateToken.mockResolvedValue(null);
      const ctx = makeContext(
        {},
        {},
        {
          query: { token: 'invalid-token', projectId: 'proj1' },
          path: '/api/events/stream',
        }
      );
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { error: { code: 'invalid_token' } },
      });
    });

    it('ignores query token for non-SSE endpoints', async () => {
      const ctx = makeContext(
        {},
        {},
        {
          query: { token: 'some-token' },
          path: '/api/documents',
        }
      );
      // Should fall through to header check and fail with missing_token
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { error: { code: 'missing_token' } },
      });
    });

    it('prefers query token over header for SSE endpoint', async () => {
      service.validateToken.mockResolvedValue({
        id: 'u1',
        email: 'test@test.com',
        scopes: ['read'],
      });
      const ctx = makeContext(
        { authorization: 'Bearer header-token' },
        {},
        { query: { token: 'query-token' }, path: '/api/events/stream' }
      );
      const ok = await guard.canActivate(ctx);
      expect(ok).toBe(true);
      // Should use query token, not header token
      expect(service.validateToken).toHaveBeenCalledWith('query-token');
    });
  });
});
