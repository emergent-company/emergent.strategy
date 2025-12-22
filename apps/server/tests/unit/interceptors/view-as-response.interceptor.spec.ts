import { describe, it, expect, beforeEach } from 'vitest';
import { ViewAsResponseInterceptor } from '../../../src/common/interceptors/view-as-response.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { ViewAsUser } from '../../../src/common/middleware/view-as.middleware';

function createMockExecutionContext(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
    getClass: () => ({}),
    getHandler: () => ({}),
  } as any;
}

function createMockCallHandler(returnValue: any): CallHandler {
  return {
    handle: () => of(returnValue),
  };
}

describe('ViewAsResponseInterceptor', () => {
  let interceptor: ViewAsResponseInterceptor;

  beforeEach(() => {
    interceptor = new ViewAsResponseInterceptor();
  });

  describe('when not viewing as', () => {
    it('passes through response unchanged when no viewAsUser', async () => {
      const req = { user: { id: 'user-123' } };
      const ctx = createMockExecutionContext(req);
      const responseData = { items: [1, 2, 3] };
      const next = createMockCallHandler(responseData);

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result).toEqual(responseData);
      expect(result._viewAs).toBeUndefined();
    });

    it('passes through response when viewAsUser but no superadminUser', async () => {
      const req = {
        user: { id: 'user-123' },
        viewAsUser: { id: 'target-456' },
      };
      const ctx = createMockExecutionContext(req);
      const responseData = { foo: 'bar' };
      const next = createMockCallHandler(responseData);

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result).toEqual(responseData);
      expect(result._viewAs).toBeUndefined();
    });
  });

  describe('when viewing as', () => {
    const viewAsUser: ViewAsUser = {
      id: 'target-456',
      displayName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      zitadelUserId: 'zitadel-456',
    };

    const superadminUser = { sub: 'admin-123', email: 'admin@test.com' };

    function createViewAsRequest() {
      return {
        user: superadminUser,
        viewAsUser,
        superadminUser,
      };
    }

    it('adds _viewAs metadata to object responses', async () => {
      const req = createViewAsRequest();
      const ctx = createMockExecutionContext(req);
      const responseData = { items: [1, 2, 3], total: 3 };
      const next = createMockCallHandler(responseData);

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result.items).toEqual([1, 2, 3]);
      expect(result.total).toBe(3);
      expect(result._viewAs).toEqual({
        userId: 'target-456',
        userName: 'John Doe',
        actingAs: 'superadmin',
      });
    });

    it('uses displayName for userName when available', async () => {
      const req = createViewAsRequest();
      const ctx = createMockExecutionContext(req);
      const next = createMockCallHandler({ data: 'test' });

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result._viewAs.userName).toBe('John Doe');
    });

    it('falls back to firstName + lastName when displayName is null', async () => {
      const req = {
        ...createViewAsRequest(),
        viewAsUser: {
          ...viewAsUser,
          displayName: null,
        },
      };
      const ctx = createMockExecutionContext(req);
      const next = createMockCallHandler({ data: 'test' });

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result._viewAs.userName).toBe('John Doe');
    });

    it('returns null userName when no name fields available', async () => {
      const req = {
        ...createViewAsRequest(),
        viewAsUser: {
          id: 'target-456',
          displayName: null,
          firstName: null,
          lastName: null,
          zitadelUserId: 'zitadel-456',
        },
      };
      const ctx = createMockExecutionContext(req);
      const next = createMockCallHandler({ data: 'test' });

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result._viewAs.userName).toBeNull();
    });

    it('passes through null responses unchanged', async () => {
      const req = createViewAsRequest();
      const ctx = createMockExecutionContext(req);
      const next = createMockCallHandler(null);

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result).toBeNull();
    });

    it('passes through undefined responses unchanged', async () => {
      const req = createViewAsRequest();
      const ctx = createMockExecutionContext(req);
      const next = createMockCallHandler(undefined);

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result).toBeUndefined();
    });

    it('passes through primitive responses unchanged', async () => {
      const req = createViewAsRequest();
      const ctx = createMockExecutionContext(req);
      const next = createMockCallHandler('string response');

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result).toBe('string response');
    });

    it('passes through Buffer responses unchanged', async () => {
      const req = createViewAsRequest();
      const ctx = createMockExecutionContext(req);
      const buffer = Buffer.from('binary data');
      const next = createMockCallHandler(buffer);

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('binary data');
    });

    it('handles array responses', async () => {
      const req = createViewAsRequest();
      const ctx = createMockExecutionContext(req);
      const responseData = [1, 2, 3];
      const next = createMockCallHandler(responseData);

      const result = await firstValueFrom(interceptor.intercept(ctx, next));

      expect(result._viewAs).toBeDefined();
      expect(result._viewAs.userId).toBe('target-456');
    });
  });
});
