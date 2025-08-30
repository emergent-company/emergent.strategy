import type { Meta, StoryObj } from "@storybook/react";
import SidebarProjectDropdown from "./SidebarProjectDropdown";

const meta: Meta<typeof SidebarProjectDropdown> = {
    title: "Admin Layout/Sidebar/SidebarProjectDropdown",
    component: SidebarProjectDropdown,
    parameters: {
        docs: {
            description: {
                component:
                    "Relies on global ConfigProvider and mocked API via useProjects. In Storybook, it will show loading/empty states by default.",
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof SidebarProjectDropdown>;

export const Default: Story = {};
