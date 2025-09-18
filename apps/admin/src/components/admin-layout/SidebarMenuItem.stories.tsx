import type { Meta, StoryObj } from "@storybook/react";

import { SidebarMenuItem } from "../layout/SidebarMenuItem";

const meta: Meta<typeof SidebarMenuItem> = {
    title: "Layout/Sidebar/MenuItem",
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

export const LinkItem: Story = {
    name: "Link Item",
    render: () => (
        <SidebarMenuItem id="inbox" url="/inbox" icon="lucide--inbox" badges={["new"]} />
    ),
};

export const ParentWithChildren: Story = {
    name: "Parent With Children",
    render: () => (
        <SidebarMenuItem id="reports" icon="lucide--bar-chart-3" collapsible>
            Reports
            <SidebarMenuItem id="daily" url="/reports/daily">Daily</SidebarMenuItem>
            <SidebarMenuItem id="monthly" url="/reports/monthly" badges={["pro"]}>Monthly</SidebarMenuItem>
        </SidebarMenuItem>
    ),
};
