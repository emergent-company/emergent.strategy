import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router";

import { Sidebar } from "./Sidebar";
import type { ISidebarMenuItem } from "./SidebarMenuItem";

const meta: Meta<typeof Sidebar> = {
    title: "Admin Layout/Sidebar/Sidebar",
    component: Sidebar,
    decorators: [
        (Story) => (
            <MemoryRouter>
                <div className="h-[520px]">
                    <Story />
                </div>
            </MemoryRouter>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

const items: ISidebarMenuItem[] = [
    { id: "section", isTitle: true, label: "Section" },
    { id: "dashboard", label: "Dashboard", url: "/admin", icon: "lucide--layout-dashboard" },
    {
        id: "projects",
        label: "Projects",
        icon: "lucide--folder",
        children: [
            { id: "p1", label: "Project One", url: "/admin/projects/1" },
            { id: "p2", label: "Project Two", url: "/admin/projects/2" },
        ],
    },
];

export const Default: Story = {
    args: { menuItems: items },
};
