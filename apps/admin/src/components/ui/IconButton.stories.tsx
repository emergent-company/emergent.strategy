import type { Meta, StoryObj } from "@storybook/react";
import { IconButton, type IconButtonProps } from "./IconButton";
import { Icon } from "./Icon";

const meta: Meta<typeof IconButton> = {
    title: "UI/IconButton",
    component: IconButton,
    args: {
        "aria-label": "Settings",
        className: "",
    },
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
