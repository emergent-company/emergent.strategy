/**
 * Notification API Service
 * Handles all notification-related API calls
 *
 * Factory function that creates notification API methods with auth context
 */
import type {
  Notification,
  NotificationTab,
  NotificationCounts,
  NotificationStats,
  NotificationFilter,
} from '@/types/notification';

type FetchJsonFn = <T>(url: string, init?: any) => Promise<T>;

export const createNotificationApi = (
  apiBase: string,
  fetchJson: FetchJsonFn
) => ({
  /**
   * Get notifications for a specific tab
   */
  async getNotifications(
    tab: NotificationTab = 'important',
    filters: NotificationFilter = {}
  ): Promise<Notification[]> {
    const params = new URLSearchParams();
    params.append('tab', tab);

    if (filters.category && filters.category !== 'all') {
      params.append('category', filters.category);
    }

    if (filters.unreadOnly) {
      params.append('unread_only', 'true');
    }

    if (filters.search) {
      params.append('search', filters.search);
    }

    const result = await fetchJson<{ data?: Notification[] }>(
      `${apiBase}/api/notifications?${params.toString()}`,
      {
        credentials: 'include',
      }
    );
    return result.data || [];
  },

  /**
   * Get unread counts for all tabs
   */
  async getUnreadCounts(): Promise<NotificationCounts> {
    const result = await fetchJson<{ data?: NotificationCounts }>(
      `${apiBase}/api/notifications/counts`,
      {
        credentials: 'include',
      }
    );
    return (
      result.data || { all: 0, important: 0, other: 0, snoozed: 0, cleared: 0 }
    );
  },

  /**
   * Get notification stats (unread, dismissed, total)
   * New endpoint from migration 0005
   */
  async getStats(): Promise<NotificationStats> {
    const result = await fetchJson<NotificationStats>(
      `${apiBase}/api/notifications/stats`,
      {
        credentials: 'include',
      }
    );
    return result || { unread: 0, dismissed: 0, total: 0 };
  },

  /**
   * Mark notification as read
   */
  async markRead(notificationId: string): Promise<void> {
    await fetchJson(`${apiBase}/api/notifications/${notificationId}/read`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  /**
   * Mark notification as unread
   */
  async markUnread(notificationId: string): Promise<void> {
    await fetchJson(`${apiBase}/api/notifications/${notificationId}/unread`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  /**
   * Clear notification (move to cleared tab)
   */
  async clear(notificationId: string): Promise<void> {
    await fetchJson(`${apiBase}/api/notifications/${notificationId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  /**
   * Clear all notifications in a tab
   */
  async clearAll(tab: 'important' | 'other'): Promise<number> {
    const result = await fetchJson<{ cleared?: number }>(
      `${apiBase}/api/notifications?tab=${tab}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );
    return result.cleared || 0;
  },

  /**
   * Snooze notification until a specific time
   */
  async snooze(notificationId: string, until: string): Promise<void> {
    await fetchJson(`${apiBase}/api/notifications/${notificationId}/snooze`, {
      method: 'POST',
      body: { until },
      credentials: 'include',
    });
  },

  /**
   * Unsnooze notification
   */
  async unsnooze(notificationId: string): Promise<void> {
    await fetchJson(`${apiBase}/api/notifications/${notificationId}/unsnooze`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  /**
   * Dismiss notification
   * New endpoint from migration 0005
   */
  async dismiss(notificationId: string): Promise<void> {
    await fetchJson(`${apiBase}/api/notifications/${notificationId}/dismiss`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  /**
   * Resolve an actionable notification (accept or reject)
   * Used for notifications that require user action (e.g., merge suggestions)
   */
  async resolve(
    notificationId: string,
    status: 'accepted' | 'rejected'
  ): Promise<void> {
    await fetchJson(`${apiBase}/api/notifications/${notificationId}/resolve`, {
      method: 'POST',
      body: { status },
      credentials: 'include',
    });
  },
});
