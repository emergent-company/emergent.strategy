import type { Meta, StoryObj } from '@storybook/react';
import { TableAvatarCell, TableAvatarCellProps } from './TableAvatarCell';

const meta: Meta<TableAvatarCellProps> = {
    title: 'Molecules/TableAvatarCell',
    component: TableAvatarCell,
    args: {
        name: 'Hart Hagerty',
        subtitle: 'United States',
        avatarUrl: 'http://localhost:3845/assets/ad7ffc0978017ac3f6f3520a8ccecf5d5b562b2e.png',
        size: 'md',
        rounded: false,
    },
    argTypes: {
        size: { control: 'select', options: ['xs', 'sm', 'md'] },
        rounded: { control: 'boolean' },
    },
};
export default meta;

type Story = StoryObj<TableAvatarCellProps>;

export const Default: Story = {};

export const NoImage: Story = {
    args: { avatarUrl: undefined },
};

export const Dense: Story = {
    args: { size: 'xs' },
};

export const Rounded: Story = {
    args: { rounded: true },
};
