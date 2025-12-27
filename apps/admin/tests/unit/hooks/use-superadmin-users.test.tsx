import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSuperadminUsers } from '@/hooks/use-superadmin-users';
import type { ListUsersResponse, SuperadminUser } from '@/types/superadmin';

const mockFetchJson = vi.fn();
vi.mock('@/hooks/use-api', () => ({
  useApi: () => ({
    apiBase: 'http://test-api',
    fetchJson: mockFetchJson,
  }),
}));

const createMockUser = (
  overrides: Partial<SuperadminUser> = {}
): SuperadminUser => ({
  id: 'user-1',
  displayName: 'Test User',
  email: 'test@example.com',
  lastActivityAt: '2025-01-01T00:00:00Z',
  organizations: [],
  ...overrides,
});

const createMockResponse = (
  users: SuperadminUser[] = [createMockUser()],
  meta: Partial<ListUsersResponse['meta']> = {}
): ListUsersResponse => ({
  users,
  meta: {
    page: 1,
    limit: 20,
    total: users.length,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
    ...meta,
  },
});

describe('useSuperadminUsers', () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with loading state', () => {
      mockFetchJson.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useSuperadminUsers());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.users).toEqual([]);
      expect(result.current.meta).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should fetch users on mount with default params', async () => {
      mockFetchJson.mockResolvedValueOnce(createMockResponse());

      renderHook(() => useSuperadminUsers());

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(1);
      });

      expect(mockFetchJson).toHaveBeenCalledWith(
        'http://test-api/api/superadmin/users?page=1&limit=20'
      );
    });
  });

  describe('successful fetch', () => {
    it('should return users and meta on success', async () => {
      const users = [
        createMockUser({ id: 'user-1', displayName: 'User One' }),
        createMockUser({ id: 'user-2', displayName: 'User Two' }),
      ];
      mockFetchJson.mockResolvedValueOnce(
        createMockResponse(users, { total: 2 })
      );

      const { result } = renderHook(() => useSuperadminUsers());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.users).toHaveLength(2);
      expect(result.current.users[0].displayName).toBe('User One');
      expect(result.current.meta?.total).toBe(2);
      expect(result.current.error).toBeNull();
    });
  });

  describe('pagination', () => {
    it('should pass page and limit params', async () => {
      mockFetchJson.mockResolvedValueOnce(createMockResponse());

      renderHook(() => useSuperadminUsers({ page: 2, limit: 50 }));

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(1);
      });

      expect(mockFetchJson).toHaveBeenCalledWith(
        'http://test-api/api/superadmin/users?page=2&limit=50'
      );
    });

    it('should return pagination meta with hasNext/hasPrev', async () => {
      mockFetchJson.mockResolvedValueOnce(
        createMockResponse([createMockUser()], {
          page: 2,
          totalPages: 5,
          hasNext: true,
          hasPrev: true,
        })
      );

      const { result } = renderHook(() => useSuperadminUsers({ page: 2 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.meta?.page).toBe(2);
      expect(result.current.meta?.hasNext).toBe(true);
      expect(result.current.meta?.hasPrev).toBe(true);
    });

    it('should refetch when page changes', async () => {
      mockFetchJson.mockResolvedValue(createMockResponse());

      const { rerender } = renderHook(
        ({ page }) => useSuperadminUsers({ page }),
        { initialProps: { page: 1 } }
      );

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(1);
      });

      rerender({ page: 2 });

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(2);
      });

      expect(mockFetchJson).toHaveBeenLastCalledWith(
        'http://test-api/api/superadmin/users?page=2&limit=20'
      );
    });
  });

  describe('search', () => {
    it('should pass search param when provided', async () => {
      mockFetchJson.mockResolvedValueOnce(createMockResponse());

      renderHook(() => useSuperadminUsers({ search: 'john' }));

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(1);
      });

      expect(mockFetchJson).toHaveBeenCalledWith(
        'http://test-api/api/superadmin/users?page=1&limit=20&search=john'
      );
    });

    it('should refetch when search changes', async () => {
      mockFetchJson.mockResolvedValue(createMockResponse());

      const { rerender } = renderHook(
        ({ search }) => useSuperadminUsers({ search }),
        { initialProps: { search: 'john' } }
      );

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(1);
      });

      rerender({ search: 'jane' });

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('org filter', () => {
    it('should pass orgId param when provided', async () => {
      mockFetchJson.mockResolvedValueOnce(createMockResponse());

      renderHook(() => useSuperadminUsers({ orgId: 'org-123' }));

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(1);
      });

      expect(mockFetchJson).toHaveBeenCalledWith(
        'http://test-api/api/superadmin/users?page=1&limit=20&orgId=org-123'
      );
    });

    it('should support combined filters', async () => {
      mockFetchJson.mockResolvedValueOnce(createMockResponse());

      renderHook(() =>
        useSuperadminUsers({
          page: 3,
          limit: 10,
          search: 'test',
          orgId: 'org-456',
        })
      );

      await waitFor(() => {
        expect(mockFetchJson).toHaveBeenCalledTimes(1);
      });

      expect(mockFetchJson).toHaveBeenCalledWith(
        'http://test-api/api/superadmin/users?page=3&limit=10&search=test&orgId=org-456'
      );
    });
  });

  describe('error handling', () => {
    it('should handle fetch error', async () => {
      mockFetchJson.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useSuperadminUsers());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.users).toEqual([]);
      expect(result.current.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockFetchJson.mockRejectedValueOnce('string error');

      const { result } = renderHook(() => useSuperadminUsers());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error?.message).toBe('Failed to fetch users');
    });
  });

  describe('refetch', () => {
    it('should allow manual refetch', async () => {
      const firstResponse = createMockResponse([
        createMockUser({ id: 'user-1', displayName: 'First User' }),
      ]);
      const secondResponse = createMockResponse([
        createMockUser({ id: 'user-1', displayName: 'Updated User' }),
      ]);

      mockFetchJson.mockResolvedValueOnce(firstResponse);

      const { result } = renderHook(() => useSuperadminUsers());

      await waitFor(() => {
        expect(result.current.users[0]?.displayName).toBe('First User');
      });

      mockFetchJson.mockResolvedValueOnce(secondResponse);

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.users[0]?.displayName).toBe('Updated User');
      expect(mockFetchJson).toHaveBeenCalledTimes(2);
    });
  });
});
