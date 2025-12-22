/**
 * NotificationBell Molecule
 * Displays notification bell with badge and dropdown panel
 *
 * Features:
 * - Badge showing unread count
 * - Dropdown panel with recent notifications
 * - Action buttons for each notification
 * - Real-time updates support
 * - Dismiss functionality
 * - Empty state handling
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  useNotificationStats,
  useNotifications,
  useNotificationMutations,
} from '@/hooks/useNotifications';
import type { Notification, NotificationAction } from '@/types/notification';

export interface NotificationBellProps {
  /** Maximum number of notifications to show in dropdown */
  maxNotifications?: number;
  /** Callback when notification is clicked */
  onNotificationClick?: (notification: Notification) => void;
  /** Callback when "View All" is clicked */
  onViewAll?: () => void;
}

// Memoize filters object to prevent recreation on every render
const ALL_NOTIFICATIONS_FILTER = { unreadOnly: false };

export const NotificationBell: React.FC<NotificationBellProps> = ({
  maxNotifications = 5,
  onNotificationClick,
  onViewAll,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Fetch notification stats (unread count for badge)
  const { data: stats, refetch: refetchStats } = useNotificationStats();

  // Fetch recent notifications - use stable filter object
  const {
    data: notifications,
    isLoading,
    refetch: refetchNotifications,
  } = useNotifications('all', ALL_NOTIFICATIONS_FILTER);

  // Mutation hooks
  const { markRead, dismiss } = useNotificationMutations(() => {
    // Refetch both stats and notifications after mutations
    refetchStats();
    refetchNotifications();
  });

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // Mark as read if unread
      if (!notification.read && !notification.readAt) {
        markRead(notification.id).catch(console.error);
      }

      onNotificationClick?.(notification);
      closeMenu();
    },
    [markRead, onNotificationClick, closeMenu]
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent, notificationId: string) => {
      e.stopPropagation();
      dismiss(notificationId).catch(console.error);
    },
    [dismiss]
  );

  const handleActionClick = useCallback(
    (
      e: React.MouseEvent,
      action: NotificationAction,
      notification: Notification
    ) => {
      e.stopPropagation();

      // Mark as read
      if (!notification.read && !notification.readAt) {
        markRead(notification.id).catch(console.error);
      }

      // Navigate to action URL
      if (action.url) {
        window.location.href = action.url;
      }

      closeMenu();
    },
    [markRead, closeMenu]
  );

  const handleViewAll = useCallback(() => {
    onViewAll?.();
    closeMenu();
  }, [onViewAll, closeMenu]);

  // Format relative time
  const formatRelativeTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get severity color classes
  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'error':
        return 'text-error';
      case 'warning':
        return 'text-warning';
      case 'success':
        return 'text-success';
      case 'info':
      default:
        return 'text-info';
    }
  };

  // Get action button style
  const getActionStyle = (style?: string) => {
    switch (style) {
      case 'primary':
        return 'btn-primary';
      case 'warning':
        return 'btn-warning';
      case 'danger':
        return 'btn-error';
      case 'secondary':
      default:
        return 'btn-ghost';
    }
  };

  const recentNotifications = notifications.slice(0, maxNotifications);
  const hasNotifications = recentNotifications.length > 0;
  const unreadCount = stats.unread;

  return (
    <div className="dropdown-bottom dropdown dropdown-end">
      <button
        tabIndex={0}
        role="button"
        className="relative btn btn-circle btn-ghost btn-sm"
        aria-label={`Notifications${
          unreadCount > 0 ? ` (${unreadCount} unread)` : ''
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon icon="lucide--bell" className="size-4.5" />
        {unreadCount > 0 && (
          <div className="top-1 absolute flex justify-center items-center end-1">
            <span className="px-1 min-w-[16px] h-4 font-semibold text-[10px] badge badge-error badge-xs">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </div>
        )}
      </button>

      {isOpen && (
        <div
          tabIndex={0}
          className="z-50 flex flex-col bg-base-100 shadow-lg mt-1 rounded-box w-96 max-h-[600px] overflow-hidden dropdown-content"
        >
          {/* Header */}
          <div className="flex flex-shrink-0 justify-between items-center bg-base-200/30 py-3 ps-4 pe-2 border-b border-base-300">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-base">Notifications</p>
              {unreadCount > 0 && (
                <span className="badge badge-primary badge-sm">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              className="btn btn-xs btn-circle btn-ghost"
              aria-label="Close"
              onClick={closeMenu}
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Spinner size="md" />
              </div>
            ) : !hasNotifications ? (
              <div className="flex flex-col justify-center items-center px-4 py-12">
                <Icon
                  icon="lucide--bell-off"
                  className="mb-3 size-12 text-base-content/30"
                />
                <p className="text-sm text-base-content/60 text-center">
                  No notifications yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-base-300/50">
                {recentNotifications.map((notification) => {
                  const isUnread = !notification.read && !notification.readAt;
                  const hasDismissed =
                    notification.dismissed || notification.clearedAt;

                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-base-200/50 cursor-pointer transition-colors ${
                        isUnread ? 'bg-base-200/20' : ''
                      } ${hasDismissed ? 'opacity-60' : ''}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {/* Notification header with dismiss button */}
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex flex-1 items-start gap-2 min-w-0">
                          {isUnread && (
                            <div className="flex-shrink-0 mt-1.5">
                              <div className="bg-primary rounded-full w-2 h-2"></div>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-sm font-medium mb-1 ${
                                isUnread
                                  ? 'text-base-content'
                                  : 'text-base-content/80'
                              }`}
                            >
                              {notification.severity && (
                                <Icon
                                  icon={
                                    notification.severity === 'error'
                                      ? 'lucide--circle-x'
                                      : notification.severity === 'warning'
                                      ? 'lucide--triangle-alert'
                                      : notification.severity === 'success'
                                      ? 'lucide--circle-check'
                                      : 'lucide--info'
                                  }
                                  className={`inline-block size-4 mr-1 ${getSeverityColor(
                                    notification.severity
                                  )}`}
                                />
                              )}
                              {notification.title}
                            </div>
                            <p className="text-xs text-base-content/60 line-clamp-2">
                              {notification.message}
                            </p>
                          </div>
                        </div>

                        {!hasDismissed && (
                          <button
                            className="flex-shrink-0 btn btn-ghost btn-xs btn-circle"
                            aria-label="Dismiss"
                            onClick={(e) => handleDismiss(e, notification.id)}
                          >
                            <Icon icon="lucide--x" className="size-3" />
                          </button>
                        )}
                      </div>

                      {/* Action buttons */}
                      {notification.actions &&
                        notification.actions.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {notification.actions.map((action, idx) => (
                              <button
                                key={idx}
                                className={`btn btn-xs ${getActionStyle(
                                  action.style
                                )}`}
                                onClick={(e) =>
                                  handleActionClick(e, action, notification)
                                }
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}

                      {/* Timestamp */}
                      <div className="mt-2 text-xs text-base-content/40">
                        {formatRelativeTime(notification.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {hasNotifications && (
            <div className="flex-shrink-0 p-2 border-t border-base-300">
              <button
                className="btn-block btn btn-ghost btn-sm"
                onClick={handleViewAll}
              >
                View All Notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
