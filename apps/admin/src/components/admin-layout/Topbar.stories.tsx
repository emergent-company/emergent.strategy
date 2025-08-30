import type { Meta, StoryObj } from "@storybook/react";
import { Topbar } from "./Topbar";

const meta: Meta<typeof Topbar> = {
    title: "AdminLayout/Topbar",
    component: Topbar,
    parameters: {
        layout: "fullscreen",
    },
    render: () => (
        <div className="group/html">
            {/* Hidden inputs that Topbar labels reference via htmlFor */}
            <input id="layout-sidebar-toggle-trigger" type="checkbox" className="hidden" />
            <input id="layout-sidebar-hover-trigger" type="checkbox" className="hidden" />
            <input id="layout-rightbar-drawer" type="checkbox" className="hidden" />
            <Topbar />
        </div>
    ),
};

export default meta;
type Story = StoryObj<typeof Topbar>;

export const Default: Story = {};
