/**
 * Admin Notification Inbox Page
 * Main page component for the notification inbox feature
 */
import { useState } from 'react';
import { MetaData, PageTitle } from '@/components';
import { NotificationInbox } from '@/components/organisms/NotificationInbox';
import { useNotifications, useNotificationCounts, useNotificationMutations } from '@/hooks/useNotifications';
import type { NotificationTab, NotificationFilter, Notification } from '@/types/notification';

const InboxPage = () => {
    const [activeTab, setActiveTab] = useState<NotificationTab>('important');
    const [filters, setFilters] = useState<NotificationFilter>({
        category: 'all',
        unreadOnly: false,
        search: '',
    });

    // Fetch notifications for active tab
    const { data: notifications = [], isLoading, refetch } = useNotifications(activeTab, filters);

    // Fetch counts for badge display
    const { data: counts, refetch: refetchCounts } = useNotificationCounts();

    // Mutation handlers
    const mutations = useNotificationMutations(() => {
        // Refetch both notifications and counts on any mutation
        refetch();
        refetchCounts();
    });

    const handleTabChange = (tab: NotificationTab) => {
        setActiveTab(tab);
    };

    const handleNotificationClick = async (notification: Notification) => {
        // If notification has action URL, navigate to it
        if (notification.actionUrl) {
            // Mark as read before navigation
            if (!notification.readAt) {
                await mutations.markRead(notification.id);
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
                await mutations.clearAll(activeTab);
            }
        }
    };

    const handleCustomizeClick = () => {
        // TODO: Navigate to notification settings
        console.log('Navigate to notification settings');
    };

    return (
        <div data-testid="page-inbox">
            <MetaData title="Inbox" noIndex />

            <PageTitle
                title="Inbox"
                items={[
                    { label: 'Admin', active: false },
                    { label: 'Inbox', active: true },
                ]}
            />

            <div className="mt-6">
                <NotificationInbox
                    notifications={notifications}
                    counts={counts || { all: 0, important: 0, other: 0, snoozed: 0, cleared: 0 }}
                    activeTab={activeTab}
                    loading={isLoading}
                    onTabChange={handleTabChange}
                    onNotificationClick={handleNotificationClick}
                    onFilterClick={handleFilterClick}
                    onClearAll={handleClearAll}
                    onCustomizeClick={handleCustomizeClick}
                />
            </div>
        </div>
    );
};

export default InboxPage;
