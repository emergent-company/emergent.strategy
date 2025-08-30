import type { Meta, StoryObj } from "@storybook/react";
import { TopbarSearchButton } from "./TopbarSearchButton";

const meta: Meta<typeof TopbarSearchButton> = {
    title: "Admin Layout/Topbar/TopbarSearchButton",
    component: TopbarSearchButton,
};
export default meta;

type Story = StoryObj<typeof TopbarSearchButton>;

export const Default: Story = {
    render: () => <TopbarSearchButton />,
};
