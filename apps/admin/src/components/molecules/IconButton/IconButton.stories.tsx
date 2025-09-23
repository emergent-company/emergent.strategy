import type { Meta, StoryObj } from '@storybook/react';
import { IconButton, type IconButtonProps } from './index';
import { Icon } from '@/components/atoms/Icon';

const meta: Meta<typeof IconButton> = {
    title: 'Molecules/IconButton',
    component: IconButton,
    args: {
        'aria-label': 'Settings',
    },
    parameters: {
        docs: {
            description: {
                component: 'Molecule for square icon-only actions. Wraps a button with size + ghost styles. Provide accessible aria-label.'
            }
        }
    }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: (args: IconButtonProps) => (
        <IconButton {...args}>
            <Icon icon="lucide--settings" className="size-4" ariaLabel="" />
        </IconButton>
    ),
};

export const Variants: Story = {
    render: (args: IconButtonProps) => (
        <div className="flex gap-4">
            <IconButton {...args}>
                <Icon icon="lucide--bell" className="size-4" ariaLabel="" />
            </IconButton>
            <IconButton {...args} className="btn btn-sm btn-primary btn-circle" aria-label="Star">
                <Icon icon="lucide--star" className="size-4" ariaLabel="" />
            </IconButton>
            <IconButton {...args} className="btn btn-sm btn-accent btn-circle" aria-label="Heart">
                <Icon icon="lucide--heart" className="size-4" ariaLabel="" />
            </IconButton>
        </div>
    )
};
