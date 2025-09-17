import type { Meta, StoryObj } from "@storybook/react";
import { IconButton } from "./IconButton";
import type { IconButtonProps } from "./IconButton";
import { Icon } from "./Icon";

const meta: Meta<typeof IconButton> = {
    title: "UI/IconButton",
    component: IconButton,
    args: {
        "aria-label": "Settings",
        className: "",
    },
    parameters: {
        docs: {
            description: {
                component: `Button optimized for square icon actions. Pass children (typically an <Icon />). Adds minimal padding & focus styles consistent with design system.\n\nUsage:\n\n\`\`\`tsx\n<IconButton aria-label="Notifications">\n  <Icon icon="lucide--bell" className="size-4" />\n</IconButton>\n\`\`\``,
            },
        },
    },
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof IconButton>;

export const Default: Story = {
    render: (args: IconButtonProps) => (
        <IconButton {...args}>
            <Icon icon="lucide--settings" className="size-4" ariaLabel="" />
        </IconButton>
    ),
};

export const WithBadge: Story = {
    render: (args: IconButtonProps) => (
        <div className="inline-block relative">
            <IconButton {...args}>
                <Icon icon="lucide--bell" className="size-4" ariaLabel="" />
            </IconButton>
            <span className="-top-0 -right-0 absolute status status-error status-sm"></span>
        </div>
    ),
    args: {
        "aria-label": "Notifications",
    },
};
