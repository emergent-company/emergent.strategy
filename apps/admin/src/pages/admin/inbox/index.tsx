/**
 * Admin Notification Inbox Page
 * Main page component for the notification inbox feature
 * Displays user notifications (personal scope)
 */
import { useState } from 'react';
import { MetaData } from '@/components';
import { PageContainer } from '@/components/layouts';
import { NotificationInbox } from '@/components/organisms/NotificationInbox';
import {
  useNotifications,
  useNotificationCounts,
  useNotificationMutations,
} from '@/hooks/useNotifications';
import type {
  NotificationTab,
  NotificationFilter,
  Notification,
} from '@/types/notification';

const InboxPage = () => {
  const [activeTab, setActiveTab] = useState<NotificationTab>('important');
  const [filters] = useState<NotificationFilter>({
    category: 'all',
    unreadOnly: false,
    search: '',
  });

  // Fetch notifications for active tab
  const {
    data: notifications = [],
    isLoading: notificationsLoading,
    refetch: refetchNotifications,
  } = useNotifications(activeTab, filters);

  // Fetch counts for badge display
  const { data: notificationCounts, refetch: refetchNotificationCounts } =
    useNotificationCounts();

  // Notification mutation handlers
  const notificationMutations = useNotificationMutations(() => {
    refetchNotifications();
    refetchNotificationCounts();
  });

  const handleTabChange = (tab: NotificationTab) => {
    setActiveTab(tab);
  };

  const handleNotificationClick = async (notification: Notification) => {
    // If notification has action URL, navigate to it
    if (notification.actionUrl) {
      // Mark as read before navigation
      if (!notification.readAt) {
        await notificationMutations.markRead(notification.id);
      }
      window.location.href = notification.actionUrl;
    }
  };

  const handleFilterClick = () => {
    // TODO: Open filter drawer
    console.log('Open filter drawer');
  };

  const handleClearAll = async () => {
    if (activeTab === 'important' || activeTab === 'other') {
      const confirmed = window.confirm(
        `Clear all notifications in ${activeTab} tab?`
      );
      if (confirmed) {
        await notificationMutations.clearAll(activeTab);
      }
    }
  };

  const handleNotificationResolve = async (
    notificationId: string,
    status: 'accepted' | 'rejected'
  ) => {
    await notificationMutations.resolve(notificationId, status);
  };

  const handleCustomizeClick = () => {
    // TODO: Navigate to notification settings
    console.log('Navigate to notification settings');
  };

  return (
    <PageContainer maxWidth="7xl" testId="page-inbox">
      <MetaData title="Inbox" noIndex />

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Inbox</h1>
        <p className="mt-1 text-base-content/70">
          View and manage your notifications
        </p>
      </div>

      {/* Notifications content */}
      <NotificationInbox
        notifications={notifications}
        counts={
          notificationCounts || {
            all: 0,
            important: 0,
            other: 0,
            snoozed: 0,
            cleared: 0,
          }
        }
        activeTab={activeTab}
        loading={notificationsLoading}
        onTabChange={handleTabChange}
        onNotificationClick={handleNotificationClick}
        onResolve={handleNotificationResolve}
        onFilterClick={handleFilterClick}
        onClearAll={handleClearAll}
        onCustomizeClick={handleCustomizeClick}
      />
    </PageContainer>
  );
};

export default InboxPage;
