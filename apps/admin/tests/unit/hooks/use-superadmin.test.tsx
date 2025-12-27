import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSuperadmin } from '@/hooks/use-superadmin';

// Mock the useApi hook
const mockFetchJson = vi.fn();
vi.mock('@/hooks/use-api', () => ({
  useApi: () => ({
    apiBase: 'http://test-api',
    fetchJson: mockFetchJson,
  }),
}));

describe('useSuperadmin', () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with loading state', () => {
      mockFetchJson.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useSuperadmin());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isSuperadmin).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should fetch superadmin status on mount', async () => {
      mockFetchJson.mockResolvedValueOnce({ isSuperadmin: true });

      renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(1);
      });

      expect(mockFetchJson).toHaveBeenCalledWith(
        'http://test-api/api/superadmin/me',
        { suppressErrorLog: true }
      );
    });
  });

  describe('superadmin user', () => {
    it('should return isSuperadmin true when API confirms superadmin', async () => {
      mockFetchJson.mockResolvedValueOnce({ isSuperadmin: true });

      const { result } = renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSuperadmin).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('should return isSuperadmin false when API returns false', async () => {
      mockFetchJson.mockResolvedValueOnce({ isSuperadmin: false });

      const { result } = renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSuperadmin).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('non-superadmin user', () => {
    it('should return isSuperadmin false on 403 error', async () => {
      mockFetchJson.mockRejectedValueOnce(new Error('Forbidden'));

      const { result } = renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSuperadmin).toBe(false);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Forbidden');
    });

    it('should handle network errors gracefully', async () => {
      mockFetchJson.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSuperadmin).toBe(false);
      expect(result.current.error?.message).toBe('Network error');
    });

    it('should handle non-Error exceptions', async () => {
      mockFetchJson.mockRejectedValueOnce('string error');

      const { result } = renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSuperadmin).toBe(false);
      expect(result.current.error?.message).toBe(
        'Failed to check superadmin status'
      );
    });
  });

  describe('refetch', () => {
    it('should allow manual refetch', async () => {
      // First call - not superadmin
      mockFetchJson.mockResolvedValueOnce({ isSuperadmin: false });

      const { result } = renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(result.current.isSuperadmin).toBe(false);
      });

      // Second call - now superadmin
      mockFetchJson.mockResolvedValueOnce({ isSuperadmin: true });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.isSuperadmin).toBe(true);
      expect(mockFetchJson).toHaveBeenCalledTimes(2);
    });

    it('should set loading state during refetch', async () => {
      mockFetchJson.mockResolvedValueOnce({ isSuperadmin: false });

      const { result } = renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Mock slow response for refetch
      let resolveRefetch: (value: { isSuperadmin: boolean }) => void;
      mockFetchJson.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefetch = resolve;
          })
      );

      const refetchPromise = result.current.refetch();

      // Should be loading
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      // Resolve the refetch
      resolveRefetch!({ isSuperadmin: true });
      await refetchPromise;

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should clear previous error on successful refetch', async () => {
      // First call - error
      mockFetchJson.mockRejectedValueOnce(new Error('Failed'));

      const { result } = renderHook(() => useSuperadmin());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Second call - success
      mockFetchJson.mockResolvedValueOnce({ isSuperadmin: true });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isSuperadmin).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should not cause memory leak on unmount during fetch', async () => {
      let resolvePromise: () => void;
      mockFetchJson.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = () => resolve({ isSuperadmin: true });
          })
      );

      const { unmount } = renderHook(() => useSuperadmin());

      // Unmount while fetch is pending
      unmount();

      // Resolve after unmount - should not throw
      resolvePromise!();

      // No assertion needed - we just verify no uncaught errors
    });
  });
});
