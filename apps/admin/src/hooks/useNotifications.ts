/**
 * Notification Data Hooks
 * Custom hooks for notification data fetching and mutations using React state
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  Notification,
  NotificationTab,
  NotificationCounts,
  NotificationStats,
  NotificationFilter,
} from '@/types/notification';
import { createNotificationApi } from '@/services/notification.service';
import { useApi } from '@/hooks/use-api';
import { usePageVisibility } from '@/hooks/use-page-visibility';

/**
 * Hook to fetch notifications for a specific tab
 */
export function useNotifications(
  tab: NotificationTab = 'important',
  filters: NotificationFilter = {}
) {
  const { apiBase, fetchJson } = useApi();
  const notificationApi = useMemo(
    () => createNotificationApi(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [data, setData] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memoize filters to avoid triggering refetch on object reference changes
  // Only recalculate when actual filter values change
  const stableFilters = useMemo(
    () => ({
      category: filters.category,
      unreadOnly: filters.unreadOnly,
      search: filters.search,
    }),
    [filters.category, filters.unreadOnly, filters.search]
  );

  // Use refs to track current values for the refetch callback
  const tabRef = useRef(tab);
  const filtersRef = useRef(stableFilters);

  // Update refs when values change
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    filtersRef.current = stableFilters;
  }, [stableFilters]);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const notifications = await notificationApi.getNotifications(
        tabRef.current,
        filtersRef.current
      );
      setData(notifications);
    } catch (err) {
      const error = err as Error;
      setError(error);
      // Log as info instead of error to avoid spurious console errors during initialization
      console.log('Failed to fetch notifications:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [notificationApi]); // Only depends on API, not tab/filters

  useEffect(() => {
    refetch();
  }, [tab, stableFilters, refetch]); // Use stableFilters instead of raw filters object

  return { data, isLoading, error, refetch };
}

/**
 * Hook to fetch notification stats (unread, dismissed, total)
 * New hook for migration 0005 stats endpoint
 * Pauses polling when tab is not visible
 */
export function useNotificationStats() {
  const { apiBase, fetchJson } = useApi();
  const isVisible = usePageVisibility();
  const notificationApi = useMemo(
    () => createNotificationApi(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [data, setData] = useState<NotificationStats>({
    unread: 0,
    dismissed: 0,
    total: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const stats = await notificationApi.getStats();
      setData(stats);
    } catch (err) {
      const error = err as Error;
      setError(error);
      // Log as info instead of error to avoid spurious console errors during initialization
      console.log('Failed to fetch notification stats:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [notificationApi]);

  useEffect(() => {
    // Don't poll when tab is hidden
    if (!isVisible) return;

    refetch();
    // Refetch every minute
    const interval = setInterval(() => {
      refetch();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch, isVisible]);

  return { data, isLoading, error, refetch };
}

/**
 * Hook to fetch notification counts
 * Pauses polling when tab is not visible
 */
export function useNotificationCounts() {
  const { apiBase, fetchJson } = useApi();
  const isVisible = usePageVisibility();
  const notificationApi = useMemo(
    () => createNotificationApi(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [data, setData] = useState<NotificationCounts>({
    all: 0,
    important: 0,
    other: 0,
    snoozed: 0,
    cleared: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const counts = await notificationApi.getUnreadCounts();
      setData(counts);
    } catch (err) {
      const error = err as Error;
      setError(error);
      // Log as info instead of error to avoid spurious console errors during initialization
      console.log('Failed to fetch notification counts:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [notificationApi]);

  useEffect(() => {
    // Don't poll when tab is hidden
    if (!isVisible) return;

    refetch();
    // Refetch every minute
    const interval = setInterval(() => {
      refetch();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch, isVisible]);

  return { data, isLoading, error, refetch };
}

/**
 * Hook for notification mutations
 */
export function useNotificationMutations(onSuccess?: () => void) {
  const { apiBase, fetchJson } = useApi();
  const notificationApi = useMemo(
    () => createNotificationApi(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const markRead = useCallback(
    async (notificationId: string) => {
      try {
        setIsLoading(true);
        setError(null);
        await notificationApi.markRead(notificationId);
        onSuccess?.();
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [notificationApi, onSuccess]
  );

  const markUnread = useCallback(
    async (notificationId: string) => {
      try {
        setIsLoading(true);
        setError(null);
        await notificationApi.markUnread(notificationId);
        onSuccess?.();
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [notificationApi, onSuccess]
  );

  const clear = useCallback(
    async (notificationId: string) => {
      try {
        setIsLoading(true);
        setError(null);
        await notificationApi.clear(notificationId);
        onSuccess?.();
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [notificationApi, onSuccess]
  );

  const clearAll = useCallback(
    async (tab: 'important' | 'other') => {
      try {
        setIsLoading(true);
        setError(null);
        await notificationApi.clearAll(tab);
        onSuccess?.();
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [notificationApi, onSuccess]
  );

  const snooze = useCallback(
    async (notificationId: string, until: string) => {
      try {
        setIsLoading(true);
        setError(null);
        await notificationApi.snooze(notificationId, until);
        onSuccess?.();
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [notificationApi, onSuccess]
  );

  const dismiss = useCallback(
    async (notificationId: string) => {
      try {
        setIsLoading(true);
        setError(null);
        await notificationApi.dismiss(notificationId);
        onSuccess?.();
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [notificationApi, onSuccess]
  );

  const resolve = useCallback(
    async (notificationId: string, status: 'accepted' | 'rejected') => {
      try {
        setIsLoading(true);
        setError(null);
        await notificationApi.resolve(notificationId, status);
        onSuccess?.();
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [notificationApi, onSuccess]
  );

  return {
    markRead,
    markUnread,
    clear,
    clearAll,
    snooze,
    dismiss,
    resolve,
    isLoading,
    error,
  };
}
