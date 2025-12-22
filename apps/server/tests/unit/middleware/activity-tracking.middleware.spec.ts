import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ActivityTrackingMiddleware } from '../../../src/common/middleware/activity-tracking.middleware';
import { Request, Response, NextFunction } from 'express';

function createMockRepository() {
  return {
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
}

function createMockRequest(user: { id?: string } | null = null): Request {
  return { user } as any;
}

function createMockResponse(): Response {
  return {} as Response;
}

describe('ActivityTrackingMiddleware', () => {
  let middleware: ActivityTrackingMiddleware;
  let mockRepository: ReturnType<typeof createMockRepository>;
  let next: NextFunction;

  beforeEach(() => {
    ActivityTrackingMiddleware.clearActivityCache();
    mockRepository = createMockRepository();
    middleware = new ActivityTrackingMiddleware(mockRepository as any);
    next = vi.fn();
  });

  afterEach(() => {
    ActivityTrackingMiddleware.clearActivityCache();
    vi.restoreAllMocks();
  });

  describe('unauthenticated requests', () => {
    it('calls next() without tracking when no user present', () => {
      const req = createMockRequest(null);
      const res = createMockResponse();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('calls next() without tracking when user has no id', () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('authenticated requests', () => {
    it('updates activity on first request for a user', async () => {
      const req = createMockRequest({ id: 'user-123' });
      const res = createMockResponse();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      await vi.waitFor(() => {
        expect(mockRepository.update).toHaveBeenCalledWith(
          { id: 'user-123' },
          { lastActivityAt: expect.any(Date) }
        );
      });
    });

    it('sets cache entry after updating', () => {
      const req = createMockRequest({ id: 'user-456' });
      const res = createMockResponse();

      middleware.use(req, res, next);

      const cache = ActivityTrackingMiddleware.getActivityCache();
      expect(cache.has('user-456')).toBe(true);
    });
  });

  describe('debouncing', () => {
    it('does not update DB for subsequent requests within debounce window', async () => {
      const userId = 'user-debounce';
      const req1 = createMockRequest({ id: userId });
      const req2 = createMockRequest({ id: userId });
      const res = createMockResponse();

      middleware.use(req1, res, next);
      await vi.waitFor(() =>
        expect(mockRepository.update).toHaveBeenCalledTimes(1)
      );

      mockRepository.update.mockClear();
      middleware.use(req2, res, next);

      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('updates DB after debounce window expires', async () => {
      const userId = 'user-expired';
      const req = createMockRequest({ id: userId });
      const res = createMockResponse();

      const pastTime = Date.now() - 61_000;
      ActivityTrackingMiddleware.setCacheEntry(userId, pastTime);

      middleware.use(req, res, next);

      await vi.waitFor(() => {
        expect(mockRepository.update).toHaveBeenCalledWith(
          { id: userId },
          { lastActivityAt: expect.any(Date) }
        );
      });
    });

    it('handles multiple different users independently', async () => {
      const req1 = createMockRequest({ id: 'user-A' });
      const req2 = createMockRequest({ id: 'user-B' });
      const res = createMockResponse();

      middleware.use(req1, res, next);
      middleware.use(req2, res, next);

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

      const req = createMockRequest({ id: userId });
      const res = createMockResponse();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();

      await vi.waitFor(() => {
        expect(mockRepository.update).toHaveBeenCalled();
      });

      await new Promise((r) => setTimeout(r, 10));

      const cache = ActivityTrackingMiddleware.getActivityCache();
      expect(cache.has(userId)).toBe(false);
    });

    it('does not throw when DB update fails (non-blocking)', () => {
      mockRepository.update.mockRejectedValue(new Error('DB error'));

      const req = createMockRequest({ id: 'user-nothrow' });
      const res = createMockResponse();

      expect(() => middleware.use(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('static test utilities', () => {
    it('getActivityCache returns the cache Map', () => {
      const cache = ActivityTrackingMiddleware.getActivityCache();
      expect(cache).toBeInstanceOf(Map);
    });

    it('clearActivityCache empties the cache', () => {
      ActivityTrackingMiddleware.setCacheEntry('test-user', Date.now());
      expect(ActivityTrackingMiddleware.getActivityCache().size).toBe(1);

      ActivityTrackingMiddleware.clearActivityCache();
      expect(ActivityTrackingMiddleware.getActivityCache().size).toBe(0);
    });

    it('setCacheEntry sets a specific entry', () => {
      const timestamp = 1234567890;
      ActivityTrackingMiddleware.setCacheEntry('custom-user', timestamp);

      const cache = ActivityTrackingMiddleware.getActivityCache();
      expect(cache.get('custom-user')).toBe(timestamp);
    });
  });

  describe('updateActivityInDb', () => {
    it('can be called directly for testing', async () => {
      await middleware.updateActivityInDb('direct-user');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 'direct-user' },
        { lastActivityAt: expect.any(Date) }
      );
    });
  });
});
