import type { Meta, StoryObj } from "@storybook/react";
import { TopbarNotificationButton } from "./TopbarNotificationButton";

const meta: Meta<typeof TopbarNotificationButton> = {
    title: "Admin Layout/Topbar/TopbarNotificationButton",
    component: TopbarNotificationButton,
};
export default meta;

type Story = StoryObj<typeof TopbarNotificationButton>;

export const Default: Story = {
    render: () => <TopbarNotificationButton />,
};
