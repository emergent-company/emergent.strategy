import type { Meta, StoryObj } from "@storybook/react";
import { TopbarRightbarButton } from "./TopbarRightbarButton";

const meta: Meta<typeof TopbarRightbarButton> = {
    title: "AdminLayout/Topbar/RightbarButton",
    component: TopbarRightbarButton,
    parameters: {
        layout: "centered",
        docs: {
            description: {
                component: `Control that toggles the customization rightbar drawer (fonts, themes). Requires hidden #layout-rightbar-drawer checkbox present in DOM.`,
            },
        },
    },
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof TopbarRightbarButton>;

export const Default: Story = {
    args: {},
    render: (args) => (
        <div className="group/html p-6">
            <input id="layout-rightbar-drawer" type="checkbox" className="hidden" />
            <TopbarRightbarButton {...args} />
        </div>
    ),
};
