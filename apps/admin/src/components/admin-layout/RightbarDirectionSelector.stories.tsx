import type { Meta, StoryObj } from "@storybook/react";
import { RightbarDirectionSelector } from "./RightbarDirectionSelector";

const meta: Meta<typeof RightbarDirectionSelector> = {
    title: "Admin/Rightbar/DirectionSelector",
    component: RightbarDirectionSelector,
};

export default meta;
type Story = StoryObj<typeof RightbarDirectionSelector>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <RightbarDirectionSelector />
        </div>
    ),
};
