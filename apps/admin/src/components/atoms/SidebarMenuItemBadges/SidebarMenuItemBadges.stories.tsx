import type { Meta, StoryObj } from '@storybook/react';
import { SidebarMenuItemBadges } from './index';

const meta: Meta<typeof SidebarMenuItemBadges> = {
    title: 'Atoms/Sidebar/SidebarMenuItemBadges',
    component: SidebarMenuItemBadges,
    args: { badges: ['new', '3'] },
};

export default meta;
type Story = StoryObj<typeof SidebarMenuItemBadges>;

export const Default: Story = {};

export const Multiple: Story = { args: { badges: ['new', 'alpha', '3'] } };

export const None: Story = { args: { badges: [] } };
