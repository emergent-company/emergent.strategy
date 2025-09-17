import type { Meta, StoryObj } from "@storybook/react";

import { SidebarMenuItem } from "./SidebarMenuItem";
import type { ISidebarMenuItem } from "./SidebarMenuItem";

const meta: Meta<typeof SidebarMenuItem> = {
    title: "AdminLayout/Sidebar/MenuItem",
    component: SidebarMenuItem,
    decorators: [
        (Story) => (
            <div className="bg-base-100 p-2 w-72">
                <Story />
            </div>
        ),
    ],
    parameters: {
        docs: {
            description: {
                component: `Composable navigation entry. Renders either a direct link or an expandable parent with children. Provide \`activated\` (Set<string>) to control open / active state externally in higher-level sidebar container. Badges array shows contextual labels.`,
            },
        },
    },
    tags: ["autodocs"],
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
