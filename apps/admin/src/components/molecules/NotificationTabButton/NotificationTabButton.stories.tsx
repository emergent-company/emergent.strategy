import type { Meta, StoryObj } from '@storybook/react';
import { NotificationTabButton } from './NotificationTabButton';
import { action } from '@/stories';

const meta: Meta<typeof NotificationTabButton> = {
    title: 'Molecules/NotificationTabButton',
    component: NotificationTabButton,
    parameters: {
        docs: {
            description: {
                component: 'Tab button molecule with optional count badge for notification inbox navigation.',
            },
        },
    },
    args: {
        onClick: action('tab-clicked'),
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
    args: {
        label: 'Important',
        tab: 'important',
        active: true,
        count: 47,
        showBadge: true,
    },
};

export const Inactive: Story = {
    args: {
        label: 'Other',
        tab: 'other',
        active: false,
        count: 45,
        showBadge: true,
    },
};

export const NoBadge: Story = {
    args: {
        label: 'Snoozed',
        tab: 'snoozed',
        active: false,
        showBadge: false,
    },
};

export const TabGroup: Story = {
    render: () => (
        <div className="flex items-center gap-1 bg-base-100 p-2 border border-base-300 rounded">
            <NotificationTabButton
                label="All"
                tab="all"
                active={false}
                onClick={action('all-clicked')}
            />
            <NotificationTabButton
                label="Important"
                tab="important"
                active
                count={47}
                showBadge
                onClick={action('important-clicked')}
            />
            <NotificationTabButton
                label="Other"
                tab="other"
                active={false}
                count={45}
                showBadge
                onClick={action('other-clicked')}
            />
            <NotificationTabButton
                label="Snoozed"
                tab="snoozed"
                active={false}
                count={3}
                showBadge
                onClick={action('snoozed-clicked')}
            />
            <NotificationTabButton
                label="Cleared"
                tab="cleared"
                active={false}
                onClick={action('cleared-clicked')}
            />
        </div>
    ),
};
