import type { Meta, StoryObj } from "@storybook/react";
import { Topbar } from "./Topbar";

const meta: Meta<typeof Topbar> = {
    title: "AdminLayout/Topbar/Container",
    component: Topbar,
    parameters: {
        layout: "fullscreen",
        docs: {
            description: {
                component: `Horizontal application bar – hosts navigation toggles, search, notifications, profile menu & customization launcher. Requires hidden checkbox inputs for interop with layout drawers/toggles in isolation.`,
            },
        },
    },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Topbar>;

export const Default: Story = {
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
