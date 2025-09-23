import type { Meta, StoryObj } from '@storybook/react';
import { Icon, type IconProps } from './index';

const meta: Meta<typeof Icon> = {
    title: 'Atoms/Icon',
    component: Icon,
    args: {
        icon: 'lucide--sparkles',
        ariaLabel: 'sparkles',
        className: 'size-6 text-primary',
    },
    parameters: {
        docs: {
            description: {
                component: 'Atom wrapper around an Iconify span. Provide a lucide icon class (e.g., lucide--home). If ariaLabel omitted, icon is aria-hidden.'
            }
        }
    },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
export const Sizes: Story = {
    render: (args: IconProps) => (
        <div className="flex items-end gap-4">
            <Icon {...args} className="size-4 text-primary" />
            <Icon {...args} className="size-6 text-secondary" icon="lucide--settings" ariaLabel="settings" />
            <Icon {...args} className="size-8 text-accent" icon="lucide--bell" ariaLabel="notifications" />
        </div>
    ),
};
