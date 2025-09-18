import type { Meta, StoryObj } from "@storybook/react";
import SidebarProjectDropdown from "../layout/SidebarProjectDropdown";

const meta: Meta<typeof SidebarProjectDropdown> = {
    title: "Layout/Sidebar/ProjectDropdown",
    component: SidebarProjectDropdown,
    parameters: {
        docs: {
            description: {
                component: `Project switcher. Fetches list via useProjects hook and persists current selection through config/context. In Storybook displays loading/empty mocks unless overridden with a provider decorator.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SidebarProjectDropdown>;

export const Default: Story = {};
