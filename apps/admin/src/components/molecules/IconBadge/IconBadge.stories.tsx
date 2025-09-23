import type { Meta, StoryObj } from '@storybook/react';
import { IconBadge, IconBadgeProps } from './IconBadge';

const meta = {
    title: 'Molecules/IconBadge',
    component: IconBadge,
    args: {
        icon: 'lucide--star',
        color: 'primary',
    },
    parameters: {
        layout: 'centered',
    },
} satisfies Meta<typeof IconBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Subtle: Story = {
    args: {
        variant: 'subtle',
    },
};

export const Solid: Story = {
    args: {
        variant: 'solid',
    },
};

export const AllColors: Story = {
    render: (args) => (
        <div className="flex flex-wrap gap-4">
            {(['primary', 'secondary', 'accent', 'info', 'success', 'warning', 'error'] as IconBadgeProps['color'][]).map(c => (
                <div key={c} className="flex flex-col items-center gap-2">
                    <IconBadge {...args} color={c} variant="subtle" />
                    <IconBadge {...args} color={c} variant="solid" />
                    <span className="text-xs text-base-content/70">{c}</span>
                </div>
            ))}
        </div>
    )
};
