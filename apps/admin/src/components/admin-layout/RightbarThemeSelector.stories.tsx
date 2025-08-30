import type { Meta, StoryObj } from "@storybook/react";
import { RightbarThemeSelector } from "./RightbarThemeSelector";

const meta: Meta<typeof RightbarThemeSelector> = {
    title: "Admin/Rightbar/ThemeSelector",
    component: RightbarThemeSelector,
};

export default meta;
type Story = StoryObj<typeof RightbarThemeSelector>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <RightbarThemeSelector />
        </div>
    ),
};
