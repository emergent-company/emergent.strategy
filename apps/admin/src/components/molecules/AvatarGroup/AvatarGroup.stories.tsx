import type { Meta, StoryObj } from '@storybook/react';
import { Avatar } from '@/components/atoms/Avatar';
import { AvatarGroup, AvatarGroupProps } from './AvatarGroup';

const baseChildren = [
    <Avatar key="1" letters="HH" color="primary" />,
    <Avatar key="2" letters="JD" color="secondary" />,
    <Avatar key="3" letters="AL" color="accent" />,
    <Avatar key="4" letters="MK" color="info" />,
    <Avatar key="5" letters="TS" color="success" />
];

const meta: Meta<AvatarGroupProps> = {
    title: 'Molecules/AvatarGroup',
    component: AvatarGroup,
    args: {
        overlap: 'lg',
        max: undefined,
        size: 'sm',
        withBorder: true,
        borderColor: 'primary',
    },
    argTypes: {
        size: { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
        overlap: { control: 'select', options: ['none', 'sm', 'md', 'lg', '-space-x-2', '-space-x-8'] },
        withBorder: { control: 'boolean' },
        borderColor: { control: 'select', options: [undefined, 'neutral', 'primary', 'secondary', 'accent', 'info', 'success', 'warning', 'error'] },
    },
    render: (args) => (
        <AvatarGroup {...args}>
            {baseChildren}
        </AvatarGroup>
    )
};
export default meta;

type Story = StoryObj<AvatarGroupProps>;

export const Default: Story = {};

export const WithImages: Story = {
    args: {
        children: [
            <Avatar key="1" src="http://localhost:3845/assets/ad7ffc0978017ac3f6f3520a8ccecf5d5b562b2e.png" />,
            <Avatar key="2" src="http://localhost:3845/assets/ad7ffc0978017ac3f6f3520a8ccecf5d5b562b2e.png" />,
            <Avatar key="3" src="http://localhost:3845/assets/ad7ffc0978017ac3f6f3520a8ccecf5d5b562b2e.png" />,
            <Avatar key="4" src="http://localhost:3845/assets/ad7ffc0978017ac3f6f3520a8ccecf5d5b562b2e.png" />,
        ],
    },
};

export const LimitedMax: Story = {
    args: { max: 3 },
};

export const Square: Story = {
    args: {
        size: 'sm',
        children: [
            <Avatar key="1" letters="HH" color="primary" shape="square" />,
            <Avatar key="2" letters="JD" color="secondary" shape="square" />,
            <Avatar key="3" letters="AL" color="accent" shape="square" />,
            <Avatar key="4" letters="MK" color="info" shape="square" />,
            <Avatar key="5" letters="TS" color="success" shape="square" />
        ]
    },
};

export const TightOverlap: Story = {
    args: { overlap: 'sm' },
};

export const NoBorder: Story = {
    args: { withBorder: false },
};

export const DynamicControls: Story = {
    args: {},
    render: (args) => (
        <AvatarGroup {...args}>
            {baseChildren}
        </AvatarGroup>
    )
};
