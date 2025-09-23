import type { Meta, StoryObj } from '@storybook/react';
import { OrgAndProjectGate } from './index';
import { Icon } from '@/components/atoms/Icon';

const meta: Meta<typeof OrgAndProjectGate> = {
    title: 'Gates/OrgAndProjectGate',
    component: OrgAndProjectGate,
    parameters: { layout: 'centered' },
    args: { children: <div className="p-4 border border-dashed rounded-box text-sm">Gated content goes here</div> },
};
export default meta;

type Story = StoryObj<typeof OrgAndProjectGate>;

export const Default: Story = {};

export const WithContent: Story = {
    args: {
        children: (
            <div className="flex items-center gap-2 p-4 border rounded-box">
                <Icon icon="lucide--shield-check" className="size-5" />
                <span>Protected dashboard section</span>
            </div>
        ),
    },
};
