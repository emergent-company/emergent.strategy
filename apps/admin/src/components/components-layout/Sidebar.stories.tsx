import type { Meta, StoryObj } from "@storybook/react";
import { Sidebar } from "../layout/Sidebar";
import { SidebarSection } from "../layout/SidebarSection";
import { SidebarMenuItem } from "../layout/SidebarMenuItem";

const meta: Meta<typeof Sidebar> = {
    title: "Layout/ComponentsSidebar",
    component: Sidebar,
    parameters: {
        docs: {
            description: {
                component: `Navigation sidebar listing component categories for the showcase section. Collapsible and keyboard navigable.`,
            },
        },
    },
    tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Sidebar>
            <SidebarSection title="Main">
                <SidebarMenuItem id="home" url="/" icon="lucide--home">
                    Home
                </SidebarMenuItem>
                <SidebarMenuItem id="analytics" icon="lucide--line-chart" collapsible>
                    Analytics
                    <SidebarMenuItem id="overview" url="/analytics/overview">
                        Overview
                    </SidebarMenuItem>
                    <SidebarMenuItem id="details" url="/analytics/details" badges={['new']}>
                        Details
                    </SidebarMenuItem>
                </SidebarMenuItem>
            </SidebarSection>
        </Sidebar>
    ),
};
