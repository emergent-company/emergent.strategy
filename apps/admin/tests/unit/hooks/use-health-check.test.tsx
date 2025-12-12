import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useHealthCheck,
  type HealthCheckResponse,
} from '@/hooks/use-health-check';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: {
      VITE_API_URL: 'http://localhost:3000',
    },
  },
});

describe('useHealthCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const healthyResponse: HealthCheckResponse = {
    ok: true,
    model: 'text-embedding-004',
    db: 'up',
    embeddings: 'enabled',
    rls_policies_ok: true,
    rls_policy_count: 8,
    rls_policy_hash: 'policies:123:1a2b',
  };

  const unhealthyResponse: HealthCheckResponse = {
    ok: false,
    model: null,
    db: 'down',
    embeddings: 'disabled',
  };

  const degradedResponse: HealthCheckResponse = {
    ok: true,
    model: 'text-embedding-004',
    db: 'up',
    embeddings: 'enabled',
    rls_policies_ok: false,
    rls_policy_count: 0,
    rls_policy_hash: '',
  };

  describe('initial state', () => {
    it('should start with loading state', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => healthyResponse,
      });

      const { result } = renderHook(() => useHealthCheck());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.status).toBe('unknown');
    });

    it('should fetch health data on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => healthyResponse,
      });

      const { result } = renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('healthy status', () => {
    it('should return healthy status when API responds with ok: true and db: up', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => healthyResponse,
      });

      const { result } = renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(result.current.status).toBe('healthy');
      });

      expect(result.current.data).toEqual(healthyResponse);
      expect(result.current.error).toBeNull();
      expect(result.current.lastChecked).toBeInstanceOf(Date);
    });
  });

  describe('unhealthy status', () => {
    it('should return unhealthy status when API responds with ok: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => unhealthyResponse,
      });

      const { result } = renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(result.current.status).toBe('unhealthy');
      });

      expect(result.current.data).toEqual(unhealthyResponse);
    });

    it('should return unhealthy status when db is down', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...healthyResponse, db: 'down' }),
      });

      const { result } = renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(result.current.status).toBe('unhealthy');
      });
    });

    it('should return unhealthy status on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(result.current.status).toBe('unhealthy');
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
    });

    it('should return unhealthy status on non-200 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const { result } = renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(result.current.status).toBe('unhealthy');
      });

      expect(result.current.error?.message).toContain('503');
    });
  });

  describe('degraded status', () => {
    it('should return degraded status when rls_policies_ok is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => degradedResponse,
      });

      const { result } = renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(result.current.status).toBe('degraded');
      });
    });
  });

  describe('polling', () => {
    it('should poll at the specified interval', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => healthyResponse,
      });

      renderHook(() => useHealthCheck({ interval: 5000 }));

      // Initial fetch
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Advance time by interval
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      // Advance again
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });
    });

    it('should not poll when disabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => healthyResponse,
      });

      renderHook(() => useHealthCheck({ enabled: false }));

      // Should not fetch initially
      expect(mockFetch).not.toHaveBeenCalled();

      // Advance time
      act(() => {
        vi.advanceTimersByTime(60000);
      });

      // Should still not have fetched
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use default 30 second interval', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => healthyResponse,
      });

      renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Advance less than 30 seconds - no new fetch
      act(() => {
        vi.advanceTimersByTime(29000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance past 30 seconds - should fetch again
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('refetch', () => {
    it('should manually trigger a health check', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => healthyResponse,
      });

      const { result } = renderHook(() => useHealthCheck());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Manually refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should keep last known data on subsequent errors', async () => {
      // First call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => healthyResponse,
      });

      const { result } = renderHook(() => useHealthCheck({ interval: 5000 }));

      await waitFor(() => {
        expect(result.current.data).toEqual(healthyResponse);
      });

      // Second call fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Data should still be the last successful response
      expect(result.current.data).toEqual(healthyResponse);
      expect(result.current.status).toBe('unhealthy'); // Status reflects error
    });
  });

  describe('cleanup', () => {
    it('should clean up interval on unmount', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => healthyResponse,
      });

      const { unmount } = renderHook(() => useHealthCheck({ interval: 5000 }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Advance time after unmount
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // No additional fetches after unmount
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
