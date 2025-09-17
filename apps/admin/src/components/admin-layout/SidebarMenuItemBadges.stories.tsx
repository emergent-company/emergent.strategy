import type { Meta, StoryObj } from "@storybook/react";
import { SidebarMenuItemBadges } from "./SidebarMenuItemBadges";

const meta: Meta<typeof SidebarMenuItemBadges> = {
    title: "AdminLayout/Sidebar/MenuItemBadges",
    component: SidebarMenuItemBadges,
    parameters: {
        docs: {
            description: {
                component: `Visual indicators appended to sidebar items (e.g., 'new', 'beta', 'pro'). Accepts array of short badge strings; styling driven by semantic color mapping.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SidebarMenuItemBadges>;

export const NewBadge: Story = {
    args: { badges: ["new"] },
};

export const CustomBadges: Story = {
    args: { badges: ["beta", "pro"] },
};
