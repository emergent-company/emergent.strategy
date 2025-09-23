import type { Meta, StoryObj } from '@storybook/react';
import { ThemeToggle, type ThemeToggleProps } from './index';

const meta: Meta<typeof ThemeToggle> = {
    title: 'Molecules/ThemeToggle',
    component: ThemeToggle,
    args: {
        className: 'btn btn-ghost btn-sm btn-circle',
        iconClass: 'size-5',
    },
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: 'Switches between light, dark, and system themes using global config context. Animates three lucide icons based on current theme.',
            },
        },
    },
    argTypes: {
        className: { control: 'text' },
        iconClass: { control: 'text' },
        onClick: { action: 'clicked' },
    },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LargeIcons: Story = {
    args: {
        iconClass: 'size-7',
        className: 'btn btn-ghost btn-circle',
    },
};
export const PlainButton: Story = {
    args: {
        className: 'p-3 rounded-box border border-base-300 hover:bg-base-200',
        iconClass: 'size-6',
    },
};