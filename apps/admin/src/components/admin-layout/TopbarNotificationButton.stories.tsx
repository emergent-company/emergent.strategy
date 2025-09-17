import type { Meta, StoryObj } from "@storybook/react";
import { TopbarNotificationButton } from "./TopbarNotificationButton";

const meta: Meta<typeof TopbarNotificationButton> = {
    title: "AdminLayout/Topbar/NotificationButton",
    component: TopbarNotificationButton,
    parameters: {
        docs: {
            description: {
                component: `Bell icon button that opens notifications panel (popover / drawer externally). Badge logic handled by parent via props or context in real app.`,
            },
        },
    },
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof TopbarNotificationButton>;

export const Default: Story = {
    render: () => <TopbarNotificationButton />,
};
