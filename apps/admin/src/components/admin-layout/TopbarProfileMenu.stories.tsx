import type { Meta, StoryObj } from "@storybook/react";
import { TopbarProfileMenu } from "./TopbarProfileMenu";

const meta: Meta<typeof TopbarProfileMenu> = {
    title: "Admin Layout/Topbar/TopbarProfileMenu",
    component: TopbarProfileMenu,
};

export default meta;
type Story = StoryObj<typeof TopbarProfileMenu>;

export const Default: Story = {
    render: () => (
        <div className="p-4">
            <TopbarProfileMenu />
        </div>
    ),
};
