/**
 * NotificationInbox Stories
 * Demonstrates the full notification inbox organism
 */
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@/stories';
import { NotificationInbox } from './NotificationInbox';
import type { Notification, NotificationCounts } from '@/types/notification';

const meta = {
    title: 'Organisms/NotificationInbox',
    component: NotificationInbox,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof NotificationInbox>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock data helpers
const createMockNotification = (
    overrides: Partial<Notification> = {}
): Notification => ({
    id: Math.random().toString(36).substr(2, 9),
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    userId: 'user-1',
    category: 'IMPORT_COMPLETED',
    importance: 'important',
    title: 'Import completed',
    message: 'Your data import has finished successfully.',
    createdAt: new Date().toISOString(),
    sourceType: 'integration',
    sourceId: 'import-123',
    details: {},
    ...overrides,
});

const now = new Date();
const today = new Date(now);
const yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
const lastWeek = new Date(now);
lastWeek.setDate(lastWeek.getDate() - 5);

const mockNotificationsImportant: Notification[] = [
    createMockNotification({
        id: '1',
        category: 'MENTION',
        title: 'Jane Cooper mentioned you',
        message: 'Can you review the latest changes to the specification document?',
        createdAt: new Date(today.getTime() - 5 * 60 * 1000).toISOString(), // 5 min ago
        details: {
            mentionedBy: 'Jane Cooper',
            mentionedIn: 'Specification Review',
        },
    }),
    createMockNotification({
        id: '2',
        category: 'EXTRACTION_COMPLETED',
        title: 'Extraction completed',
        message: 'Document "Q4 Report.pdf" has been processed and is ready for review.',
        createdAt: new Date(today.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
    }),
    createMockNotification({
        id: '3',
        category: 'IMPORT_COMPLETED',
        title: 'Import completed',
        message: 'Your data import from Salesforce has finished successfully.',
        createdAt: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        readAt: new Date(yesterday.getTime() - 1 * 60 * 60 * 1000).toISOString(),
    }),
    createMockNotification({
        id: '4',
        category: 'ASSIGNED',
        title: 'New task assigned',
        message: 'Review and approve the API documentation updates.',
        createdAt: new Date(yesterday.getTime() - 8 * 60 * 60 * 1000).toISOString(),
        readAt: new Date(yesterday.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    }),
    createMockNotification({
        id: '5',
        category: 'REVIEW_REQUEST',
        title: 'Review requested',
        message: 'Tom Wilson requested your review on the authentication flow changes.',
        createdAt: new Date(lastWeek.getTime()).toISOString(),
    }),
];

const mockNotificationsOther: Notification[] = [
    createMockNotification({
        id: '10',
        category: 'SYSTEM_WARNING',
        title: 'System update available',
        message: 'A new version of the platform is available. Update now to get the latest features.',
        importance: 'other',
        createdAt: new Date(today.getTime() - 15 * 60 * 1000).toISOString(),
    }),
    createMockNotification({
        id: '11',
        category: 'COMMENT',
        title: 'New comment',
        message: 'Someone commented on a document you\'re following.',
        importance: 'other',
        createdAt: new Date(yesterday.getTime()).toISOString(),
        details: {
            reactions: 3,
        },
    }),
];

const mockCounts: NotificationCounts = {
    all: 15,
    important: 3,
    other: 12,
    snoozed: 2,
    cleared: 5,
};

const mockCountsEmpty: NotificationCounts = {
    all: 0,
    important: 0,
    other: 0,
    snoozed: 0,
    cleared: 0,
};

// Stories
export const ImportantTab: Story = {
    args: {
        notifications: mockNotificationsImportant,
        counts: mockCounts,
        activeTab: 'important',
        onTabChange: action('onTabChange'),
        onNotificationClick: action('onNotificationClick'),
        onFilterClick: action('onFilterClick'),
        onClearAll: action('onClearAll'),
        onCustomizeClick: action('onCustomizeClick'),
    },
};

export const OtherTab: Story = {
    args: {
        notifications: mockNotificationsOther,
        counts: mockCounts,
        activeTab: 'other',
        onTabChange: action('onTabChange'),
        onNotificationClick: action('onNotificationClick'),
        onFilterClick: action('onFilterClick'),
        onClearAll: action('onClearAll'),
        onCustomizeClick: action('onCustomizeClick'),
    },
};

export const AllTab: Story = {
    args: {
        notifications: [...mockNotificationsImportant, ...mockNotificationsOther],
        counts: mockCounts,
        activeTab: 'all',
        onTabChange: action('onTabChange'),
        onNotificationClick: action('onNotificationClick'),
        onFilterClick: action('onFilterClick'),
        onClearAll: action('onClearAll'),
        onCustomizeClick: action('onCustomizeClick'),
    },
};

export const EmptyImportant: Story = {
    args: {
        notifications: [],
        counts: mockCountsEmpty,
        activeTab: 'important',
        onTabChange: action('onTabChange'),
        onNotificationClick: action('onNotificationClick'),
        onFilterClick: action('onFilterClick'),
        onClearAll: action('onClearAll'),
        onCustomizeClick: action('onCustomizeClick'),
    },
};

export const EmptySnoozed: Story = {
    args: {
        notifications: [],
        counts: mockCountsEmpty,
        activeTab: 'snoozed',
        onTabChange: action('onTabChange'),
        onNotificationClick: action('onNotificationClick'),
        onFilterClick: action('onFilterClick'),
        onClearAll: action('onClearAll'),
        onCustomizeClick: action('onCustomizeClick'),
    },
};

export const Loading: Story = {
    args: {
        notifications: [],
        counts: mockCounts,
        activeTab: 'important',
        loading: true,
        onTabChange: action('onTabChange'),
        onNotificationClick: action('onNotificationClick'),
        onFilterClick: action('onFilterClick'),
        onClearAll: action('onClearAll'),
        onCustomizeClick: action('onCustomizeClick'),
    },
};

export const FullHeight: Story = {
    args: {
        notifications: mockNotificationsImportant,
        counts: mockCounts,
        activeTab: 'important',
        onTabChange: action('onTabChange'),
        onNotificationClick: action('onNotificationClick'),
        onFilterClick: action('onFilterClick'),
        onClearAll: action('onClearAll'),
        onCustomizeClick: action('onCustomizeClick'),
    },
    decorators: [
        (Story) => (
            <div style={{ height: '600px' }}>
                <Story />
            </div>
        ),
    ],
};
