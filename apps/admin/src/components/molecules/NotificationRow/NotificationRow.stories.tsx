import type { Meta, StoryObj } from '@storybook/react';
import { NotificationRow } from './NotificationRow';
import { action } from '@/stories';
import { NotificationCategory } from '@/types/notification';
import type { Notification } from '@/types/notification';

const meta: Meta<typeof NotificationRow> = {
    title: 'Molecules/NotificationRow',
    component: NotificationRow,
    parameters: {
        docs: {
            description: {
                component: 'Notification row molecule matching ClickUp design. Displays notification with unread indicator, title, preview, and timestamp.',
            },
        },
    },
    args: {
        onClick: action('notification-clicked'),
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const baseNotification: Notification = {
    id: '1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    category: NotificationCategory.IMPORT_COMPLETED,
    importance: 'important',
    title: 'Import completed successfully',
    message: '50 new objects imported from ClickUp Space "Engineering"',
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
};

export const Unread: Story = {
    args: {
        notification: baseNotification,
    },
};

export const Read: Story = {
    args: {
        notification: {
            ...baseNotification,
            id: '2',
            readAt: new Date().toISOString(),
            title: 'Extraction finished',
            message: 'Document "Architecture Overview.pdf" processed successfully',
        },
    },
};

export const WithReactions: Story = {
    args: {
        notification: {
            ...baseNotification,
            id: '3',
            title: 'Review request: Technical Architecture',
            message: '@john mentioned you in a comment',
            details: { reactions: 3 },
        },
    },
};

export const LongContent: Story = {
    args: {
        notification: {
            ...baseNotification,
            id: '4',
            title: 'Sync conflict detected in document hierarchy',
            message: 'Multiple users have modified the same document simultaneously. Please review the changes and resolve conflicts to ensure data consistency across the system.',
        },
    },
};

export const OldNotification: Story = {
    args: {
        notification: {
            ...baseNotification,
            id: '5',
            readAt: new Date().toISOString(),
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days ago
            title: 'System maintenance completed',
            message: 'Database optimization finished',
        },
    },
};

export const NotificationList: Story = {
    render: () => {
        const notifications: Notification[] = [
            {
                ...baseNotification,
                id: '1',
                category: NotificationCategory.IMPORT_COMPLETED,
                title: 'Import completed',
                message: '50 new objects from ClickUp',
                createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
            },
            {
                ...baseNotification,
                id: '2',
                category: NotificationCategory.MENTION,
                title: 'Review request',
                message: '@sarah mentioned you in a comment',
                details: { reactions: 2 },
                createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
            },
            {
                ...baseNotification,
                id: '3',
                readAt: new Date().toISOString(),
                category: NotificationCategory.EXTRACTION_COMPLETED,
                title: 'Extraction finished',
                message: 'Document processing complete',
                createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
            },
        ];

        return (
            <div className="border border-base-300 rounded w-full max-w-3xl">
                {notifications.map((notif) => (
                    <NotificationRow
                        key={notif.id}
                        notification={notif}
                        onClick={action('notification-clicked')}
                    />
                ))}
            </div>
        );
    },
};
