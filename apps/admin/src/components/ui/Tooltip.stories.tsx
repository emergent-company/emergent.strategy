import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "./Tooltip";

const meta: Meta<typeof Tooltip> = {
    title: "UI/Tooltip",
    component: Tooltip,
    args: {
        placement: "top",
        content: (
            <div>
                <p className="font-semibold">Usage Summary:</p>
                <p className="mt-2">Today: 47 tokens</p>
                <p className="mt-0.5">Total: 158 tokens</p>
            </div>
        ),
    },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
    render: (args) => (
        <div className="p-6">
            <Tooltip {...args}>
                <button className="btn-outline btn">Hover me</button>
            </Tooltip>
        </div>
    ),
};
