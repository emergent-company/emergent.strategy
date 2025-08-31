import type { Meta, StoryObj } from "@storybook/react";

import { Sidebar } from "./Sidebar";
import type { ISidebarMenuItem } from "../admin-layout/SidebarMenuItem";

const meta: Meta<typeof Sidebar> = {
    title: "Components Layout/Sidebar",
    component: Sidebar,
    decorators: [
        (Story) => (
            <div className="h-[480px]">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

const menu: ISidebarMenuItem[] = [
    { id: "title", label: "Main", isTitle: true },
    { id: "home", label: "Home", url: "/", icon: "lucide--home" },
    {
        id: "analytics",
        label: "Analytics",
        icon: "lucide--line-chart",
        children: [
            { id: "overview", label: "Overview", url: "/analytics/overview" },
            { id: "details", label: "Details", url: "/analytics/details", badges: ["new"] },
        ],
    },
];

export const Default: Story = {
    args: { menuItems: menu },
};
