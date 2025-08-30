import type { Meta, StoryObj } from "@storybook/react";

import { SidebarMenuItemBadges } from "./SidebarMenuItemBadges";

const meta: Meta<typeof SidebarMenuItemBadges> = {
    title: "Admin Layout/Sidebar/SidebarMenuItemBadges",
    component: SidebarMenuItemBadges,
};

export default meta;
type Story = StoryObj<typeof SidebarMenuItemBadges>;

export const NewBadge: Story = {
    args: { badges: ["new"] },
};

export const CustomBadges: Story = {
    args: { badges: ["beta", "pro"] },
};
