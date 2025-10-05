import type { Meta, StoryObj } from '@storybook/react';
import { NotificationDot } from './NotificationDot';

const meta: Meta<typeof NotificationDot> = {
    title: 'Atoms/NotificationDot',
    component: NotificationDot,
    parameters: {
        docs: {
            description: {
                component: 'Visual indicator atom for unread notification state. Used in notification rows.',
            },
        },
    },
    argTypes: {
        unread: { control: 'boolean' },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Unread: Story = {
    args: {
        unread: true,
    },
    render: (args) => (
        <div className="flex items-center gap-4 p-4">
            <NotificationDot {...args} />
            <span className="text-sm">Unread notification</span>
        </div>
    ),
};

export const Read: Story = {
    args: {
        unread: false,
    },
    render: (args) => (
        <div className="flex items-center gap-4 p-4">
            <NotificationDot {...args} />
            <span className="text-sm text-base-content/60">Read notification</span>
        </div>
    ),
};

export const InContext: Story = {
    render: () => (
        <div className="space-y-2 p-4">
            <div className="flex items-start gap-3 p-3 border border-base-300 rounded">
                <div className="mt-1.5">
                    <NotificationDot unread />
                </div>
                <div className="flex-1">
                    <div className="font-semibold">Import completed</div>
                    <div className="text-sm text-base-content/60">50 new objects imported from ClickUp</div>
                </div>
            </div>
            <div className="flex items-start gap-3 opacity-70 p-3 border border-base-300 rounded">
                <div className="mt-1.5">
                    <NotificationDot unread={false} />
                </div>
                <div className="flex-1">
                    <div>Extraction finished</div>
                    <div className="text-sm text-base-content/60">Document processing complete</div>
                </div>
            </div>
        </div>
    ),
};
