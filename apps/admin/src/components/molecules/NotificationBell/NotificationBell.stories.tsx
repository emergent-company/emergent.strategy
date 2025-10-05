import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { NotificationBell } from './NotificationBell';
import type { NotificationBellProps } from './NotificationBell';

const meta: Meta<typeof NotificationBell> = {
    title: 'Molecules/NotificationBell',
    component: NotificationBell,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'NotificationBell molecule displays a bell icon with unread badge and dropdown panel showing recent notifications. Supports action buttons, dismiss functionality, and real-time updates.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NotificationBell>;

/**
 * Default notification bell with bell icon and badge
 */
export const Default: Story = {
    args: {
        maxNotifications: 5,
    },
    render: (args: NotificationBellProps) => (
        <div className="flex justify-center items-center bg-base-200 p-8">
            <div className="bg-base-100 shadow-lg p-4 rounded-box">
                <NotificationBell {...args} />
            </div>
        </div>
    ),
};

/**
 * Notification bell with custom max notifications
 */
export const WithLimitedNotifications: Story = {
    args: {
        maxNotifications: 3,
    },
    render: (args: NotificationBellProps) => (
        <div className="flex justify-center items-center bg-base-200 p-8">
            <div className="bg-base-100 shadow-lg p-4 rounded-box">
                <NotificationBell {...args} />
            </div>
        </div>
    ),
};

/**
 * Notification bell with click handlers
 */
export const WithHandlers: Story = {
    args: {
        maxNotifications: 5,
        onNotificationClick: (notification) => {
            console.log('Notification clicked:', notification);
            alert(`Clicked: ${notification.title}`);
        },
        onViewAll: () => {
            console.log('View All clicked');
            alert('Navigating to notifications page');
        },
    },
    render: (args: NotificationBellProps) => (
        <div className="flex justify-center items-center bg-base-200 p-8">
            <div className="bg-base-100 shadow-lg p-4 rounded-box">
                <NotificationBell {...args} />
            </div>
        </div>
    ),
};

/**
 * Notification bell in topbar context
 */
export const InTopbar: Story = {
    args: {
        maxNotifications: 5,
    },
    render: (args: NotificationBellProps) => (
        <div className="bg-base-100 border-b border-base-300">
            <div className="flex justify-between items-center px-4 py-2">
                <div className="font-semibold">App Name</div>
                <div className="flex items-center gap-2">
                    <NotificationBell {...args} />
                    <div className="avatar placeholder">
                        <div className="bg-neutral rounded-full w-8 text-neutral-content">
                            <span className="text-xs">U</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};
