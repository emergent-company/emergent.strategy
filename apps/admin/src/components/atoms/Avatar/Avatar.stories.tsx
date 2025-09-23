import type { Meta, StoryObj } from '@storybook/react';
import { Avatar, AvatarProps } from './Avatar';

const meta: Meta<AvatarProps> = {
    title: 'Atoms/Avatar',
    component: Avatar,
    args: {
        letters: 'HH',
        size: 'sm',
        shape: 'circle',
        radius: 'box',
        color: 'primary',
        border: false,
    },
    argTypes: {
        size: { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
        shape: { control: 'select', options: ['circle', 'square'] },
        radius: { control: 'select', options: ['none', 'sm', 'md', 'lg', 'xl', 'full', 'box', 'field', 'selector'] },
        color: { control: 'select', options: ['neutral', 'primary', 'secondary', 'accent', 'info', 'success', 'warning', 'error'] },
    },
};
export default meta;
type Story = StoryObj<AvatarProps>;

export const Letters: Story = {};

export const Image: Story = {
    args: {
        src: 'http://localhost:3845/assets/ad7ffc0978017ac3f6f3520a8ccecf5d5b562b2e.png',
        letters: undefined,
    },
};

export const WithBorder: Story = {
    args: { border: true, borderColor: 'primary' },
};

export const LargeSquare: Story = {
    args: { size: 'lg', shape: 'square', radius: 'xl' },
};

export const CustomRadiusNumber: Story = {
    args: { size: 'sm', shape: 'square', radius: 12 },
};
