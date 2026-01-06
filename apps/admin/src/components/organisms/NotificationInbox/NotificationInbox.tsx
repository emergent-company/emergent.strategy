/**
 * NotificationInbox Organism
 * Full notification inbox UI matching ClickUp's design
 */
import React, { useState } from 'react';
import { NotificationTabButton } from '@/components/molecules/NotificationTabButton';
import { NotificationRow } from '@/components/molecules/NotificationRow';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import type {
  Notification,
  NotificationTab,
  NotificationCounts,
} from '@/types/notification';

export interface NotificationInboxProps {
  notifications: Notification[];
  counts: NotificationCounts;
  activeTab?: NotificationTab;
  loading?: boolean;
  onTabChange?: (tab: NotificationTab) => void;
  onNotificationClick?: (notification: Notification) => void;
  onResolve?: (notificationId: string, status: 'accepted' | 'rejected') => void;
  onFilterClick?: () => void;
  onClearAll?: () => void;
  onCustomizeClick?: () => void;
}

interface TimeGroup {
  title: string;
  notifications: Notification[];
}

export const NotificationInbox: React.FC<NotificationInboxProps> = ({
  notifications,
  counts,
  activeTab = 'important',
  loading = false,
  onTabChange,
  onNotificationClick,
  onResolve,
  onFilterClick,
  onClearAll,
  onCustomizeClick,
}) => {
  // Group notifications by time
  const groupByTime = (notifs: Notification[]): TimeGroup[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: TimeGroup[] = [
      { title: 'Today', notifications: [] },
      { title: 'Yesterday', notifications: [] },
      { title: 'Last 7 days', notifications: [] },
      { title: 'Earlier', notifications: [] },
    ];

    notifs.forEach((notif) => {
      const date = new Date(notif.createdAt);
      if (date >= today) {
        groups[0].notifications.push(notif);
      } else if (date >= yesterday) {
        groups[1].notifications.push(notif);
      } else if (date >= lastWeek) {
        groups[2].notifications.push(notif);
      } else {
        groups[3].notifications.push(notif);
      }
    });

    return groups.filter((group) => group.notifications.length > 0);
  };

  const timeGroups = groupByTime(notifications);

  return (
    <div className="flex flex-col bg-base-100 border border-base-300 rounded h-full">
      {/* Top bar with tabs and actions */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-base-300">
        {/* Tabs */}
        <div className="flex items-center gap-1" role="tablist">
          <NotificationTabButton
            label="All"
            tab="all"
            active={activeTab === 'all'}
            onClick={() => onTabChange?.('all')}
          />
          <NotificationTabButton
            label="Important"
            tab="important"
            active={activeTab === 'important'}
            count={counts.important}
            showBadge
            onClick={() => onTabChange?.('important')}
          />
          <NotificationTabButton
            label="Other"
            tab="other"
            active={activeTab === 'other'}
            count={counts.other}
            showBadge
            onClick={() => onTabChange?.('other')}
          />
          <NotificationTabButton
            label="Snoozed"
            tab="snoozed"
            active={activeTab === 'snoozed'}
            count={counts.snoozed}
            showBadge={counts.snoozed > 0}
            onClick={() => onTabChange?.('snoozed')}
          />
          <NotificationTabButton
            label="Cleared"
            tab="cleared"
            active={activeTab === 'cleared'}
            onClick={() => onTabChange?.('cleared')}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="soft"
            onClick={onFilterClick}
            startIcon={<Icon icon="lucide--filter" />}
            aria-label="Filter notifications"
          />
          <Button size="sm" variant="soft" onClick={onClearAll}>
            Clear all
          </Button>
          <Button size="sm" variant="soft" onClick={onCustomizeClick}>
            Customize
          </Button>
        </div>
      </div>

      {/* Notification list */}
      <div
        className="flex-1 overflow-y-auto"
        role="tabpanel"
        id={`${activeTab}-panel`}
      >
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Spinner size="md" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col justify-center items-center gap-3 py-16 text-center">
            <Icon
              icon="lucide--inbox"
              className="w-12 h-12 text-base-content/30"
            />
            <div className="text-sm text-base-content/60">
              No notifications in this tab.
            </div>
          </div>
        ) : (
          timeGroups.map((group) => (
            <div key={group.title} className="mb-4">
              <div className="px-4 py-2 font-semibold text-xs text-base-content/50">
                {group.title}
              </div>
              {group.notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onClick={onNotificationClick}
                  onResolve={onResolve}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationInbox;
