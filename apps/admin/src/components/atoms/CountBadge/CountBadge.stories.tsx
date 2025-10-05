import type { Meta, StoryObj } from '@storybook/react';
import { CountBadge } from './CountBadge';

const meta: Meta<typeof CountBadge> = {
    title: 'Atoms/CountBadge',
    component: CountBadge,
    parameters: {
        docs: {
            description: {
                component: 'Count badge atom for displaying notification counts in tabs.',
            },
        },
    },
    argTypes: {
        count: { control: { type: 'number', min: 0, max: 999 } },
        variant: { control: 'select', options: ['primary', 'neutral'] },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        count: 47,
        variant: 'primary',
    },
};

export const Neutral: Story = {
    args: {
        count: 45,
        variant: 'neutral',
    },
};

export const LargeCount: Story = {
    args: {
        count: 999,
        variant: 'primary',
    },
};

export const InTabContext: Story = {
    render: () => (
        <div className="flex items-center gap-2 p-4">
            <button className="bg-base-200 px-3 py-1.5 rounded font-medium text-sm">
                Important
                <CountBadge count={47} variant="primary" />
            </button>
            <button className="hover:bg-base-200 px-3 py-1.5 rounded font-medium text-sm">
                Other
                <CountBadge count={45} variant="neutral" />
            </button>
            <button className="hover:bg-base-200 px-3 py-1.5 rounded font-medium text-sm">
                Snoozed
                <CountBadge count={3} variant="neutral" />
            </button>
        </div>
    ),
};
