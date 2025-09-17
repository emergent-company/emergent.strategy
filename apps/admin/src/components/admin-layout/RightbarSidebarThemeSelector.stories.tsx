import type { Meta, StoryObj } from "@storybook/react";
import { RightbarSidebarThemeSelector } from "./RightbarSidebarThemeSelector";

const meta: Meta<typeof RightbarSidebarThemeSelector> = {
    title: "AdminLayout/Rightbar/SidebarThemeSelector",
    component: RightbarSidebarThemeSelector,
    parameters: {
        docs: {
            description: {
                component: `Palette selector focused on sidebar surface (contrast & accent tweaks). Applies chosen theme tokens to sidebar root via data attributes.`,
            },
        },
    },
    tags: ["autodocs"],
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
