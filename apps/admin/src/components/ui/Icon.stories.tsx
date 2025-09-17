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
    parameters: {
        docs: {
            description: {
                component: `Lightweight wrapper around an Iconify span. Provide a full icon class (lucide--*) and optional ariaLabel. When ariaLabel is omitted the icon is hidden from assistive tech (aria-hidden).\n\nUsage:\n\n\`\`\`tsx\n<Icon icon="lucide--settings" ariaLabel="settings" className="size-5 text-primary" />\n\`\`\``,
            },
        },
    },
    tags: ["autodocs"],
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
