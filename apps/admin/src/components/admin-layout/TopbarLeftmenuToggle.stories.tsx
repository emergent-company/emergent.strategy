import type { Meta, StoryObj } from "@storybook/react";
import { TopbarLeftmenuToggle } from "./TopbarLeftmenuToggle";

const meta: Meta<typeof TopbarLeftmenuToggle> = {
    title: "AdminLayout/TopbarLeftmenuToggle",
    component: TopbarLeftmenuToggle,
    parameters: { layout: "centered" },
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
export default meta;

type Story = StoryObj<typeof TopbarLeftmenuToggle>;

export const Default: Story = { args: {} };
