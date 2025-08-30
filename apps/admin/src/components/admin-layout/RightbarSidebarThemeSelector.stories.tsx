import type { Meta, StoryObj } from "@storybook/react";
import { RightbarSidebarThemeSelector } from "./RightbarSidebarThemeSelector";

const meta: Meta<typeof RightbarSidebarThemeSelector> = {
    title: "Admin/Rightbar/SidebarThemeSelector",
    component: RightbarSidebarThemeSelector,
};

export default meta;
type Story = StoryObj<typeof RightbarSidebarThemeSelector>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <RightbarSidebarThemeSelector />
        </div>
    ),
};
