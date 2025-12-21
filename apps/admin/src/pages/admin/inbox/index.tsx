/**
 * Admin Notification Inbox Page
 * Main page component for the notification inbox feature
 * Displays user notifications (personal scope) and pending invitations
 */
import { useState } from 'react';
import { MetaData } from '@/components';
import { PageContainer } from '@/components/layouts';
import { NotificationInbox } from '@/components/organisms/NotificationInbox';
import { PendingInvitationCard } from '@/components/molecules/PendingInvitationCard';
import {
  useNotifications,
  useNotificationCounts,
  useNotificationMutations,
} from '@/hooks/useNotifications';
import { usePendingInvites } from '@/hooks/use-pending-invites';
import { useToast } from '@/hooks/use-toast';
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
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(
    null
  );

  // Toast notifications
  const { showToast } = useToast();

  // Fetch pending invitations
  const {
    invites: pendingInvites,
    isLoading: invitesLoading,
    acceptInvite,
    declineInvite,
  } = usePendingInvites();

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

  // Invitation handlers
  const handleAcceptInvite = async (token: string) => {
    const invite = pendingInvites.find((i) => i.token === token);
    if (invite) {
      setProcessingInviteId(invite.id);
    }
    try {
      await acceptInvite(token);
      showToast({
        message: 'Invitation accepted! You now have access to the project.',
        variant: 'success',
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to accept invitation',
        variant: 'error',
      });
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    setProcessingInviteId(inviteId);
    try {
      await declineInvite(inviteId);
      showToast({
        message: 'Invitation declined.',
        variant: 'info',
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to decline invitation',
        variant: 'error',
      });
    } finally {
      setProcessingInviteId(null);
    }
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

      {/* Pending Invitations Section */}
      {!invitesLoading && pendingInvites.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-lg mb-3">Pending Invitations</h2>
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <PendingInvitationCard
                key={invite.id}
                invite={invite}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
                isAccepting={processingInviteId === invite.id}
                isDeclining={processingInviteId === invite.id}
              />
            ))}
          </div>
        </div>
      )}

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
