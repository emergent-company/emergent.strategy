import type { Meta, StoryObj } from "@storybook/react";
import { TopbarRightbarButton } from "./TopbarRightbarButton";

const meta: Meta<typeof TopbarRightbarButton> = {
    title: "AdminLayout/TopbarRightbarButton",
    component: TopbarRightbarButton,
    parameters: { layout: "centered" },
    render: (args) => (
        <div className="group/html p-6">
            <input id="layout-rightbar-drawer" type="checkbox" className="hidden" />
            <TopbarRightbarButton {...args} />
        </div>
    ),
};
export default meta;

type Story = StoryObj<typeof TopbarRightbarButton>;

export const Default: Story = { args: {} };
