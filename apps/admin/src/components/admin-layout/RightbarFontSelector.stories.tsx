import type { Meta, StoryObj } from "@storybook/react";
import { RightbarFontSelector } from "./RightbarFontSelector";

const meta: Meta<typeof RightbarFontSelector> = {
    title: "Admin/Rightbar/FontSelector",
    component: RightbarFontSelector,
};

export default meta;
type Story = StoryObj<typeof RightbarFontSelector>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <RightbarFontSelector />
        </div>
    ),
};
