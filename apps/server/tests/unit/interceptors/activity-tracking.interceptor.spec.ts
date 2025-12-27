import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ActivityTrackingInterceptor } from '../../../src/common/interceptors/activity-tracking.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';

function createMockRepository() {
  return {
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
}

function createMockExecutionContext(
  user: { id?: string } | null = null
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

function createMockCallHandler(): CallHandler {
  return {
    handle: () => of({ success: true }),
  };
}

describe('ActivityTrackingInterceptor', () => {
  let interceptor: ActivityTrackingInterceptor;
  let mockRepository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    ActivityTrackingInterceptor.clearActivityCache();
    mockRepository = createMockRepository();
    interceptor = new ActivityTrackingInterceptor(mockRepository as any);
  });

  afterEach(() => {
    ActivityTrackingInterceptor.clearActivityCache();
    vi.restoreAllMocks();
  });

  describe('unauthenticated requests', () => {
    it('proceeds without tracking when no user present', async () => {
      const context = createMockExecutionContext(null);
      const handler = createMockCallHandler();

      const result = await firstValueFrom(
        interceptor.intercept(context, handler)
      );

      expect(result).toEqual({ success: true });
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('proceeds without tracking when user has no id', async () => {
      const context = createMockExecutionContext({});
      const handler = createMockCallHandler();

      await firstValueFrom(interceptor.intercept(context, handler));

      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('authenticated requests', () => {
    it('updates activity on first request for a user', async () => {
      const context = createMockExecutionContext({ id: 'user-123' });
      const handler = createMockCallHandler();

      await firstValueFrom(interceptor.intercept(context, handler));

      await vi.waitFor(() => {
        expect(mockRepository.update).toHaveBeenCalledWith(
          { id: 'user-123' },
          { lastActivityAt: expect.any(Date) }
        );
      });
    });

    it('sets cache entry after updating', async () => {
      const context = createMockExecutionContext({ id: 'user-456' });
      const handler = createMockCallHandler();

      await firstValueFrom(interceptor.intercept(context, handler));

      const cache = ActivityTrackingInterceptor.getActivityCache();
      expect(cache.has('user-456')).toBe(true);
    });
  });

  describe('debouncing', () => {
    it('does not update DB for subsequent requests within debounce window', async () => {
      const userId = 'user-debounce';
      const context1 = createMockExecutionContext({ id: userId });
      const context2 = createMockExecutionContext({ id: userId });
      const handler = createMockCallHandler();

      await firstValueFrom(interceptor.intercept(context1, handler));

      await vi.waitFor(() =>
        expect(mockRepository.update).toHaveBeenCalledTimes(1)
      );

      mockRepository.update.mockClear();

      await firstValueFrom(interceptor.intercept(context2, handler));

      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('updates DB after debounce window expires', async () => {
      const userId = 'user-expired';
      const context = createMockExecutionContext({ id: userId });
      const handler = createMockCallHandler();

      const pastTime = Date.now() - 61_000;
      ActivityTrackingInterceptor.setCacheEntry(userId, pastTime);

      await firstValueFrom(interceptor.intercept(context, handler));

      await vi.waitFor(() => {
        expect(mockRepository.update).toHaveBeenCalledWith(
          { id: userId },
          { lastActivityAt: expect.any(Date) }
        );
      });
    });

    it('handles multiple different users independently', async () => {
      const context1 = createMockExecutionContext({ id: 'user-A' });
      const context2 = createMockExecutionContext({ id: 'user-B' });
      const handler = createMockCallHandler();

      await firstValueFrom(interceptor.intercept(context1, handler));
      await firstValueFrom(interceptor.intercept(context2, handler));

      await vi.waitFor(() => {
        expect(mockRepository.update).toHaveBeenCalledTimes(2);
      });

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 'user-A' },
        { lastActivityAt: expect.any(Date) }
      );
      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 'user-B' },
        { lastActivityAt: expect.any(Date) }
      );
    });
  });

  describe('error handling', () => {
    it('clears cache entry on DB update failure', async () => {
      const userId = 'user-error';
      mockRepository.update.mockRejectedValue(
        new Error('DB connection failed')
      );

      const context = createMockExecutionContext({ id: userId });
      const handler = createMockCallHandler();

      await firstValueFrom(interceptor.intercept(context, handler));

      await vi.waitFor(() => {
        expect(mockRepository.update).toHaveBeenCalled();
      });

      await new Promise((r) => setTimeout(r, 10));

      const cache = ActivityTrackingInterceptor.getActivityCache();
      expect(cache.has(userId)).toBe(false);
    });

    it('does not throw when DB update fails (non-blocking)', async () => {
      mockRepository.update.mockRejectedValue(new Error('DB error'));

      const context = createMockExecutionContext({ id: 'user-nothrow' });
      const handler = createMockCallHandler();

      const result = await firstValueFrom(
        interceptor.intercept(context, handler)
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe('static test utilities', () => {
    it('getActivityCache returns the cache Map', () => {
      const cache = ActivityTrackingInterceptor.getActivityCache();
      expect(cache).toBeInstanceOf(Map);
    });

    it('clearActivityCache empties the cache', () => {
      ActivityTrackingInterceptor.setCacheEntry('test-user', Date.now());
      expect(ActivityTrackingInterceptor.getActivityCache().size).toBe(1);

      ActivityTrackingInterceptor.clearActivityCache();
      expect(ActivityTrackingInterceptor.getActivityCache().size).toBe(0);
    });

    it('setCacheEntry sets a specific entry', () => {
      const timestamp = 1234567890;
      ActivityTrackingInterceptor.setCacheEntry('custom-user', timestamp);

      const cache = ActivityTrackingInterceptor.getActivityCache();
      expect(cache.get('custom-user')).toBe(timestamp);
    });
  });

  describe('updateActivityInDb', () => {
    it('can be called directly for testing', async () => {
      await interceptor.updateActivityInDb('direct-user');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 'direct-user' },
        { lastActivityAt: expect.any(Date) }
      );
    });
  });
});
