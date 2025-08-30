import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "./Icon";

const meta: Meta<typeof Icon> = {
    title: "UI/Icon",
    component: Icon,
    args: {
        icon: "lucide--sparkles",
        ariaLabel: "sparkles icon",
        className: "size-6 text-primary",
    },
};
export default meta;

export const Basic: StoryObj<typeof Icon> = {
    render: (args) => (
        <div className="flex items-center gap-3">
            <Icon {...args} />
            <Icon icon="lucide--settings" className="size-6" ariaLabel="settings" />
            <Icon icon="lucide--bell" className="size-6" ariaLabel="notifications" />
            <Icon icon="lucide--search" className="size-6" ariaLabel="search" />
        </div>
    ),
};
