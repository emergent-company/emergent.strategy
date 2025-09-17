import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "./Tooltip";
const meta: Meta<typeof Tooltip> = {
    title: "UI/Tooltip",
    component: Tooltip,
    parameters: {
        docs: {
            description: {
                component: `Wrapper that shows a floating panel (using <dialog popover> under the hood) on hover/focus. Provide \`content\` ReactNode and optional \`placement\`. Content is rendered verbatim allowing rich markup.`,
            },
        },
    },
    args: {
        placement: "top" as const,
        content: (
            <div>
                <p className="font-semibold">Usage Summary:</p>
                <p className="mt-2">Today: 47 tokens</p>
                <p className="mt-0.5">Total: 158 tokens</p>
            </div>
        ),
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: (args) => (
        <div className="p-6">
            <Tooltip {...args} content={args.content} placement={args.placement}>
                <button className="btn-outline btn">Hover me</button>
            </Tooltip>
        </div>
    ),
};
