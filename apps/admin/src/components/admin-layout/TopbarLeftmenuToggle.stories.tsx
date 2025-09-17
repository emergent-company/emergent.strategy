import type { Meta, StoryObj } from "@storybook/react";
import { TopbarLeftmenuToggle } from "./TopbarLeftmenuToggle";

const meta: Meta<typeof TopbarLeftmenuToggle> = {
    title: "AdminLayout/Topbar/LeftmenuToggle",
    component: TopbarLeftmenuToggle,
    parameters: {
        layout: "centered",
        docs: {
            description: {
                component: `Hamburger / collapse control for the primary sidebar. Supports standard click toggle and hover-driven mini variant via \`hoverMode\` prop. Requires presence of hidden checkbox triggers (#layout-sidebar-toggle-trigger, #layout-sidebar-hover-trigger).`,
            },
        },
    },
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof TopbarLeftmenuToggle>;

export const Default: Story = {
    args: {},
    render: (args) => (
        <div className="group/html p-6">
            <input id="layout-sidebar-toggle-trigger" type="checkbox" className="hidden" />
            <input id="layout-sidebar-hover-trigger" type="checkbox" className="hidden" />
            <div className="flex items-center gap-2">
                <TopbarLeftmenuToggle {...args} />
                <TopbarLeftmenuToggle hoverMode {...args} />
            </div>
        </div>
    ),
};
