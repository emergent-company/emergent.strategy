import type { Meta, StoryObj } from "@storybook/react";
import { Sidebar } from "../layout/Sidebar";
import { SidebarSection } from "../layout/SidebarSection";
import { SidebarMenuItem } from "../layout/SidebarMenuItem";
import { SidebarProjectDropdown } from "../layout/SidebarProjectDropdown";

const meta: Meta<typeof Sidebar> = {
    title: "Layout/Sidebar/Container",
    component: Sidebar,
    decorators: [
        (Story) => (
            <div className="h-[520px]">
                <Story />
            </div>
        ),
    ],
    parameters: {
        docs: {
            description: {
                component:
                    `Primary navigation column. Compose one or more <SidebarSection /> children for grouped navigation.
Activation & expansion state is managed internally and propagated to child sections.

Legacy menuItems prop has been removed; migrate by wrapping your items in a <SidebarSection />.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof Sidebar>;

// Default section items now composed via child <SidebarMenuItem />

export const Default: Story = {
    render: () => (
        <Sidebar>
            <SidebarProjectDropdown />
            <SidebarSection id="default" title="Default">
                <SidebarMenuItem id="dashboard" url="/admin" icon="lucide--layout-dashboard">Dashboard</SidebarMenuItem>
                <SidebarMenuItem id="projects" icon="lucide--folder" collapsible>
                    Projects
                    <SidebarMenuItem id="p1" url="/admin/projects/1">Project One</SidebarMenuItem>
                    <SidebarMenuItem id="p2" url="/admin/projects/2">Project Two</SidebarMenuItem>
                </SidebarMenuItem>
            </SidebarSection>
        </Sidebar>
    ),
};

// Multiple section configuration example
// Multiple sections demo

export const MultipleSections: Story = {
    name: "Multiple Sections",
    render: () => (
        <Sidebar>
            <SidebarSection id="core" title="Core">
                <SidebarMenuItem id="dash" url="/admin" icon="lucide--layout-dashboard">Dashboard</SidebarMenuItem>
                <SidebarMenuItem id="inbox" url="/admin/inbox" icon="lucide--inbox" badges={["2"]}>Inbox</SidebarMenuItem>
            </SidebarSection>
            <SidebarSection id="workspace" title="Workspace" className="mt-4">
                <SidebarMenuItem id="reports" icon="lucide--bar-chart-3" collapsible>
                    Reports
                    <SidebarMenuItem id="r-daily" url="/admin/reports/daily">Daily</SidebarMenuItem>
                    <SidebarMenuItem id="r-monthly" url="/admin/reports/monthly" badges={["beta"]}>Monthly</SidebarMenuItem>
                </SidebarMenuItem>
                <SidebarMenuItem id="settings" url="/admin/settings" icon="lucide--settings">Settings</SidebarMenuItem>
            </SidebarSection>
        </Sidebar>
    ),
};

export const WithProjectDropdown: Story = {
    name: "With Project Dropdown",
    render: () => (
        <Sidebar>
            <SidebarProjectDropdown />
            <SidebarSection id="core" title="Core">
                <SidebarMenuItem id="dash" url="/admin" icon="lucide--layout-dashboard">Dashboard</SidebarMenuItem>
            </SidebarSection>
        </Sidebar>
    ),
};
