import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router";

import { SidebarMenuItem, type ISidebarMenuItem } from "./SidebarMenuItem";

const meta: Meta<typeof SidebarMenuItem> = {
    title: "Admin Layout/Sidebar/SidebarMenuItem",
    component: SidebarMenuItem,
    decorators: [
        (Story) => (
            <MemoryRouter>
                <div className="bg-base-100 p-2 w-72">
                    <Story />
                </div>
            </MemoryRouter>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof SidebarMenuItem>;

const baseActivated = new Set<string>();

export const LinkItem: Story = {
    args: {
        id: "inbox",
        label: "Inbox",
        url: "/inbox",
        icon: "lucide--inbox",
        badges: ["new"],
        activated: baseActivated,
    } as ISidebarMenuItem & { activated: Set<string> },
};

export const ParentWithChildren: Story = {
    args: {
        id: "reports",
        label: "Reports",
        icon: "lucide--bar-chart-3",
        children: [
            { id: "daily", label: "Daily", url: "/reports/daily" },
            { id: "monthly", label: "Monthly", url: "/reports/monthly", badges: ["pro"] },
        ],
        activated: new Set<string>(),
    } as ISidebarMenuItem & { activated: Set<string> },
};
